/**
 * The classifier pipeline.
 *
 * Runs the seven classification layers in strict priority order and returns the
 * first match. Layer numbering and the reason/signal/confidence shape map 1:1
 * to the ProvenanceDrawer in the UI:
 *
 *   1. User overrides     — exact rules the user set
 *   2. Profile rules      — salary, EMI, rent, house-help, insurance, SIP, CC pay
 *   3. Provider rules     — bank / institution patterns from packs
 *   4. Merchant aliases   — pack + user merchant aliases
 *   5. Keyword rules      — generic descriptors (low confidence)
 *   6. Recurrence         — subscription cadence detection
 *   7. Fallback           — uncategorised → review queue
 *
 * After a verdict is chosen, two post-classification refinements may re-stamp
 * it for display, mirroring the design fixtures:
 *   8. transfer dedupe    — handled inline at layer 2 (cc_payment) today
 *   9. project isolation  — one-time projects pulled out of recurring rollups
 *
 * Pure and deterministic: pass everything via ClassifyContext.
 */
import type { Classification, ClassifyContext, RawTxn } from './types';
import { LAYER } from './types';
import { clean, containsAny, signature } from './normalize';
import { classifyByProfile } from './profile-rules';
import { classifyByProvider } from './provider-rules';
import { classifyByMerchantAlias } from './merchant-aliases';
import { classifyByKeyword } from './keyword-rules';
import { classifyByRecurrence } from './recurrence';

/** Layer 1 — exact user overrides keyed by normalized description signature. */
function classifyByOverride(txn: RawTxn, ctx: ClassifyContext): Classification | null {
  const sig = signature(txn.rawDescription);
  const ov = ctx.overrides.find((o) => o.matchSignature === sig);
  if (!ov) return null;
  return {
    flow: ov.flow ?? (txn.amount > 0 ? 'income' : 'expense'),
    category: ov.category ?? 'Uncategorised',
    subcategory: ov.subcategory ?? null,
    confidence: 'high',
    reason: `User override: you set this rule${ov.note ? ` — ${ov.note}` : ''}. Always wins over automatic classification.`,
    signal: 'user.override',
    layer: LAYER.USER_OVERRIDE,
    reviewRequired: false,
    taxSection: ov.taxSection ?? null,
  };
}

/** Layer 7 — fallback to the review queue. */
function fallback(txn: RawTxn): Classification {
  return {
    flow: txn.amount > 0 ? 'income' : 'expense',
    category: 'Uncategorised',
    subcategory: null,
    confidence: 'low',
    reason:
      'Fallback: no override, profile, provider, alias, keyword, or recurrence match. Raw descriptor only. Sent to review queue.',
    signal: null,
    layer: LAYER.FALLBACK,
    reviewRequired: true,
  };
}

/**
 * Step 9 — one-time project isolation. If the txn date falls within a declared
 * project window and the verdict's category/merchant matches the project hints,
 * re-stamp it as a project expense so it is excluded from recurring-lifestyle
 * rollups.
 */
function applyProjectIsolation(
  txn: RawTxn,
  verdict: Classification,
  ctx: ClassifyContext,
): Classification {
  if (verdict.flow !== 'expense') return verdict;
  const desc = clean(txn.rawDescription);
  for (const proj of ctx.profile.projects ?? []) {
    const inWindow = txn.date >= proj.startDate && txn.date <= proj.endDate;
    if (!inWindow) continue;
    const hints = proj.categoryHints ?? [];
    const hintHit =
      hints.length === 0 ||
      containsAny(desc, hints) ||
      hints.some((h) => verdict.category.toLowerCase().includes(h.toLowerCase()));
    if (!hintHit) continue;
    return {
      ...verdict,
      reason: `One-time project: matches "${proj.name}" window (${proj.startDate} → ${proj.endDate}). Isolated from recurring-lifestyle rollups.`,
      signal: 'project.one_time',
      layer: LAYER.PROJECT_ISOLATION,
      projectId: proj.id,
      isRecurring: false,
    };
  }
  return verdict;
}

/** Classify a single transaction through all layers + refinements. */
export function classify(txn: RawTxn, ctx: ClassifyContext): Classification {
  const verdict =
    classifyByOverride(txn, ctx) ??
    classifyByProfile(txn, ctx) ??
    classifyByProvider(txn, ctx) ??
    classifyByMerchantAlias(txn, ctx) ??
    classifyByKeyword(txn, ctx) ??
    classifyByRecurrence(txn, ctx) ??
    fallback(txn);

  return applyProjectIsolation(txn, verdict, ctx);
}

/** Classify a batch, preserving input order. */
export function classifyBatch(txns: RawTxn[], ctx: ClassifyContext): Classification[] {
  return txns.map((t) => classify(t, ctx));
}
