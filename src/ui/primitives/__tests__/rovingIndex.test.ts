import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rovingIndex } from '../rovingIndex';

test('ArrowRight moves to the next index', () => {
  assert.equal(rovingIndex(0, 'ArrowRight', 3), 1);
  assert.equal(rovingIndex(1, 'ArrowRight', 3), 2);
});

test('ArrowRight wraps from the last index to the first', () => {
  assert.equal(rovingIndex(2, 'ArrowRight', 3), 0);
});

test('ArrowLeft moves to the previous index', () => {
  assert.equal(rovingIndex(2, 'ArrowLeft', 3), 1);
  assert.equal(rovingIndex(1, 'ArrowLeft', 3), 0);
});

test('ArrowLeft wraps from the first index to the last', () => {
  assert.equal(rovingIndex(0, 'ArrowLeft', 3), 2);
});

test('Home always returns the first index', () => {
  assert.equal(rovingIndex(0, 'Home', 5), 0);
  assert.equal(rovingIndex(4, 'Home', 5), 0);
});

test('End always returns the last index', () => {
  assert.equal(rovingIndex(0, 'End', 5), 4);
  assert.equal(rovingIndex(4, 'End', 5), 4);
});

test('single-item list: Left/Right wrap onto the same index', () => {
  assert.equal(rovingIndex(0, 'ArrowRight', 1), 0);
  assert.equal(rovingIndex(0, 'ArrowLeft', 1), 0);
});

test('unrecognized keys return null (caller ignores them)', () => {
  assert.equal(rovingIndex(0, 'Enter', 3), null);
  assert.equal(rovingIndex(0, 'ArrowDown', 3), null);
  assert.equal(rovingIndex(0, ' ', 3), null);
});

test('length 0 always returns null regardless of key', () => {
  assert.equal(rovingIndex(0, 'ArrowRight', 0), null);
  assert.equal(rovingIndex(0, 'Home', 0), null);
});
