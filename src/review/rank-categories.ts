/**
 * Pure ranking for the triage category shortlist. This ranks UI options —
 * it does not decide classification verdicts, so it must stay side-effect
 * free and DB-free (no `server-only` import; safe to import from client
 * components).
 */
import { normalizeCategory } from '@/classifier/taxonomy';
import type { Flow } from '@/classifier/types';

export interface DistributionEntry {
  category: string;
  p: number;
}

export interface RankInput {
  /** The group's deterministically-selected ML suggestion (may be null). */
  suggestedCategory: string | null;
  /**
   * Optional per-category probabilities from the prediction's provenance.
   * May be malformed upstream (wrong shape, non-array, bad entries) — every
   * entry is validated with `isDistributionEntry` before use.
   */
  distribution?: DistributionEntry[] | null;
  /** User-frequency ranking, already computed by the route. */
  topCategories: string[];
  groupFlow: Flow;
}

/** Type guard for a single distribution entry. Exported for reuse by callers
 * (e.g. the route) that need to validate provenance data independently. */
export function isDistributionEntry(x: unknown): x is DistributionEntry {
  if (typeof x !== 'object' || x === null) return false;
  const rec = x as Record<string, unknown>;
  return typeof rec.category === 'string' && typeof rec.p === 'number' && Number.isFinite(rec.p);
}

/**
 * Rank category options for the triage shortlist.
 *
 * Precedence: suggestedCategory (normalized) -> distribution entries by
 * descending probability (ties keep input order; invalid entries or entries
 * naming a category outside the flow's pool are skipped; if `distribution`
 * isn't a well-formed array at all, that source is skipped entirely) ->
 * topCategories in given order -> pool order as filler. Every returned
 * category is a member of the flow's pool; the result is deduped and capped
 * at 5.
 */
export function rankCategories(input: RankInput, categoriesForFlowFn: (f: Flow) => string[]): string[] {
  const pool = categoriesForFlowFn(input.groupFlow);
  const poolSet = new Set(pool);

  const candidates: string[] = [];

  if (input.suggestedCategory) {
    candidates.push(normalizeCategory(input.suggestedCategory));
  }

  if (Array.isArray(input.distribution)) {
    const ranked = input.distribution
      .map((entry, idx) => ({ entry, idx }))
      .filter(({ entry }) => isDistributionEntry(entry))
      .sort((a, b) => (b.entry as DistributionEntry).p - (a.entry as DistributionEntry).p || a.idx - b.idx);
    for (const { entry } of ranked) candidates.push((entry as DistributionEntry).category);
  }

  for (const c of input.topCategories) candidates.push(c);
  for (const c of pool) candidates.push(c);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (!poolSet.has(c) || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
    if (out.length >= 5) break;
  }
  return out;
}
