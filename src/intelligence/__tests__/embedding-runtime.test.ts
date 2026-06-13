import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  embedTextsWithSession,
  l2Normalize,
  meanPoolTokenEmbeddings,
  type EncodedText,
  type EmbeddingSession,
} from '../embedding-runtime';

test('mean pooling ignores masked tokens and L2 normalizes the result', () => {
  const pooled = meanPoolTokenEmbeddings(
    new Float32Array([
      1, 0,
      3, 0,
      100, 100,
    ]),
    [1, 3, 2],
    [1, 1, 0],
  );

  assert.deepEqual(pooled, [2, 0]);
  assert.deepEqual(l2Normalize(pooled), [1, 0]);
});

test('embedding session adapter feeds encoded tensors and returns normalized vectors', async () => {
  const encoded: EncodedText = {
    tokens: ['[CLS]', 'zepto', '[PAD]'],
    inputIds: [2, 10, 0],
    attentionMask: [1, 1, 0],
    tokenTypeIds: [0, 0, 0],
  };
  const calls: unknown[] = [];
  const session: EmbeddingSession = {
    async run(feeds) {
      calls.push(feeds);
      return {
        last_hidden_state: {
          data: new Float32Array([
            1, 0,
            3, 0,
            50, 50,
          ]),
          dims: [1, 3, 2],
        },
      };
    },
  };

  const vectors = await embedTextsWithSession({
    session,
    encode: () => encoded,
    texts: ['UPI/ZEPTO'],
    dimensions: 2,
    maxLength: 3,
    createTensor: (type, data, dims) => ({ type, data, dims }),
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(vectors, [[1, 0]]);
});
