/**
 * Build the classifier context from the encrypted DB + the profile seed.
 *
 * Assembles everything the deterministic classifier needs except the recurrence
 * index (which is computed per-run over the batch being ingested):
 *   - user overrides   → user_overrides table
 *   - profile signals  → profile seed (employer/rent/EMI/broker/insurer/projects)
 *   - merchant aliases → merchant_aliases table (packs + user)
 *   - keyword rules    → built-in India defaults
 */
import 'server-only';
import type { DB } from '@/db/client';
import { merchantAliases, userOverrides } from '@/db/schema';
import { DEFAULT_KEYWORD_RULES } from '@/classifier/keyword-rules';
import type { ClassifyContext, MerchantAlias, UserOverride, ProviderRule } from '@/classifier/types';
import { buildClassifierSignals, loadProfileSeed } from '@/profile/signals';

export type BaseContext = Omit<ClassifyContext, 'recurrence'>;

/** Build the static (recurrence-free) classifier context. */
export function buildBaseContext(db: DB): BaseContext {
  const aliases: MerchantAlias[] = db
    .select({
      pattern: merchantAliases.pattern,
      canonicalMerchant: merchantAliases.canonicalMerchant,
      category: merchantAliases.category,
      subcategory: merchantAliases.subcategory,
      source: merchantAliases.source,
      confidence: merchantAliases.confidence,
    })
    .from(merchantAliases)
    .all()
    .map((r) => ({
      pattern: r.pattern,
      canonicalMerchant: r.canonicalMerchant,
      category: r.category,
      subcategory: r.subcategory,
      source: r.source ?? 'pack:in',
      confidence: (r.confidence ?? 'high') as MerchantAlias['confidence'],
    }));

  const overrides: UserOverride[] = db
    .select()
    .from(userOverrides)
    .all()
    .map((r) => ({
      matchSignature: r.matchSignature ?? '',
      flow: (r.flow ?? undefined) as UserOverride['flow'],
      category: r.category ?? undefined,
      subcategory: r.subcategory ?? undefined,
      merchant: r.merchant ?? undefined,
      taxSection: r.taxSection ?? undefined,
      note: r.note ?? undefined,
    }))
    .filter((o) => o.matchSignature);

  // Profile signals come from the seed file (single source of truth). If the
  // user hasn't created one yet, ingest still runs with empty signals.
  let profile: ClassifyContext['profile'] = {};
  try {
    profile = buildClassifierSignals(loadProfileSeed());
  } catch {
    profile = {};
  }

  const providerRules: ProviderRule[] = []; // reserved for layer-3 biller rules

  return {
    overrides,
    profile,
    providerRules,
    merchantAliases: aliases,
    keywordRules: DEFAULT_KEYWORD_RULES,
  };
}
