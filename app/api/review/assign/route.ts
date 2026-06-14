import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { reviewItems, transactions, userOverrides, merchantAliases } from '@/db/schema';
import { signature } from '@/classifier/normalize';
import { detectSubscriptions } from '@/ledger/subscriptions';
import { rebuildClassificationReviewItems } from '@/ingest/review-items';
import type { Flow } from '@/classifier/types';
import { json, badRequest, assertSameOrigin } from '@/server/api';
import { recordFeedbackExamples } from '@/intelligence/store';
import { TAXONOMY } from '@/classifier/taxonomy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Derive flow from a canonical taxonomy category key (e.g. 'salary', 'travel',
 * 'self_transfer'). Returns undefined when the key is not in the taxonomy so
 * the caller can fall back to legacy logic.
 */
function flowForCanonical(category: string): Flow | undefined {
  for (const [flow, cats] of Object.entries(TAXONOMY)) {
    if ((cats as string[]).includes(category)) return flow as Flow;
  }
  return undefined;
}

/**
 * Flow follows from the category and the sign of each transaction — credits are
 * income, Transfer is a transfer, Investment debits are contributions. Users
 * never pick a flow by hand, so a debit can't be mislabelled income.
 *
 * Canonical taxonomy keys (e.g. 'salary', 'self_transfer', 'travel') are
 * resolved first; legacy strings ('Transfer', 'Investment') fall through to the
 * original rules for backward compatibility.
 */
function flowFor(category: string, amount: number): Flow {
  // Canonical taxonomy lookup — handles both new canonical keys and legacy
  // strings that happen to appear verbatim in the taxonomy (e.g. 'investment').
  const canonical = flowForCanonical(category.toLowerCase().replace(/ /g, '_'));
  if (canonical !== undefined) return canonical;

  // Legacy fallback — keeps backward compat for 'Transfer', 'Investment', etc.
  if (category === 'Transfer') return 'transfer';
  if (amount > 0) return 'income';
  if (category === 'Investment') return 'investment';
  return 'expense';
}

// Generic tokens that must never become a merchant-matching pattern.
const TOKEN_STOPWORDS = new Set([
  'payment', 'bank', 'limited', 'limite', 'india', 'private', 'services', 'technologies',
  'upi', 'imps', 'neft', 'rtgs', 'ach', 'nach', 'the', 'and', 'ltd', 'pvt', 'new', 'delhi',
  'mumbai', 'bangalore', 'bengaluru', 'gurgaon', 'transaction', 'card', 'credit', 'debit',
]);

/**
 * Derive a reusable alias pattern from the assigned merchant name: the longest
 * (≥4 char) word of the name that literally appears in EVERY matched raw
 * descriptor. Returning null (name not present in the text) means we only set
 * the per-signature override — never a risky substring rule.
 */
function deriveAliasToken(merchant: string, rawDescriptions: string[]): string | null {
  const lowered = rawDescriptions.map((r) => r.toLowerCase());
  if (!lowered.length) return null;
  const words = [...new Set(merchant.toLowerCase().split(/[^a-z0-9]+/))]
    .filter((w) => w.length >= 4 && !TOKEN_STOPWORDS.has(w))
    .sort((a, b) => b.length - a.length);
  for (const w of words) if (lowered.every((r) => r.includes(w))) return w;
  return null;
}

