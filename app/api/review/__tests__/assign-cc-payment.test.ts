import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-assign-cc-')), 'test.db');
process.env.PF_DB_PASSPHRASE = 'test-passphrase';

let postAssign: (req: Request) => Promise<Response>;
let db: import('@/db/client').DB;
let schema: typeof import('@/db/schema');
let sig: string;

const raw = 'BIL ONL BILL DESK CRED CARD PAYMENT';

before(async () => {
  const { getDb } = await import('@/db/client');
  const { signature } = await import('@/classifier/normalize');
  schema = await import('@/db/schema');
  ({ POST: postAssign } = await import('@/../app/api/review/assign/route'));
  db = await getDb();
  sig = signature(raw);
  db.insert(schema.transactions).values({
    id: 'cc-review-row',
    txnDate: '2025-11-02',
    amount: -58478600,
    rawDescription: raw,
    merchant: 'Wrong guessed merchant',
    flow: 'expense',
    category: 'Uncategorised',
    subcategory: null,
    confidence: 'low',
    layer: 7,
    classificationReason: 'Fallback',
    reviewRequired: true,
    suspectedTransfer: true,
  }).run();
});

test('credit card payment assignment preserves the journaled assign contract', async () => {
  const req = new Request('http://127.0.0.1:3001/api/review/assign', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Origin: 'http://127.0.0.1:3001',
    },
    body: JSON.stringify({ signature: sig, merchant: '', category: 'credit card payment' }),
  });
  const res = await postAssign(req);
  const data = await res.json();
  assert.equal(res.status, 200, JSON.stringify(data));
  assert.equal(data.updated, 1);
  assert.ok(typeof data.opId === 'string' && data.opId.startsWith('undo_'));

  const txn = db.select().from(schema.transactions).get()!;
  assert.equal(txn.flow, 'transfer');
  assert.equal(txn.category, 'cc_payment');
  assert.equal(txn.subcategory, 'Credit card payment');
  assert.equal(txn.isInternalTransfer, true);
  assert.equal(txn.suspectedTransfer, false);
  assert.equal(txn.merchant, null);
  assert.equal(txn.reviewRequired, false);

  const override = db.select().from(schema.userOverrides).get()!;
  assert.equal(override.matchSignature, sig);
  assert.equal(override.flow, 'transfer');
  assert.equal(override.category, 'cc_payment');
  assert.equal(override.merchant, null);

  const feedback = db.select().from(schema.classificationFeedback).get()!;
  assert.equal(feedback.transactionId, txn.id);
  assert.equal(feedback.category, 'Transfer');
  assert.equal(feedback.subcategory, 'Credit card payment');
  assert.equal(feedback.flow, 'transfer');
  assert.equal(feedback.merchant, '');

  const example = db.select().from(schema.localModelExamples).get()!;
  assert.equal(example.transactionId, txn.id);
  assert.equal(example.flow, 'transfer');
  assert.equal(example.merchant, '');

  const journal = db.select().from(schema.reviewUndoJournal).get()!;
  assert.equal(journal.id, data.opId);
  assert.equal(journal.consumedAt, null);
});
