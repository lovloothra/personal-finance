import { eq } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { classificationPredictions, localModelSuggestions, transactions } from '@/db/schema';
import { LOCAL_ML_LAYER } from '@/intelligence/local-model';
import { recordFeedbackExamples } from '@/intelligence/store';
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
    const row = db
      .select({
        suggestionId: localModelSuggestions.id,
        status: localModelSuggestions.status,
        predictionId: classificationPredictions.id,
        transactionId: transactions.id,
        rawDescription: transactions.rawDescription,
        amount: transactions.amount,
        institutionId: transactions.institutionId,
        merchant: classificationPredictions.predictedMerchant,
        category: classificationPredictions.category,
        subcategory: classificationPredictions.subcategory,
        flow: classificationPredictions.flow,
        confidence: classificationPredictions.confidence,
        reason: classificationPredictions.reason,
      })
      .from(localModelSuggestions)
      .innerJoin(classificationPredictions, eq(localModelSuggestions.predictionId, classificationPredictions.id))
      .innerJoin(transactions, eq(localModelSuggestions.transactionId, transactions.id))
      .where(eq(localModelSuggestions.id, id))
      .get();

    if (!row) return badRequest('Suggestion not found.');
    if (row.status !== 'open') return badRequest(`Suggestion is already ${row.status}.`);

    db.transaction((tx) => {
      tx.update(transactions)
        .set({
          merchant: row.merchant,
          flow: row.flow,
          category: row.category,
          subcategory: row.subcategory,
          confidence: row.confidence,
          classificationReason: row.reason,
          profileSignalUsed: 'local_ml.memory',
          layer: LOCAL_ML_LAYER,
          classificationSource: 'local_ml',
          acceptedPredictionId: row.predictionId,
          reviewRequired: false,
          updatedAt: Date.now(),
        })
        .where(eq(transactions.id, row.transactionId))
        .run();

      tx.update(classificationPredictions)
        .set({ decision: 'accepted', updatedAt: Date.now() })
        .where(eq(classificationPredictions.id, row.predictionId))
        .run();

      tx.update(localModelSuggestions)
        .set({ status: 'accepted', updatedAt: Date.now() })
        .where(eq(localModelSuggestions.id, row.suggestionId))
        .run();
    });

    recordFeedbackExamples(db, [
      {
        transactionId: row.transactionId,
        rawDescription: row.rawDescription ?? '',
        merchant: row.merchant,
        category: row.category,
        subcategory: row.subcategory,
        flow: row.flow,
        amount: row.amount,
        institutionId: row.institutionId,
        source: 'suggestion_accept',
      },
    ]);
    detectSubscriptions(db);
    rebuildClassificationReviewItems(db);

    return json({ ok: true, suggestionId: row.suggestionId, transactionId: row.transactionId });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to accept suggestion.', 500);
  }
}
