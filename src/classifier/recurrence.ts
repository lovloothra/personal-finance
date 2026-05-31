/**
 * Layer 6 — Recurrence / subscription detection.
 *
 * `buildRecurrenceIndex` scans a batch of transactions and, for each normalized
 * merchant signature, decides whether the cadence looks like a subscription
 * (monthly / quarterly / yearly) based on the gaps between occurrences and a
 * minimum count. `classifyByRecurrence` then tags a single txn if its signature
 * is in that index. Pure: the index is computed once and passed via context.
 */
import type {
  Classification,
  ClassifyContext,
  RawTxn,
  RecurrenceHit,
} from './types';
import { LAYER } from './types';
import { signature } from './normalize';

const DAY = 86_400_000;

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / DAY;
}

/**
 * Build a recurrence index from a batch of (already parsed) debit transactions.
 * A signature is "recurring" when it has >= minOccurrences debits whose median
 * gap falls in a monthly/quarterly/yearly band.
 */
export function buildRecurrenceIndex(
  txns: RawTxn[],
  minOccurrences = 3,
): Map<string, RecurrenceHit> {
  const groups = new Map<string, string[]>(); // signature → sorted dates
  for (const t of txns) {
    if (t.amount >= 0) continue; // subscriptions are debits
    const sig = signature(t.merchant ?? t.rawDescription);
    if (!sig) continue;
    const arr = groups.get(sig) ?? [];
    arr.push(t.date);
    groups.set(sig, arr);
  }

  const index = new Map<string, RecurrenceHit>();
  for (const [sig, datesRaw] of groups) {
    if (datesRaw.length < minOccurrences) continue;
    const dates = [...datesRaw].sort();
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) gaps.push(daysBetween(dates[i - 1], dates[i]));
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];

    let cadence: RecurrenceHit['cadence'] | null = null;
    if (median >= 25 && median <= 35) cadence = 'monthly';
    else if (median >= 80 && median <= 100) cadence = 'quarterly';
    else if (median >= 350 && median <= 380) cadence = 'yearly';

    if (cadence) index.set(sig, { cadence, occurrences: dates.length });
  }
  return index;
}

export function classifyByRecurrence(
  txn: RawTxn,
  ctx: ClassifyContext,
): Classification | null {
  if (txn.amount >= 0) return null;
  const sig = signature(txn.merchant ?? txn.rawDescription);
  const hit = ctx.recurrence.get(sig);
  if (!hit) return null;

  return {
    flow: 'expense',
    category: 'Subscriptions',
    subcategory: txn.merchant ?? null,
    confidence: hit.occurrences >= 6 ? 'high' : 'med',
    reason: `Recurrence: charge from "${(txn.merchant ?? txn.rawDescription).trim()}" seen ${hit.cadence} for ${hit.occurrences} occurrences → flagged as subscription.`,
    signal: `recurrence.${hit.cadence}`,
    layer: LAYER.RECURRENCE,
    reviewRequired: false,
    isRecurring: true,
  };
}
