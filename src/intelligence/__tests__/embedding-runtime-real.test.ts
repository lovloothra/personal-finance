import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getDefaultEmbeddingRuntime } from '../embedding-runtime';

test('real MiniLM ONNX runtime returns a 384-dimensional embedding', { skip: process.env.PF_RUN_MODEL_TESTS !== '1' }, async () => {
  const runtime = await getDefaultEmbeddingRuntime();
  assert.equal(runtime.status, 'ready');
  const embedding = await runtime.embedText('UPI ZEPTO MARKETPLACE');
  assert.equal(embedding?.length, 384);
});
