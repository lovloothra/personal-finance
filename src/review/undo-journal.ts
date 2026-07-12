/**
 * Before-state snapshot + exact restore for the assign flow's undo.
 *
 * Why a snapshot and not "delete what assign created": assign UPSERTS its
 * side effects — an existing signature override, merchant alias, feedback
 * row, or local-model example gets UPDATED in place, and blanket deletion
 * would destroy user data that predates the assignment. The journal records,
 * per row, whether it existed and what its fields were, so undo restores the
 * exact prior state. Review items are deliberately absent: they're a
 * rebuildable projection of transactions.review_required
 * (rebuildClassificationReviewItems), regenerated after restore.
 */
import 'server-only';
import { eq } from 'drizzle-orm';
import {
  classificationFeedback,
  localClassifierHeads,
  localModelExamples,
  merchantAliases,
  transactions,
  userOverrides,
} from '@/db/schema';
import type { DbTx } from '@/intelligence/store';
import { LOCAL_MODEL_VERSION } from '@/intelligence/local-model';

/** The transaction fields the assign route mutates (plus updatedAt so undo
 * leaves no fingerprint). */
export interface TxnPrior {
  id: string;
  merchant: string | null;
  category: string | null;
  subcategory: string | null;
  flow: 'income' | 'expense' | 'transfer' | 'investment' | null;
  isInternalTransfer: boolean | null;
  suspectedTransfer: boolean | null;
  confidence: 'high' | 'med' | 'low' | null;
  layer: number | null;
  classificationSource: 'deterministic' | 'local_ml';
  acceptedPredictionId: string | null;
  classificationReason: string | null;
  profileSignalUsed: string | null;
  reviewRequired: boolean | null;
  updatedAt: number;
}

/** A row assign upserted: `existed: false` means assign created it (undo
 * deletes); `existed: true` means assign updated it (undo restores `prior`). */
export interface RowSnapshot<T> {
  id: string;
  existed: boolean;
  prior?: T;
}

export type OverridePrior = typeof userOverrides.$inferSelect;
export type AliasPrior = typeof merchantAliases.$inferSelect;
export type FeedbackPrior = typeof classificationFeedback.$inferSelect;
export type ExamplePrior = typeof localModelExamples.$inferSelect;

export interface UndoSnapshot {
  signature: string;
  override: RowSnapshot<OverridePrior>;
  alias: RowSnapshot<AliasPrior> | null;
  feedback: RowSnapshot<FeedbackPrior>[];
  examples: RowSnapshot<ExamplePrior>[];
  txns: TxnPrior[];
}

/** Light structural check before trusting a journal payload from the DB. */
export function isUndoSnapshot(x: unknown): x is UndoSnapshot {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.signature === 'string' &&
    Array.isArray(s.txns) &&
    Array.isArray(s.feedback) &&
    Array.isArray(s.examples) &&
    typeof s.override === 'object' && s.override !== null
  );
}

type RestorableTable = typeof userOverrides | typeof merchantAliases | typeof classificationFeedback | typeof localModelExamples;

function restoreRow(tx: DbTx, table: RestorableTable, snap: RowSnapshot<Record<string, unknown>>): void {
  if (snap.existed && snap.prior) {
    // Full-row restore: every captured column back to its prior value. The
    // cast crosses drizzle's per-table typing; the snapshot was captured via
    // $inferSelect on the same table, so the shape matches by construction.
    const { id: _id, ...fields } = snap.prior;
    tx.update(table).set(fields as never).where(eq(table.id, snap.id)).run();
  } else {
    tx.delete(table).where(eq(table.id, snap.id)).run();
  }
}

/**
 * Apply the inverse of one assignment inside an open transaction. The caller
 * marks the journal row consumed and rebuilds projections after commit.
 */
export function restoreSnapshot(tx: DbTx, snap: UndoSnapshot): { restoredTxns: number } {
  for (const t of snap.txns) {
    const { id, ...prior } = t;
    tx.update(transactions).set(prior).where(eq(transactions.id, id)).run();
  }

  restoreRow(tx, userOverrides, snap.override as RowSnapshot<Record<string, unknown>>);
  if (snap.alias) restoreRow(tx, merchantAliases, snap.alias as RowSnapshot<Record<string, unknown>>);
  // Examples FK-reference feedback (local_model_examples.feedback_id), so
  // created examples must be deleted before their created feedback rows.
  for (const e of snap.examples) restoreRow(tx, localModelExamples, e as RowSnapshot<Record<string, unknown>>);
  for (const f of snap.feedback) restoreRow(tx, classificationFeedback, f as RowSnapshot<Record<string, unknown>>);

  // The restored feedback/examples change the training set — the head must
  // retrain before its next use. Marking stale is enough; rebuilding
  // immediately is unnecessary (loadLocalClassifierState does it lazily).
  tx.update(localClassifierHeads)
    .set({ stale: true, updatedAt: Date.now() })
    .where(eq(localClassifierHeads.id, LOCAL_MODEL_VERSION))
    .run();

  return { restoredTxns: snap.txns.length };
}
