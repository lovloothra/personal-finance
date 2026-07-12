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

export interface SuspectedDedupRow extends DedupRow {
  id: string;
  createdAt?: number | null;
}

export interface SuspectedDuplicatePair<T extends SuspectedDedupRow = SuspectedDedupRow> {
  id: string;
  keeper: T;
  candidate: T;
  basis: 'signature_token_prefix';
}

/** One stable decision per candidate transaction, across reparses/reruns. */
export function duplicateCandidateId(candidateTransactionId: string): string {
  return `dup_${candidateTransactionId}`;
}

function isProperTokenPrefix(a: string, b: string): boolean {
  const aTokens = a.split(/\s+/).filter(Boolean);
  const bTokens = b.split(/\s+/).filter(Boolean);
  if (aTokens.length === 0 || aTokens.length >= bTokens.length) return false;
  return aTokens.every((token, i) => token === bTokens[i]);
}

function signaturesHavePrefixDrift(a: SuspectedDedupRow, b: SuspectedDedupRow): boolean {
  const aSig = signature(a.rawDescription);
  const bSig = signature(b.rawDescription);
  if (!aSig || !bSig || aSig === bSig) return false;
  return isProperTokenPrefix(aSig, bSig) || isProperTokenPrefix(bSig, aSig);
}

function comparable(a: SuspectedDedupRow, b: SuspectedDedupRow): boolean {
  return !!a.docId
    && !!b.docId
    && a.docId !== b.docId
    && !!a.ownAccountId
    && a.ownAccountId === b.ownAccountId
    && a.date === b.date
    && a.amount === b.amount
    && signaturesHavePrefixDrift(a, b);
}

/**
 * Find weak cross-document duplicates without dropping either row.
 * Existing rows are considered first (oldest/id order), followed by incoming
 * rows in parser order. Only incoming rows can become new candidates.
 */
export function detectSuspectedDuplicates<T extends SuspectedDedupRow>(
  existingRows: T[],
  incomingRows: T[],
): SuspectedDuplicatePair<T>[] {
  const prior = [...existingRows].sort(
    (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id),
  );
  const pairs: SuspectedDuplicatePair<T>[] = [];

  for (const candidate of incomingRows) {
    const keeper = prior.find((row) => comparable(row, candidate));
    if (keeper) {
      pairs.push({
        id: duplicateCandidateId(candidate.id),
        keeper,
        candidate,
        basis: 'signature_token_prefix',
      });
    }
    prior.push(candidate);
  }
  return pairs;
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
