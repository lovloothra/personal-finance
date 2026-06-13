import { test } from 'node:test';
import assert from 'node:assert/strict';

import { synthesizeWithOllama, getOllamaStatus } from '../ollama';

test('Ollama synthesis reports unavailable and keeps deterministic answer on fetch failure', async () => {
  const result = await synthesizeWithOllama(
    {
      question: 'How much did I spend on groceries?',
      toolCalls: [{ tool: 'category_spend', args: { category: 'Groceries' } }],
      toolResult: { answer: 'Groceries spend: INR 1,000.', aggregates: { total: 100000 }, evidence: { transactionIds: ['txn_1'] } },
    },
    {
      url: 'http://localhost:11434',
      model: 'qwen2.5:1.5b',
      fetch: async () => {
        throw new Error('connect ECONNREFUSED');
      },
    },
  );

  assert.equal(result.status, 'unavailable');
  assert.equal(result.answer, undefined);
});

test('Ollama receives only typed-tool output and returns synthesized answer', async () => {
  let requestBody: any = null;
  const result = await synthesizeWithOllama(
    {
      question: 'Show provenance for txn_1',
      toolCalls: [{ tool: 'provenance', args: { transactionId: 'txn_1' } }],
      toolResult: {
        answer: 'Found provenance 1 transaction.',
        evidence: {
          transactionIds: ['txn_1'],
          rows: [{ id: 'txn_1', source: 'local_ml', acceptedPredictionId: 'pred_1' }],
        },
      },
    },
    {
      url: 'http://localhost:11434',
      model: 'qwen2.5:1.5b',
      fetch: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ message: { content: 'Synthesized with txn_1 and pred_1.' } }), { status: 200 });
      },
    },
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.answer, 'Synthesized with txn_1 and pred_1.');
  assert.equal(requestBody.stream, false);
  const sent = JSON.stringify(requestBody);
  assert.match(sent, /txn_1/);
  assert.match(sent, /pred_1/);
  assert.doesNotMatch(sent, /SELECT|DROP|sqlite_master/i);
});

test('Ollama status checks model availability through local tags endpoint', async () => {
  const status = await getOllamaStatus({
    url: 'http://localhost:11434',
    model: 'qwen2.5:1.5b',
    fetch: async () => new Response(JSON.stringify({ models: [{ name: 'qwen2.5:1.5b' }] }), { status: 200 }),
  });

  assert.deepEqual(status, {
    status: 'available',
    url: 'http://localhost:11434',
    model: 'qwen2.5:1.5b',
    modelAvailable: true,
  });
});
