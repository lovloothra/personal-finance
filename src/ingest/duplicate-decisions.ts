/**
 * Reconcile detected duplicate pairs against the durable decisions the user
 * already made.
 *
 * Transaction ids are positional (`txn_<docId>_<index>`), so a reparse
 * re-inserts a document's rows under the SAME ids. A row the user removed
 * therefore comes back, and because its candidate record still reads `removed`
 * the review UI — which only lists `open` pairs — can never surface it again.
 * This pass re-applies the decision instead.
 *
 * Positional ids are also reusable: after a parser change, index 7 of a
 * document may be an entirely different transaction. Honouring a `removed`
 * decision by id alone would silently delete real spending, so a decision is
 * only re-applied when the row's content fingerprint still matches the one
 * recorded when the decision was made. Anything else goes back to review.
 */
import 'server-only';
import { eq } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { duplicateCandidates, transactions } from '@/db/schema';
import { rowFingerprint, type SuspectedDuplicatePair } from './dedup';
import { detachTransactionChildren } from './clear-output';

export interface DuplicateReconcileResult {
  /** Pairs newly recorded for review. */
  opened: number;
  /** Resurrected rows deleted again under a prior `removed` decision. */
  reRemoved: number;
  /** `removed` decisions that could not be verified and were sent back to review. */
  reopened: number;
  /** Ids of the rows deleted by `reRemoved`, so callers can skip their children. */
  reRemovedIds: string[];
}

export function reconcileDuplicateDecisions(
  db: DB,
  pairs: SuspectedDuplicatePair[],
): DuplicateReconcileResult {
  const result: DuplicateReconcileResult = { opened: 0, reRemoved: 0, reopened: 0, reRemovedIds: [] };

  for (const pair of pairs) {
    const fingerprint = rowFingerprint(pair.candidate);
    const existing = db
      .select()
      .from(duplicateCandidates)
      .where(eq(duplicateCandidates.id, pair.id))
      .get();

    if (!existing) {
      db.insert(duplicateCandidates)
        .values({
          id: pair.id,
          keeperTransactionId: pair.keeper.id,
          candidateTransactionId: pair.candidate.id,
          candidateFingerprint: fingerprint,
          basis: pair.basis,
          status: 'open',
        })
        .run();
      result.opened++;
      continue;
    }

    // A kept pair is a permanent dismissal; a still-open one is already queued.
    if (existing.status !== 'removed') continue;

    const resurrected = db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.id, pair.candidate.id))
      .get();
    if (!resurrected) continue;

    // Records written before fingerprints existed cannot be verified, so the
    // user re-confirms once; from then on the decision is durable.
    if (existing.candidateFingerprint !== fingerprint) {
      db.update(duplicateCandidates)
        .set({
          keeperTransactionId: pair.keeper.id,
          candidateFingerprint: fingerprint,
          status: 'open',
          updatedAt: Date.now(),
        })
        .where(eq(duplicateCandidates.id, pair.id))
        .run();
      result.reopened++;
      continue;
    }

    detachTransactionChildren(db, [pair.candidate.id]);
    db.delete(transactions).where(eq(transactions.id, pair.candidate.id)).run();
    db.update(duplicateCandidates)
      .set({ keeperTransactionId: pair.keeper.id, updatedAt: Date.now() })
      .where(eq(duplicateCandidates.id, pair.id))
      .run();
    result.reRemoved++;
    result.reRemovedIds.push(pair.candidate.id);
  }

  return result;
}
