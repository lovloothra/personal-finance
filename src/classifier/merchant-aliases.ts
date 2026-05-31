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
  const human = best.category ? best.category.split('.').slice(1).join(' / ') || best.category : 'Uncategorised';

  return {
    flow,
    category: best.category ?? 'Uncategorised',
    subcategory: best.subcategory,
    confidence: best.confidence,
    reason: `Merchant alias: "${txn.rawDescription.trim()}" → ${best.canonicalMerchant} (${best.source === 'user' ? 'your alias' : 'pack'}). Category ${human} from pack default.`,
    signal:
      best.source === 'user'
        ? 'user.merchant_alias'
        : `pack.merchants.${best.subcategory ?? best.category ?? 'merchant'}`,
    layer: LAYER.MERCHANT_ALIAS,
    reviewRequired: false,
  };
}
