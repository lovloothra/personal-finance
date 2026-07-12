import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inr, inrCompact, fmtDate, labelForOption, fyLabel, redactInr } from '../format';

test('inrCompact abbreviates crore-scale amounts for stat cards', () => {
  assert.equal(inrCompact(15301460), '₹1.53 Cr');
  assert.equal(inrCompact(26023346), '₹2.6 Cr');
  assert.equal(inrCompact(10721886), '₹1.07 Cr');
  assert.equal(inrCompact(10000000), '₹1 Cr');
});

test('inrCompact abbreviates lakh-scale amounts', () => {
  assert.equal(inrCompact(250000), '₹2.5 L');
  assert.equal(inrCompact(100000), '₹1 L');
  assert.equal(inrCompact(1475000), '₹14.75 L');
});

test('inrCompact leaves sub-lakh amounts fully grouped', () => {
  assert.equal(inrCompact(99999), inr(99999));
  assert.equal(inrCompact(450), inr(450));
  assert.equal(inrCompact(0), inr(0));
});

test('inrCompact uses absolute value (sign is rendered by Money)', () => {
  assert.equal(inrCompact(-10721886), '₹1.07 Cr');
});

test('fmtDate renders a valid ISO date as "DD Mon YYYY" (en-IN)', () => {
  assert.equal(fmtDate('2026-04-12'), '12 Apr 2026');
  assert.equal(fmtDate('2026-01-05'), '05 Jan 2026');
});

test('fmtDate returns non-date input unchanged', () => {
  // new Date('garbageT00:00:00') is Invalid Date -> fall back to the input as-is.
  assert.equal(fmtDate('garbage'), 'garbage');
  assert.equal(fmtDate(''), '');
});

test('labelForOption de-underscores and sentence-cases an option value', () => {
  assert.equal(labelForOption('non_metro'), 'Non metro');
  assert.equal(labelForOption('mutual_fund'), 'Mutual fund');
  assert.equal(labelForOption('child'), 'Child');
});

test('labelForOption leaves values with no letters to capitalize as-is', () => {
  assert.equal(labelForOption('80CCD1B'), '80CCD1B');
  assert.equal(labelForOption(''), '');
});

test('fyLabel computes label and month range from the key alone', () => {
  assert.deepEqual(fyLabel('2025-26'), { label: 'FY 2025–26', sub: 'Apr 2025 – Mar 2026' });
  assert.deepEqual(fyLabel('2026-27'), { label: 'FY 2026–27', sub: 'Apr 2026 – Mar 2027' });
});

test('fyLabel falls back to a bare label for unrecognized keys', () => {
  assert.deepEqual(fyLabel('all'), { label: 'FY all', sub: '' });
  assert.deepEqual(fyLabel(''), { label: 'FY ', sub: '' });
});

test('redactInr redacts plain amount forms', () => {
  assert.equal(redactInr('saves you ₹2,53,500 this year'), 'saves you ₹•••,••• this year');
  assert.equal(redactInr('₹12,34,567'), '₹•••,•••');
});

test('redactInr redacts compact forms with Cr', () => {
  assert.equal(redactInr('₹1.07 Cr'), '₹•••,•••');
  assert.equal(redactInr('save ₹1.07 Cr total'), 'save ₹•••,••• total');
});

test('redactInr redacts compact forms with L', () => {
  assert.equal(redactInr('₹12.5 L left'), '₹•••,••• left');
  assert.equal(redactInr('after ₹5.25 L in deductions'), 'after ₹•••,••• in deductions');
});

test('redactInr handles multiple amounts in one string', () => {
  assert.equal(redactInr('You save ₹2,53,500 this year with ₹1.07 Cr total'), 'You save ₹•••,••• this year with ₹•••,••• total');
  assert.equal(redactInr('₹10 L and ₹2,00,000 both masked'), '₹•••,••• and ₹•••,••• both masked');
});

test('redactInr leaves amount-free text unchanged', () => {
  assert.equal(redactInr('This is just text'), 'This is just text');
  assert.equal(redactInr('No amounts here'), 'No amounts here');
  assert.equal(redactInr(''), '');
});
