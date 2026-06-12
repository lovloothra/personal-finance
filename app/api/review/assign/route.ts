import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { reviewItems, transactions, userOverrides } from '@/db/schema';
import { signature } from '@/classifier/normalize';
import type { Flow } from '@/classifier/types';
import { json, badRequest, assertSameOrigin } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Flow follows from the category and the sign of each transaction — credits are
 * income, Transfer is a transfer, Investment debits are contributions. Users
 * never pick a flow by hand, so a debit can't be mislabelled income.
 */
function flowFor(category: string, amount: number): Flow {
  if (category === 'Transfer') return 'transfer';
  if (amount > 0) return 'income';
  if (category === 'Investment') return 'investment';
  return 'expense';
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
      .select({ id: transactions.id, rawDescription: transactions.rawDescription, amount: transactions.amount })
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
              confidence: 'high',
              layer: 1,
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
      const values = { matchSignature: sig, merchant, category, subcategory, flow: category === 'Transfer' ? ('transfer' as Flow) : null, updatedAt: Date.now() };
      if (existing) {
        tx.update(userOverrides).set(values).where(eq(userOverrides.id, existing.id)).run();
      } else {
        tx.insert(userOverrides).values({ id: `ov_${randomUUID()}`, ...values }).run();
      }
    });

    return json({ ok: true, updated: matched.length });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Assign failed.', 500);
  }
}
