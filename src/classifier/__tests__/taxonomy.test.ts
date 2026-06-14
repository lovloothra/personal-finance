import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoriesForFlow, normalizeCategory, TAXONOMY } from '../taxonomy';

test('income flow exposes the new income categories', () => {
  const cats = categoriesForFlow('income');
  assert.ok(cats.includes('salary'));
  assert.ok(cats.includes('interest'));
  assert.ok(cats.includes('dividend'));
  assert.ok(cats.includes('capital_gains'));
});

test('normalizeCategory folds legacy free-form strings to canonical keys', () => {
  assert.equal(normalizeCategory('Salary'), 'salary');
  assert.equal(normalizeCategory('expenses.travel'), 'travel');
  assert.equal(normalizeCategory('Credit card payment'), 'cc_payment');
  assert.equal(normalizeCategory('quick-commerce'), 'quick_commerce');
});

test('unknown legacy string falls back to uncategorised', () => {
  assert.equal(normalizeCategory('something we never saw'), 'uncategorised');
});

test('every taxonomy value is unique within its flow', () => {
  for (const flow of Object.keys(TAXONOMY) as (keyof typeof TAXONOMY)[]) {
    const set = new Set(TAXONOMY[flow]);
    assert.equal(set.size, TAXONOMY[flow].length);
  }
});
