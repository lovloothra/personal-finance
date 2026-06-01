/**
 * Layer 4 — Merchant aliases (packs + user).
 *
 * Matches the longest alias pattern that appears in the description. Longest
 * match wins so "uber eats" beats "uber" when both are present. Category and
 * subcategory come from the pack's dotted taxonomy (e.g. expenses.transport →
 * cabs). The flow is inferred from the txn sign unless the alias forces one.
 */
import type { Classification, ClassifyContext, RawTxn, Flow } from './types';
import { LAYER } from './types';
import { clean } from './normalize';

/** Domain prefixes in the pack taxonomy that aren't useful as display categories. */
const TAXONOMY_DOMAINS = new Set(['expenses', 'subscriptions', 'income', 'transfer', 'investment']);

function titleCase(s: string): string {
  return s
    .replace(/[._-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Turn a dotted pack taxonomy ("expenses.transport", "expenses.quick_commerce")
 * into a human display category. Drops the generic domain prefix and title-cases
 * the most specific meaningful segment, falling back to the subcategory.
 */
function displayCategory(taxonomy: string | null, subcategory: string | null): string {
  const segments = (taxonomy ?? '').split('.').filter((s) => s && !TAXONOMY_DOMAINS.has(s));
  const pick = segments[0] ?? subcategory ?? taxonomy ?? 'Uncategorised';
  return titleCase(pick);
}

export function classifyByMerchantAlias(
  txn: RawTxn,
  ctx: ClassifyContext,
): Classification | null {
  const desc = clean(txn.rawDescription);

  let best: ClassifyContext['merchantAliases'][number] | null = null;
  for (const alias of ctx.merchantAliases) {
    if (alias.pattern && desc.includes(alias.pattern)) {
      if (!best || alias.pattern.length > best.pattern.length) best = alias;
    }
  }
  if (!best) return null;

  const flow: Flow = txn.amount > 0 ? 'income' : 'expense';
  const category = displayCategory(best.category, best.subcategory);

  return {
    flow,
    category,
    subcategory: best.subcategory,
    merchant: best.canonicalMerchant,
    confidence: best.confidence,
    reason: `Merchant alias: "${txn.rawDescription.trim()}" → ${best.canonicalMerchant} (${best.source === 'user' ? 'your alias' : 'pack'}). Category ${category} from pack default.`,
    signal:
      best.source === 'user'
        ? 'user.merchant_alias'
        : `pack.merchants.${best.subcategory ?? best.category ?? 'merchant'}`,
    layer: LAYER.MERCHANT_ALIAS,
    reviewRequired: false,
  };
}
