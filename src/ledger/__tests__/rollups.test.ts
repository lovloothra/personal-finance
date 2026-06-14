/**
 * Rollup tests: suspected transfers (suspectedTransfer=true) must be excluded
 * from income aggregations so they cannot inflate reported income.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-rollups-')), 'test.db');
process.env.PF_DB_PASSPHRASE = 'test-passphrase';

import { getDb, type DB } from '@/db/client';
import { transactions } from '@/db/schema';
import { incomeRollup, overviewRollup, liabilitiesRollup } from '@/ledger/rollups';

let db: DB;
let n = 0;

function insertTxn(p: {
  flow: 'income' | 'expense' | 'transfer' | 'investment';
  amount: number;
  date: string;
  fyKey: string;
  suspectedTransfer?: boolean;
  category?: string;
}) {
  db.insert(transactions).values({
    id: `t${n++}`,
    txnDate: p.date,
    amount: p.amount,
    currency: 'INR',
    rawDescription: `test-txn-${n}`,
    flow: p.flow,
    category: p.category ?? (p.flow === 'income' ? 'Other Income' : 'Misc'),
    isInternalTransfer: false,
    suspectedTransfer: p.suspectedTransfer ?? false,
    fyKey: p.fyKey,
  }).run();
}

before(async () => {
  db = await getDb();

  // Normal confirmed income: ₹50,000 = 5,000,000 paise
  insertTxn({ flow: 'income', amount: 5_000_000, date: '2025-05-01', fyKey: '2025-26', suspectedTransfer: false });
  // Suspected transfer quarantined credit: ₹1,00,000 = 10,000,000 paise
  // This MUST NOT appear in income totals.
  insertTxn({ flow: 'income', amount: 10_000_000, date: '2025-06-15', fyKey: '2025-26', suspectedTransfer: true });
  // An expense row with suspectedTransfer=false (normal): ₹10,000 debit
  insertTxn({ flow: 'expense', amount: -1_000_000, date: '2025-05-10', fyKey: '2025-26', suspectedTransfer: false });
});

test('incomeRollup excludes suspected transfers from total', () => {
  const rollup = incomeRollup(db, '2025-26');
  // Only the ₹50,000 confirmed income should count (5,000,000 paise → 50,000 rupees)
  assert.equal(rollup.total, 50_000, `Expected ₹50,000 income total but got ₹${rollup.total}`);
  // hasData should still be true because we have at least one real income row
  assert.ok(rollup.hasData, 'hasData should be true when confirmed income exists');
});

test('incomeRollup txns list excludes suspected transfers', () => {
  const rollup = incomeRollup(db, '2025-26');
  // The transactions list should only contain the one confirmed income row
  assert.equal(rollup.txns.length, 1, `Expected 1 income txn but got ${rollup.txns.length}`);
  assert.equal(rollup.txns[0].amt, 50_000);
});

test('overviewRollup income excludes suspected transfers via flowSum', () => {
  const rollup = overviewRollup(db, '2025-26');
  // The overview income should be ₹50,000 (not ₹1,50,000)
  assert.equal(rollup.income, 50_000, `Expected ₹50,000 overview income but got ₹${rollup.income}`);
});

test('liabilitiesRollup finds loan rows stored with lowercase canonical category', () => {
  // Insert a loan expense with canonical lowercase category (post-backfill form).
  insertTxn({ flow: 'expense', amount: -500_000, date: '2025-07-01', fyKey: '2025-26', category: 'loan' });
  // Also insert one with legacy Title-Case to confirm both are matched.
  insertTxn({ flow: 'expense', amount: -300_000, date: '2025-08-01', fyKey: '2025-26', category: 'Loan' });

  const rollup = liabilitiesRollup(db, '2025-26');
  assert.ok(rollup.hasData, 'hasData should be true when loan rows exist');
  assert.ok(rollup.loans.length >= 2, `Expected at least 2 loan groups (got ${rollup.loans.length})`);
  const totalEmi = rollup.loans.reduce((s, l) => s + l.emi, 0);
  assert.ok(totalEmi > 0, 'Total EMI from loan rows must be > 0');
});
