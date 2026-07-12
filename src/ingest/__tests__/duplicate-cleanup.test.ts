import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-duplicate-cleanup-')), 'test.db');
process.env.PF_DB_PASSPHRASE = 'test-passphrase';

import { eq } from 'drizzle-orm';
import { getDb, type DB } from '@/db/client';
import {
  classificationFeedback,
  duplicateCandidates,
  internalTransferLinks,
  parsedDocuments,
  transactions,
} from '@/db/schema';
import { applyDuplicateCleanup, duplicateDecision, planDuplicateCleanup } from '../duplicate-cleanup';

const short = 'BIL/ONL/001104143602/BILL DESK/CRED_BICIEC3112/MKS-10000007874';
const long = `${short} BANK/113537545429`;
let db: DB;

const row = (id: string, documentId: string, rawDescription: string, createdAt: number) => ({
  id,
  documentId,
  txnDate: '2025-11-02',
  amount: -58478600,
  rawDescription,
  ownAccountId: 'acct-icici-2840',
  ownAccountKind: 'bank' as const,
  flow: 'expense' as const,
  category: 'Uncategorised',
  createdAt,
});

before(async () => {
  db = await getDb();
  db.insert(parsedDocuments).values([
    { id: 'doc_monthly' },
    { id: 'doc_consolidated' },
    { id: 'doc_legit_a' },
    { id: 'doc_legit_b' },
    { id: 'doc_kept_a' },
    { id: 'doc_kept_b' },
  ]).run();
  db.insert(transactions).values([
    row('keeper-real', 'doc_monthly', short, 100),
    row('candidate-real', 'doc_consolidated', long, 200),
    row('legit-a', 'doc_legit_a', 'UPI BLUE TOKAI COFFEE', 300),
    row('legit-b', 'doc_legit_b', 'UPI TAXI HOME', 400),
    row('kept-a', 'doc_kept_a', 'PAYMENT SHARED', 500),
    row('kept-b', 'doc_kept_b', 'PAYMENT SHARED BANK', 600),
  ]).run();
  db.insert(duplicateCandidates).values({
    id: 'dup_kept-b',
    keeperTransactionId: 'kept-a',
    candidateTransactionId: 'kept-b',
    status: 'kept',
  }).run();
  db.insert(classificationFeedback).values({
    id: 'feedback-candidate',
    transactionId: 'candidate-real',
    matchSignature: 'bill desk cred bank',
    rawDescription: long,
    merchant: '',
    category: 'uncategorised',
    flow: 'expense',
    amount: -58478600,
    source: 'review_assignment',
    reviewedAt: Date.now(),
  }).run();
  db.insert(internalTransferLinks).values({
    id: 'link-candidate',
    kind: 'account_transfer',
    debitTxnId: 'candidate-real',
    creditTxnId: 'keeper-real',
  }).run();
});

test('dry-run plan finds the real pair but excludes legitimate and kept pairs', () => {
  const plan = planDuplicateCleanup(db);
  assert.equal(plan.totalRows, 6);
  assert.deepEqual(plan.pairs.map((pair) => [pair.keeper.id, pair.candidate.id]), [
    ['keeper-real', 'candidate-real'],
  ]);
  assert.equal(plan.keptDecisionsSkipped, 1);
  assert.equal(db.select().from(transactions).all().length, 6, 'planning is read-only');
});

test('apply is transactional, detaches children, and preserves the removal audit', () => {
  const result = applyDuplicateCleanup(db);
  assert.equal(result.removed, 1);
  assert.equal(result.totalRows, 6);
  assert.equal(result.totalAfter, 5);
  assert.ok(db.select().from(transactions).where(eq(transactions.id, 'keeper-real')).get());
  assert.equal(db.select().from(transactions).where(eq(transactions.id, 'candidate-real')).get(), undefined);
  assert.ok(db.select().from(transactions).where(eq(transactions.id, 'legit-a')).get());
  assert.ok(db.select().from(transactions).where(eq(transactions.id, 'legit-b')).get());
  assert.ok(db.select().from(transactions).where(eq(transactions.id, 'kept-b')).get());
  assert.equal(db.select().from(classificationFeedback).where(eq(classificationFeedback.id, 'feedback-candidate')).get()?.transactionId, null);
  assert.equal(db.select().from(internalTransferLinks).where(eq(internalTransferLinks.id, 'link-candidate')).get(), undefined);
  assert.equal(duplicateDecision(db, 'dup_candidate-real')?.status, 'removed');
});

test('a second apply is an idempotent no-op', () => {
  const result = applyDuplicateCleanup(db);
  assert.equal(result.removed, 0);
  assert.equal(result.totalRows, 5);
  assert.equal(result.totalAfter, 5);
});
