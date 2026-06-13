import 'server-only';

import { eq } from 'drizzle-orm';

import type { DB } from '@/db/client';
import {
  classificationFeedback,
  classificationPredictions,
  localModelExamples,
  localModelSuggestions,
} from '@/db/schema';
import { signature } from '@/classifier/normalize';
import type { Flow } from '@/classifier/types';
import {
  LOCAL_MODEL_VERSION,
  amountBucketFor,
  directionForAmount,
  makeLocalModelExample,
  merchantTokensFrom,
  type ClassificationDecision,
  type FeedbackSource,
  type LocalModelExample,
} from './local-model';

export interface FeedbackRecordInput {
  transactionId: string;
  rawDescription: string;
  merchant: string;
  category: string;
  subcategory: string | null;
  flow: Flow;
  amount: number;
  institutionId?: string | null;
  source: FeedbackSource;
  reviewedAt?: number;
}

export function loadLocalModelExamples(db: DB): LocalModelExample[] {
  return db
    .select({
      id: localModelExamples.id,
      feedbackId: localModelExamples.feedbackId,
      transactionId: localModelExamples.transactionId,
      signature: localModelExamples.signature,
      rawDescription: localModelExamples.rawDescription,
      merchant: localModelExamples.merchant,
      merchantTokens: localModelExamples.merchantTokens,
      category: localModelExamples.category,
      subcategory: localModelExamples.subcategory,
      flow: localModelExamples.flow,
      amount: localModelExamples.amount,
      amountBucket: localModelExamples.amountBucket,
      direction: localModelExamples.direction,
      institutionId: localModelExamples.institutionId,
      reviewedAt: localModelExamples.reviewedAt,
      source: localModelExamples.source,
    })
    .from(localModelExamples)
    .all()
    .map((row) => ({
      id: row.id,
      feedbackId: row.feedbackId ?? '',
      transactionId: row.transactionId,
      signature: row.signature,
      rawDescription: row.rawDescription,
      merchant: row.merchant,
      merchantTokens: row.merchantTokens ?? [],
      category: row.category,
      subcategory: row.subcategory,
      flow: row.flow,
      amount: row.amount,
      amountBucket: row.amountBucket,
      direction: row.direction,
      institutionId: row.institutionId,
      reviewedAt: row.reviewedAt,
      source: row.source,
    }));
}

export function recordFeedbackExamples(db: DB, records: FeedbackRecordInput[]): number {
  if (records.length === 0) return 0;
  const reviewedAt = Date.now();
  db.transaction((tx) => {
    for (const record of records) {
      const time = record.reviewedAt ?? reviewedAt;
      const feedbackId = feedbackIdFor(record.transactionId, record.source);
      const exampleId = exampleIdFor(record.transactionId, record.source);
      const matchSignature = signature(record.rawDescription);
      const example = makeLocalModelExample({
        id: exampleId,
        feedbackId,
        transactionId: record.transactionId,
        rawDescription: record.rawDescription,
        merchant: record.merchant,
        category: record.category,
        subcategory: record.subcategory,
        flow: record.flow,
        amount: record.amount,
        institutionId: record.institutionId ?? null,
        reviewedAt: time,
        source: record.source,
      });

      tx.insert(classificationFeedback)
        .values({
          id: feedbackId,
          transactionId: record.transactionId,
          matchSignature,
          rawDescription: record.rawDescription,
          merchant: record.merchant,
          category: record.category,
          subcategory: record.subcategory,
          flow: record.flow,
          amount: record.amount,
          institutionId: record.institutionId ?? null,
          source: record.source,
          reviewedAt: time,
        })
        .onConflictDoUpdate({
          target: classificationFeedback.id,
          set: {
            matchSignature,
            rawDescription: record.rawDescription,
            merchant: record.merchant,
            category: record.category,
            subcategory: record.subcategory,
            flow: record.flow,
            amount: record.amount,
            institutionId: record.institutionId ?? null,
            source: record.source,
            reviewedAt: time,
          },
        })
        .run();

      tx.insert(localModelExamples)
        .values({
          id: example.id,
          feedbackId: example.feedbackId,
          transactionId: example.transactionId,
          signature: example.signature,
          rawDescription: example.rawDescription,
          merchant: example.merchant,
          merchantTokens: example.merchantTokens,
          category: example.category,
          subcategory: example.subcategory,
          flow: example.flow,
          amount: example.amount,
          amountBucket: example.amountBucket,
          direction: example.direction,
          institutionId: example.institutionId,
          source: example.source,
          reviewedAt: example.reviewedAt,
        })
        .onConflictDoUpdate({
          target: localModelExamples.id,
          set: {
            signature: example.signature,
            rawDescription: example.rawDescription,
            merchant: example.merchant,
            merchantTokens: example.merchantTokens,
            category: example.category,
            subcategory: example.subcategory,
            flow: example.flow,
            amount: example.amount,
            amountBucket: example.amountBucket,
            direction: example.direction,
            institutionId: example.institutionId,
            source: example.source,
            reviewedAt: example.reviewedAt,
          },
        })
        .run();
    }
  });
  return records.length;
}

