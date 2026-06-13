import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LAYER, type Classification, type RawTxn } from '@/classifier/types';
import {
  LOCAL_ML_LAYER,
  decideClassification,
  isLocalPredictionEligible,
  type LocalModelExample,
} from '../local-model';

const txn = (partial: Partial<RawTxn> = {}): RawTxn => ({
  id: 'txn_target',
  date: '2026-02-14',
  amount: -74000,
  currency: 'INR',
  rawDescription: 'UPI/ZEPTO MARKETPLACE BLR/ORDER 991',
  institutionId: 'hdfc-bank',
  ...partial,
});

const deterministic = (partial: Partial<Classification> = {}): Classification => ({
  flow: 'expense',
  category: 'Uncategorised',
  subcategory: null,
  merchant: null,
  confidence: 'low',
  reason: 'Fallback: no deterministic rule matched.',
  signal: null,
  layer: LAYER.FALLBACK,
  reviewRequired: true,
  ...partial,
});

const example = (id: string, partial: Partial<LocalModelExample> = {}): LocalModelExample => ({
  id,
  feedbackId: `fb_${id}`,
  transactionId: `txn_${id}`,
  signature: 'zepto marketplace blr order',
  rawDescription: 'UPI/ZEPTO MARKETPLACE BLR/ORDER 123',
  merchant: 'Zepto',
  merchantTokens: ['zepto', 'marketplace'],
  category: 'Groceries',
  subcategory: 'Quick commerce',
  flow: 'expense',
  amount: -72000,
  amountBucket: 'expense:500-1000',
  direction: 'debit',
  institutionId: 'hdfc-bank',
  reviewedAt: 1781548800000,
  source: 'review_assignment',
  ...partial,
});

test('local prediction eligibility allows only low-confidence residual deterministic outcomes', () => {
  assert.equal(isLocalPredictionEligible(deterministic()), true);
  assert.equal(isLocalPredictionEligible(deterministic({ layer: LAYER.KEYWORD, reviewRequired: true })), true);
  assert.equal(isLocalPredictionEligible(deterministic({ layer: LAYER.USER_OVERRIDE, reviewRequired: false })), false);
  assert.equal(isLocalPredictionEligible(deterministic({ layer: LAYER.PROFILE, reviewRequired: false })), false);
  assert.equal(isLocalPredictionEligible(deterministic({ layer: LAYER.PROVIDER, reviewRequired: false })), false);
  assert.equal(isLocalPredictionEligible(deterministic({ layer: LAYER.MERCHANT_ALIAS, reviewRequired: false })), false);
  assert.equal(isLocalPredictionEligible(deterministic({ flow: 'transfer', category: 'Transfer' })), false);
  assert.equal(isLocalPredictionEligible(deterministic({ taxSection: '80C' })), false);
  assert.equal(isLocalPredictionEligible(deterministic({ layer: LAYER.PROJECT_ISOLATION, projectId: 'move' })), false);
});

test('one reviewed local example is exposed only as a review suggestion', () => {
  const decision = decideClassification(txn(), deterministic(), [example('one')]);

  assert.equal(decision.source, 'deterministic');
  assert.equal(decision.reviewStatus, 'suggested');
  assert.equal(decision.finalResult.category, 'Uncategorised');
  assert.equal(decision.finalResult.reviewRequired, true);
  assert.equal(decision.localPrediction?.category, 'Groceries');
  assert.equal(decision.localPrediction?.confidence, 'med');
  assert.deepEqual(decision.localPrediction?.evidenceIds, ['one']);
});

test('strong local memory becomes an audited layer-10 classification', () => {
  const decision = decideClassification(txn(), deterministic(), [
    example('one'),
    example('two', { amount: -76000 }),
    example('three', { amount: -81000, rawDescription: 'ZEPTO MARKETPLACE BENGALURU ORDER' }),
  ]);

  assert.equal(decision.source, 'local_ml');
  assert.equal(decision.reviewStatus, 'accepted');
  assert.equal(decision.finalResult.layer, LOCAL_ML_LAYER);
  assert.equal(decision.finalResult.category, 'Groceries');
  assert.equal(decision.finalResult.subcategory, 'Quick commerce');
  assert.equal(decision.finalResult.merchant, 'Zepto');
  assert.equal(decision.finalResult.confidence, 'high');
  assert.equal(decision.finalResult.reviewRequired, false);
  assert.match(decision.finalResult.reason, /Local memory/);
  assert.deepEqual(decision.localPrediction?.evidenceIds, ['one', 'two', 'three']);
});

test('local memory never predicts an incompatible money flow', () => {
  const decision = decideClassification(
    txn({ amount: 74000 }),
    deterministic({ flow: 'income' }),
    [example('expense_only')],
  );

  assert.equal(decision.source, 'deterministic');
  assert.equal(decision.reviewStatus, 'required');
  assert.equal(decision.localPrediction, null);
});
