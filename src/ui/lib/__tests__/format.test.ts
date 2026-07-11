import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inr, inrCompact, fmtDate, labelForOption } from '../format';

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