export function recordLocalDecision(db: DB, transactionId: string, decision: ClassificationDecision): string | null {
  const prediction = decision.localPrediction;
  if (!prediction) return null;

  const predictionId = predictionIdFor(transactionId, prediction.modelVersion);
  const suggestionId = suggestionIdFor(transactionId, prediction.modelVersion);
  const predictionDecision =
    decision.source === 'local_ml'
      ? 'accepted'
      : decision.reviewStatus === 'suggested'
        ? 'suggested'
        : prediction.confidence === 'low'
          ? 'stored'
          : 'suggested';

  db.transaction((tx) => {
    tx.insert(classificationPredictions)
      .values({
        id: predictionId,
        transactionId,
        modelVersion: prediction.modelVersion,
        predictedMerchant: prediction.merchant,
        category: prediction.category,
        subcategory: prediction.subcategory,
        flow: prediction.flow,
        confidenceScore: prediction.confidenceScore,
        confidence: prediction.confidence,
        reason: prediction.reason,
        provenance: prediction.provenance,
        evidenceIds: prediction.evidenceIds,
        decision: predictionDecision,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: classificationPredictions.id,
        set: {
          predictedMerchant: prediction.merchant,
          category: prediction.category,
          subcategory: prediction.subcategory,
          flow: prediction.flow,
          confidenceScore: prediction.confidenceScore,
          confidence: prediction.confidence,
          reason: prediction.reason,
          provenance: prediction.provenance,
          evidenceIds: prediction.evidenceIds,
          decision: predictionDecision,
          updatedAt: Date.now(),
        },
      })
      .run();

    if (decision.reviewStatus === 'suggested') {
      tx.insert(localModelSuggestions)
        .values({
          id: suggestionId,
          predictionId,
          transactionId,
          status: 'open',
          updatedAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: localModelSuggestions.id,
          set: {
            predictionId,
            transactionId,
            status: 'open',
            updatedAt: Date.now(),
          },
        })
        .run();
    }
  });

  return predictionId;
}

export function predictionIdFor(transactionId: string, modelVersion = LOCAL_MODEL_VERSION): string {
  return `pred_${transactionId}_${modelVersion}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

export function suggestionIdFor(transactionId: string, modelVersion = LOCAL_MODEL_VERSION): string {
  return `sug_${transactionId}_${modelVersion}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

export function feedbackIdFor(transactionId: string, source: FeedbackSource): string {
  return `fb_${source}_${transactionId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

export function exampleIdFor(transactionId: string, source: FeedbackSource): string {
  return `ex_${source}_${transactionId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

export function localExampleValuesFor(record: FeedbackRecordInput): LocalModelExample {
  return makeLocalModelExample({
    id: exampleIdFor(record.transactionId, record.source),
    feedbackId: feedbackIdFor(record.transactionId, record.source),
    transactionId: record.transactionId,
    rawDescription: record.rawDescription,
    merchant: record.merchant,
    category: record.category,
    subcategory: record.subcategory,
    flow: record.flow,
    amount: record.amount,
    institutionId: record.institutionId ?? null,
    reviewedAt: record.reviewedAt ?? Date.now(),
    source: record.source,
  });
}

export function derivedLocalExampleParts(rawDescription: string, amount: number): {
  signature: string;
  merchantTokens: string[];
  amountBucket: string;
  direction: 'credit' | 'debit';
} {
  return {
    signature: signature(rawDescription),
    merchantTokens: merchantTokensFrom(rawDescription),
    amountBucket: amountBucketFor(amount),
    direction: directionForAmount(amount),
  };
}

export function markSuggestionRejected(db: DB, suggestionId: string): void {
  db.update(localModelSuggestions)
    .set({ status: 'rejected', updatedAt: Date.now() })
    .where(eq(localModelSuggestions.id, suggestionId))
    .run();
}
