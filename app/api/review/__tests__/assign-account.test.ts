/**
 * Document-level assign-account flow: the picker lists unassigned source
 * documents behind a triage group, and assigning stamps the DOCUMENT plus all
 * its transactions (account identity lives at the document altitude).
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-assign-acct-')), 'test.db');
process.env.PF_DB_PASSPHRASE = 'test-passphrase';

let GET: (req: Request) => Promise<Response>;
let POST: (req: Request) => Promise<Response>;
let db: import('@/db/client').DB;

before(async () => {
  const { getDb } = await import('@/db/client');
  const schema = await import('@/db/schema');
  ({ GET, POST } = await import('@/../app/api/review/assign-account/route'));
  db = await getDb();

  db.insert(schema.institutions).values([
    { id: 'hdfc-bank', displayName: 'HDFC Bank', category: 'bank' },
    { id: 'icici-bank', displayName: 'ICICI Bank', category: 'bank' },
  ]).run();
  db.insert(schema.accountsBank).values({ id: 'bank_live', institutionId: 'icici-bank', last4: '2840' }).run();

  db.insert(schema.parsedDocuments).values([
    { id: 'doc_unassigned', institutionId: 'hdfc-bank', docType: 'bank_statement' },
    { id: 'doc_attributed', institutionId: 'icici-bank', docType: 'bank_statement', ownAccountId: 'bank_live', ownAccountKind: 'bank', ownAccountSource: 'header_match' },
  ]).run();

  const base = {
    institutionId: null, messageId: null, merchant: null, subcategory: null,
    confidence: 'low' as const, layer: 7, reviewRequired: true,
    category: 'Uncategorised', flow: 'expense' as const, currency: 'INR',
  };
  db.insert(schema.transactions).values([
    { id: 't1', documentId: 'doc_unassigned', txnDate: '2026-04-01', amount: -5000, rawDescription: 'UPI/COFFEE/pay', ...base },
    { id: 't2', documentId: 'doc_unassigned', txnDate: '2026-04-15', amount: -7000, rawDescription: 'UPI/COFFEE/pay', ...base },
    { id: 't3', documentId: 'doc_attributed', txnDate: '2026-04-02', amount: -9000, rawDescription: 'UPI/COFFEE/pay', ownAccountId: 'bank_live', ownAccountKind: 'bank' as const, ...base },
  ]).run();

  db.insert(schema.reviewItems).values({
    id: 'rev_1', kind: 'account_unresolved', refId: 'doc_unassigned', title: 'x', detail: 'y', status: 'open',
  }).run();
});

test('GET lists only the unassigned documents behind the group, with registered accounts', async () => {
  const { signature } = await import('@/classifier/normalize');
  const sig = signature('UPI/COFFEE/pay');
  const res = await GET(new Request(`http://x/api/review/assign-account?signature=${encodeURIComponent(sig)}`));
  const data = await res.json();
  assert.equal(data.docs.length, 1);
  assert.equal(data.docs[0].id, 'doc_unassigned');
  assert.equal(data.docs[0].txnCount, 2);
  assert.equal(data.docs[0].firstDate, '2026-04-01');
  assert.ok(data.accounts.some((a: { id: string }) => a.id === 'bank_live'));
});

test('POST with an existing account stamps the document, its txns, and resolves the review item', async () => {
  const schema = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const res = await POST(new Request('http://x/api/review/assign-account', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3001' },
    body: JSON.stringify({ documentId: 'doc_unassigned', accountId: 'bank_live' }),
  }));
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.updatedTxns, 2);

  const doc = db.select().from(schema.parsedDocuments).where(eq(schema.parsedDocuments.id, 'doc_unassigned')).get()!;
  assert.equal(doc.ownAccountId, 'bank_live');
  assert.equal(doc.ownAccountSource, 'user_assigned');
  const t1 = db.select().from(schema.transactions).where(eq(schema.transactions.id, 't1')).get()!;
  assert.equal(t1.ownAccountId, 'bank_live');
  assert.equal(t1.ownAccountKind, 'bank');
  const rev = db.select().from(schema.reviewItems).where(eq(schema.reviewItems.id, 'rev_1')).get()!;
  assert.equal(rev.status, 'resolved');
});

test('POST register creates the account row and assigns it', async () => {
  const schema = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  // Reset the doc to unassigned for this case.
  db.update(schema.parsedDocuments).set({ ownAccountId: null, ownAccountKind: null, ownAccountSource: null })
    .where(eq(schema.parsedDocuments.id, 'doc_unassigned')).run();

  const res = await POST(new Request('http://x/api/review/assign-account', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3001' },
    body: JSON.stringify({ documentId: 'doc_unassigned', register: { kind: 'bank', institutionId: 'hdfc-bank', last4: '9563', nickname: 'Salary' } }),
  }));
  const data = await res.json();
  assert.equal(res.status, 200);
  const created = db.select().from(schema.accountsBank).where(eq(schema.accountsBank.id, data.accountId)).get()!;
  assert.equal(created.last4, '9563');
  assert.equal(created.nickname, 'Salary');
  const doc = db.select().from(schema.parsedDocuments).where(eq(schema.parsedDocuments.id, 'doc_unassigned')).get()!;
  assert.equal(doc.ownAccountId, data.accountId);
});

test('POST rejects unknown institutions and malformed last4', async () => {
  const mk = (register: unknown) => new Request('http://x/api/review/assign-account', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3001' },
    body: JSON.stringify({ documentId: 'doc_unassigned', register }),
  });
  assert.equal((await POST(mk({ kind: 'bank', institutionId: 'not-a-bank' }))).status, 400);
  assert.equal((await POST(mk({ kind: 'bank', institutionId: 'hdfc-bank', last4: '12ab' }))).status, 400);
  assert.equal((await POST(mk({ kind: 'wallet', institutionId: 'hdfc-bank' }))).status, 400);
});

test('POST rejects cross-origin requests', async () => {
  const res = await POST(new Request('http://x/api/review/assign-account', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ documentId: 'doc_unassigned', accountId: 'bank_live' }),
  }));
  assert.notEqual(res.status, 200);
});
