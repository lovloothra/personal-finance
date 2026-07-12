import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../pipeline';
import { DEFAULT_KEYWORD_RULES } from '../keyword-rules';
import type { ClassifyContext, RawTxn } from '../types';

const ctx: ClassifyContext = {
  profile: {},
  providerRules: [],
  merchantAliases: [],
  keywordRules: DEFAULT_KEYWORD_RULES,
  overrides: [],
  recurrence: new Map(),
};

const txn = (rawDescription: string, amount = -58478600): RawTxn => ({
  id: 'guard',
  date: '2025-11-02',
  amount,
  currency: 'INR',
  rawDescription,
});

test('full CRED-via-BillDesk rail is a canonical high-confidence card payment', () => {
  const result = classify(txn('BIL/ONL/001104143602/BILL DESK/CRED_BICIEC3112/MKS-10000007874'), ctx);
  assert.equal(result.flow, 'transfer');
  assert.equal(result.category, 'cc_payment');
  assert.equal(result.subcategory, 'Credit card payment');
  assert.equal(result.confidence, 'high');
  assert.equal(result.reviewRequired, false);
  assert.equal(result.isInternalTransfer, true);
  assert.equal(result.signal, 'keyword.cred_billdesk_cc_payment');
});

test('trailing BANK reference drift does not change the match', () => {
  const result = classify(txn('BIL/ONL/001104143602/BILL DESK/CRED_BICIEC3112/MKS-10000007874 BANK/113537545429'), ctx);
  assert.equal(result.category, 'cc_payment');
});

test('BillDesk utility payment is not silently marked as a transfer', () => {
  const result = classify(txn('BIL/ONL/001104143602/BILL DESK/BESCOM/MKS-10000007874'), ctx);
  assert.notEqual(result.flow, 'transfer');
  assert.equal(result.category, 'Utilities');
});

test('unstructured CRED description is not silently marked as a transfer', () => {
  const result = classify(txn('UPI/CRED/RENT PAYMENT/cred@axis'), ctx);
  assert.notEqual(result.flow, 'transfer');
});

test('a credit with the same rail shape is not classified as a card payment', () => {
  const result = classify(txn('BIL/ONL/001104143602/BILL DESK/CRED_BICIEC3112/MKS-10000007874', 58478600), ctx);
  assert.notEqual(result.flow, 'transfer');
  assert.equal(result.category, 'Uncategorised');
});

test('bare AUTOPAY remains outside the structural card-payment rule', () => {
  const result = classify(txn('UPI-AUTOPAY/STREAMING SERVICE/mandate'), ctx);
  assert.notEqual(result.flow, 'transfer');
});
