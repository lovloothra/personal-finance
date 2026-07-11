import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewState } from '../viewState';

// Precedence table: loading beats error beats empty beats ready.
const CASES: Array<[boolean, string | null, boolean | undefined, string]> = [
  [true, null, undefined, 'loading'],
  [true, 'HTTP 500', true, 'loading'], // retry in flight: show loading, not the stale error
  [false, 'HTTP 500', undefined, 'error'],
  [false, 'HTTP 500', true, 'error'], // failure wins even if stale data lingers
  [false, null, undefined, 'empty'], // no payload at all
  [false, null, false, 'empty'], // payload says hasData: false
  [false, null, true, 'ready'],
];

test('viewState precedence: loading > error > empty > ready', () => {
  for (const [loading, error, hasData, expected] of CASES) {
    assert.equal(viewState(loading, error, hasData), expected, `(${loading}, ${error}, ${hasData})`);
  }
});
