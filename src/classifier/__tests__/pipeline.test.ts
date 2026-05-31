/**
 * Golden tests for the 7-layer classifier pipeline.
 *
 * Each test pins one layer's verdict — flow / category / confidence / layer /
 * signal / reviewRequired — against the shape the ProvenanceDrawer renders.
 * The context is deliberately minimal per test so exactly one layer fires.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../pipeline';
import { buildRecurrenceIndex } from '../recurrence';
import { signature } from '../normalize';
import type { ClassifyContext, RawTxn } from '../types';

const inr = (rupees: number) => Math.round(rupees * 100); // paise helper

function ctx(overrides: Partial<ClassifyContext> = {}): ClassifyContext {
  return {
    overrides: [],
    profile: {},
    providerRules: [],
    merchantAliases: [],
    keywordRules: [],
    recurrence: new Map(),
    ...overrides,
  };
}

function txn(partial: Partial<RawTxn>): RawTxn {
  return {
    id: 't1',
    date: '2025-07-01',
    amount: -inr(100),
    currency: 'INR',
    rawDescription: '',
    ...partial,
  };
}

test('layer 1 — user override wins outright', () => {
  const desc = 'UPI/somerandomhandle@okhdfc/payment';
  const c = classify(txn({ rawDescription: desc, amount: -inr(500) }), ctx({
    overrides: [{ matchSignature: signature(desc), flow: 'expense', category: 'Charity', note: 'monthly donation' }],
  }));
  assert.equal(c.layer, 1);
  assert.equal(c.category, 'Charity');
  assert.equal(c.confidence, 'high');
  assert.equal(c.signal, 'user.override');
});

test('layer 2 — salary credit from employer', () => {
  const c = classify(
    txn({ amount: inr(180000), rawDescription: 'NEFT CR NEXORA SYSTEMS PVT LTD SALARY JUL' }),
    ctx({ profile: { employer: { name: 'Nexora Systems', aliases: ['nexora systems'], monthlyAmount: inr(180000) } } }),
  );
  assert.equal(c.flow, 'income');
  assert.equal(c.category, 'Salary');
  assert.equal(c.layer, 2);
  assert.equal(c.confidence, 'high');
  assert.equal(c.signal, 'profile.employer');
});

test('layer 2 — credit-card payment is an internal transfer', () => {
  const c = classify(
    txn({ amount: -inr(45000), rawDescription: 'HDFC CREDIT CARD PAYMENT XX7702' }),
    ctx({ profile: { cards: [{ last4: '7702', label: 'HDFC ··7702' }] } }),
  );
  assert.equal(c.flow, 'transfer');
  assert.equal(c.isInternalTransfer, true);
  assert.equal(c.signal, 'transfer.cc_payment');
  assert.equal(c.layer, 2);
});

test('layer 2 — house-help UPI', () => {
  const c = classify(
    txn({ amount: -inr(12000), rawDescription: 'UPI/lakshmi@oksbi/maid salary' }),
    ctx({ profile: { houseHelp: [{ name: 'Lakshmi', role: 'maid', monthlyAmount: inr(12000) }] } }),
  );
  assert.equal(c.category, 'Household');
  assert.equal(c.subcategory, 'maid');
  assert.equal(c.signal, 'profile.house_help');
  assert.equal(c.layer, 2);
});

test('layer 2 — broker SIP tagged as 80C', () => {
  const c = classify(
    txn({ amount: -inr(25000), rawDescription: 'GROWW ELSS SIP' }),
    ctx({ profile: { brokers: [{ institutionId: 'groww', name: 'Groww', taxSection: '80C' }] } }),
  );
  assert.equal(c.flow, 'investment');
  assert.equal(c.taxSection, '80C');
  assert.equal(c.signal, 'profile.broker.groww');
});

test('layer 3 — provider rule (BESCOM → utilities)', () => {
  const c = classify(
    txn({ amount: -inr(2400), rawDescription: 'BESCOM ELECTRICITY BILL PAYMENT' }),
    ctx({
      providerRules: [
        { institutionId: 'bescom', displayName: 'BESCOM', patterns: ['bescom'], category: 'Utilities', subcategory: 'Electricity' },
      ],
    }),
  );
  assert.equal(c.layer, 3);
  assert.equal(c.category, 'Utilities');
  assert.equal(c.signal, 'pack.institutions');
  assert.equal(c.confidence, 'high');
});

test('layer 4 — merchant alias (longest match wins)', () => {
  const c = classify(
    txn({ amount: -inr(640), rawDescription: 'ZEPTO MARKETPLACE BLR' }),
    ctx({
      merchantAliases: [
        { pattern: 'zepto', canonicalMerchant: 'Zepto', category: 'expenses.groceries', subcategory: 'quick-commerce', source: 'pack:in', confidence: 'high' },
      ],
    }),
  );
  assert.equal(c.layer, 4);
  assert.equal(c.flow, 'expense');
  assert.equal(c.subcategory, 'quick-commerce');
  assert.ok(c.signal?.startsWith('pack.merchants.'));
});

test('layer 5 — keyword rule (fuel)', () => {
  const c = classify(
    txn({ amount: -inr(3000), rawDescription: 'INDIAN OIL FUEL PURCHASE' }),
    ctx({ keywordRules: [{ keyword: 'fuel', category: 'Transport', subcategory: 'Fuel', flow: 'expense', confidence: 'med' }] }),
  );
  assert.equal(c.layer, 5);
  assert.equal(c.category, 'Transport');
  assert.equal(c.signal, 'keyword.fuel');
});

test('layer 6 — recurrence detects a monthly subscription', () => {
  const batch: RawTxn[] = [
    txn({ id: 'a', date: '2025-04-05', amount: -inr(1600), rawDescription: 'CURSOR AI SUBSCRIPTION', merchant: 'Cursor AI' }),
    txn({ id: 'b', date: '2025-05-05', amount: -inr(1600), rawDescription: 'CURSOR AI SUBSCRIPTION', merchant: 'Cursor AI' }),
    txn({ id: 'c', date: '2025-06-05', amount: -inr(1600), rawDescription: 'CURSOR AI SUBSCRIPTION', merchant: 'Cursor AI' }),
  ];
  const recurrence = buildRecurrenceIndex(batch);
  const c = classify(batch[2], ctx({ recurrence }));
  assert.equal(c.layer, 6);
  assert.equal(c.category, 'Subscriptions');
  assert.equal(c.isRecurring, true);
  assert.equal(c.signal, 'recurrence.monthly');
});

test('layer 7 — fallback to review queue', () => {
  const c = classify(txn({ amount: -inr(250), rawDescription: 'UPI/9876543210@ybl/unknown' }), ctx());
  assert.equal(c.layer, 7);
  assert.equal(c.category, 'Uncategorised');
  assert.equal(c.reviewRequired, true);
  assert.equal(c.signal, null);
});

test('layer 9 — one-time project isolation re-stamps an expense', () => {
  const c = classify(
    txn({ amount: -inr(40000), date: '2026-03-15', rawDescription: 'MAKEMYTRIP GOA HOTEL' }),
    ctx({
      merchantAliases: [
        { pattern: 'makemytrip', canonicalMerchant: 'MakeMyTrip', category: 'expenses.travel', subcategory: 'hotels', source: 'pack:in', confidence: 'high' },
      ],
      profile: {
        projects: [
          { id: 'goa-trip', name: 'Goa anniversary trip', startDate: '2026-03-01', endDate: '2026-03-31', categoryHints: ['travel'] },
        ],
      },
    }),
  );
  assert.equal(c.layer, 9);
  assert.equal(c.projectId, 'goa-trip');
  assert.equal(c.signal, 'project.one_time');
  assert.equal(c.isRecurring, false);
});
