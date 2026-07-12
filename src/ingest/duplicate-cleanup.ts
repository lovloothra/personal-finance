/**
 * Plan and apply historical cleanup for weak narration-drift duplicates.
 * The detector is pure; all DB mutation stays explicit and transactional here.
 */
import 'server-only';
import { eq, inArray } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { duplicateCandidates, transactions } from '@/db/schema';
import { detectSuspectedDuplicates, type SuspectedDedupRow, type SuspectedDuplicatePair } from './dedup';
import { detachTransactionChildren } from './clear-output';

export interface DuplicateCleanupPlan {
  totalRows: number;
  pairs: SuspectedDuplicatePair[];
  keptDecisionsSkipped: number;
}

/** Scan the current ledger deterministically without changing it. */
export function planDuplicateCleanup(db: DB): DuplicateCleanupPlan {
  const rows: SuspectedDedupRow[] = db
    .select({
      id: transactions.id,
      docId: transactions.documentId,
      date: transactions.txnDate,
      amount: transactions.amount,
      rawDescription: transactions.rawDescription,
      ownAccountId: transactions.ownAccountId,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .all()
    .map((row) => ({
      ...row,
      docId: row.docId ?? '',
      rawDescription: row.rawDescription ?? '',
    }))
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id));

  const statusByCandidate = new Map(
    db.select({ candidateId: duplicateCandidates.candidateTransactionId, status: duplicateCandidates.status })
      .from(duplicateCandidates)
      .all()
      .map((row) => [row.candidateId, row.status]),
  );
  const detected = detectSuspectedDuplicates([], rows);
  const pairs = detected.filter((pair) => statusByCandidate.get(pair.candidate.id) !== 'kept');

  return {
    totalRows: rows.length,
    pairs,
    keptDecisionsSkipped: detected.length - pairs.length,
  };
}

export interface DuplicateCleanupResult extends DuplicateCleanupPlan {
  removed: number;
  totalAfter: number;
}

/** Re-plan at call time, then remove every approved candidate atomically. */
export function applyDuplicateCleanup(db: DB): DuplicateCleanupResult {
  const plan = planDuplicateCleanup(db);
  const candidateIds = plan.pairs.map((pair) => pair.candidate.id);
  if (candidateIds.length === 0) {
    return { ...plan, removed: 0, totalAfter: plan.totalRows };
  }

  db.transaction((tx) => {
    detachTransactionChildren(tx, candidateIds);
    for (const pair of plan.pairs) {
      tx.insert(duplicateCandidates)
        .values({
          id: pair.id,
          keeperTransactionId: pair.keeper.id,
          candidateTransactionId: pair.candidate.id,
          basis: pair.basis,
          status: 'removed',
          updatedAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: duplicateCandidates.id,
          set: {
            keeperTransactionId: pair.keeper.id,
            basis: pair.basis,
            status: 'removed',
            updatedAt: Date.now(),
          },
        })
        .run();
    }
    for (let i = 0; i < candidateIds.length; i += 500) {
      tx.delete(transactions).where(inArray(transactions.id, candidateIds.slice(i, i + 500))).run();
    }
  });

  const totalAfter = db.select({ id: transactions.id }).from(transactions).all().length;
  return { ...plan, removed: candidateIds.length, totalAfter };
}

/** Read one durable decision, used by tests and rehearsal reporting. */
export function duplicateDecision(db: DB, id: string) {
  return db.select().from(duplicateCandidates).where(eq(duplicateCandidates.id, id)).get();
}
