/**
 * Subscription detection — the single source of truth, rebuilt from the
 * transactions table after every ingest / reclassify.
 *
 * Two kinds of subscription are recognised:
 *
 *   1. Known subscription merchants — anything classified to a subscription
 *      pack (OTT, music, AI tools/software, telecom). Identity is certain, so
 *      these surface as CONFIRMED even with a single charge (an annual Hotstar
 *      plan is still a subscription). Grouped by canonical merchant, so
 *      "Netflix" appears exactly once regardless of how many raw descriptors
 *      the bank used. A merchant billing at clearly different price points
 *      (e.g. Airtel mobile vs broadband) splits into one line per price tier.
 *
 *   2. Unknown recurring charges — a debit whose cleaned descriptor repeats on
 *      a monthly/quarterly/yearly cadence (>= 3 times). Lower confidence, shown
 *      as LIKELY for the user to confirm, dismiss, or teach a merchant alias.
 *
 * User-set statuses (confirmed / dismissed) survive rebuilds because the ids
 * are deterministic.
 */
import 'server-only';
import type { DB } from '@/db/client';
import { transactions, subscriptionsDetected } from '@/db/schema';
import { signature } from '@/classifier/normalize';

/** Display categories that come exclusively from subscription merchant packs. */
const SUBSCRIPTION_MERCHANT_CATEGORIES = new Set(['Ott', 'Software', 'Music', 'Telecom', 'Entertainment']);

/** Categories that are recurring commitments but belong on their own pages. */
const STRUCTURAL = new Set([
  'Housing', 'Loan', 'Insurance', 'Salary', 'Investment', 'Transfer',
  'Uncategorised', 'Fees & Charges', 'Cash', 'Refund', 'Income',
]);

/** Layers that yield a trustworthy canonical merchant (override→alias). */
const CANONICAL_LAYERS = new Set([1, 2, 3, 4]);

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) =>
  Math.abs(new Date(a + 'T00:00:00Z').getTime() - new Date(b + 'T00:00:00Z').getTime()) / DAY;

type Cadence = 'monthly' | 'quarterly' | 'yearly';

function addCadence(iso: string, cadence: Cadence): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (cadence === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else if (cadence === 'quarterly') d.setUTCMonth(d.getUTCMonth() + 3);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Median gap → cadence band, or null when the spacing fits no band. */
function cadenceFromGaps(dates: string[]): Cadence | null {
  if (dates.length < 2) return null;
  const sorted = [...dates].sort();
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1], sorted[i]));
  const g = median(gaps);
  if (g >= 20 && g <= 45) return 'monthly';
  if (g >= 75 && g <= 110) return 'quarterly';
  if (g >= 320 && g <= 400) return 'yearly';
  return null;
}

