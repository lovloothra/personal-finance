/**
 * Duplicate decisions must outlive a reparse.
 *
 * Transaction ids are positional (`txn_<docId>_<index>`), so re-parsing a
 * document re-inserts its rows under the SAME ids. Without reconciliation a
 * row the user removed silently returns to the ledger, and because the
 * candidate record still reads `removed` the review UI — which only lists
 * `open` pairs — can never surface it again.
 */
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-duplicate-decisions-')), 'test.db');
process.env.PF_DB_PASSPHRASE = 'test-passphrase';

import { eq } from 'drizzle-orm';
import { getDb, type DB } from '@/db/client';
import { classificationFeedback, duplicateCandidates, parsedDocuments, transactions } from '@/db/schema';
import { detectSuspectedDuplicates, type SuspectedDedupRow } from '../dedup';
import { reconcileDuplicateDecisions } from '../duplicate-decisions';

const short = 'BIL/ONL/900000000001/BILL DESK/CRED_SYNTH0001/MKS-10000000001';
const long = `${short} BANK/900000000002`;
let db: DB;

const txnRow = (id: string, documentId: string, rawDescription: string, createdAt: number) => ({
  id,
  documentId,
  txnDate: '2025-11-02',
  amount: -58478600,
  rawDescription,
  ownAccountId: 'acct-test-0001',
  ownAccountKind: 'bank' as const,
  flow: 'expense' as const,
  category: 'Uncategorised',
  createdAt,
});

/** The detector input shape for a stored row. */
const dedupRow = (id: string, docId: string, rawDescription: string, createdAt: number): SuspectedDedupRow => ({
  id,
  docId,
  date: '2025-11-02',
  amount: -58478600,
  rawDescription,
  ownAccountId: 'acct-test-0001',
  createdAt,
});

before(async () => {
  db = await getDb();
  db.insert(parsedDocuments).values([{ id: 'doc_monthly' }, { id: 'doc_consolidated' }]).run();
});

test('a removed decision re-deletes the same row when a reparse re-inserts it', () => {
  const keeper = txnRow('txn_doc_monthly_0', 'doc_monthly', short, 100);
  const candidate = txnRow('txn_doc_consolidated_7', 'doc_consolidated', long, 200);
  db.insert(transactions).values([keeper, candidate]).run();

  // Run 1: the pair is detected and recorded as open.
  const pairs = detectSuspectedDuplicates(
    [dedupRow(keeper.id, 'doc_monthly', short, 100)],
    [dedupRow(candidate.id, 'doc_consolidated', long, 200)],
  );
  assert.equal(pairs.length, 1);
  reconcileDuplicateDecisions(db, pairs);

  // The user removes the duplicate (what the remove route does).
  db.delete(transactions).where(eq(transactions.id, candidate.id)).run();
  db.update(duplicateCandidates)
    .set({ status: 'removed' })
    .where(eq(duplicateCandidates.id, pairs[0].id))
    .run();

  // Run 2 — reparse: clearDocumentOutput + re-insert puts the row back under
  // the identical positional id.
  db.insert(transactions).values(candidate).run();
  const result = reconcileDuplicateDecisions(db, pairs);

  assert.equal(result.reRemoved, 1, 'the resurrected row must be removed again');
  const resurrected = db.select().from(transactions).where(eq(transactions.id, candidate.id)).get();
  assert.equal(resurrected, undefined, 'the removed duplicate must not survive a reparse');
  const record = db.select().from(duplicateCandidates).where(eq(duplicateCandidates.id, pairs[0].id)).get();
  assert.equal(record?.status, 'removed', 'the decision stays removed');
});

test('a removed decision whose id now holds a different transaction reopens instead of deleting', () => {
  const keeperId = 'txn_doc_monthly_1';
  const candidateId = 'txn_doc_consolidated_9';
  db.insert(transactions).values([
    txnRow(keeperId, 'doc_monthly', short, 300),
    txnRow(candidateId, 'doc_consolidated', long, 400),
  ]).run();
  const pairs = detectSuspectedDuplicates(
    [dedupRow(keeperId, 'doc_monthly', short, 300)],
    [dedupRow(candidateId, 'doc_consolidated', long, 400)],
  );
  reconcileDuplicateDecisions(db, pairs);
  db.delete(transactions).where(eq(transactions.id, candidateId)).run();
  db.update(duplicateCandidates).set({ status: 'removed' }).where(eq(duplicateCandidates.id, pairs[0].id)).run();

  // A parser change shifts rows: index 9 now holds different spending that
  // happens to drift against the keeper.
  const shifted = 'BIL/ONL/900000000003/BILL DESK/CRED_SYNTH0002/MKS-10000000003';
  db.insert(transactions).values({
    ...txnRow(candidateId, 'doc_consolidated', `${shifted} BANK/900000000004`, 400),
  }).run();
  const shiftedPairs = detectSuspectedDuplicates(
    [dedupRow('txn_doc_monthly_2', 'doc_monthly', shifted, 300)],
    [dedupRow(candidateId, 'doc_consolidated', `${shifted} BANK/900000000004`, 400)],
  );
  const result = reconcileDuplicateDecisions(db, shiftedPairs);

  assert.equal(result.reopened, 1, 'an unverifiable decision goes back to review');
  assert.equal(result.reRemoved, 0, 'a different transaction must never be auto-deleted');
  const survivor = db.select().from(transactions).where(eq(transactions.id, candidateId)).get();
  assert.ok(survivor, 'real spending must not be deleted under a stale decision');
  const record = db.select().from(duplicateCandidates).where(eq(duplicateCandidates.id, shiftedPairs[0].id)).get();
  assert.equal(record?.status, 'open');
});

