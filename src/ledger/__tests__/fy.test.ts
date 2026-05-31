import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fyWindow, fyForDate, fyKey, isInFy, gmailDayAfter } from '../fy';

test('fyWindow spans Apr 1 to Mar 31', () => {
  const w = fyWindow('2025-26');
  assert.equal(w.start, '2025-04-01');
  assert.equal(w.end, '2026-03-31');
  assert.equal(w.startYear, 2025);
  assert.equal(w.endYear, 2026);
});

test('fyForDate maps Jan–Mar to the prior starting year', () => {
  assert.equal(fyForDate('2026-03-30'), '2025-26');
  assert.equal(fyForDate('2025-04-01'), '2025-26');
  assert.equal(fyForDate('2025-03-31'), '2024-25');
  assert.equal(fyForDate('2025-12-31'), '2025-26');
});

test('fyKey pads the two-digit end year', () => {
  assert.equal(fyKey(2025), '2025-26');
  assert.equal(fyKey(1999), '1999-00');
  assert.equal(fyKey(2009), '2009-10');
});

test('isInFy respects inclusive bounds', () => {
  assert.ok(isInFy('2025-04-01', '2025-26'));
  assert.ok(isInFy('2026-03-31', '2025-26'));
  assert.ok(!isInFy('2026-04-01', '2025-26'));
  assert.ok(!isInFy('2025-03-31', '2025-26'));
});

test('gmailDayAfter advances one day across month/year boundaries', () => {
  assert.equal(gmailDayAfter('2026-03-31'), '2026/04/01');
  assert.equal(gmailDayAfter('2025-12-31'), '2026/01/01');
});
