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
import { attachments, gmailMessages, parsedDocuments, transactions, reviewItems, subscriptionsDetected } from '@/db/schema';
import { tryUnlock, QPDF_INSTALL_HINT } from '@/pdf/unlock';
import { extractText } from '@/pdf/extract';
import { buildPasswordCandidates } from '@/pdf/candidates';
import { parseStatement } from '@/parsers/registry';
import { buildRecurrenceIndex } from '@/classifier/recurrence';
import { signature } from '@/classifier/normalize';
import { classify } from '@/classifier/pipeline';
import type { RawTxn, ClassifyContext } from '@/classifier/types';
import { fyForDate } from '@/ledger/fy';
import { loadProfileSeed, passwordInputs } from '@/profile/signals';
import { buildBaseContext } from './context';

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
}

let seq = 0;
const rid = (p: string) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

/** Add one cadence period to an ISO date, returning the next expected charge. */
function addCadence(iso: string, cadence: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (cadence === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else if (cadence === 'quarterly') d.setUTCMonth(d.getUTCMonth() + 3);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

interface PendingTxn {
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
    if (!att.pathOnDisk || (att.mimeType && !att.mimeType.includes('pdf') && !att.filename?.toLowerCase().endsWith('.pdf'))) {
      setStatus(att.id, 'unsupported');
      continue;
    }
    let path = att.pathOnDisk;

    // 1. Unlock if encrypted.
    const unlockedPath = join(path.replace(/\.pdf$/i, '') + '.unlocked.pdf');
    const unlock = tryUnlock(path, candidates, unlockedPath);
    if (unlock.status === 'unlocked') {
      path = unlock.outPath!;
      setStatus(att.id, 'pending', { locked: true, unlockMethod: 'qpdf_candidate' });
    } else if (unlock.status === 'failed') {
      addReview('locked_pdf', att.id, `${att.filename ?? 'A statement'} is password-protected`, `Tried ${unlock.triedCandidates ?? 0} profile-derived passwords without success. Add a hint to unlock.`, 'alert');
      setStatus(att.id, 'review', { locked: true });
      continue;
    } else if (unlock.status === 'qpdf_missing') {
      // Only a problem if the file is actually encrypted; extraction below will
      // tell us. Try extraction; if it throws we treat as locked.
    }

    // 2. Extract text.
    let text = '';
    let likelyScanned = false;
    try {
      const res = await extractText(path);
      text = res.text;
      likelyScanned = res.likelyScanned;
    } catch (err) {
      const msg = (err as Error).message ?? '';
      const looksLocked = /password|encrypt/i.test(msg);
      addReview(
        'locked_pdf',
        att.id,
        `${att.filename ?? 'A statement'} could not be read`,
        looksLocked ? `Looks password-protected. ${QPDF_INSTALL_HINT}` : `Extraction failed: ${msg}`,
        'alert',
      );
      setStatus(att.id, 'failed');
      continue;
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
    const docId = rid('doc');
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

    for (const t of statement.txns) {
      parsed.push({ docId, providerId: att.providerId, messageId: att.messageId, date: t.date, amount: t.amount, currency: t.currency, rawDescription: t.rawDescription });
    }
    setStatus(att.id, 'extracted');
    onProgress({ phase: 'parse', message: `Parsed ${att.filename ?? 'statement'} — ${statement.txns.length} transactions`, documents: docCount });
  }

  // 5. Build recurrence over the whole batch, then classify + insert.
  const rawTxns: RawTxn[] = parsed.map((p, i) => ({
    id: `txn_${p.docId}_${i}`,
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
  const results = rawTxns.map((raw, i) => ({ raw, meta: parsed[i], c: classify(raw, ctx) }));

  db.transaction((tx) => {
    for (const { raw, meta, c } of results) {
      const fyKey = fyForDate(raw.date);
      byFy[fyKey] = (byFy[fyKey] ?? 0) + 1;

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
          flow: c.flow,
          category: c.category,
          subcategory: c.subcategory,
          confidence: c.confidence,
          classificationReason: c.reason,
          profileSignalUsed: c.signal,
          layer: c.layer,
          reviewRequired: c.reviewRequired,
          isInternalTransfer: c.isInternalTransfer ?? false,
          isRecurring: c.isRecurring ?? false,
          projectId: c.projectId ?? null,
          taxSection: c.taxSection ?? null,
          fyKey,
        })
        .onConflictDoUpdate({
          target: transactions.id,
          set: { flow: c.flow, category: c.category, subcategory: c.subcategory, confidence: c.confidence, classificationReason: c.reason, profileSignalUsed: c.signal, layer: c.layer, reviewRequired: c.reviewRequired, fyKey },
        })
        .run();
      txnCount++;
    }
  });

  // 6. Flag low-confidence / uncategorised for review.
  const lowConf = results.filter(({ c }) => c.reviewRequired);
  for (const { raw, c } of lowConf.slice(0, 200)) {
    addReview(
      c.category === 'Uncategorised' ? 'uncategorised' : 'low_confidence',
      raw.id,
      `Needs a look: ${raw.rawDescription.slice(0, 48) || 'transaction'}`,
      c.reason,
      'info',
    );
  }

  // 7. Materialise detected subscriptions. A subscription is any RECURRING
  // debit (per the recurrence index) that isn't a structural commitment like
  // rent, an EMI, insurance, an investment, or an internal transfer — those
  // belong on their own pages. This catches merchant-aliased recurring charges
  // (Netflix, gym, cloud) that matched before the recurrence layer.
  const NON_SUBSCRIPTION = new Set(['Housing', 'Loan', 'Insurance', 'Salary', 'Investment', 'Transfer']);
  const subGroups = new Map<string, { merchant: string; category: string; cadence: string; occurrences: number; amounts: number[]; dates: string[] }>();
  for (const { raw, c } of results) {
    if (c.flow !== 'expense' || raw.amount >= 0) continue;
    if (NON_SUBSCRIPTION.has(c.category)) continue;
    const sig = signature(raw.merchant ?? raw.rawDescription);
    const hit = recurrence.get(sig);
    if (!hit) continue; // only recurring charges
    const merchant = (raw.merchant ?? c.merchant ?? c.subcategory ?? raw.rawDescription).trim().slice(0, 60);
    const g = subGroups.get(sig) ?? { merchant, category: c.category, cadence: hit.cadence, occurrences: hit.occurrences, amounts: [], dates: [] };
    g.amounts.push(Math.abs(raw.amount));
    g.dates.push(raw.date);
    subGroups.set(sig, g);
  }
  db.transaction((tx) => {
    for (const [sig, g] of subGroups) {
      const dates = [...g.dates].sort();
      const lastSeen = dates[dates.length - 1];
      const id = `sub_${sig.replace(/\s+/g, '-').slice(0, 40)}`;
      tx
        .insert(subscriptionsDetected)
        .values({
          id,
          merchant: g.merchant,
          amount: g.amounts[g.amounts.length - 1],
          cadence: g.cadence,
          status: g.occurrences >= 6 ? 'confirmed' : 'likely',
          firstSeen: dates[0],
          lastSeen,
          nextChargeEta: addCadence(lastSeen, g.cadence),
          occurrences: g.occurrences || g.dates.length,
          category: g.category,
        })
        .onConflictDoUpdate({
          target: subscriptionsDetected.id,
          set: { amount: g.amounts[g.amounts.length - 1], cadence: g.cadence, lastSeen, nextChargeEta: addCadence(lastSeen, g.cadence), occurrences: g.occurrences || g.dates.length, updatedAt: Date.now() },
        })
        .run();
    }
  });

  onProgress({ phase: 'done', message: 'Ingest complete', documents: docCount, transactions: txnCount });
  return { documents: docCount, transactions: txnCount, reviewItems: reviewCount, byFy };
}
