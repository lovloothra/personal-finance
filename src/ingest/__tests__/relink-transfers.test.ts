/**
 * Cross-RUN self-transfers must pair: a debit leg imported in run 1 and its
 * credit leg in run 2 previously never linked (linking only saw the current
 * batch), so the debit counted as expense and the credit as income —
 * double-counted money. The ledger-wide relink pass is ADDITIVE: it marks new
 * pairs/singles but never un-marks an existing transfer.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-relink-')), 'test.db');
process.env.PF_DB_PASSPHRASE = 'test-passphrase';

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { getDb, type DB } from '@/db/client';
import { internalTransferLinks, parsedDocuments, transactions } from '@/db/schema';
import { relinkTransfersLedgerWide } from '../relink-transfers';

let db: DB;

const txn = (id: string, docId: string, date: string, amount: number, desc: string, extra: Partial<typeof transactions.$inferInsert> = {}) => ({
  id, documentId: docId, txnDate: date, amount, currency: 'INR', rawDescription: desc,
  flow: (amount > 0 ? 'income' : 'expense') as 'income' | 'expense',
  category: amount > 0 ? 'other_income' : 'household',
  isInternalTransfer: false, suspectedTransfer: false, reviewRequired: false, fyKey: '2026-27',
  ...extra,
});

before(async () => {
  db = await getDb();
  db.insert(parsedDocuments).values([{ id: 'doc_run1' }, { id: 'doc_run2' }]).run();
  // Run 1 stored the debit leg (no credit leg existed then).
  db.insert(transactions).values(txn('leg_debit', 'doc_run1', '2026-05-10', -5000000, 'NEFT TRANSFER TO OWN ICICI A/C')).run();
  // Run 2 stored the credit leg + an unrelated expense.
  db.insert(transactions).values([
    txn('leg_credit', 'doc_run2', '2026-05-11', 5000000, 'NEFT CR FUNDS TRANSFER FROM HDFC'),
    txn('unrelated', 'doc_run2', '2026-05-11', -45000, 'SWIGGY ORDER BLR'),
    // A user already marked this one a transfer — additive pass must not touch it.
    txn('user_transfer', 'doc_run2', '2026-05-12', -100000, 'UPI SOMETHING OPAQUE', {
      flow: 'transfer', category: 'self_transfer', isInternalTransfer: true, layer: 1,
    }),
  ]).run();
});

test('a cross-run debit/credit pair links and both legs become transfers', async () => {
  relinkTransfersLedgerWide(db);

  const debit = db.select().from(transactions).where(eq(transactions.id, 'leg_debit')).get()!;
  const credit = db.select().from(transactions).where(eq(transactions.id, 'leg_credit')).get()!;
  assert.equal(debit.flow, 'transfer');
  assert.equal(debit.isInternalTransfer, true);
  assert.equal(credit.flow, 'transfer');
  assert.equal(credit.isInternalTransfer, true);

  const links = db.select().from(internalTransferLinks).all();
  assert.ok(links.some((l) => l.debitTxnId === 'leg_debit' && l.creditTxnId === 'leg_credit'), 'link row written');
});

test('the pass is additive: unrelated spending and existing transfers are untouched', () => {
  const unrelated = db.select().from(transactions).where(eq(transactions.id, 'unrelated')).get()!;
  assert.equal(unrelated.flow, 'expense');
  assert.equal(unrelated.isInternalTransfer, false);

  const userTransfer = db.select().from(transactions).where(eq(transactions.id, 'user_transfer')).get()!;
  assert.equal(userTransfer.flow, 'transfer');
  assert.equal(userTransfer.layer, 1, 'user-override transfer left exactly as it was');
});
