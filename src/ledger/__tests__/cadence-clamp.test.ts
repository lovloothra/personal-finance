/**
 * addCadence must clamp to end-of-month: Jan 31 + monthly rolled over to
 * Mar 3 (setUTCMonth overflow), drifting every 31st-anchored subscription's
 * next-charge ETA.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCadence } from '../subscriptions';

test('monthly cadence from Jan 31 lands on Feb 28/29, not Mar 3', () => {
  assert.equal(addCadence('2025-01-31', 'monthly'), '2025-02-28');
  assert.equal(addCadence('2024-01-31', 'monthly'), '2024-02-29'); // leap year
});

test('monthly cadence from a mid-month date is untouched', () => {
  assert.equal(addCadence('2025-01-15', 'monthly'), '2025-02-15');
});

test('quarterly from Nov 30 clamps into Feb', () => {
  assert.equal(addCadence('2024-11-30', 'quarterly'), '2025-02-28');
});

test('yearly from Feb 29 clamps to Feb 28 in a non-leap year', () => {
  assert.equal(addCadence('2024-02-29', 'yearly'), '2025-02-28');
});
