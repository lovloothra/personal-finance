import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triageKeyAction, type TriageKeyCtx } from '../triageKeys';

const ctx = (overrides: Partial<TriageKeyCtx> = {}): TriageKeyCtx => ({
  groupCount: 10,
  focusIndex: 0,
  inInput: false,
  ...overrides,
});

test('j returns focusNext', () => {
  assert.deepEqual(triageKeyAction('j', ctx()), { type: 'focusNext' });
});

test('k returns focusPrev', () => {
  assert.deepEqual(triageKeyAction('k', ctx()), { type: 'focusPrev' });
});

test('/ returns focusSearch', () => {
  assert.deepEqual(triageKeyAction('/', ctx()), { type: 'focusSearch' });
});

test('Enter returns assign', () => {
  assert.deepEqual(triageKeyAction('Enter', ctx()), { type: 'assign' });
});

test('x returns transfer', () => {
  assert.deepEqual(triageKeyAction('x', ctx()), { type: 'transfer' });
});

for (const n of [1, 2, 3, 4, 5]) {
  test(`digit ${n} returns pick n=${n} when groupCount > 0`, () => {
    assert.deepEqual(triageKeyAction(String(n), ctx({ groupCount: 5 })), { type: 'pick', n });
  });
}

test('digit keys return null when groupCount is 0', () => {
  for (const n of ['1', '2', '3', '4', '5']) {
    assert.equal(triageKeyAction(n, ctx({ groupCount: 0 })), null);
  }
});

test('digits outside 1-5 (e.g. 0, 6) are not handled', () => {
  assert.equal(triageKeyAction('0', ctx()), null);
  assert.equal(triageKeyAction('6', ctx()), null);
});

test('unrecognized keys return null', () => {
  for (const key of ['ArrowDown', 'a', 'Escape', ' ', 'Tab', 'Shift']) {
    assert.equal(triageKeyAction(key, ctx()), null);
  }
});

test('inInput=true: every key returns null, including ones normally handled', () => {
  const inputCtx = ctx({ inInput: true });
  for (const key of ['j', 'k', '/', 'Enter', 'x', '1', '2', '3', '4', '5', 'Escape', 'a']) {
    assert.equal(triageKeyAction(key, inputCtx), null, `expected null for "${key}" while inInput`);
  }
});

test('inInput=true with groupCount > 0 still blocks digit picks', () => {
  assert.equal(triageKeyAction('1', ctx({ inInput: true, groupCount: 10 })), null);
});
