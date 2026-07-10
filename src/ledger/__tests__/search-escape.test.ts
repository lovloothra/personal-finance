/**
 * LIKE metacharacters in a search query must match literally — "100%" acted
 * as "100 followed by anything" and "_" as any-single-char wildcards.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-search-')), 'test.db');
process.env.PF_DB_PASSPHRASE = 'test-passphrase';

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { getDb, type DB } from '@/db/client';
import { transactions } from '@/db/schema';
import { searchTransactions } from '../rollups';

let db: DB;

before(async () => {
  db = await getDb();
  const base = { currency: 'INR', flow: 'expense' as const, category: 'household', fyKey: '2026-27', reviewRequired: false, isInternalTransfer: false, suspectedTransfer: false };
  db.insert(transactions).values([
    { ...base, id: 's1', txnDate: '2026-06-01', amount: -10000, rawDescription: 'OFFER 100% CASHBACK STORE' },
    { ...base, id: 's2', txnDate: '2026-06-02', amount: -20000, rawDescription: 'PAID 1000 TO VENDOR' },
    { ...base, id: 's3', txnDate: '2026-06-03', amount: -30000, rawDescription: 'CAB RIDE HOME' },
  ]).run();
});

test('"100%" matches only the literal percent row, not every "100…" row', () => {
  const hits = searchTransactions(db, '100%').map((r) => r.id);
  assert.deepEqual(hits, ['s1']);
});

test('underscore does not act as a single-char wildcard', () => {
  const hits = searchTransactions(db, 'c_b').map((r) => r.id);
  assert.deepEqual(hits, [], '"c_b" must not match CAB');
});
