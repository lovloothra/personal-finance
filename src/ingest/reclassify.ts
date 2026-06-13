/**
 * Re-run classification over every stored transaction without re-parsing PDFs.
 *
 * Used after the classification inputs change — a new user override, updated
 * packs, profile edits, or tightened classifier rules — so the fixes apply
 * retroactively to already-imported data. Mirrors the classify/insert phase of
 * runIngest exactly: same recurrence index, same transfer linking, same column
 * writes, then rebuilds the derived review items and detected subscriptions.
 */
import 'server-only';
import { eq } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { transactions, internalTransferLinks } from '@/db/schema';
import { buildRecurrenceIndex } from '@/classifier/recurrence';
import { classify } from '@/classifier/pipeline';
import { linkInternalTransfers } from '@/classifier/transfers';
import type { RawTxn, ClassifyContext } from '@/classifier/types';
import { fyForDate } from '@/ledger/fy';
import { loadProfileSeed } from '@/profile/signals';
import { buildBaseContext } from './context';
import { rebuildClassificationReviewItems } from './review-items';
import { detectSubscriptions } from '@/ledger/subscriptions';
import { decideClassification } from '@/intelligence/local-model';
import { loadLocalClassifierState, predictionIdFor, recordLocalDecision } from '@/intelligence/store';

export interface ReclassifyResult {
  transactions: number;
  changed: number;
}

export async function reclassifyAll(db: DB): Promise<ReclassifyResult> {
  const base = buildBaseContext(db);

  const rows = db
    .select({
      id: transactions.id,
      documentId: transactions.documentId,
      txnDate: transactions.txnDate,
      amount: transactions.amount,
      currency: transactions.currency,
      rawDescription: transactions.rawDescription,
      institutionId: transactions.institutionId,
      category: transactions.category,
      flow: transactions.flow,
      merchant: transactions.merchant,
    })
    .from(transactions)
    .all();

  const rawTxns: RawTxn[] = rows.map((r) => ({
    id: r.id,
    date: r.txnDate,
    amount: r.amount,
    currency: r.currency ?? 'INR',
    rawDescription: r.rawDescription ?? '',
    institutionId: r.institutionId ?? undefined,
  }));
  const recurrence = buildRecurrenceIndex(rawTxns);
  const ctx: ClassifyContext = { ...base, recurrence };
  const localState = await loadLocalClassifierState(db);

  const results = await Promise.all(rawTxns.map(async (raw, i) => {
    const deterministic = classify(raw, ctx);
    const decision = await decideClassification(raw, deterministic, localState);
    return { raw, prev: rows[i], deterministic, decision, c: decision.finalResult };
  }));

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
    results.map(({ raw, prev, deterministic }) => ({ id: raw.id, date: raw.date, amount: raw.amount, rawDescription: raw.rawDescription, documentId: prev.documentId ?? '', flow: deterministic.flow })),
    { selfNames },
  );

  let changed = 0;
  db.transaction((tx) => {
    for (const { raw, prev, c, deterministic, decision } of results) {
      const isTransfer = transfer.transferIds.has(raw.id) || c.isInternalTransfer || c.flow === 'transfer';
      const final = isTransfer ? deterministic : c;
      const flow = isTransfer ? 'transfer' : final.flow;
      const category = isTransfer ? 'Transfer' : final.category;
      const merchant = final.merchant ?? final.subcategory ?? null;
      const acceptedPredictionId =
        !isTransfer && decision.source === 'local_ml' && decision.localPrediction
          ? predictionIdFor(raw.id, decision.localPrediction.modelVersion)
          : null;
      if (category !== prev.category || flow !== prev.flow || merchant !== prev.merchant) changed++;

      tx.update(transactions)
        .set({
          merchant,
          flow,
          category,
          subcategory: final.subcategory,
          confidence: final.confidence,
          classificationReason: final.reason,
          profileSignalUsed: final.signal,
          layer: final.layer,
          classificationSource: isTransfer ? 'deterministic' : decision.source,
          acceptedPredictionId,
          reviewRequired: isTransfer ? false : final.reviewRequired,
          isInternalTransfer: isTransfer,
          isRecurring: final.isRecurring ?? false,
          projectId: final.projectId ?? null,
          taxSection: final.taxSection ?? null,
          fyKey: fyForDate(raw.date),
          updatedAt: Date.now(),
        })
        .where(eq(transactions.id, raw.id))
        .run();
    }

    tx.delete(internalTransferLinks).run();
    for (const link of transfer.links) {
      tx.insert(internalTransferLinks)
        .values({ id: `lnk_${link.debitId}_${link.creditId}`.slice(0, 80), kind: link.kind, debitTxnId: link.debitId, creditTxnId: link.creditId, confidence: 'high' })
        .onConflictDoNothing()
        .run();
    }

  });

  for (const { raw, decision } of results) {
    if (!transfer.transferIds.has(raw.id)) recordLocalDecision(db, raw.id, decision);
  }

  // Subscriptions + review items are projections of the updated ledger.
  detectSubscriptions(db);
  rebuildClassificationReviewItems(db);

  return { transactions: results.length, changed };
}
