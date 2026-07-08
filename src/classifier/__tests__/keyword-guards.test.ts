/**
 * Layer 5 keyword rules must not fire on substring collisions — 'interest'
 * inside PINTEREST, 'gas' inside GASTRO — and must not force a flow that
 * contradicts the transaction sign (an income rule stamping a debit would
 * deflate income rollups with a negative amount). Multi-word and dotted
 * keywords keep substring matching; transfer rules stay valid in both
 * directions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../pipeline';
import { DEFAULT_KEYWORD_RULES } from '../keyword-rules';
import { LAYER } from '../types';
import type { ClassifyContext, RawTxn } from '../types';

const ctx: ClassifyContext = {
  overrides: [],
  profile: {},
  providerRules: [],
  merchantAliases: [],
  keywordRules: DEFAULT_KEYWORD_RULES,
  recurrence: new Map(),
};

const txn = (desc: string, amount: number): RawTxn => ({
  id: 't1',
  date: '2026-06-15',
  amount,
  currency: 'INR',
  rawDescription: desc,
});

// — Whole-word guard: short keywords must not match inside longer words —

test("'interest' inside PINTEREST does not stamp a debit as interest income", () => {
  const c = classify(txn('PINTEREST* ADS SUBSCRIPTION', -49900), ctx);
  assert.notEqual(c.signal, 'keyword.interest');
  assert.equal(c.flow, 'expense');
  assert.equal(c.category, 'Uncategorised');
  assert.equal(c.layer, LAYER.FALLBACK);
  assert.equal(c.reviewRequired, true);
});

test("'gas' inside GASTRO does not classify a clinic as utilities", () => {
  const c = classify(txn('GASTRO CARE CENTRE BLR', -350000), ctx);
  assert.notEqual(c.category, 'Utilities');
  assert.equal(c.layer, LAYER.FALLBACK);
  assert.equal(c.reviewRequired, true);
});

test("standalone 'interest' on a credit still matches", () => {
  const c = classify(txn('SAVINGS A/C INTEREST CREDIT', 45000), ctx);
  assert.equal(c.category, 'Income');
  assert.equal(c.flow, 'income');
  assert.equal(c.signal, 'keyword.interest');
  assert.equal(c.layer, LAYER.KEYWORD);
});

test("standalone 'gas' on a debit still matches", () => {
  const c = classify(txn('GAS CYLINDER BOOKING HP', -110000), ctx);
  assert.equal(c.category, 'Utilities');
  assert.equal(c.subcategory, 'Gas');
  assert.equal(c.layer, LAYER.KEYWORD);
});

test('multi-word phrases keep substring matching', () => {
  const c = classify(txn('CREDIT CARD PAYMENT HDFC 7702', -3200000), ctx);
  assert.equal(c.category, 'Transfer');
  assert.equal(c.flow, 'transfer');
  assert.equal(c.layer, LAYER.KEYWORD);
});

test('dotted keywords keep substring matching', () => {
  const c = classify(txn('UPI-CRED.CLUB-cc bill', -2500000), ctx);
  assert.equal(c.category, 'Transfer');
  assert.equal(c.flow, 'transfer');
  assert.equal(c.signal, 'keyword.cred.club');
});

// — Flow guard: a rule whose flow contradicts the txn sign must be skipped —

test("whole-word 'interest' on a debit is not stamped income", () => {
  const c = classify(txn('INTEREST CHARGED ON OD ACCOUNT', -50000), ctx);
  assert.notEqual(c.flow, 'income');
  assert.equal(c.category, 'Uncategorised');
  assert.equal(c.layer, LAYER.FALLBACK);
  assert.equal(c.reviewRequired, true);
});

test("'refund' on a debit is not stamped income", () => {
  const c = classify(txn('REFUND TO CUSTOMER ORDER 403', -89000), ctx);
  assert.notEqual(c.flow, 'income');
  assert.equal(c.layer, LAYER.FALLBACK);
});

test('transfer rules still fire on credits (card-side leg)', () => {
  const c = classify(txn('CREDIT CARD PAYMENT RECEIVED, THANK YOU', 3200000), ctx);
  assert.equal(c.category, 'Transfer');
  assert.equal(c.flow, 'transfer');
  assert.equal(c.layer, LAYER.KEYWORD);
});

test('expense rule on a credit is skipped to review, not stamped expense', () => {
  const c = classify(txn('ATM WDL REVERSAL 402934', 1000000), ctx);
  assert.notEqual(c.flow, 'expense');
  assert.equal(c.category, 'Uncategorised');
  assert.equal(c.reviewRequired, true);
});
