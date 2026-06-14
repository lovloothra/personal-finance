import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkInternalTransfers, type LinkTxn } from '../transfers';

const t = (id: string, date: string, amount: number, desc: string, doc: string): LinkTxn => ({
  id, date, amount, rawDescription: desc, documentId: doc, flow: amount > 0 ? 'income' : 'expense',
});

test('pairs a self-transfer debit with its credit on another statement', () => {
  const txns = [
    t('a', '2025-06-10', -5000000, 'NEFT TRANSFER TO OWN ICICI A/C', 'doc_hdfc'),
    t('b', '2025-06-11', 5000000, 'NEFT CR FUNDS TRANSFER FROM HDFC', 'doc_icici'),
    t('c', '2025-06-10', -64900, 'NETFLIX SUBSCRIPTION', 'doc_hdfc'), // unrelated, no pair
  ];
  const { transferIds, links } = linkInternalTransfers(txns);
  assert.ok(transferIds.has('a') && transferIds.has('b'), 'both legs marked');
  assert.ok(!transferIds.has('c'), 'unrelated txn untouched');
  assert.equal(links[0].kind, 'account_transfer');
});

test('pairs a CC bill payment (bank debit) with card "payment received"', () => {
  const txns = [
    t('d', '2025-06-05', -4500000, 'CREDIT CARD PAYMENT HDFC INFINIA', 'doc_bank'),
    t('e', '2025-06-05', 4500000, 'PAYMENT RECEIVED THANK YOU', 'doc_card'),
  ];
  const { transferIds, links } = linkInternalTransfers(txns);
  assert.ok(transferIds.has('d') && transferIds.has('e'));
  assert.equal(links[0].kind, 'cc_payment');
});

test('does NOT pair a real expense that coincidentally matches an income amount', () => {
  const txns = [
    t('x', '2025-06-10', -250000, 'SWIGGY ORDER BLR', 'doc_card'), // no transfer signal
    t('y', '2025-06-10', 250000, 'UPI FROM FRIEND', 'doc_hdfc'), // no transfer signal
  ];
  const { transferIds } = linkInternalTransfers(txns);
  assert.equal(transferIds.size, 0, 'no transfer signal → not deduped');
});

test('requires the pair to be on different statements', () => {
  const txns = [
    t('p', '2025-06-10', -100000, 'IMPS TRANSFER', 'doc_same'),
    t('q', '2025-06-10', 100000, 'IMPS CR TRANSFER', 'doc_same'),
  ];
  const { transferIds } = linkInternalTransfers(txns);
  assert.equal(transferIds.size, 0, 'same statement → not a cross-account transfer');
});

test('marks a single-sided card payment-received credit as a transfer', () => {
  const txns = [t('z', '2025-06-05', 4500000, 'PAYMENT RECEIVED THANK YOU', 'doc_card')];
  const { transferIds } = linkInternalTransfers(txns);
  assert.ok(transferIds.has('z'), 'card payment received is never income');
});

test('leaves a single-sided NEFT payment to a vendor as an expense', () => {
  const txns = [t('r', '2025-06-07', -5500000, 'NEFT TO LANDLORD RENT', 'doc_hdfc')];
  const { transferIds } = linkInternalTransfers(txns);
  assert.equal(transferIds.size, 0, 'unpaired outgoing NEFT stays an expense');
});

test('counterparty resolving to an own account is a single-sided transfer', () => {
  const { transferIds } = linkInternalTransfers([
    { id: 'd1', date: '2025-10-01', amount: -500000_00, rawDescription: 'NEFT to self', counterpartyKind: 'own_account' },
  ]);
  assert.ok(transferIds.has('d1'));
});

test('own debit <-> own credit pair with no keyword is a transfer', () => {
  const { transferIds, links } = linkInternalTransfers([
    { id: 'd1', date: '2025-10-01', amount: -500000_00, rawDescription: 'MOBILE BANKING DFC bank', ownAccountId: 'acc_icici' },
    { id: 'c1', date: '2025-10-02', amount: 500000_00, rawDescription: 'MOBILE BANKING DFC bank', ownAccountId: 'acc_hdfc', documentId: 'doc2' },
  ]);
  assert.ok(transferIds.has('d1') && transferIds.has('c1'));
  assert.equal(links[0].kind, 'account_transfer');
});

test('own credit with no matching own debit is NOT auto-paired', () => {
  const { transferIds } = linkInternalTransfers([
    { id: 'c1', date: '2025-10-01', amount: 500000_00, rawDescription: 'MOBILE BANKING DFC bank', ownAccountId: 'acc_hdfc' },
  ]);
  assert.equal(transferIds.has('c1'), false);
});
