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
import { transactions, subscriptionsDetected, internalTransferLinks } from '@/db/schema';
import { buildRecurrenceIndex } from '@/classifier/recurrence';
import { signature } from '@/classifier/normalize';
import { classify } from '@/classifier/pipeline';
import { linkInternalTransfers } from '@/classifier/transfers';
import type { RawTxn, ClassifyContext } from '@/classifier/types';
import { fyForDate } from '@/ledger/fy';
import { loadProfileSeed } from '@/profile/signals';
import { buildBaseContext } from './context';
import { rebuildClassificationReviewItems } from './review-items';

export interface ReclassifyResult {
  transactions: number;
  changed: number;
}

function addCadence(iso: string, cadence: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (cadence === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else if (cadence === 'quarterly') d.setUTCMonth(d.getUTCMonth() + 3);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function reclassifyAll(db: DB): ReclassifyResult {
  const base = buildBaseContext(db);

  const rows = db
    .select({
      id: transactions.id,
      documentId: transactions.documentId,
      txnDate: transactions.txnDate,
      amount: transactions.amount,
      currency: transactions.currency,
      rawDescription: transactions.rawDescription,
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
  }));
  const recurrence = buildRecurrenceIndex(rawTxns);
  const ctx: ClassifyContext = { ...base, recurrence };

  const results = rawTxns.map((raw, i) => ({ raw, prev: rows[i], c: classify(raw, ctx) }));

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
    results.map(({ raw, prev, c }) => ({ id: raw.id, date: raw.date, amount: raw.amount, rawDescription: raw.rawDescription, documentId: prev.documentId ?? '', flow: c.flow })),
    { selfNames },
  );

  // Preserve subscription statuses the user has confirmed/dismissed.
  const prevSubStatus = new Map(
    db.select({ id: subscriptionsDetected.id, status: subscriptionsDetected.status }).from(subscriptionsDetected).all().map((r) => [r.id, r.status]),
  );

  let changed = 0;
  db.transaction((tx) => {
    for (const { raw, prev, c } of results) {
      const isTransfer = transfer.transferIds.has(raw.id) || c.isInternalTransfer || c.flow === 'transfer';
      const flow = isTransfer ? 'transfer' : c.flow;
      const category = isTransfer ? 'Transfer' : c.category;
      const merchant = c.merchant ?? c.subcategory ?? null;
      if (category !== prev.category || flow !== prev.flow || merchant !== prev.merchant) changed++;

      tx.update(transactions)
        .set({
          merchant,
          flow,
          category,
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

    // Rebuild detected subscriptions from scratch (statuses carried over).
    const NON_SUBSCRIPTION = new Set(['Housing', 'Loan', 'Insurance', 'Salary', 'Investment', 'Transfer', 'Uncategorised', 'Fees & Charges', 'Cash']);
    const subGroups = new Map<string, { merchant: string; category: string; cadence: string; occurrences: number; amounts: number[]; dates: string[] }>();
    for (const { raw, c } of results) {
      if (c.flow !== 'expense' || raw.amount >= 0) continue;
      if (NON_SUBSCRIPTION.has(c.category) || transfer.transferIds.has(raw.id)) continue;
      const sig = signature(c.merchant ?? raw.rawDescription);
      const hit = recurrence.get(sig);
      if (!hit) continue;
      const merchant = (c.merchant ?? c.subcategory ?? raw.rawDescription).trim().slice(0, 60);
      const g = subGroups.get(sig) ?? { merchant, category: c.category, cadence: hit.cadence, occurrences: hit.occurrences, amounts: [], dates: [] };
      g.amounts.push(Math.abs(raw.amount));
      g.dates.push(raw.date);
      subGroups.set(sig, g);
    }
    tx.delete(subscriptionsDetected).run();
    for (const [sig, g] of subGroups) {
      const dates = [...g.dates].sort();
      const lastSeen = dates[dates.length - 1];
      const id = `sub_${sig.replace(/\s+/g, '-').slice(0, 40)}`;
      tx.insert(subscriptionsDetected)
        .values({
          id,
          merchant: g.merchant,
          amount: g.amounts[g.amounts.length - 1],
          cadence: g.cadence,
          status: prevSubStatus.get(id) ?? (g.occurrences >= 6 ? 'confirmed' : 'likely'),
          firstSeen: dates[0],
          lastSeen,
          nextChargeEta: addCadence(lastSeen, g.cadence),
          occurrences: g.occurrences || g.dates.length,
          category: g.category,
        })
        .run();
    }
  });

  // Classification-derived review items mirror the updated transactions.
  rebuildClassificationReviewItems(db);

  return { transactions: results.length, changed };
}
