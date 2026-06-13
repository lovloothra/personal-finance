/**
 * Ingest orchestration: downloaded attachments → classified transactions.
 *
 * For each pending attachment:
 *   unlock (qpdf + profile password candidates) → extract text (pdf.js) →
 *   [OCR fallback for scans] → parse (provider registry) → parsed_documents.
 * Then, across the whole batch, build the recurrence index, classify every
 * transaction (7-layer pipeline), and insert transactions + review_items.
 *
 * Idempotent at the attachment level: only `status = 'pending'` rows are
 * processed, so re-running after a partial import resumes cleanly.
 */
import 'server-only';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { attachments, gmailMessages, parsedDocuments, transactions, reviewItems, documentPasswords, internalTransferLinks } from '@/db/schema';
import { tryUnlock, qpdfAvailable } from '@/pdf/unlock';
import { extractText, LockedPdfError } from '@/pdf/extract';
import { buildPasswordCandidates } from '@/pdf/candidates';
import { parseStatement } from '@/parsers/registry';
import { buildRecurrenceIndex } from '@/classifier/recurrence';
import { signature } from '@/classifier/normalize';
import { classify } from '@/classifier/pipeline';
import { linkInternalTransfers } from '@/classifier/transfers';
import type { RawTxn, ClassifyContext } from '@/classifier/types';
import { fyForDate } from '@/ledger/fy';
import { loadProfileSeed, passwordInputs } from '@/profile/signals';
import { buildBaseContext } from './context';
import { rebuildClassificationReviewItems } from './review-items';
import { detectSubscriptions } from '@/ledger/subscriptions';

export interface IngestProgress {
  phase: 'parse' | 'classify' | 'review' | 'done';
  message: string;
  documents?: number;
  transactions?: number;
}
export type IngestProgressFn = (e: IngestProgress) => void;

export interface IngestResult {
  documents: number;
  transactions: number;
  reviewItems: number;
  byFy: Record<string, number>;
  duplicatesDropped: number;
}

let seq = 0;
const rid = (p: string) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

/** Last-resort qpdf unlock (only when the binary is present). Returns the
 * decrypted path, or null if qpdf couldn't open it with any candidate. */
function tryQpdf(path: string, candidates: string[]): string | null {
  const out = path.replace(/\.pdf$/i, '') + '.unlocked.pdf';
  const r = tryUnlock(path, candidates, out);
  return r.status === 'unlocked' ? r.outPath ?? out : null;
}

interface PendingTxn {
  id: string;
  docId: string;
  providerId: string | null;
  messageId: string | null;
  date: string;
  amount: number;
  currency: string;
  rawDescription: string;
}

