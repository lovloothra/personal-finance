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

test('cross-run bank payments and card credits are squared off with card-payment provenance', () => {
  db.insert(parsedDocuments).values([
    { id: 'doc_bank_card_payment', docType: 'bank_statement', ownAccountId: 'bank-1', ownAccountKind: 'bank' },
    { id: 'doc_card_payment_credit', docType: 'card_statement', ownAccountId: 'card-1', ownAccountKind: 'card' },
    { id: 'doc_card_refund_credit', docType: 'card_statement', ownAccountId: 'card-1', ownAccountKind: 'card' },
  ]).run();
  db.insert(transactions).values([
    txn('bank_card_payment', 'doc_bank_card_payment', '2026-06-01', -8508300, 'OPAQUE BANK DEBIT', {
      ownAccountId: 'bank-1', ownAccountKind: 'bank', reviewRequired: true,
    }),
    txn('card_payment_credit', 'doc_card_payment_credit', '2026-06-01', 8508300, 'OPAQUE CARD CREDIT', {
      ownAccountId: 'card-1', ownAccountKind: 'card', reviewRequired: true,
    }),
    txn('card_refund_credit', 'doc_card_refund_credit', '2026-06-02', 432100, 'MERCHANT REVERSAL', {
      ownAccountId: 'card-1', ownAccountKind: 'card', reviewRequired: true,
    }),
  ]).run();

  const result = relinkTransfersLedgerWide(db);
  assert.ok(result.accountClassified >= 3);

  for (const id of ['bank_card_payment', 'card_payment_credit']) {
    const row = db.select().from(transactions).where(eq(transactions.id, id)).get()!;
    assert.equal(row.flow, 'transfer');
    assert.equal(row.category, 'cc_payment');
    assert.equal(row.isInternalTransfer, true);
    assert.equal(row.profileSignalUsed, 'transfer.cc_payment_pair');
  }
  const refund = db.select().from(transactions).where(eq(transactions.id, 'card_refund_credit')).get()!;
  assert.equal(refund.category, 'refund');
  assert.equal(refund.isInternalTransfer, false);
  assert.equal(refund.profileSignalUsed, 'account.card_credit_refund');

  const link = db.select().from(internalTransferLinks)
    .where(eq(internalTransferLinks.creditTxnId, 'card_payment_credit')).get()!;
  assert.equal(link.debitTxnId, 'bank_card_payment');
  assert.equal(link.kind, 'cc_payment');
});
