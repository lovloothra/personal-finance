import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-duplicate-review-')), 'test.db');
process.env.PF_DB_PASSPHRASE = 'test-passphrase';

let db: Awaited<ReturnType<typeof import('@/db/client')['getDb']>>;
let keepPost: typeof import('@/../app/api/review/duplicates/[id]/keep/route')['POST'];
let removePost: typeof import('@/../app/api/review/duplicates/[id]/remove/route')['POST'];

const baseTxn = {
  txnDate: '2025-11-02',
  amount: -58478600,
  flow: 'expense' as const,
  category: 'Uncategorised',
  reviewRequired: true,
};

before(async () => {
  const client = await import('@/db/client');
  const schema = await import('@/db/schema');
  ({ POST: keepPost } = await import('@/../app/api/review/duplicates/[id]/keep/route'));
  ({ POST: removePost } = await import('@/../app/api/review/duplicates/[id]/remove/route'));
  db = await client.getDb();
  db.insert(schema.transactions).values([
    { id: 'keeper-remove', rawDescription: 'BIL/ONL/1/BILL DESK/CRED_ABC1/MKS-1', ...baseTxn },
    { id: 'candidate-remove', rawDescription: 'BIL/ONL/1/BILL DESK/CRED_ABC1/MKS-1 BANK/2', ...baseTxn },
    { id: 'keeper-keep', rawDescription: 'PAYMENT SHORT', ...baseTxn },
    { id: 'candidate-keep', rawDescription: 'PAYMENT SHORT BANK', ...baseTxn },
  ]).run();
  db.insert(schema.duplicateCandidates).values([
    { id: 'dup_remove', keeperTransactionId: 'keeper-remove', candidateTransactionId: 'candidate-remove' },
    { id: 'dup_keep', keeperTransactionId: 'keeper-keep', candidateTransactionId: 'candidate-keep' },
  ]).run();
  db.insert(schema.classificationFeedback).values({
    id: 'feedback-child',
    transactionId: 'candidate-remove',
    matchSignature: 'bill desk cred bank',
    rawDescription: 'candidate',
    merchant: '',
    category: 'uncategorised',
    flow: 'expense',
    amount: -58478600,
    source: 'review_assignment',
    reviewedAt: Date.now(),
  }).run();
});

const request = () => new Request('http://127.0.0.1:3001/api/review/duplicates/x', {
  method: 'POST',
  headers: { Origin: 'http://127.0.0.1:3001' },
});

test('remove detaches children, deletes only the candidate, and preserves an audit decision', async () => {
  const res = await removePost(request(), { params: Promise.resolve({ id: 'dup_remove' }) });
  assert.equal(res.status, 200, await res.text());

  const { classificationFeedback, duplicateCandidates, transactions } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  assert.ok(db.select().from(transactions).where(eq(transactions.id, 'keeper-remove')).get());
  assert.equal(db.select().from(transactions).where(eq(transactions.id, 'candidate-remove')).get(), undefined);
  assert.equal(db.select().from(classificationFeedback).where(eq(classificationFeedback.id, 'feedback-child')).get()?.transactionId, null);
  assert.equal(db.select().from(duplicateCandidates).where(eq(duplicateCandidates.id, 'dup_remove')).get()?.status, 'removed');
});

test('keep both dismisses the pair without changing either transaction', async () => {
  const res = await keepPost(request(), { params: Promise.resolve({ id: 'dup_keep' }) });
  assert.equal(res.status, 200, await res.text());

  const { duplicateCandidates, transactions } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  assert.ok(db.select().from(transactions).where(eq(transactions.id, 'keeper-keep')).get());
  assert.ok(db.select().from(transactions).where(eq(transactions.id, 'candidate-keep')).get());
  assert.equal(db.select().from(duplicateCandidates).where(eq(duplicateCandidates.id, 'dup_keep')).get()?.status, 'kept');
});

test('resolved decisions cannot be reopened by the ingest upsert shape', async () => {
  const { duplicateCandidates } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  db.insert(duplicateCandidates)
    .values({ id: 'dup_keep', keeperTransactionId: 'different', candidateTransactionId: 'candidate-keep', status: 'open' })
    .onConflictDoNothing()
    .run();
  assert.equal(db.select().from(duplicateCandidates).where(eq(duplicateCandidates.id, 'dup_keep')).get()?.status, 'kept');
});

test('both mutations enforce the loopback origin guard', async () => {
  const hostile = new Request('http://127.0.0.1:3001/api/review/duplicates/x', {
    method: 'POST',
    headers: { Origin: 'https://evil.example' },
  });
  const res = await keepPost(hostile, { params: Promise.resolve({ id: 'dup_keep' }) });
  assert.equal(res.ok, false);
  assert.match((await res.json()).error, /origin/i);
});
