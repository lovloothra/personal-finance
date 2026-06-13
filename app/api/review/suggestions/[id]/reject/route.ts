import { eq } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { classificationPredictions, localModelSuggestions } from '@/db/schema';
import { assertSameOrigin, badRequest, json } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOrigin(req);
    const { id } = await ctx.params;
    const db = await getDb();
    const row = db
      .select({ suggestionId: localModelSuggestions.id, predictionId: localModelSuggestions.predictionId, status: localModelSuggestions.status })
      .from(localModelSuggestions)
      .where(eq(localModelSuggestions.id, id))
      .get();

    if (!row) return badRequest('Suggestion not found.');
    if (row.status !== 'open') return badRequest(`Suggestion is already ${row.status}.`);

    db.transaction((tx) => {
      tx.update(localModelSuggestions)
        .set({ status: 'rejected', updatedAt: Date.now() })
        .where(eq(localModelSuggestions.id, row.suggestionId))
        .run();

      if (row.predictionId) {
        tx.update(classificationPredictions)
          .set({ decision: 'rejected', updatedAt: Date.now() })
          .where(eq(classificationPredictions.id, row.predictionId))
          .run();
      }
    });

    return json({ ok: true, suggestionId: row.suggestionId });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to reject suggestion.', 500);
  }
}