/**
 * Assign a merchant + category to every review-pending transaction whose
 * normalized description matches the given signature. Persists the choice as a
 * user override (classifier layer 1), so future ingests classify it the same
 * way, then resolves the matching review-queue items.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const body = (await req.json()) as {
      signature?: string;
      merchant?: string;
      category?: string;
      subcategory?: string | null;
    };
    const sig = body.signature?.trim();
    const merchant = body.merchant?.trim();
    let category = body.category?.trim();
    if (!sig) return badRequest('Provide the description signature to match.');
    if (!merchant) return badRequest('Provide a merchant name.');
    if (!category) return badRequest('Provide a category.');
    let subcategory = body.subcategory?.trim() || null;

    // "Credit card payment" is the friendly face of a Transfer: the card's own
    // statement already carries every expense, so the bill payment must never
    // count as spending. Stored canonically so rollups and dedupe see Transfer.
    if (category.toLowerCase() === 'credit card payment') {
      category = 'Transfer';
      subcategory = 'Credit card payment';
    }

    const db = await getDb();

  const pending = db
      .select({ id: transactions.id, rawDescription: transactions.rawDescription, amount: transactions.amount, institutionId: transactions.institutionId })
      .from(transactions)
      .where(eq(transactions.reviewRequired, true))
      .all();
    const matched = pending.filter((t) => signature(t.rawDescription ?? '') === sig);
    if (matched.length === 0) return badRequest('No review-pending transactions match that signature.');

    const reason = `User override: assigned "${merchant}" → ${category}${subcategory ? ` / ${subcategory}` : ''}.`;

    db.transaction((tx) => {
      // Chunk id lists to stay well under SQLite's bound-parameter limit.
      for (let i = 0; i < matched.length; i += 500) {
        const slice = matched.slice(i, i + 500);
        // Flow depends on each txn's sign, so update debit/credit groups separately.
        for (const flow of ['income', 'expense', 'transfer', 'investment'] as Flow[]) {
          const ids = slice.filter((t) => flowFor(category, t.amount) === flow).map((t) => t.id);
          if (ids.length === 0) continue;
          tx.update(transactions)
            .set({
              merchant,
              category,
              subcategory,
              flow,
              isInternalTransfer: flow === 'transfer',
              suspectedTransfer: false,
              confidence: 'high',
                layer: 1,
                classificationSource: 'deterministic',
                acceptedPredictionId: null,
                classificationReason: reason,
              profileSignalUsed: 'user.override',
              reviewRequired: false,
              updatedAt: Date.now(),
            })
            .where(inArray(transactions.id, ids))
            .run();
        }
        tx.update(reviewItems)
          .set({ status: 'resolved', updatedAt: Date.now() })
          .where(inArray(reviewItems.refId, slice.map((t) => t.id)))
          .run();
      }

      // Flow is left null on the override so reclassification derives it from
      // each transaction's sign — except Transfer, which is sign-agnostic.
      const existing = tx.select({ id: userOverrides.id }).from(userOverrides).where(eq(userOverrides.matchSignature, sig)).get();
      const overrideFlow: Flow | null = flowForCanonical(category.toLowerCase().replace(/ /g, '_')) === 'transfer' || category === 'Transfer'
        ? 'transfer'
        : null;
      const values = { matchSignature: sig, merchant, category, subcategory, flow: overrideFlow, updatedAt: Date.now() };
      if (existing) {
        tx.update(userOverrides).set(values).where(eq(userOverrides.id, existing.id)).run();
      } else {
        tx.insert(userOverrides).values({ id: `ov_${randomUUID()}`, ...values }).run();
      }
  });

    await recordFeedbackExamples(
      db,
      matched.map((t) => ({
        transactionId: t.id,
        rawDescription: t.rawDescription ?? '',
        merchant,
        category,
        subcategory,
        flow: flowFor(category, t.amount),
        amount: t.amount,
        institutionId: t.institutionId,
        source: 'review_assignment',
      })),
    );

    // Teach-from-assignment: if the merchant name appears in every matched
    // descriptor, save a reusable user merchant alias and sweep it across the
    // rest of the review queue — one assignment clears every spelling variant
    // and future imports auto-tag. Skipped for Transfer (substring rules there
    // are too blunt for credit-card payments).
    let aliasToken: string | null = null;
    let aliasApplied = 0;
    if (category !== 'Transfer' && flowFor(category, -1) !== 'transfer') {
      aliasToken = deriveAliasToken(merchant, matched.map((t) => t.rawDescription ?? ''));
    }
    if (aliasToken) {
      const matchedSet = new Set(matched.map((t) => t.id));
      const others = db
        .select({ id: transactions.id, amount: transactions.amount, raw: transactions.rawDescription })
        .from(transactions)
        .where(eq(transactions.reviewRequired, true))
        .all()
        .filter((t) => !matchedSet.has(t.id) && (t.raw ?? '').toLowerCase().includes(aliasToken!));

      db.transaction((tx) => {
        // Persist the alias as a user row (layer-4 source) so re-ingests reuse it.
        const aliasId = `ua_${aliasToken}`;
        const aliasVals = { pattern: aliasToken!, canonicalMerchant: merchant, category, subcategory, source: 'user' as const, confidence: 'high' as const, updatedAt: Date.now() };
        const existingAlias = tx.select({ id: merchantAliases.id }).from(merchantAliases).where(eq(merchantAliases.id, aliasId)).get();
        if (existingAlias) tx.update(merchantAliases).set(aliasVals).where(eq(merchantAliases.id, aliasId)).run();
        else tx.insert(merchantAliases).values({ id: aliasId, ...aliasVals }).run();

        for (let i = 0; i < others.length; i += 500) {
          const chunk = others.slice(i, i + 500);
          for (const flow of ['income', 'expense', 'transfer', 'investment'] as Flow[]) {
            const ids = chunk.filter((t) => flowFor(category, t.amount) === flow).map((t) => t.id);
            if (!ids.length) continue;
            tx.update(transactions)
                .set({ merchant, category, subcategory, flow, suspectedTransfer: false, confidence: 'high', layer: 4, classificationSource: 'deterministic', acceptedPredictionId: null, classificationReason: `${reason} (matched your "${aliasToken}" rule)`, profileSignalUsed: 'user.merchant_alias', reviewRequired: false, updatedAt: Date.now() })
              .where(inArray(transactions.id, ids))
              .run();
          }
          tx.update(reviewItems).set({ status: 'resolved', updatedAt: Date.now() }).where(inArray(reviewItems.refId, chunk.map((t) => t.id))).run();
        }
      });
      aliasApplied = others.length;
    }

    // Keep the derived views (subscriptions, review queue) consistent.
    detectSubscriptions(db);
    rebuildClassificationReviewItems(db);

    return json({ ok: true, updated: matched.length, aliasToken, aliasApplied });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Assign failed.', 500);
  }
}
