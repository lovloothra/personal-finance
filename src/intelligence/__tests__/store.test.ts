import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-local-model-')), 'test.db');
process.env.PF_DB_PASSPHRASE = 'test-passphrase';

import { getDb, type DB } from '@/db/client';
import { transactions } from '@/db/schema';
import {
  loadLocalClassifierState,
  recordFeedbackExamples,
} from '../store';

let db: DB;

before(async () => {
  db = await getDb();
  db.insert(transactions)
    .values([
      {
        id: 'txn_store_1',
        txnDate: '2026-02-14',
        amount: -72000,
        currency: 'INR',
        rawDescription: 'UPI/ZEPTO MARKETPLACE',
        flow: 'expense',
        category: 'Uncategorised',
        fyKey: '2025-26',
      },
      {
        id: 'txn_store_2',
        txnDate: '2026-02-15',
        amount: -42000,
        currency: 'INR',
        rawDescription: 'UBER TRIP',
        flow: 'expense',
        category: 'Uncategorised',
        fyKey: '2025-26',
      },
    ])
    .run();
});

test('review feedback stores embeddings and deterministic classifier heads rebuild after new feedback', async () => {
  await recordFeedbackExamples(
    db,
    [
      {
        transactionId: 'txn_store_1',
        rawDescription: 'UPI/ZEPTO MARKETPLACE',
        merchant: 'Zepto',
        category: 'Groceries',
        subcategory: 'Quick commerce',
        flow: 'expense',
        amount: -72000,
        source: 'review_assignment',
      },
    ],
    { embeddingModelId: 'fake-2d', embedText: async () => [1, 0], now: () => 100 },
  );

  const first = await loadLocalClassifierState(db, {
    embeddingModelId: 'fake-2d',
    embedText: async () => [1, 0],
    dimensions: 2,
    now: () => 200,
  });
  const second = await loadLocalClassifierState(db, {
    embeddingModelId: 'fake-2d',
    embedText: async () => [1, 0],
    dimensions: 2,
    now: () => 300,
  });

  assert.equal(first.examples[0].embedding?.length, 2);
  assert.equal(first.head?.checksum, second.head?.checksum);

  await recordFeedbackExamples(
    db,
    [
      {
        transactionId: 'txn_store_2',
        rawDescription: 'UBER TRIP',
        merchant: 'Uber',
        category: 'Transport',
        subcategory: 'Cab',
        flow: 'expense',
        amount: -42000,
        source: 'review_assignment',
      },
    ],
    { embeddingModelId: 'fake-2d', embedText: async () => [0, 1], now: () => 400 },
  );

  const rebuilt = await loadLocalClassifierState(db, {
    embeddingModelId: 'fake-2d',
    embedText: async () => [1, 0],
    dimensions: 2,
    now: () => 500,
  });

  assert.notEqual(rebuilt.head?.checksum, first.head?.checksum);
  assert.equal(rebuilt.head?.exampleCount, 2);
});
