/**
 * Remove a document's ingest output so it can be re-parsed.
 *
 * `transactions.id` is referenced by six tables with no ON DELETE clause and
 * `foreign_keys = ON`, so the naive `DELETE FROM transactions` throws
 * `FOREIGN KEY constraint failed` the moment feedback or ML predictions exist.
 * Children split by ownership:
 *   - derived state (predictions, suggestions, transfer links) → deleted; a
 *     re-ingest recomputes them;
 *   - user knowledge (feedback, model examples, tax evidence, overrides) →
 *     kept with the transaction pointer nulled — signatures still match the
 *     re-ingested rows, and feedback/examples are the ML training corpus.
 */
import 'server-only';
import { eq, inArray, or } from 'drizzle-orm';
import type { DB } from '@/db/client';
import {
  classificationFeedback,
  classificationPredictions,
  internalTransferLinks,
  localModelExamples,
  localModelSuggestions,
  taxEvidence,
  transactions,
  userOverrides,
} from '@/db/schema';

export function clearDocumentOutput(db: DB, docId: string): void {
  const txnIds = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.documentId, docId))
    .all()
    .map((r) => r.id);

  // Chunk id lists to stay well under SQLite's bound-parameter limit.
  for (let i = 0; i < txnIds.length; i += 500) {
    const chunk = txnIds.slice(i, i + 500);

    const predIds = db
      .select({ id: classificationPredictions.id })
      .from(classificationPredictions)
      .where(inArray(classificationPredictions.transactionId, chunk))
      .all()
      .map((r) => r.id);
    // Suggestions FK-reference predictions too, so they go first.
    db.delete(localModelSuggestions)
      .where(
        predIds.length
          ? or(inArray(localModelSuggestions.transactionId, chunk), inArray(localModelSuggestions.predictionId, predIds))
          : inArray(localModelSuggestions.transactionId, chunk),
      )
      .run();
    db.delete(classificationPredictions).where(inArray(classificationPredictions.transactionId, chunk)).run();
    db.delete(internalTransferLinks)
      .where(or(inArray(internalTransferLinks.debitTxnId, chunk), inArray(internalTransferLinks.creditTxnId, chunk)))
      .run();

    db.update(classificationFeedback).set({ transactionId: null }).where(inArray(classificationFeedback.transactionId, chunk)).run();
    db.update(localModelExamples).set({ transactionId: null }).where(inArray(localModelExamples.transactionId, chunk)).run();
    db.update(taxEvidence).set({ transactionId: null }).where(inArray(taxEvidence.transactionId, chunk)).run();
    db.update(userOverrides).set({ transactionId: null }).where(inArray(userOverrides.transactionId, chunk)).run();
  }

  db.delete(transactions).where(eq(transactions.documentId, docId)).run();
}
