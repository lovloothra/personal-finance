import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { reviewItems, transactions, userOverrides } from '@/db/schema';
import { signature } from '@/classifier/normalize';
import type { Flow } from '@/classifier/types';
import { json, badRequest, assertSameOrigin } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FLOWS = new Set(['income', 'expense', 'transfer', 'investment']);

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
      flow?: string;
    };
    const sig = body.signature?.trim();
    const merchant = body.merchant?.trim();
    const category = body.category?.trim();
    if (!sig) return badRequest('Provide the description signature to match.');
    if (!merchant) return badRequest('Provide a merchant name.');
    if (!category) return badRequest('Provide a category.');
    const flow = body.flow && FLOWS.has(body.flow) ? (body.flow as Flow) : undefined;
    const subcategory = body.subcategory?.trim() || null;

    const db = await getDb();

    const pending = db
      .select({ id: transactions.id, rawDescription: transactions.rawDescription })
      .from(transactions)
      .where(eq(transactions.reviewRequired, true))
      .all();
    const matchedIds = pending.filter((t) => signature(t.rawDescription ?? '') === sig).map((t) => t.id);
    if (matchedIds.length === 0) return badRequest('No review-pending transactions match that signature.');

    const reason = `User override: assigned "${merchant}" → ${category}${subcategory ? ` / ${subcategory}` : ''}.`;

    // Chunk id lists to stay well under SQLite's bound-parameter limit.
    const chunks: string[][] = [];
    for (let i = 0; i < matchedIds.length; i += 500) chunks.push(matchedIds.slice(i, i + 500));

    db.transaction((tx) => {
      for (const ids of chunks) {
        tx.update(transactions)
          .set({
            merchant,
            category,
            subcategory,
            ...(flow ? { flow } : {}),
            confidence: 'high',
            layer: 1,
            classificationReason: reason,
            profileSignalUsed: 'user.override',
            reviewRequired: false,
            updatedAt: Date.now(),
          })
          .where(inArray(transactions.id, ids))
          .run();

        tx.update(reviewItems)
          .set({ status: 'resolved', updatedAt: Date.now() })
          .where(inArray(reviewItems.refId, ids))
          .run();
      }

      const existing = tx.select({ id: userOverrides.id }).from(userOverrides).where(eq(userOverrides.matchSignature, sig)).get();
      const values = { matchSignature: sig, merchant, category, subcategory, flow: flow ?? null, updatedAt: Date.now() };
      if (existing) {
        tx.update(userOverrides).set(values).where(eq(userOverrides.id, existing.id)).run();
      } else {
        tx.insert(userOverrides).values({ id: `ov_${randomUUID()}`, ...values }).run();
      }
    });

    return json({ ok: true, updated: matchedIds.length });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Assign failed.', 500);
  }
}
