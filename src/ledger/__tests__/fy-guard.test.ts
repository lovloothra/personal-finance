/**
 * Invalid statement dates must never become fyKey "NaN-NaN" — such rows were
 * stored but invisible in every FY view. isoDate round-trips the calendar;
 * fyForDate throws as the backstop.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fyForDate } from '../fy';
import { parseGenericBank } from '../../parsers/in/generic-bank';

test('fyForDate throws on an invalid date instead of returning NaN-NaN', () => {
  assert.throws(() => fyForDate('2025-02-31'), /invalid date/);
  assert.equal(fyForDate('2025-02-28'), '2024-25');
});

test('the parser rejects impossible calendar dates (31 Feb) into unparsedLines', () => {
  const text = 'Statement of account\n31/02/2025 SOME MERCHANT PAYMENT 649.00 12,345.00\n28/02/2025 REAL MERCHANT 100.00 12,245.00';
  const r = parseGenericBank(text, { providerId: 'hdfc-bank', docType: 'bank_statement' });
  assert.ok(r.txns.every((t) => t.date !== '2025-02-31'), 'no txn stored with an impossible date');
  assert.ok(r.txns.some((t) => t.date === '2025-02-28'), 'the valid line still parses');
});
