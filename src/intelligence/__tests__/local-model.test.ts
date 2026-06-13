import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LAYER, type Classification, type RawTxn } from '@/classifier/types';
import { trainSoftmaxHead } from '../classifier-head';
import {
  LOCAL_ML_LAYER,
  LOCAL_MODEL_VERSION,
  decideClassification,
  isLocalPredictionEligible,
  makeLocalModelExample,
  type LocalClassifierState,
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

const localExample = (id: string, embedding: number[], category = 'Groceries') => ({
  ...makeLocalModelExample({
    id,
    feedbackId: `fb_${id}`,
    transactionId: `txn_${id}`,
    rawDescription: 'UPI/ZEPTO MARKETPLACE BLR/ORDER 123',
    merchant: category === 'Groceries' ? 'Zepto' : 'Uber',
    category,
    subcategory: category === 'Groceries' ? 'Quick commerce' : 'Cab',
    flow: 'expense',
    amount: -72000,
    institutionId: 'hdfc-bank',
    reviewedAt: 1781548800000,
    source: 'review_assignment',
  }),
  embedding,
  embeddingModelId: 'fake-2d',
});

function state(examples = [localExample('one', [1, 0]), localExample('two', [0.95, 0.05]), localExample('three', [0, 1], 'Transport')]): LocalClassifierState {
  return {
    status: 'ready',
    embeddingModelId: 'fake-2d',
    examples,
    head: trainSoftmaxHead(examples, {
      modelVersion: LOCAL_MODEL_VERSION,
      embeddingModelId: 'fake-2d',
      dimensions: 2,
      trainedAt: 100,
    }),
    embedText: async () => [1, 0],
  };
}

test('local prediction eligibility allows only low-confidence residual deterministic outcomes', () => {
  assert.equal(isLocalPredictionEligible(deterministic()), true);
  assert.equal(isLocalPredictionEligible(deterministic({ layer: LAYER.KEYWORD, confidence: 'med', reviewRequired: false })), false);
  assert.equal(isLocalPredictionEligible(deterministic({ layer: LAYER.PROFILE })), false);
  assert.equal(isLocalPredictionEligible(deterministic({ flow: 'transfer', isInternalTransfer: true })), false);
  assert.equal(isLocalPredictionEligible(deterministic({ taxSection: '80C' })), false);
  assert.equal(isLocalPredictionEligible(deterministic({ layer: LAYER.PROJECT_ISOLATION, projectId: 'trip' })), false);
});

test('local classifier skips prediction without a trained head', async () => {
  const decision = await decideClassification(txn(), deterministic(), {
    status: 'disabled',
    embeddingModelId: 'fake-2d',
    examples: [],
    head: null,
    embedText: async () => {
      throw new Error('embedder should not run');
    },
  });

  assert.equal(decision.source, 'deterministic');
  assert.equal(decision.reviewStatus, 'required');
  assert.equal(decision.localPrediction, null);
});

test('protected deterministic layers never call embedding inference', async () => {
  const decision = await decideClassification(
    txn(),
    deterministic({ layer: LAYER.PROVIDER, confidence: 'high', reviewRequired: false, category: 'Utilities' }),
    {
      ...state(),
      embedText: async () => {
        throw new Error('protected layer called embedder');
      },
    },
  );

  assert.equal(decision.source, 'deterministic');
  assert.equal(decision.finalResult.category, 'Utilities');
});

test('strong softmax prediction becomes accepted layer-10 classification', async () => {
  const decision = await decideClassification(txn(), deterministic(), state(), {
    minEvidenceForAutoAccept: 2,
    minAutoAcceptScore: 0.9,
    minAutoAcceptMargin: 0.75,
  });

  assert.equal(decision.source, 'local_ml');
  assert.equal(decision.reviewStatus, 'accepted');
  assert.equal(decision.finalResult.layer, LOCAL_ML_LAYER);
  assert.equal(decision.finalResult.category, 'Groceries');
  assert.equal(decision.localPrediction?.provenance.model, 'minilm_softmax_head');
  assert.equal(decision.localPrediction?.provenance.headVersion, LOCAL_MODEL_VERSION);
  assert.ok(decision.localPrediction?.provenance.distribution.length);
});

test('weak softmax distribution is stored as a suggestion', async () => {
  const weak = state();
  weak.embedText = async () => [0.7, 0.7];

  const decision = await decideClassification(txn(), deterministic(), weak, {
    minEvidenceForAutoAccept: 2,
    minAutoAcceptScore: 0.95,
    minAutoAcceptMargin: 0.9,
  });

  assert.equal(decision.source, 'deterministic');
  assert.equal(decision.reviewStatus, 'suggested');
  assert.equal(decision.localPrediction?.confidence, 'med');
});

test('prediction incompatible with transaction sign is rejected', async () => {
  const decision = await decideClassification(txn({ amount: 74000 }), deterministic({ flow: 'income' }), state());

  assert.equal(decision.source, 'deterministic');
  assert.equal(decision.reviewStatus, 'required');
  assert.equal(decision.localPrediction, null);
});
