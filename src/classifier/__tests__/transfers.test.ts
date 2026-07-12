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

test('self-name-only pair (no keyword, no ownAccountId) still links', () => {
  const { transferIds } = linkInternalTransfers([
    { id: 'd1', date: '2025-10-01', amount: -25000_00, rawDescription: 'UPI TO LOV LOOTHRA' },
    { id: 'c1', date: '2025-10-02', amount: 25000_00, rawDescription: 'UPI FROM LOV LOOTHRA', documentId: 'doc2' },
  ], { selfNames: ['lov', 'loothra'] });
  assert.ok(transferIds.has('d1') && transferIds.has('c1'));
});

test('flow=transfer-only pair (no keyword) still links', () => {
  const { transferIds } = linkInternalTransfers([
    { id: 'd1', date: '2025-10-01', amount: -25000_00, rawDescription: 'PLAIN UPI XYZ', flow: 'transfer' },
    { id: 'c1', date: '2025-10-02', amount: 25000_00, rawDescription: 'PLAIN UPI ABC', flow: 'transfer', documentId: 'doc2' },
  ]);
  assert.ok(transferIds.has('d1') && transferIds.has('c1'));
});

test('two unrelated equal-amount txns with only ownAccountId (no signal) do NOT falsely pair', () => {
  // a plain expense and a plain income, each merely stamped with an account,
  // no transfer signal on either, SAME-amount coincidence within window.
  const { transferIds } = linkInternalTransfers([
    { id: 'd1', date: '2025-10-01', amount: -500_00, rawDescription: 'SWIGGY ORDER', ownAccountId: 'acc_a', merchant: 'Swiggy' },
    { id: 'c1', date: '2025-10-02', amount: 500_00, rawDescription: 'CASHFREE PAYOUT', ownAccountId: 'acc_a', documentId: 'doc2', merchant: 'Cashfree' },
  ]);
  assert.equal(transferIds.has('d1'), false);
  assert.equal(transferIds.has('c1'), false);
});

test('coincidental equal-amount expense/income across DIFFERENT own accounts do NOT pair', () => {
  const { transferIds } = linkInternalTransfers([
    { id: 'd1', date: '2025-10-01', amount: -50000_00, rawDescription: 'RENT PAYMENT', ownAccountId: 'acc_hdfc', merchant: 'Landlord', documentId: 'doc_hdfc' },
    { id: 'c1', date: '2025-10-02', amount: 50000_00, rawDescription: 'SALARY CREDIT', ownAccountId: 'acc_icici', merchant: 'Acme Corp', documentId: 'doc_icici' },
  ]);
  assert.equal(transferIds.has('d1'), false);
  assert.equal(transferIds.has('c1'), false);
});

test('bare equal-amount debit/credit across different own accounts DO pair (keyword-less transfer)', () => {
  const { transferIds, links } = linkInternalTransfers([
    { id: 'd1', date: '2025-10-01', amount: -500000_00, rawDescription: 'MOBILE BANKING DFC bank', ownAccountId: 'acc_icici', documentId: 'doc_a' },
    { id: 'c1', date: '2025-10-02', amount: 500000_00, rawDescription: 'MOBILE BANKING DFC bank', ownAccountId: 'acc_hdfc', documentId: 'doc_b' },
  ]);
  assert.ok(transferIds.has('d1') && transferIds.has('c1'));
  assert.equal(links[0].kind, 'account_transfer');
});

test('large round-number credit with no merchant/counterparty is suspected', () => {
  const { suspectedIds } = linkInternalTransfers([
    { id: 'c1', date: '2025-11-02', amount: 500000_00, rawDescription: 'MOBILE BANKING DFC bank' },
  ]);
  assert.ok(suspectedIds.has('c1'));
});

test('round credit that is already a confirmed transfer is not also suspected', () => {
  const { suspectedIds } = linkInternalTransfers([
    { id: 'd1', date: '2025-10-01', amount: -500000_00, rawDescription: 'x', ownAccountId: 'a', documentId: 'd1doc' },
    { id: 'c1', date: '2025-10-01', amount: 500000_00, rawDescription: 'x', ownAccountId: 'b', documentId: 'd2' },
  ]);
  assert.equal(suspectedIds.has('c1'), false);
});

test('non-round credit is not suspected', () => {
  const { suspectedIds } = linkInternalTransfers([
    { id: 'c1', date: '2025-11-02', amount: 137_50, rawDescription: 'refund' },
  ]);
  assert.equal(suspectedIds.has('c1'), false);
});

test('credit with a resolved merchant is not suspected', () => {
  const { suspectedIds } = linkInternalTransfers([
    { id: 'c1', date: '2025-11-02', amount: 500000_00, rawDescription: 'salary', merchant: 'Acme Corp' },
  ]);
  assert.equal(suspectedIds.has('c1'), false);
});

// UPI AUTOPAY is the rail for Netflix/Spotify/SIP/insurance mandates in India —
// real spending, not card bills. Single-sided cc-payment marking must require
// card-bill context; a bare "autopay" debit must stay an expense.

test('UPI AUTOPAY merchant debit is NOT single-sided marked as a transfer', () => {
  const txns = [
    t('n1', '2025-06-01', -64900, 'UPI-AUTOPAY/NETFLIX/pay@icici/mandate', 'doc_bank'),
    t('n2', '2025-06-02', -19900, 'UPI AUTOPAY SPOTIFY SI', 'doc_bank'),
  ];
  const { transferIds } = linkInternalTransfers(txns);
  assert.equal(transferIds.size, 0, 'autopay without card context stays spending');
});

test('card autopay debit (card-bill context) is still single-sided marked', () => {
  const txns = [t('n3', '2025-06-03', -4500000, 'AUTOPAY SI-TAD HDFC CARD 9829', 'doc_bank')];
  const { transferIds } = linkInternalTransfers(txns);
  assert.ok(transferIds.has('n3'), 'autopay + card context is a card bill by definition');
});

test('CRED via BillDesk debit is single-sided marked as a card payment', () => {
  const txns = [t(
    'cred-billdesk',
    '2025-11-02',
    -58478600,
    'BIL/ONL/001104143602/BILL DESK/CRED_BICIEC3112/MKS-10000007874 BANK/113537545429',
    'doc_bank',
  )];
  const { transferIds } = linkInternalTransfers(txns);
  assert.ok(transferIds.has('cred-billdesk'));
});

test('autopay alone is not a pairing signal for coincidental equal amounts', () => {
  const txns = [
    t('n4', '2025-06-10', -64900, 'UPI-AUTOPAY/NETFLIX/mandate', 'doc_bank'),
    t('n5', '2025-06-11', 64900, 'NEFT CR REFUND TRANSFER', 'doc_icici'), // explicit signal on credit
  ];
  const { transferIds } = linkInternalTransfers(txns);
  assert.ok(!transferIds.has('n4'), 'netflix mandate must not pair away into a transfer');
});
