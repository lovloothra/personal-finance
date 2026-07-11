import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDistributionEntry, rankCategories, type RankInput } from '../rank-categories';
import type { Flow } from '@/classifier/types';

// Fixed pools independent of the real taxonomy so ordering assertions stay
// stable regardless of taxonomy.ts changes.
const POOLS: Record<Flow, string[]> = {
  expense: ['housing', 'rent', 'utilities', 'groceries', 'dining', 'transport', 'fuel'],
  income: ['salary', 'interest', 'dividend'],
  transfer: ['self_transfer', 'cc_payment'],
  investment: ['investment'],
};
const poolFn = (f: Flow) => POOLS[f];

const base: RankInput = {
  suggestedCategory: null,
  distribution: null,
  topCategories: [],
  groupFlow: 'expense',
};

test('suggestion comes first when present', () => {
  const out = rankCategories({ ...base, suggestedCategory: 'groceries', topCategories: ['rent'] }, poolFn);
  assert.equal(out[0], 'groceries');
  assert.equal(out[1], 'rent');
});

test('suggestion is normalized via normalizeCategory before matching the pool', () => {
  // 'expenses.groceries' is a known legacy dotted path that normalizes to 'groceries'.
  const out = rankCategories({ ...base, suggestedCategory: 'expenses.groceries' }, poolFn);
  assert.equal(out[0], 'groceries');
});

test('distribution entries rank by descending probability', () => {
  const out = rankCategories({
    ...base,
    distribution: [
      { category: 'fuel', p: 0.1 },
      { category: 'dining', p: 0.8 },
      { category: 'transport', p: 0.5 },
    ],
  }, poolFn);
  assert.deepEqual(out.slice(0, 3), ['dining', 'transport', 'fuel']);
});

test('distribution ties keep input order (stable sort)', () => {
  const out = rankCategories({
    ...base,
    distribution: [
      { category: 'fuel', p: 0.5 },
      { category: 'dining', p: 0.5 },
      { category: 'transport', p: 0.5 },
    ],
  }, poolFn);
  assert.deepEqual(out.slice(0, 3), ['fuel', 'dining', 'transport']);
});

test('malformed distribution: a string instead of an array is skipped entirely', () => {
  const out = rankCategories({
    ...base,
    distribution: 'not-an-array' as unknown as RankInput['distribution'],
    topCategories: ['rent'],
  }, poolFn);
  assert.deepEqual(out.slice(0, 1), ['rent']);
});

test('malformed distribution: a plain object instead of an array is skipped entirely', () => {
  const out = rankCategories({
    ...base,
    distribution: { category: 'rent', p: 0.9 } as unknown as RankInput['distribution'],
    topCategories: ['rent'],
  }, poolFn);
  assert.deepEqual(out.slice(0, 1), ['rent']);
});

test('malformed distribution: entries missing p are skipped, valid entries still rank', () => {
  const out = rankCategories({
    ...base,
    distribution: [
      { category: 'fuel' } as unknown as { category: string; p: number },
      { category: 'dining', p: 0.8 },
    ],
  }, poolFn);
  assert.equal(out[0], 'dining');
  assert.ok(!out.includes('fuel') || out.indexOf('fuel') > out.indexOf('dining'));
});

test('malformed distribution: NaN probability is skipped', () => {
  const out = rankCategories({
    ...base,
    distribution: [
      { category: 'fuel', p: NaN },
      { category: 'dining', p: 0.8 },
    ],
  }, poolFn);
  assert.equal(out[0], 'dining');
  assert.equal(isDistributionEntry({ category: 'fuel', p: NaN }), false);
});

test('isDistributionEntry rejects non-objects, non-string category, non-number p', () => {
  assert.equal(isDistributionEntry(null), false);
  assert.equal(isDistributionEntry('x'), false);
  assert.equal(isDistributionEntry(42), false);
  assert.equal(isDistributionEntry({ category: 1, p: 0.5 }), false);
  assert.equal(isDistributionEntry({ category: 'x', p: '0.5' }), false);
  assert.equal(isDistributionEntry({ category: 'x', p: 0.5 }), true);
});

test('distribution entries naming a category outside the flow pool are skipped', () => {
  const out = rankCategories({
    ...base,
    distribution: [
      { category: 'salary', p: 0.9 }, // not in the expense pool
      { category: 'dining', p: 0.1 },
    ],
  }, poolFn);
  assert.deepEqual(out.slice(0, 1), ['dining']);
  assert.ok(!out.includes('salary'));
});

test('flow filtering: pool is scoped to groupFlow', () => {
  const out = rankCategories({ ...base, groupFlow: 'income', topCategories: ['groceries', 'salary'] }, poolFn);
  // 'groceries' is an expense-flow category, must not leak into income output.
  assert.ok(!out.includes('groceries'));
  assert.deepEqual(out, ['salary', 'interest', 'dividend']);
});

test('every output element belongs to the pool for that flow', () => {
  const out = rankCategories({
    ...base,
    groupFlow: 'transfer',
    suggestedCategory: 'groceries', // wrong-flow suggestion must be dropped
    topCategories: ['groceries', 'cc_payment'],
  }, poolFn);
  for (const c of out) assert.ok(POOLS.transfer.includes(c));
  assert.deepEqual(out, ['cc_payment', 'self_transfer']);
});

test('dedupe: a category appearing via multiple sources appears once, at its highest-precedence slot', () => {
  const out = rankCategories({
    ...base,
    suggestedCategory: 'dining',
    distribution: [{ category: 'dining', p: 0.9 }],
    topCategories: ['dining'],
  }, poolFn);
  assert.equal(out.filter((c) => c === 'dining').length, 1);
  assert.equal(out[0], 'dining');
});

test('cap: result never exceeds 5 entries even with a larger pool', () => {
  const out = rankCategories({ ...base, groupFlow: 'expense' }, poolFn); // expense pool has 7
  assert.equal(out.length, 5);
});

test('empty inputs: no suggestion, no distribution, no topCategories falls back to pool order', () => {
  const out = rankCategories({ suggestedCategory: null, distribution: null, topCategories: [], groupFlow: 'investment' }, poolFn);
  assert.deepEqual(out, ['investment']);
});

test('empty inputs: empty distribution array contributes nothing', () => {
  const out = rankCategories({ ...base, distribution: [], topCategories: ['rent'] }, poolFn);
  assert.deepEqual(out.slice(0, 1), ['rent']);
});