test('a removed decision written before fingerprints existed is re-confirmed, not applied', () => {
  const keeperId = 'txn_doc_monthly_3';
  const candidateId = 'txn_doc_consolidated_11';
  db.insert(transactions).values([
    txnRow(keeperId, 'doc_monthly', short, 500),
    txnRow(candidateId, 'doc_consolidated', long, 600),
  ]).run();
  const pairs = detectSuspectedDuplicates(
    [dedupRow(keeperId, 'doc_monthly', short, 500)],
    [dedupRow(candidateId, 'doc_consolidated', long, 600)],
  );
  // A legacy row: removed, with no fingerprint recorded.
  db.insert(duplicateCandidates).values({
    id: pairs[0].id,
    keeperTransactionId: keeperId,
    candidateTransactionId: candidateId,
    candidateFingerprint: null,
    status: 'removed',
  }).run();

  const result = reconcileDuplicateDecisions(db, pairs);

  assert.equal(result.reopened, 1);
  assert.equal(result.reRemoved, 0);
  assert.ok(db.select().from(transactions).where(eq(transactions.id, candidateId)).get());
});

test('a kept decision is never reopened and never touches the ledger', () => {
  const keeperId = 'txn_doc_monthly_4';
  const candidateId = 'txn_doc_consolidated_13';
  db.insert(transactions).values([
    txnRow(keeperId, 'doc_monthly', short, 700),
    txnRow(candidateId, 'doc_consolidated', long, 800),
  ]).run();
  const pairs = detectSuspectedDuplicates(
    [dedupRow(keeperId, 'doc_monthly', short, 700)],
    [dedupRow(candidateId, 'doc_consolidated', long, 800)],
  );
  reconcileDuplicateDecisions(db, pairs);
  db.update(duplicateCandidates).set({ status: 'kept' }).where(eq(duplicateCandidates.id, pairs[0].id)).run();

  const result = reconcileDuplicateDecisions(db, pairs);

  assert.deepEqual(result, { opened: 0, reRemoved: 0, reopened: 0, reRemovedIds: [] });
  const record = db.select().from(duplicateCandidates).where(eq(duplicateCandidates.id, pairs[0].id)).get();
  assert.equal(record?.status, 'kept');
  assert.ok(db.select().from(transactions).where(eq(transactions.id, candidateId)).get(), 'both rows stay');
});

test('reconciliation works inside an ingest transaction', () => {
  const keeperId = 'txn_doc_monthly_6';
  const candidateId = 'txn_doc_consolidated_17';
  db.insert(transactions).values([
    txnRow(keeperId, 'doc_monthly', short, 1100),
    txnRow(candidateId, 'doc_consolidated', long, 1200),
  ]).run();
  const pairs = detectSuspectedDuplicates(
    [dedupRow(keeperId, 'doc_monthly', short, 1100)],
    [dedupRow(candidateId, 'doc_consolidated', long, 1200)],
  );
  reconcileDuplicateDecisions(db, pairs);
  db.delete(transactions).where(eq(transactions.id, candidateId)).run();
  db.update(duplicateCandidates).set({ status: 'removed' }).where(eq(duplicateCandidates.id, pairs[0].id)).run();

  // runIngest calls this inside db.transaction((tx) => …), so the tx handle
  // must work exactly as the db handle does.
  let result = { reRemoved: 0 } as ReturnType<typeof reconcileDuplicateDecisions>;
  db.transaction((tx) => {
    tx.insert(transactions).values(txnRow(candidateId, 'doc_consolidated', long, 1200)).run();
    result = reconcileDuplicateDecisions(tx, pairs);
  });

  assert.equal(result.reRemoved, 1);
  assert.deepEqual(result.reRemovedIds, [candidateId]);
  assert.equal(db.select().from(transactions).where(eq(transactions.id, candidateId)).get(), undefined);
});

test('re-removing a resurrected row detaches its FK children first', () => {
  const keeperId = 'txn_doc_monthly_5';
  const candidateId = 'txn_doc_consolidated_15';
  db.insert(transactions).values([
    txnRow(keeperId, 'doc_monthly', short, 900),
    txnRow(candidateId, 'doc_consolidated', long, 1000),
  ]).run();
  const pairs = detectSuspectedDuplicates(
    [dedupRow(keeperId, 'doc_monthly', short, 900)],
    [dedupRow(candidateId, 'doc_consolidated', long, 1000)],
  );
  reconcileDuplicateDecisions(db, pairs);
  db.delete(transactions).where(eq(transactions.id, candidateId)).run();
  db.update(duplicateCandidates).set({ status: 'removed' }).where(eq(duplicateCandidates.id, pairs[0].id)).run();

  // Reparse re-inserts the row AND reattaches a feedback child.
  db.insert(transactions).values(txnRow(candidateId, 'doc_consolidated', long, 1000)).run();
  db.insert(classificationFeedback).values({
    id: `fb_${candidateId}`,
    transactionId: candidateId,
    matchSignature: 'bil onl bill desk cred_synth mks bank',
    rawDescription: long,
    merchant: '',
    category: 'Uncategorised',
    flow: 'expense',
    amount: -58478600,
    source: 'review_assignment',
    reviewedAt: 1000,
  }).run();

  const result = reconcileDuplicateDecisions(db, pairs);

  assert.equal(result.reRemoved, 1, 'deletion must not throw on FOREIGN KEY constraint');
  assert.equal(db.select().from(transactions).where(eq(transactions.id, candidateId)).get(), undefined);
  const feedback = db.select().from(classificationFeedback).where(eq(classificationFeedback.id, `fb_${candidateId}`)).get();
  assert.equal(feedback?.transactionId, null, 'user knowledge is kept with the pointer nulled');
});
