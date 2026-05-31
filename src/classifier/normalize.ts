/**
 * Description normalization helpers, shared by override matching and recurrence
 * keying. Pure and deterministic.
 */

/** Lowercase, collapse whitespace, trim. */
export function clean(desc: string): string {
  return desc.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * A stable "signature" for a description: lowercased, with digits, dates,
 * reference numbers, and punctuation stripped, leaving the merchant-ish tokens.
 * Used to match recurring charges and user overrides across statements.
 */
export function signature(desc: string): string {
  return clean(desc)
    .replace(/\b[0-9x*·]{4,}\b/g, ' ') // card/acct numbers, refs
    .replace(/[0-9]+/g, ' ') // remaining digits
    .replace(/[^a-z ]+/g, ' ') // punctuation
    .replace(/\b(upi|imps|neft|rtgs|ref|txn|id|no|dt|inr|rs)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when `needle` (already lowercased) appears in the cleaned description. */
export function contains(desc: string, needle: string): boolean {
  return clean(desc).includes(needle.toLowerCase());
}

/** True when any of the (lowercased) needles appears in the description. */
export function containsAny(desc: string, needles: string[]): boolean {
  const c = clean(desc);
  return needles.some((n) => c.includes(n.toLowerCase()));
}

/** Absolute amount equality within a tolerance fraction (default ±5%). */
export function amountNear(a: number, b: number, tol = 0.05): boolean {
  if (b === 0) return a === 0;
  return Math.abs(Math.abs(a) - Math.abs(b)) <= Math.abs(b) * tol;
}