export async function runIngest(db: DB, opts: { onProgress?: IngestProgressFn } = {}): Promise<IngestResult> {
  const onProgress = opts.onProgress ?? (() => {});
  const base = buildBaseContext(db);

  // Profile-derived password candidates for locked PDFs.
  let candidates: string[] = [];
  try {
    candidates = buildPasswordCandidates(passwordInputs(loadProfileSeed()));
  } catch {
    candidates = [];
  }
  // Append any passwords the user added manually (tried first — they're exact).
  const userPasswords = db.select({ v: documentPasswords.value }).from(documentPasswords).all().map((r) => r.v);
  candidates = [...userPasswords, ...candidates];

  // Clear transfer links up front — they reference transactions that the
  // per-attachment cleanup may delete, and they're rebuilt at the end.
  db.delete(internalTransferLinks).run();

  const pending = db
    .select({
      id: attachments.id,
      mimeType: attachments.mimeType,
      pathOnDisk: attachments.pathOnDisk,
      filename: attachments.filename,
      messageId: attachments.messageId,
      providerId: gmailMessages.institutionId,
    })
    .from(attachments)
    .leftJoin(gmailMessages, eq(attachments.messageId, gmailMessages.id))
    .where(eq(attachments.status, 'pending'))
    .all();

  const parsed: PendingTxn[] = [];
  let docCount = 0;
  let reviewCount = 0;

  const addReview = (kind: string, refId: string, title: string, detail: string, severity = 'warn') => {
    db.insert(reviewItems).values({ id: rid('rev'), kind, refId, title, detail, severity, status: 'open' }).run();
    reviewCount++;
  };
  const setStatus = (id: string, status: string, extra: Partial<typeof attachments.$inferInsert> = {}) =>
    db.update(attachments).set({ status, ...extra }).where(eq(attachments.id, id)).run();

  for (const att of pending) {
    // Clear any stale review items for this attachment before reprocessing.
    db.delete(reviewItems).where(eq(reviewItems.refId, att.id)).run();
    if (!att.pathOnDisk || (att.mimeType && !att.mimeType.includes('pdf') && !att.filename?.toLowerCase().endsWith('.pdf'))) {
      setStatus(att.id, 'unsupported');
      continue;
    }
    const path = att.pathOnDisk;

    // 1. Extract text. Encrypted PDFs are decrypted in pure JS by pdf.js using
    //    the profile-derived password candidates — no external qpdf needed.
    //    If pdf.js can't (rare: certificate security), fall back to qpdf when
    //    it happens to be installed.
    let text = '';
    let likelyScanned = false;
    let unlockMethod: string | null = null;
    try {
      const res = await extractText(path, { passwords: candidates });
      text = res.text;
      likelyScanned = res.likelyScanned;
      if (res.decrypted) unlockMethod = 'pdfjs_candidate';
    } catch (err) {
      if (err instanceof LockedPdfError) {
        // Last-resort: qpdf, only if the user happens to have it installed.
        const viaQpdf = qpdfAvailable() ? tryQpdf(path, candidates) : null;
        if (viaQpdf) {
          try {
            const res = await extractText(viaQpdf);
            text = res.text;
            likelyScanned = res.likelyScanned;
            unlockMethod = 'qpdf_candidate';
          } catch {
            text = '';
          }
        }
        if (!text) {
          addReview(
            'locked_pdf',
            att.id,
            `${att.filename ?? 'A statement'} is password-protected`,
            candidates.length
              ? `Tried ${candidates.length} profile-derived passwords (DOB, PAN, account/card last-4, customer id) without success. Add the document password under Profile to unlock it.`
              : 'Add your DOB, PAN and account/card last-4 under Profile so we can derive its password.',
            'alert',
          );
          setStatus(att.id, 'review', { locked: true });
          continue;
        }
      } else {
        addReview('locked_pdf', att.id, `${att.filename ?? 'A statement'} could not be read`, `Extraction failed: ${(err as Error).message}`, 'alert');
        setStatus(att.id, 'failed');
        continue;
      }
    }

    // 3. Scanned image → OCR (deferred: needs a raster backend) → review.
    if (likelyScanned || text.trim().length === 0) {
      addReview('locked_pdf', att.id, `${att.filename ?? 'A statement'} looks scanned`, 'No embedded text found. OCR spot-check needed before its figures are trusted.', 'warn');
      setStatus(att.id, 'review', { ocrUsed: true });
      continue;
    }

    // 4. Parse → parsed_documents + collect transactions.
    const providerId = att.providerId ?? 'unknown';
    const statement = parseStatement(text, { providerId, docType: 'bank_statement' });
    // Deterministic doc id keyed to the attachment so re-ingest is idempotent.
    const docId = `doc_${att.id}`;
    // Clear any prior output for this attachment before re-inserting.
    db.delete(transactions).where(eq(transactions.documentId, docId)).run();
    db.delete(parsedDocuments).where(eq(parsedDocuments.id, docId)).run();
    db.insert(parsedDocuments)
      .values({
        id: docId,
        attachmentId: att.id,
        messageId: att.messageId,
        parserId: `in/${providerId}`,
        institutionId: att.providerId,
        docType: 'bank_statement',
        rawText: text.slice(0, 20000),
        status: statement.txns.length ? 'parsed' : 'partial',
      })
      .run();
    docCount++;

    statement.txns.forEach((t, j) => {
      parsed.push({ id: `txn_${docId}_${j}`, docId, providerId: att.providerId, messageId: att.messageId, date: t.date, amount: t.amount, currency: t.currency, rawDescription: t.rawDescription });
    });
    setStatus(att.id, 'extracted', unlockMethod ? { locked: true, unlockMethod } : {});
    onProgress({ phase: 'parse', message: `Parsed ${att.filename ?? 'statement'} — ${statement.txns.length} transactions`, documents: docCount });
  }

  // 5. Build recurrence over the whole batch, then classify + insert.
  // Global cross-statement dedup: the same transaction often appears in
  // overlapping statements (e.g. a monthly AND an annual statement covering the
  // same period). Collapse identical (date + amount + description signature)
  // rows so they're counted once.
  const seenGlobal = new Set<string>();
  const dedupedParsed = parsed.filter((p) => {
    const sig = `${p.date}|${p.amount}|${signature(p.rawDescription)}`;
    if (seenGlobal.has(sig)) return false;
    seenGlobal.add(sig);
    return true;
  });
  const duplicatesDropped = parsed.length - dedupedParsed.length;

  const rawTxns: RawTxn[] = dedupedParsed.map((p) => ({
    id: p.id,
    date: p.date,
    amount: p.amount,
    currency: p.currency,
    rawDescription: p.rawDescription,
    institutionId: p.providerId ?? undefined,
  }));
  const recurrence = buildRecurrenceIndex(rawTxns);
  const ctx: ClassifyContext = { ...base, recurrence };

  const byFy: Record<string, number> = {};
  let txnCount = 0;
  onProgress({ phase: 'classify', message: `Classifying ${rawTxns.length} transactions…`, documents: docCount });

  // Classify once; reuse for both inserts and review flagging.
  const results = rawTxns.map((raw, i) => ({ raw, meta: dedupedParsed[i], c: classify(raw, ctx) }));

  // Link internal transfers (CC bill payments + self-transfers) across the
  // whole batch so both legs are excluded from income/expense rollups.
  // Pass the household's own name tokens so "IMPS .../Self/LOV" style transfers
  // are recognised.
  let selfNames: string[] = [];
  try {
    const seed = loadProfileSeed();
    selfNames = [seed.personal.fullName, seed.spouse?.fullName]
      .filter(Boolean)
      .flatMap((n) => (n as string).split(/\s+/))
      .filter((tok) => tok.length >= 3);
  } catch {
    selfNames = [];
  }
  const transfer = linkInternalTransfers(
    results.map(({ raw, meta, c }) => ({ id: raw.id, date: raw.date, amount: raw.amount, rawDescription: raw.rawDescription, documentId: meta.docId, flow: c.flow })),
    { selfNames },
  );

  db.transaction((tx) => {
    for (const { raw, meta, c } of results) {
      const fyKey = fyForDate(raw.date);
      byFy[fyKey] = (byFy[fyKey] ?? 0) + 1;
      const isTransfer = transfer.transferIds.has(raw.id) || c.isInternalTransfer || c.flow === 'transfer';
      const flow = isTransfer ? 'transfer' : c.flow;

      tx.insert(transactions)
        .values({
          id: raw.id,
          documentId: meta.docId,
          messageId: meta.messageId,
          institutionId: meta.providerId,
          txnDate: raw.date,
          amount: raw.amount,
          currency: raw.currency,
          rawDescription: raw.rawDescription,
          merchant: c.merchant ?? c.subcategory ?? null,
          flow,
          category: isTransfer ? 'Transfer' : c.category,
          subcategory: c.subcategory,
          confidence: c.confidence,
          classificationReason: c.reason,
          profileSignalUsed: c.signal,
          layer: c.layer,
          reviewRequired: isTransfer ? false : c.reviewRequired,
          isInternalTransfer: isTransfer,
          isRecurring: c.isRecurring ?? false,
          projectId: c.projectId ?? null,
          taxSection: c.taxSection ?? null,
          fyKey,
        })
        .onConflictDoUpdate({
          target: transactions.id,
          set: { flow, category: isTransfer ? 'Transfer' : c.category, subcategory: c.subcategory, confidence: c.confidence, classificationReason: c.reason, profileSignalUsed: c.signal, layer: c.layer, reviewRequired: isTransfer ? false : c.reviewRequired, isInternalTransfer: isTransfer, fyKey },
        })
        .run();
      txnCount++;
    }

    // Record the matched transfer pairs for provenance.
    tx.delete(internalTransferLinks).run();
    for (const link of transfer.links) {
      tx.insert(internalTransferLinks)
        .values({ id: `lnk_${link.debitId}_${link.creditId}`.slice(0, 80), kind: link.kind, debitTxnId: link.debitId, creditTxnId: link.creditId, confidence: 'high' })
        .onConflictDoNothing()
        .run();
    }
  });

  // 6. Rebuild the classification-derived review queue from the transactions
  // table (idempotent — re-running ingest never duplicates review items).
  reviewCount += rebuildClassificationReviewItems(db);

  // 7. Materialise detected subscriptions from the classified ledger (known
  // subscription merchants + recurring unknowns), grouped by canonical merchant.
  detectSubscriptions(db);

  onProgress({ phase: 'done', message: `Ingest complete (${duplicatesDropped} duplicates removed)`, documents: docCount, transactions: txnCount });
  return { documents: docCount, transactions: txnCount, reviewItems: reviewCount, byFy, duplicatesDropped };
}
