import { randomUUID } from 'node:crypto';
import { desc, eq, inArray, notInArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { classificationFeedback, localModelExamples, reviewItems, transactions, userOverrides, merchantAliases, reviewUndoJournal } from '@/db/schema';
import { signature } from '@/classifier/normalize';
import { detectSubscriptions } from '@/ledger/subscriptions';
import { rebuildClassificationReviewItems } from '@/ingest/review-items';
import type { Flow } from '@/classifier/types';
import { json, badRequest, assertSameOrigin } from '@/server/api';
import { prepareFeedbackExamples, writeFeedbackExamples, exampleIdFor, feedbackIdFor } from '@/intelligence/store';
import { TAXONOMY, normalizeCategory } from '@/classifier/taxonomy';
import type { RowSnapshot, TxnPrior, UndoSnapshot, OverridePrior, AliasPrior, FeedbackPrior, ExamplePrior } from '@/review/undo-journal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Journal rows kept undoable-or-not before pruning; only the newest matters
 * for undo, the rest are short-lived forensic context. */
const JOURNAL_KEEP = 20;

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

/** The transaction columns the journal snapshots — exactly what this route mutates. */
function txnPriorOf(t: typeof transactions.$inferSelect): TxnPrior {
  return {
    id: t.id,
    merchant: t.merchant,
    category: t.category,
    subcategory: t.subcategory,
    flow: t.flow,
    isInternalTransfer: t.isInternalTransfer,
    suspectedTransfer: t.suspectedTransfer,
    confidence: t.confidence,
    layer: t.layer,
    classificationSource: t.classificationSource,
    acceptedPredictionId: t.acceptedPredictionId,
    classificationReason: t.classificationReason,
    profileSignalUsed: t.profileSignalUsed,
    reviewRequired: t.reviewRequired,
    updatedAt: t.updatedAt,
  };
}

/**
 * Assign a merchant + category to every review-pending transaction whose
 * normalized description matches the given signature, atomically:
 *
 * 1. Identify every affected row (matched txns, alias-swept txns, the
 *    override/alias/feedback/example rows the write will upsert).
 * 2. Do all async work (embedding generation) BEFORE any mutation.
 * 3. Capture prior state into an undo journal snapshot.
 * 4. One DB transaction: journal insert + txn updates + override upsert +
 *    feedback/example upserts + alias upsert/sweep + classifier-head stale.
 * 5. Rebuild the derived projections (subscriptions, review items) AFTER
 *    commit — if that fails the response still carries the committed opId
 *    with projectionSynced: false, never a generic error that would invite
 *    repeating the already-committed assignment.
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
    // Merchant is optional: transfers, P2P payments, and bank charges have no
    // merchant, and forcing one poisons overrides + ML training data.
    const merchant = body.merchant?.trim() ?? '';
    let category = body.category?.trim();
    if (!sig) return badRequest('Provide the description signature to match.');
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

    // ---- 1. Identify affected rows (reads only) ---------------------------
    const pending = db.select().from(transactions).where(eq(transactions.reviewRequired, true)).all();
    const matched = pending.filter((t) => signature(t.rawDescription ?? '') === sig);
    if (matched.length === 0) return badRequest('No review-pending transactions match that signature.');

    // Normalize once; flowFor still receives the original `category` so legacy
    // strings like 'Transfer' and 'Income' are handled by its fallback rules.
    const canonicalCategory = normalizeCategory(category);

    const reason = merchant
      ? `User override: assigned "${merchant}" → ${category}${subcategory ? ` / ${subcategory}` : ''}.`
      : `User override: assigned ${category}${subcategory ? ` / ${subcategory}` : ''}.`;

    // Teach-from-assignment: if the merchant name appears in every matched
    // descriptor, a reusable user merchant alias sweeps the rest of the review
    // queue. Skipped for Transfer (substring rules there are too blunt).
    let aliasToken: string | null = null;
    if (category !== 'Transfer' && flowFor(category, -1) !== 'transfer') {
      aliasToken = deriveAliasToken(merchant, matched.map((t) => t.rawDescription ?? ''));
    }
    const matchedSet = new Set(matched.map((t) => t.id));
    const others = aliasToken
      ? pending.filter((t) => !matchedSet.has(t.id) && (t.rawDescription ?? '').toLowerCase().includes(aliasToken))
      : [];

    // ---- 2. Async work before any mutation --------------------------------
    // Feedback/examples are recorded for the matched group only (the alias
    // sweep is a rule application, not a human label) — unchanged behavior.
    const prepared = await prepareFeedbackExamples(
      matched.map((t) => ({
        transactionId: t.id,
        rawDescription: t.rawDescription ?? '',
        merchant,
        category,
        subcategory,
        flow: flowFor(category, t.amount),
        amount: t.amount,
        institutionId: t.institutionId,
        source: 'review_assignment' as const,
      })),
    );

    // ---- 3. Capture prior state -------------------------------------------
    const existingOverride = db.select().from(userOverrides).where(eq(userOverrides.matchSignature, sig)).get();
    const overrideId = existingOverride?.id ?? `ov_${randomUUID()}`;
    const overrideSnap: RowSnapshot<OverridePrior> = existingOverride
      ? { id: existingOverride.id, existed: true, prior: existingOverride }
      : { id: overrideId, existed: false };

    const aliasId = aliasToken ? `ua_${aliasToken}` : null;
    const existingAlias = aliasId
      ? db.select().from(merchantAliases).where(eq(merchantAliases.id, aliasId)).get()
      : undefined;
    const aliasSnap: RowSnapshot<AliasPrior> | null = aliasId
      ? existingAlias
        ? { id: aliasId, existed: true, prior: existingAlias }
        : { id: aliasId, existed: false }
      : null;

    const feedbackIds = matched.map((t) => feedbackIdFor(t.id, 'review_assignment'));
    const exampleIds = matched.map((t) => exampleIdFor(t.id, 'review_assignment'));
    const existingFeedback = new Map(
      db.select().from(classificationFeedback).where(inArray(classificationFeedback.id, feedbackIds)).all().map((r) => [r.id, r]),
    );
    const existingExamples = new Map(
      db.select().from(localModelExamples).where(inArray(localModelExamples.id, exampleIds)).all().map((r) => [r.id, r]),
    );
    const feedbackSnaps: RowSnapshot<FeedbackPrior>[] = feedbackIds.map((id) => {
      const prior = existingFeedback.get(id);
      return prior ? { id, existed: true, prior } : { id, existed: false };
    });
    const exampleSnaps: RowSnapshot<ExamplePrior>[] = exampleIds.map((id) => {
      const prior = existingExamples.get(id);
      return prior ? { id, existed: true, prior } : { id, existed: false };
    });

    const snapshot: UndoSnapshot = {
      signature: sig,
      override: overrideSnap,
      alias: aliasSnap,
      feedback: feedbackSnaps,
      examples: exampleSnaps,
      txns: [...matched, ...others].map(txnPriorOf),
    };
    // Timestamp-prefixed so id ordering is chronological even when two
    // assigns land in the same millisecond (createdAt's default is only
    // second-precision; we also set it explicitly in ms below).
    const opId = `undo_${Date.now()}_${randomUUID()}`;

    // ---- 4. One atomic transaction ----------------------------------------
    db.transaction((tx) => {
      tx.insert(reviewUndoJournal).values({ id: opId, payload: snapshot, createdAt: Date.now() }).run();

      const applyTo = (slice: typeof matched, layer: number, reasonText: string) => {
        for (let i = 0; i < slice.length; i += 500) {
          const chunk = slice.slice(i, i + 500);
          // Flow depends on each txn's sign, so update debit/credit groups separately.
          for (const flow of ['income', 'expense', 'transfer', 'investment'] as Flow[]) {
            const ids = chunk.filter((t) => flowFor(category!, t.amount) === flow).map((t) => t.id);
            if (ids.length === 0) continue;
            tx.update(transactions)
              .set({
                merchant: merchant || null,
                category: canonicalCategory,
                subcategory,
                flow,
                isInternalTransfer: flow === 'transfer',
                suspectedTransfer: false,
                confidence: 'high',
                layer,
                classificationSource: 'deterministic',
                acceptedPredictionId: null,
                classificationReason: reasonText,
                profileSignalUsed: layer === 1 ? 'user.override' : 'user.merchant_alias',
                reviewRequired: false,
                updatedAt: Date.now(),
              })
              .where(inArray(transactions.id, ids))
              .run();
          }
          tx.update(reviewItems)
            .set({ status: 'resolved', updatedAt: Date.now() })
            .where(inArray(reviewItems.refId, chunk.map((t) => t.id)))
            .run();
        }
      };

      applyTo(matched, 1, reason);

      // Flow is left null on the override so reclassification derives it from
      // each transaction's sign — except Transfer, which is sign-agnostic.
      const overrideFlow: Flow | null = flowForCanonical(category!.toLowerCase().replace(/ /g, '_')) === 'transfer' || category === 'Transfer'
        ? 'transfer'
        : null;
      const values = { matchSignature: sig, merchant: merchant || null, category: canonicalCategory, subcategory, flow: overrideFlow, updatedAt: Date.now() };
      if (existingOverride) {
        tx.update(userOverrides).set(values).where(eq(userOverrides.id, existingOverride.id)).run();
      } else {
        tx.insert(userOverrides).values({ id: overrideId, ...values }).run();
      }

      writeFeedbackExamples(tx, prepared);

      if (aliasToken && aliasId) {
        // Persist the alias as a user row (layer-4 source) so re-ingests reuse it.
        const aliasVals = { pattern: aliasToken, canonicalMerchant: merchant, category: canonicalCategory, subcategory, source: 'user' as const, confidence: 'high' as const, updatedAt: Date.now() };
        if (existingAlias) tx.update(merchantAliases).set(aliasVals).where(eq(merchantAliases.id, aliasId)).run();
        else tx.insert(merchantAliases).values({ id: aliasId, ...aliasVals }).run();

        applyTo(others, 4, `${reason} (matched your "${aliasToken}" rule)`);
      }

      // Prune: keep the newest JOURNAL_KEEP rows (consumed or not).
      const keep = tx
        .select({ id: reviewUndoJournal.id })
        .from(reviewUndoJournal)
        .orderBy(desc(reviewUndoJournal.createdAt), desc(reviewUndoJournal.id))
        .limit(JOURNAL_KEEP)
        .all()
        .map((r) => r.id);
      tx.delete(reviewUndoJournal).where(notInArray(reviewUndoJournal.id, keep)).run();
    });

    // ---- 5. Projections after commit --------------------------------------
    let projectionSynced = true;
    let warning: string | undefined;
    try {
      detectSubscriptions(db);
      rebuildClassificationReviewItems(db);
    } catch (err) {
      projectionSynced = false;
      warning = `Assignment saved, but refreshing derived views failed: ${err instanceof Error ? err.message : String(err)}. They'll self-heal on the next assign or reclassify.`;
    }

    return json({
      ok: true,
      updated: matched.length,
      aliasToken,
      aliasApplied: others.length,
      opId,
      projectionSynced,
      ...(warning ? { warning } : {}),
    });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Assign failed.', 500);
  }
}
