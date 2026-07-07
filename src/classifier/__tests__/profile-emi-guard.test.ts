/**
 * The profile EMI rule must not claim a transaction on amount coincidence when
 * the descriptor names a known merchant — an EMI-sized SIP to INDmoney is an
 * investment, not a loan payment.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../pipeline';
import type { ClassifyContext, RawTxn } from '../types';

const baseCtx: ClassifyContext = {
  overrides: [],
  profile: { loans: [{ kind: 'home', emiAmount: -12_700_000 }] },
  providerRules: [],
  merchantAliases: [
    { pattern: 'indmoney', canonicalMerchant: 'INDmoney', category: 'investment', subcategory: null, source: 'pack:in', confidence: 'high' },
  ],
  keywordRules: [],
  recurrence: new Map(),
};

const txn = (desc: string, amount: number): RawTxn => ({
  id: 't1',
  date: '2026-01-05',
  amount,
  currency: 'INR',
  rawDescription: desc,
});

test('EMI-sized debit naming a known merchant classifies by the alias, not the loan', () => {
  const c = classify(txn('ACH/INDMONEYMF ICI INDMONEY MUTUAL FUND', -12_700_000), baseCtx);
  assert.equal(c.category, 'Investment');
  assert.equal(c.flow, 'investment');
  assert.equal(c.layer, 4);
});

test('EMI-sized debit with no merchant evidence still matches the loan rule', () => {
  const c = classify(txn('ACH D- HDFC LTD HOMELOAN 0042', -12_700_000), baseCtx);
  assert.equal(c.category, 'Loan');
  assert.equal(c.layer, 2);
});

test('explicit EMI keyword always matches the loan rule', () => {
  const c = classify(txn('EMI 04 OF 24 HDFC LTD', -5_000_000), baseCtx);
  assert.equal(c.category, 'Loan');
});

// 'emi' is a substring of everyday words (premium, chemist, academia) — the
// loan rule must only fire on the whole word, or it shadows every later layer.

test("'emi' inside PREMIUM does not shadow the profile insurer rule", () => {
  const ctx: ClassifyContext = {
    ...baseCtx,
    profile: {
      ...baseCtx.profile,
      insurers: [{ name: 'HDFC Ergo', kind: 'health', taxSection: '80D' }],
    },
  };
  const c = classify(txn('HDFC ERGO GENERAL INSURANCE PREMIUM', -1_500_000), ctx);
  assert.equal(c.category, 'Insurance');
  assert.equal(c.flow, 'expense');
  assert.equal(c.signal, 'profile.insurer');
});

test("'emi' inside CHEMIST does not trigger the loan rule", () => {
  const c = classify(txn('UPI-APOLLO CHEMIST-BLR', -45_000), baseCtx);
  assert.notEqual(c.category, 'Loan');
});

test("standalone 'emi' between separators still matches the loan rule", () => {
  const c = classify(txn('ACH-D/EMI/HDFC LTD', -5_000_000), baseCtx);
  assert.equal(c.category, 'Loan');
});
