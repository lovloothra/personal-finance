/**
 * Cross-document transaction dedup (pure).
 *
 * The same real-world transaction shows up in overlapping statements — a
 * monthly AND an annual statement, or the same period re-imported in a later
 * run. Those must be counted once. But `signature()` strips digits/refs, so a
 * key applied WITHIN one document also collapses two genuine same-day,
 * same-amount payments to the same merchant (two coffees, split rent) — real
 * spending silently dropped. Policy: rows from the SAME document are never
 * duplicates of each other; rows from different documents (or already-stored
 * rows from prior runs) with the same key are.
 */
import { signature } from '@/classifier/normalize';

export interface DedupRow {
  docId: string;
  date: string;
  amount: number;
  rawDescription: string;
  ownAccountId?: string | null;
}

/** Stable identity key: date + amount + normalized descriptor + account. */
export function dedupKey(r: { date: string; amount: number; rawDescription: string; ownAccountId?: string | null }): string {
  return `${r.date}|${r.amount}|${signature(r.rawDescription)}|${r.ownAccountId ?? ''}`;
}

/**
 * Drop rows whose key was already claimed by a DIFFERENT document — either
 * earlier in this batch or by rows already stored in the DB (`existingKeys`,
 * which by construction only contains other documents: a re-parsed document's
 * own rows are deleted before it re-inserts).
 */
export function dedupeAcrossDocuments<T extends DedupRow>(
  rows: T[],
  existingKeys: ReadonlySet<string>,
): { kept: T[]; dropped: number } {
  const claimedBy = new Map<string, string>(); // key → docId that first claimed it
  const kept: T[] = [];
  let dropped = 0;

  for (const r of rows) {
    const key = dedupKey(r);
    const claimer = claimedBy.get(key);
    if (existingKeys.has(key) || (claimer !== undefined && claimer !== r.docId)) {
      dropped++;
      continue;
    }
    if (claimer === undefined) claimedBy.set(key, r.docId);
    kept.push(r);
  }
  return { kept, dropped };
}
