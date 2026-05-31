/**
 * Layer 3 — Provider / institution rules.
 *
 * Matches descriptions against known institution patterns from the packs
 * (e.g. BESCOM → Utilities/Electricity, a specific bank's interest credit).
 * These are more specific than generic keywords but less personal than profile
 * rules, hence layer 3.
 */
import type { Classification, ClassifyContext, RawTxn, Flow } from './types';
import { LAYER } from './types';
import { clean } from './normalize';

export function classifyByProvider(
  txn: RawTxn,
  ctx: ClassifyContext,
): Classification | null {
  const desc = clean(txn.rawDescription);

  let best: ClassifyContext['providerRules'][number] | null = null;
  let bestLen = 0;
  for (const rule of ctx.providerRules) {
    for (const pat of rule.patterns) {
      if (pat && desc.includes(pat) && pat.length > bestLen) {
        best = rule;
        bestLen = pat.length;
      }
    }
  }
  if (!best) return null;

  const flow: Flow = best.flow ?? (txn.amount > 0 ? 'income' : 'expense');
  return {
    flow,
    category: best.category,
    subcategory: best.subcategory ?? null,
    confidence: 'high',
    reason: `Provider rule: ${best.displayName} (institutions pack) → ${best.category}${best.subcategory ? `/${best.subcategory}` : ''}.`,
    signal: 'pack.institutions',
    layer: LAYER.PROVIDER,
    reviewRequired: false,
  };
}
