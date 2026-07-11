/**
 * Assign → undo round-trip. The hard cases here are the UPSERT restorations:
 * assign UPDATES a pre-existing override/alias/feedback/example in place, so
 * undo must restore their prior field values — deleting them would destroy
 * user data that predates the assignment.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-assign-undo-')), 'test.db');
process.env.PF_DB_PASSPHRASE = 'test-passphrase';

let assignPOST: (req: Request) => Promise<Response>;
let undoPOST: (req: Request) => Promise<Response>;
let undoGET: () => Promise<Response>;
let db: import('@/db/client').DB;
let schema: typeof import('@/db/schema');
let sig: string;

const RAW_A = 'UPI ZOMATO ORDER 12345 BLR';
const RAW_B = 'POS ZOMATO GURGAON 999'; // different signature, alias-swept via "zomato"

function post(url: string, body: unknown): Request {
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

before(async () => {
  const { getDb } = await import('@/db/client');
  schema = await import('@/db/schema');
  const { signature } = await import('@/classifier/normalize');
  ({ POST: assignPOST } = await import('@/../app/api/review/assign/route'));
  ({ POST: undoPOST, GET: undoGET } = await import('@/../app/api/review/assign/undo/route'));
  db = await getDb();
  sig = signature(RAW_A);

  const base = {
    institutionId: null, messageId: null, documentId: null, merchant: null, subcategory: null,
    confidence: 'low' as const, layer: 7, reviewRequired: true,
    category: 'Uncategorised', flow: 'expense' as const, currency: 'INR',
    classificationReason: 'Fallback: no match.', profileSignalUsed: null,
    updatedAt: 111_000, // fixed prior timestamp so restore-exactness is assertable
  };
  db.insert(schema.transactions).values([
    { id: 't1', txnDate: '2026-04-01', amount: -50000, rawDescription: RAW_A, ...base },
    { id: 't2', txnDate: '2026-04-15', amount: -70000, rawDescription: RAW_A, ...base },
    { id: 't3', txnDate: '2026-04-20', amount: -90000, rawDescription: RAW_B, ...base },
  ]).run();

  // Pre-existing rows the assign will UPDATE (not create):
  db.insert(schema.userOverrides).values({
    id: 'ov_preexisting', matchSignature: sig, merchant: 'Old Zomato', category: 'dining', subcategory: null, flow: null,
  }).run();
  db.insert(schema.merchantAliases).values({
    id: 'ua_zomato', pattern: 'zomato', canonicalMerchant: 'Zomato Old', category: 'dining', source: 'user', confidence: 'high',
  }).run();
  db.insert(schema.classificationFeedback).values({
    id: 'fb_review_assignment_t1', transactionId: 't1', matchSignature: sig, rawDescription: RAW_A,
    merchant: 'Old Zomato', category: 'dining', subcategory: null, flow: 'expense', amount: -50000,
    institutionId: null, source: 'review_assignment', reviewedAt: 100_000,
  }).run();
  db.insert(schema.localModelExamples).values({
    id: 'ex_review_assignment_t1', feedbackId: 'fb_review_assignment_t1', transactionId: 't1', signature: sig,
    rawDescription: RAW_A, merchant: 'Old Zomato', merchantTokens: ['zomato'], category: 'dining', subcategory: null,
    flow: 'expense', amount: -50000, amountBucket: 'medium', direction: 'debit', institutionId: null,
    source: 'review_assignment', embedding: [], embeddingModelId: null, embeddingUpdatedAt: null, reviewedAt: 100_000,
  }).run();
});

let opId: string;

test('assign updates matched + alias-swept txns atomically and returns an opId', async () => {
  const res = await assignPOST(post('http://127.0.0.1:3001/api/review/assign', { signature: sig, merchant: 'Zomato', category: 'food_delivery' }));
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.updated, 2);
  assert.equal(data.aliasToken, 'zomato');
  assert.equal(data.aliasApplied, 1);
  assert.equal(data.projectionSynced, true);
  assert.ok(typeof data.opId === 'string' && data.opId.startsWith('undo_'));
  opId = data.opId;

  const t1 = db.select().from(schema.transactions).all().find((t) => t.id === 't1')!;
  const t3 = db.select().from(schema.transactions).all().find((t) => t.id === 't3')!;
  assert.equal(t1.category, 'food_delivery');
  assert.equal(t1.merchant, 'Zomato');
  assert.equal(t1.reviewRequired, false);
  assert.equal(t1.layer, 1);
  assert.equal(t3.category, 'food_delivery'); // swept by the zomato alias
  assert.equal(t3.layer, 4);
  assert.equal(t3.reviewRequired, false);

  // Pre-existing rows were UPDATED in place (same ids), not duplicated:
  const ov = db.select().from(schema.userOverrides).all();
  assert.equal(ov.length, 1);
  assert.equal(ov[0].id, 'ov_preexisting');
  assert.equal(ov[0].category, 'food_delivery');
  assert.equal(ov[0].merchant, 'Zomato');

  const alias = db.select().from(schema.merchantAliases).all().find((a) => a.id === 'ua_zomato')!;
  assert.equal(alias.canonicalMerchant, 'Zomato');
  assert.equal(alias.category, 'food_delivery');

  const fb1 = db.select().from(schema.classificationFeedback).all().find((f) => f.id === 'fb_review_assignment_t1')!;
  assert.equal(fb1.category, 'food_delivery');
  const fb2 = db.select().from(schema.classificationFeedback).all().find((f) => f.id === 'fb_review_assignment_t2');
  assert.ok(fb2, 'feedback row created for t2');
  const ex2 = db.select().from(schema.localModelExamples).all().find((e) => e.id === 'ex_review_assignment_t2');
  assert.ok(ex2, 'example row created for t2');
});

test('GET undo reports the op as the latest unconsumed', async () => {
  const res = await undoGET();
  const data = await res.json();
  assert.equal(data.opId, opId);
});

test('undo with a stale/unknown opId is refused', async () => {
  const res = await undoPOST(post('http://127.0.0.1:3001/api/review/assign/undo', { opId: 'undo_not_the_latest' }));
  assert.equal(res.status, 409);
});

test('undo restores EXACT prior state: updated rows get old values, created rows are deleted', async () => {
  const res = await undoPOST(post('http://127.0.0.1:3001/api/review/assign/undo', { opId }));
  const data = await res.json();
  assert.equal(res.status, 200, `undo failed: ${JSON.stringify(data)}`);
  assert.equal(data.ok, true);
  assert.equal(data.restored, 3);
  assert.equal(data.projectionSynced, true);

  // Transactions back to their pre-assign fields, including updatedAt:
  for (const id of ['t1', 't2', 't3']) {
    const t = db.select().from(schema.transactions).all().find((x) => x.id === id)!;
    assert.equal(t.category, 'Uncategorised', `${id} category restored`);
    assert.equal(t.merchant, null, `${id} merchant restored`);
    assert.equal(t.reviewRequired, true, `${id} back in review`);
    assert.equal(t.layer, 7, `${id} layer restored`);
    assert.equal(t.updatedAt, 111_000, `${id} updatedAt restored — undo leaves no fingerprint`);
  }

  // Pre-existing override restored, not deleted:
  const ov = db.select().from(schema.userOverrides).all();
  assert.equal(ov.length, 1);
  assert.equal(ov[0].id, 'ov_preexisting');
  assert.equal(ov[0].category, 'dining');
  assert.equal(ov[0].merchant, 'Old Zomato');

  // Pre-existing alias restored:
  const alias = db.select().from(schema.merchantAliases).all().find((a) => a.id === 'ua_zomato')!;
  assert.equal(alias.canonicalMerchant, 'Zomato Old');
  assert.equal(alias.category, 'dining');

  // Pre-existing feedback/example restored; created ones deleted:
  const fb1 = db.select().from(schema.classificationFeedback).all().find((f) => f.id === 'fb_review_assignment_t1')!;
  assert.equal(fb1.category, 'dining');
  assert.equal(fb1.merchant, 'Old Zomato');
  assert.equal(db.select().from(schema.classificationFeedback).all().find((f) => f.id === 'fb_review_assignment_t2'), undefined);
  const ex1 = db.select().from(schema.localModelExamples).all().find((e) => e.id === 'ex_review_assignment_t1')!;
  assert.equal(ex1.category, 'dining');
  assert.equal(db.select().from(schema.localModelExamples).all().find((e) => e.id === 'ex_review_assignment_t2'), undefined);

  // Journal row consumed:
  const j = db.select().from(schema.reviewUndoJournal).all().find((r) => r.id === opId)!;
  assert.ok(j.consumedAt != null);

  // Review-items projection regenerated for the restored pending txns:
  const items = db.select().from(schema.reviewItems).all().filter((i) => i.status === 'open');
  assert.equal(items.length, 3);
});

test('a consumed op cannot be undone twice', async () => {
  const res = await undoPOST(post('http://127.0.0.1:3001/api/review/assign/undo', { opId }));
  assert.equal(res.status, 409);
  const data = await res.json();
  assert.match(data.error, /Nothing to undo/);
});

test('only the most recent assignment is undoable', async () => {
  // Two fresh assigns in sequence → undoing the FIRST is refused.
  const r1 = await assignPOST(post('http://127.0.0.1:3001/api/review/assign', { signature: sig, merchant: '', category: 'dining' }));
  const d1 = await r1.json();
  assert.equal(d1.ok, true);

  const { signature } = await import('@/classifier/normalize');
  const sigB = signature(RAW_B);
  const r2 = await assignPOST(post('http://127.0.0.1:3001/api/review/assign', { signature: sigB, merchant: '', category: 'groceries' }));
  const d2 = await r2.json();
  assert.equal(d2.ok, true);

  const refuse = await undoPOST(post('http://127.0.0.1:3001/api/review/assign/undo', { opId: d1.opId }));
  assert.equal(refuse.status, 409);
  const ok = await undoPOST(post('http://127.0.0.1:3001/api/review/assign/undo', { opId: d2.opId }));
  assert.equal((await ok.json()).ok, true);
});
