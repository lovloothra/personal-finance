import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { duplicateCandidates, transactions } from '@/db/schema';
import { detachTransactionChildren } from '@/ingest/clear-output';
import { rebuildClassificationReviewItems } from '@/ingest/review-items';
import { detectSubscriptions } from '@/ledger/subscriptions';
import { assertSameOrigin, badRequest, json } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOrigin(req);
    const { id } = await ctx.params;
    const db = await getDb();
    const row = db.select().from(duplicateCandidates).where(eq(duplicateCandidates.id, id)).get();
    if (!row) return badRequest('Duplicate candidate not found.', 404);
    if (row.status !== 'open') return badRequest(`Duplicate candidate is already ${row.status}.`);
    const candidate = db.select({ id: transactions.id }).from(transactions)
      .where(eq(transactions.id, row.candidateTransactionId)).get();
    if (!candidate) return badRequest('Candidate transaction no longer exists.', 409);

    db.transaction((tx) => {
      detachTransactionChildren(tx, [candidate.id]);
      tx.delete(transactions).where(eq(transactions.id, candidate.id)).run();
      tx.update(duplicateCandidates)
        .set({ status: 'removed', updatedAt: Date.now() })
        .where(eq(duplicateCandidates.id, id))
        .run();
    });

    // Rebuild projections only after the deletion commits.
    rebuildClassificationReviewItems(db);
    detectSubscriptions(db);
    return json({ ok: true, id, status: 'removed', removedTransactionId: candidate.id });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to remove duplicate transaction.', 500);
  }
}
