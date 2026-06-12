/**
 * Guards on the recurrence layer: mandate rails (ACH/NACH/ECS) and large-ticket
 * recurring debits must never be flagged as subscriptions — they're SIPs, EMIs,
 * premiums, or bank charges and should fall through to other layers / review.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecurrenceIndex } from '../recurrence';
import { signature } from '../normalize';
import type { RawTxn } from '../types';

const txn = (id: string, date: string, amount: number, desc: string): RawTxn => ({
  id,
  date,
  amount,
  currency: 'INR',
  rawDescription: desc,
});

const monthly = (desc: string, paise: number): RawTxn[] => [
  txn('a', '2025-04-05', -paise, desc),
  txn('b', '2025-05-05', -paise, desc),
  txn('c', '2025-06-05', -paise, desc),
  txn('d', '2025-07-05', -paise, desc),
];

test('a small monthly charge is indexed as recurring', () => {
  const index = buildRecurrenceIndex(monthly('NETFLIX.COM Mumbai', 64900));
  assert.equal(index.get(signature('NETFLIX.COM Mumbai'))?.cadence, 'monthly');
});

test('ACH/NACH mandate debits are never indexed as subscriptions', () => {
  const desc = 'ACH/INDIAN CLEARING CORP/ICIC7011211200004632/P5296359X0307699';
  const index = buildRecurrenceIndex(monthly(desc, 1000000));
  assert.equal(index.get(signature(desc)), undefined);
});

test('GST/fee descriptors are never indexed as subscriptions', () => {
  const desc = 'IGST-VPS2635564606052-RATE -07 (Ref# VT253550075035420000143)';
  const index = buildRecurrenceIndex(monthly(desc, 400));
  assert.equal(index.get(signature(desc)), undefined);
});

test('large recurring debits (SIP/EMI scale) are never indexed as subscriptions', () => {
  const desc = 'INDMONEYMF ICI INDMONEY MUTUAL FUND';
  const index = buildRecurrenceIndex(monthly(desc, 5_000_000)); // ₹50,000
  assert.equal(index.get(signature(desc)), undefined);
});
