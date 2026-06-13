import { test } from 'node:test';
import assert from 'node:assert/strict';

import { selectAssistantTool } from '../query';

test('assistant selects cashflow tool with explicit FY', () => {
  assert.deepEqual(selectAssistantTool('cash flow for FY 2025-26'), {
    tool: 'cashflow',
    args: { fyKey: '2025-26' },
  });
});

test('assistant selects category spend without SQL generation', () => {
  assert.deepEqual(selectAssistantTool('how much did I spend on groceries?'), {
    tool: 'category_spend',
    args: { category: 'Groceries' },
  });
});

test('assistant rejects unsafe SQL-shaped requests', () => {
  assert.deepEqual(selectAssistantTool('run SQL: drop table transactions'), {
    tool: 'unsupported',
    args: { reason: 'unsafe_or_unsupported' },
  });
});
