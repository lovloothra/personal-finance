import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-uncat-')), 'test.db');

let GET: (req: Request) => Promise<Response>;

before(async () => {
  const { getDb } = await import('@/db/client');
  const { transactions } = await import('@/db/schema');
  ({ GET } = await import('@/../app/api/review/uncategorised/route'));
  const db = await getDb();
  const base = {
    institutionId: null, messageId: null, merchant: null, subcategory: null,
    confidence: 'low' as const, layer: 7, classificationReason: null, profileSignalUsed: null,
    classificationSource: 'deterministic' as const, acceptedPredictionId: null,
    isInternalTransfer: false, isRecurring: false, projectId: null, taxSection: null,
    reviewRequired: true, category: 'Uncategorised', flow: 'expense' as const,
    fyKey: '2024-25', createdAt: Date.now(), updatedAt: Date.now(),
  };
  db.insert(transactions).values([
    { id: 'r1', txnDate: '2024-06-01', amount: -5400000, rawDescription: 'UPI/RASHMI/rent', ...base },
    { id: 'r2', txnDate: '2024-07-01', amount: -5400000, rawDescription: 'UPI/RASHMI/rent', ...base },
    { id: 's1', txnDate: '2024-06-02', amount: -9000, rawDescription: 'UPI/NEWSPAPER/sub', ...base },
    { id: 's2', txnDate: '2024-06-03', amount: -9000, rawDescription: 'UPI/NEWSPAPER/sub', ...base },
    { id: 's3', txnDate: '2024-06-04', amount: -9000, rawDescription: 'UPI/NEWSPAPER/sub', ...base },
  ]).run();
});

test('groups are sorted by total value descending', async () => {
  const res = await GET(new Request('http://x/api/review/uncategorised'));
  const data = await res.json();
  assert.equal(data.groups[0].sample.includes('RASHMI'), true, 'rent group first');
});

test('q filters by rawDescription substring (case-insensitive)', async () => {
  const res = await GET(new Request('http://x/api/review/uncategorised?q=rashmi'));
  const data = await res.json();
  assert.equal(data.groups.length, 1);
  assert.equal(data.totalTransactions, 2);
});
