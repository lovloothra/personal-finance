import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { duplicateCandidates } from '@/db/schema';
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

    db.update(duplicateCandidates)
      .set({ status: 'kept', updatedAt: Date.now() })
      .where(eq(duplicateCandidates.id, id))
      .run();
    return json({ ok: true, id, status: 'kept' });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to keep both transactions.', 500);
  }
}
