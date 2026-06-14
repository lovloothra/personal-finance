import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-fy-')), 'test.db');

import { getDb, type DB } from '@/db/client';
import { transactions } from '@/db/schema';
import { availableFys, latestFyWithData } from '@/ledger/rollups';

let db: DB;

const base = {
  institutionId: null, messageId: null,
  rawDescription: 'X', merchant: 'X', subcategory: null, confidence: 'high' as const,
  layer: 2, classificationReason: null, profileSignalUsed: null,
  classificationSource: 'deterministic' as const, acceptedPredictionId: null,
  isInternalTransfer: false, isRecurring: false, projectId: null, taxSection: null,
  reviewRequired: false, createdAt: Date.now(), updatedAt: Date.now(),
};

before(async () => {
  db = await getDb();
  db.insert(transactions).values([
    { id: 't1', txnDate: '2024-06-01', amount: -5400000, flow: 'expense', category: 'Housing', fyKey: '2024-25', ...base },
    { id: 't2', txnDate: '2023-06-01', amount: -100000, flow: 'expense', category: 'Food', fyKey: '2023-24', ...base },
  ]).run();
});

test('availableFys returns distinct FY keys, newest first', () => {
  assert.deepEqual(availableFys(db), ['2024-25', '2023-24']);
});

test('latestFyWithData returns the newest non-empty FY', () => {
  assert.equal(latestFyWithData(db), '2024-25');
});
