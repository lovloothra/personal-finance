import { test } from 'node:test';
import assert from 'node:assert/strict';

import { trainSoftmaxHead, predictSoftmaxHead, type EmbeddedTrainingExample } from '../classifier-head';

const example = (partial: Partial<EmbeddedTrainingExample>): EmbeddedTrainingExample => ({
  id: partial.id ?? 'ex',
  merchant: partial.merchant ?? 'Zepto',
  flow: partial.flow ?? 'expense',
  category: partial.category ?? 'Groceries',
  subcategory: partial.subcategory ?? 'Quick commerce',
  embedding: partial.embedding ?? [1, 0],
});

test('softmax head does not train without embedded examples', () => {
  assert.equal(trainSoftmaxHead([], { modelVersion: 'test-head', embeddingModelId: 'fake', dimensions: 2 }), null);
});

test('softmax head predicts the nearest winning label with distribution and margin', () => {
  const head = trainSoftmaxHead(
    [
      example({ id: 'g1', merchant: 'Zepto', embedding: [1, 0] }),
      example({ id: 'g2', merchant: 'Blinkit', embedding: [0.95, 0.05] }),
      example({ id: 't1', merchant: 'Uber', category: 'Transport', subcategory: 'Cab', embedding: [0, 1] }),
    ],
    { modelVersion: 'test-head', embeddingModelId: 'fake', dimensions: 2, trainedAt: 100 },
  );

  assert.ok(head);
  const prediction = predictSoftmaxHead(head, [1, 0], [
    example({ id: 'g1', merchant: 'Zepto', embedding: [1, 0] }),
    example({ id: 'g2', merchant: 'Blinkit', embedding: [0.95, 0.05] }),
    example({ id: 't1', merchant: 'Uber', category: 'Transport', subcategory: 'Cab', embedding: [0, 1] }),
  ]);

  assert.ok(prediction);
  assert.equal(prediction.label.category, 'Groceries');
  assert.equal(prediction.nearest[0].exampleId, 'g1');
  assert.ok(prediction.probability > 0.9);
  assert.ok(prediction.margin > 0.75);
  assert.equal(prediction.distribution[0].category, 'Groceries');
});