/** Turn a raw bank descriptor into a readable label for unknown recurrences. */
function cleanLabel(raw: string): string {
  let s = raw
    .replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*/, '') // leading HH:MM(:SS)
    .replace(/\(ref#?[^)]*\)/gi, ' ') // (Ref# ...)
    .replace(/\bref#?\s*\w+/gi, ' ')
    .replace(/\b(?=[a-z0-9]*\d)[a-z0-9]{7,}\b/gi, ' ') // codes/VPAs (long + a digit), keeps plain words
    .replace(/\b\d{3,}\b/g, ' ') // bare long numbers
    .replace(/[+|*/@]/g, ' ')
    .replace(/\b(upi|imps|neft|rtgs|bil|ach|nach|pos|vps|c l)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(?:\s+(?:in|the|of|ltd|limite|limited))?\s+\d{1,3}$/i, '') // trailing "... 30"
    .trim();
  if (!s) s = raw.replace(/\s+/g, ' ').trim();
  if (s.length <= 36) return s;
  return s.slice(0, 36).replace(/\s+\S*$/, '').trim() || s.slice(0, 36);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

interface Charge {
  date: string;
  amount: number; // positive paise
  rawDescription: string;
}
interface Bucket {
  id: string;
  merchant: string;
  category: string;
  known: boolean;
  charges: Charge[];
}

/** Minimum representative amount for an UNKNOWN recurrence to count as a
 * subscription — filters out trivial fee/cashback noise. */
const MIN_UNKNOWN_PAISE = 3000; // ₹30

/** Detect subscriptions from the classified ledger and rewrite the table. */
export function detectSubscriptions(db: DB): number {
  const rows = db
    .select({
      merchant: transactions.merchant,
      category: transactions.category,
      layer: transactions.layer,
      flow: transactions.flow,
      isTransfer: transactions.isInternalTransfer,
      date: transactions.txnDate,
      amount: transactions.amount,
      raw: transactions.rawDescription,
    })
    .from(transactions)
    .all();

  // 1. Group charges by canonical merchant (known) or descriptor signature.
  const groups = new Map<string, Bucket>();
  for (const r of rows) {
    if (r.flow !== 'expense' || r.isTransfer || r.amount >= 0) continue;
    const category = r.category ?? 'Uncategorised';
    if (STRUCTURAL.has(category)) continue;

    const canonical = r.merchant && CANONICAL_LAYERS.has(r.layer ?? 99) ? r.merchant : null;
    const known = !!canonical && SUBSCRIPTION_MERCHANT_CATEGORIES.has(category);

    let key: string;
    let label: string;
    if (known && canonical) {
      key = `m:${canonical.toLowerCase()}`;
      label = canonical;
    } else if (category === 'Subscriptions') {
      // Recurrence-detected generic subscription — key by descriptor.
      key = `s:${signature(r.raw ?? '')}`;
      label = canonical ?? cleanLabel(r.raw ?? '');
    } else {
      continue; // ordinary spend, not a subscription candidate
    }
    if (!key.endsWith(':')) {
      const b = groups.get(key) ?? { id: key, merchant: label, category, known, charges: [] };
      b.charges.push({ date: r.date, amount: Math.abs(r.amount), rawDescription: r.raw ?? '' });
      groups.set(key, b);
    }
  }

  // 2. Resolve each group into a single subscription row (one per merchant).
  interface Resolved {
    id: string; merchant: string; category: string; amount: number;
    cadence: Cadence; firstSeen: string; lastSeen: string; occurrences: number; known: boolean;
  }
  const resolved: Resolved[] = [];
  for (const b of groups.values()) {
    const charges = b.charges;
    const dates = charges.map((c) => c.date).sort();
    const occ = charges.length;
    let cadence = cadenceFromGaps(dates);
    const byDate = [...charges].sort((a, b2) => (a.date < b2.date ? -1 : 1));
    const latestAmount = byDate[byDate.length - 1].amount;

    if (b.known) {
      // Known merchant: always a subscription. Infer cadence when the data is
      // too sparse to measure (a lone annual plan vs a monthly one).
      if (!cadence) cadence = occ === 1 && latestAmount >= 120000 ? 'yearly' : 'monthly';
    } else {
      // Unknown: only a subscription if it genuinely recurs and isn't noise.
      if (occ < 3 || !cadence) continue;
      if (median(charges.map((c) => c.amount)) < MIN_UNKNOWN_PAISE) continue;
      if ((b.merchant.match(/[a-z]/gi)?.length ?? 0) < 3) continue;
    }

    resolved.push({
      id: b.id,
      merchant: b.merchant,
      category: b.category,
      amount: latestAmount, // what you'll pay next
      cadence,
      firstSeen: dates[0],
      lastSeen: dates[dates.length - 1],
      occurrences: occ,
      known: b.known,
    });
  }

  // 3. Rewrite the table, carrying over user-set statuses.
  const prevStatus = new Map(
    db.select({ id: subscriptionsDetected.id, status: subscriptionsDetected.status })
      .from(subscriptionsDetected).all().map((r) => [r.id, r.status]),
  );

  db.transaction((tx) => {
    tx.delete(subscriptionsDetected).run();
    for (const s of resolved) {
      const id = `sub_${slug(s.id)}`;
      // Only identified subscription merchants auto-confirm. Unknown recurrences
      // (a repeated store charge, a recurring transfer) stay "likely" so the
      // user decides — keeps "Active subscriptions" trustworthy.
      const status = prevStatus.get(id) ?? (s.known ? 'confirmed' : 'likely');
      tx.insert(subscriptionsDetected)
        .values({
          id,
          merchant: s.merchant.slice(0, 60),
          amount: s.amount,
          cadence: s.cadence,
          status,
          firstSeen: s.firstSeen,
          lastSeen: s.lastSeen,
          nextChargeEta: addCadence(s.lastSeen, s.cadence),
          occurrences: s.occurrences,
          category: s.category,
        })
        .onConflictDoNothing()
        .run();
    }
  });

  return resolved.length;
}
