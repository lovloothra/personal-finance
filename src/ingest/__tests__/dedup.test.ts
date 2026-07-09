/**
 * Dedup must work in BOTH directions:
 *  - undercount: two real same-day, same-amount payments in ONE statement
 *    (two coffees, split rent) must both survive — signature() strips digits,
 *    so the old batch-global key collapsed them;
 *  - double-count: the same transaction appearing in OVERLAPPING statements
 *    (monthly + annual, or re-imported in a later run) must be dropped.
 * Policy: dedup only ACROSS documents; same-document rows are never dupes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeAcrossDocuments, dedupKey } from '../dedup';

const row = (docId: string, desc: string, opts: { date?: string; amount?: number; acct?: string | null } = {}) => ({
  docId,
  date: opts.date ?? '2025-06-10',
  amount: opts.amount ?? -15000,
  rawDescription: desc,
  ownAccountId: opts.acct ?? 'acct-1',
});

test('two identical same-day payments in the SAME statement both survive', () => {
  const rows = [
    row('doc_jun', 'UPI-BLUE TOKAI COFFEE-ref 111222'),
    row('doc_jun', 'UPI-BLUE TOKAI COFFEE-ref 333444'), // sig strips digits → identical key
  ];
  const { kept, dropped } = dedupeAcrossDocuments(rows, new Set());
  assert.equal(kept.length, 2, 'real duplicate spend must not be silent-dropped');
  assert.equal(dropped, 0);
});

test('the same transaction in an overlapping statement (other doc) is dropped', () => {
  const rows = [
    row('doc_monthly', 'UPI-BLUE TOKAI COFFEE-ref 111222'),
    row('doc_annual', 'UPI-BLUE TOKAI COFFEE-ref 111222'),
  ];
  const { kept, dropped } = dedupeAcrossDocuments(rows, new Set());
  assert.equal(kept.length, 1);
  assert.equal(kept[0].docId, 'doc_monthly', 'first document wins');
  assert.equal(dropped, 1);
});

test('cross-RUN duplicates are dropped against keys already stored in the DB', () => {
  const existing = new Set([dedupKey(row('doc_old', 'UPI-BLUE TOKAI COFFEE-ref 111222'))]);
  const rows = [
    row('doc_annual', 'UPI-BLUE TOKAI COFFEE-ref 999888'), // same sig → stored in run 1
    row('doc_annual', 'NEFT DR NEW LANDLORD RENT', { amount: -4500000 }),
  ];
  const { kept, dropped } = dedupeAcrossDocuments(rows, existing);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].rawDescription, 'NEFT DR NEW LANDLORD RENT');
  assert.equal(dropped, 1);
});

test('identical payments from DIFFERENT accounts are not duplicates', () => {
  const rows = [
    row('doc_hdfc', 'UPI-SHARED DINNER SPLIT', { acct: 'acct-hdfc' }),
    row('doc_icici', 'UPI-SHARED DINNER SPLIT', { acct: 'acct-icici' }),
  ];
  const { kept, dropped } = dedupeAcrossDocuments(rows, new Set());
  assert.equal(kept.length, 2);
  assert.equal(dropped, 0);
});
