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
