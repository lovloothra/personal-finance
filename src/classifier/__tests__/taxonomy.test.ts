import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoriesForFlow, labelForCategory, normalizeCategory, TAXONOMY, transferStorageCategory } from '../taxonomy';

test('labelForCategory renders human display labels, never snake_case', () => {
  assert.equal(labelForCategory('mobile_internet'), 'Mobile & Internet');
  assert.equal(labelForCategory('quick_commerce'), 'Quick Commerce');
  assert.equal(labelForCategory('food_delivery'), 'Food Delivery');
  assert.equal(labelForCategory('cc_payment'), 'Credit Card Payment');
  assert.equal(labelForCategory('atm_cash'), 'ATM / Cash');
  assert.equal(labelForCategory('self_transfer'), 'Self Transfer');
  assert.equal(labelForCategory('groceries'), 'Groceries');
});

test('every taxonomy key has a label without underscores', () => {
  for (const flow of Object.keys(TAXONOMY) as (keyof typeof TAXONOMY)[]) {
    for (const key of TAXONOMY[flow]) {
      const label = labelForCategory(key);
      assert.ok(label.length > 0, `label for ${key}`);
      assert.ok(!label.includes('_'), `no underscore in label for ${key}: ${label}`);
    }
  }
});

test('labelForCategory tolerates legacy display strings', () => {
  assert.equal(labelForCategory('Transfer'), 'Transfer');
  assert.equal(labelForCategory('Uncategorised'), 'Uncategorised');
});

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

test('transferStorageCategory preserves canonical keys and keeps the legacy fallback', () => {
  assert.equal(transferStorageCategory('self_transfer'), 'self_transfer');
  assert.equal(transferStorageCategory('cc_payment'), 'cc_payment');
  assert.equal(transferStorageCategory('Uncategorised'), 'Transfer');
  assert.equal(transferStorageCategory('self_transfer', 'Transfer'), 'Transfer');
  assert.equal(transferStorageCategory('self_transfer', 'self_transfer'), 'self_transfer');
  assert.equal(transferStorageCategory('cc_payment', 'Transfer'), 'cc_payment');
});
