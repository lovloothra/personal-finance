/**
 * Regression: re-ingesting a document (reparse/unlock) deletes its transactions,
 * but six tables hold FKs to transactions.id with no ON DELETE — once feedback
 * or ML predictions exist, the naive delete throws `FOREIGN KEY constraint
 * failed` and the whole re-ingest 500s. clearDocumentOutput must detach or
 * remove children first: predictions/suggestions/transfer-links are derived
 * state (delete); feedback/examples/tax-evidence/overrides are user knowledge
 * (keep, null the transaction pointer).
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-clear-output-')), 'test.db');
process.env.PF_DB_PASSPHRASE = 'test-passphrase';

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { getDb, type DB } from '@/db/client';
import {
  classificationFeedback,
  classificationPredictions,
  internalTransferLinks,
  localModelExamples,
  localModelSuggestions,
  parsedDocuments,
  taxEvidence,
  transactions,
  userOverrides,
} from '@/db/schema';
import { clearDocumentOutput } from '../clear-output';

let db: DB;

const txn = (id: string, docId: string) => ({
  id, documentId: docId, txnDate: '2026-05-01', amount: -50000, currency: 'INR',
  rawDescription: `desc ${id}`, flow: 'expense' as const, category: 'dining',
});

before(async () => {
  db = await getDb();
  db.insert(parsedDocuments).values([{ id: 'doc_a' }, { id: 'doc_b' }]).run();
  db.insert(transactions).values([txn('t1', 'doc_a'), txn('t2', 'doc_a'), txn('t3', 'doc_b')]).run();

  // Derived ML state for t1 (delete on reparse) …
  db.insert(classificationPredictions).values({
    id: 'p1', transactionId: 't1', modelVersion: 'minilm-softmax-v1', predictedMerchant: 'Cafe',
    category: 'Dining', flow: 'expense', confidenceScore: 0.5, confidence: 'med',
    reason: 'test', provenance: {}, decision: 'suggested',
  }).run();
  db.insert(localModelSuggestions).values({ id: 's1', predictionId: 'p1', transactionId: 't1' }).run();
  db.insert(internalTransferLinks).values({ id: 'l1', kind: 'account_transfer', debitTxnId: 't1', creditTxnId: 't2' }).run();

  // …and user knowledge (must survive with the pointer nulled).
  db.insert(classificationFeedback).values({
    id: 'f1', transactionId: 't1', matchSignature: 'sig', rawDescription: 'desc t1',
    merchant: 'Cafe', category: 'dining', flow: 'expense', amount: -50000,
    source: 'review_assignment', reviewedAt: Date.now(),
  }).run();
  db.insert(localModelExamples).values({
    id: 'e1', feedbackId: 'f1', transactionId: 't1', signature: 'sig', rawDescription: 'desc t1',
    merchant: 'Cafe', category: 'dining', flow: 'expense', amount: -50000,
    amountBucket: 'expense:100-500', direction: 'debit', source: 'review_assignment', reviewedAt: Date.now(),
  }).run();
  db.insert(taxEvidence).values({ id: 'te1', fyKey: '2026-27', section: '80C', transactionId: 't1' }).run();
  db.insert(userOverrides).values({ id: 'o1', transactionId: 't1', matchSignature: 'sig' }).run();

  // Control: another document's derived state must be untouched.
  db.insert(classificationPredictions).values({
    id: 'p3', transactionId: 't3', modelVersion: 'minilm-softmax-v1', predictedMerchant: 'X',
    category: 'Dining', flow: 'expense', confidenceScore: 0.5, confidence: 'med',
    reason: 'test', provenance: {}, decision: 'suggested',
  }).run();
});

test('clearDocumentOutput removes the doc txns without FK failure once children exist', async () => {
  clearDocumentOutput(db, 'doc_a'); // the old naive delete threw right here

  const remaining = db.select({ id: transactions.id }).from(transactions).all().map((r) => r.id);
  assert.deepEqual(remaining.sort(), ['t3']);
});

test('derived ML state for the doc is deleted; other docs untouched', () => {
  assert.equal(db.select().from(classificationPredictions).all().find((p) => p.id === 'p1'), undefined);
  assert.equal(db.select().from(localModelSuggestions).all().length, 0);
  assert.equal(db.select().from(internalTransferLinks).all().length, 0);
  assert.ok(db.select().from(classificationPredictions).all().find((p) => p.id === 'p3'), 'control doc prediction survives');
});

test('user knowledge survives with the transaction pointer nulled', () => {
  const f = db.select().from(classificationFeedback).where(eq(classificationFeedback.id, 'f1')).get();
  assert.ok(f, 'feedback row kept — it is training data');
  assert.equal(f!.transactionId, null);
  const e = db.select().from(localModelExamples).where(eq(localModelExamples.id, 'e1')).get();
  assert.ok(e); assert.equal(e!.transactionId, null);
  const te = db.select().from(taxEvidence).where(eq(taxEvidence.id, 'te1')).get();
  assert.ok(te); assert.equal(te!.transactionId, null);
  const o = db.select().from(userOverrides).where(eq(userOverrides.id, 'o1')).get();
  assert.ok(o, 'signature-keyed override kept'); assert.equal(o!.transactionId, null);
});
