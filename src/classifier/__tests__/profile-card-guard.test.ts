/**
 * The profile card rule must not turn arbitrary debits into CC-payment
 * transfers on a bare last4 substring — long UPI/NEFT reference numbers
 * routinely contain any 4-digit sequence. Last4 only counts in masked card
 * contexts (xx7702, **** 7702, ··7702, "ending 7702").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../pipeline';
import type { ClassifyContext, RawTxn } from '../types';

const ctx: ClassifyContext = {
  overrides: [],
  profile: { cards: [{ institutionId: 'hdfc-bank-cards', last4: '7702', label: 'HDFC Infinia' }] },
  providerRules: [],
  merchantAliases: [
    { pattern: 'swiggy', canonicalMerchant: 'Swiggy', category: 'expenses.food_delivery', subcategory: null, source: 'pack:in', confidence: 'high' },
  ],
  keywordRules: [],
  recurrence: new Map(),
};

const txn = (desc: string, amount: number): RawTxn => ({
  id: 't1', date: '2026-06-05', amount, currency: 'INR', rawDescription: desc,
});

test('last4 inside a UPI reference number does NOT make a debit a CC transfer', () => {
  const c = classify(txn('UPI/P2M/517702123456/SWIGGY BLR', -45000), ctx);
  assert.notEqual(c.flow, 'transfer');
  assert.equal(c.category, 'Food Delivery'); // the alias, not the card rule
});

test('last4 in a masked card context still matches the CC-payment rule', () => {
  for (const desc of ['PAYMENT TOWARDS CARD xx7702', 'IMPS CARD PAYMENT **** 7702', 'BILL PAID ··7702 HDFC']) {
    const c = classify(txn(desc, -4500000), ctx);
    assert.equal(c.flow, 'transfer', desc);
    assert.equal(c.category, 'Transfer', desc);
  }
});

test('the card label still matches as before', () => {
  const c = classify(txn('NEFT DR HDFC INFINIA PAYMENT', -4500000), ctx);
  assert.equal(c.flow, 'transfer');
});
