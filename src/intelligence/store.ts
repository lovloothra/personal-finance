import 'server-only';

import { eq } from 'drizzle-orm';

import { signature } from '@/classifier/normalize';
import type { Flow } from '@/classifier/types';
import type { DB } from '@/db/client';
import {
  classificationFeedback,
  classificationPredictions,
  localClassifierHeads,
  localModelExamples,
  localModelSuggestions,
} from '@/db/schema';

import { trainSoftmaxHead, type LocalClassifierHead } from './classifier-head';
import { getDefaultEmbeddingRuntime, type EmbeddingRuntime } from './embedding-runtime';
import {
  LOCAL_MODEL_VERSION,
  makeLocalModelExample,
  type ClassificationDecision,
  type FeedbackSource,
  type LocalClassifierState,
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

export interface EmbeddingWriteOptions {
  embeddingModelId?: string;
  dimensions?: number;
  now?: () => number;
  embedText?: (text: string) => Promise<number[] | null>;
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
      source: localModelExamples.source,
      reviewedAt: localModelExamples.reviewedAt,
      embedding: localModelExamples.embedding,
      embeddingModelId: localModelExamples.embeddingModelId,
      embeddingUpdatedAt: localModelExamples.embeddingUpdatedAt,
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
      embedding: row.embedding?.length ? row.embedding : null,
      embeddingModelId: row.embeddingModelId,
      embeddingUpdatedAt: row.embeddingUpdatedAt,
    }));
}

/** The object drizzle passes to a `db.transaction((tx) => ...)` callback —
 * same query-builder surface as DB, scoped to the open transaction. */
export type DbTx = Parameters<Parameters<DB['transaction']>[0]>[0];

export interface PreparedFeedbackWrite {
  records: FeedbackRecordInput[];
  examples: LocalModelExample[];
}

/**
 * Embedding half of recordFeedbackExamples, split out so callers that need
 * the writes inside a LARGER transaction (the atomic assign route) can do
 * all async work — model load, embedText — BEFORE opening it. better-sqlite3
 * transactions are synchronous; awaiting inside one is not an option.
 */
export async function prepareFeedbackExamples(
  records: FeedbackRecordInput[],
  options: EmbeddingWriteOptions = {},
): Promise<PreparedFeedbackWrite> {
  const now = options.now ?? Date.now;
  const runtime = await embeddingWriter(options);
  const examples: LocalModelExample[] = [];

  for (const record of records) {
    const reviewedAt = record.reviewedAt ?? now();
    const embedding = await runtime.embedText(textForEmbedding(record));
    const modelId = embedding ? runtime.embeddingModelId : null;
    examples.push(
      localExampleValuesFor({
        ...record,
        reviewedAt,
        embedding,
        embeddingModelId: modelId,
        embeddingUpdatedAt: embedding ? now() : null,
      }),
    );
  }
  return { records, examples };
}

/**
 * Write half of recordFeedbackExamples: upserts the feedback + example rows
 * and marks the classifier head stale. `tx` may be an open transaction or a
 * plain DB handle. Synchronous by design — see prepareFeedbackExamples.
 */
export function writeFeedbackExamples(
  tx: DbTx | DB,
  prepared: PreparedFeedbackWrite,
  nowFn: () => number = Date.now,
): number {
  const { records, examples } = prepared;
  if (records.length === 0) return 0;
  writeFeedbackExamplesBody(tx, records, examples, nowFn);
  return records.length;
}

export async function recordFeedbackExamples(
  db: DB,
  records: FeedbackRecordInput[],
  options: EmbeddingWriteOptions = {},
): Promise<number> {
  if (records.length === 0) return 0;
  const now = options.now ?? Date.now;
  const { examples } = await prepareFeedbackExamples(records, options);

  db.transaction((tx) => {
    writeFeedbackExamplesBody(tx, records, examples, now);
  });

  return records.length;
}

function writeFeedbackExamplesBody(tx: DbTx | DB, records: FeedbackRecordInput[], examples: LocalModelExample[], now: () => number): void {
  {
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      const example = examples[index];
      const feedbackId = feedbackIdFor(record.transactionId, record.source);
      tx.insert(classificationFeedback)
        .values({
          id: feedbackId,
          transactionId: record.transactionId,
          matchSignature: signature(record.rawDescription),
          rawDescription: record.rawDescription,
          merchant: record.merchant,
          category: record.category,
          subcategory: record.subcategory,
          flow: record.flow,
          amount: record.amount,
          institutionId: record.institutionId ?? null,
          source: record.source,
          reviewedAt: example.reviewedAt,
        })
        .onConflictDoUpdate({
          target: classificationFeedback.id,
          set: {
            matchSignature: signature(record.rawDescription),
            rawDescription: record.rawDescription,
            merchant: record.merchant,
            category: record.category,
            subcategory: record.subcategory,
            flow: record.flow,
            amount: record.amount,
            institutionId: record.institutionId ?? null,
            reviewedAt: example.reviewedAt,
          },
        })
        .run();

      tx.insert(localModelExamples)
        .values({
          id: example.id,
          feedbackId,
          transactionId: record.transactionId,
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
          embedding: example.embedding ?? [],
          embeddingModelId: example.embeddingModelId ?? null,
          embeddingUpdatedAt: example.embeddingUpdatedAt ?? null,
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
            embedding: example.embedding ?? [],
            embeddingModelId: example.embeddingModelId ?? null,
            embeddingUpdatedAt: example.embeddingUpdatedAt ?? null,
            reviewedAt: example.reviewedAt,
          },
        })
        .run();
    }

    tx.update(localClassifierHeads)
      .set({ stale: true, updatedAt: now() })
      .where(eq(localClassifierHeads.id, LOCAL_MODEL_VERSION))
      .run();
  }
}

export async function loadLocalClassifierState(
  db: DB,
  options: EmbeddingWriteOptions = {},
): Promise<LocalClassifierState> {
  const runtime = await embeddingWriter(options);
  const examples = loadLocalModelExamples(db);
  const embedded = await backfillMissingEmbeddings(db, examples, runtime, options.now ?? Date.now);
  const usable = embedded.filter(
    (example): example is LocalModelExample & { embedding: number[] } =>
      Array.isArray(example.embedding) &&
      example.embedding.length === runtime.dimensions &&
      example.embeddingModelId === runtime.embeddingModelId,
  );
  const persisted = loadClassifierHead(db);
  const needsRebuild =
    !persisted ||
    persisted.stale ||
    persisted.embeddingModelId !== runtime.embeddingModelId ||
    persisted.dimensions !== runtime.dimensions ||
    persisted.exampleCount !== usable.length;
  const head = needsRebuild ? rebuildClassifierHead(db, usable, runtime, options.now ?? Date.now) : persisted.head;

  return {
    status: runtime.status,
    embeddingModelId: runtime.embeddingModelId,
    reason: runtime.reason,
    examples: embedded,
    head,
    embedText: runtime.embedText,
  };
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
        .values({ id: suggestionId, predictionId, transactionId, status: 'open', updatedAt: Date.now() })
        .onConflictDoUpdate({
          target: localModelSuggestions.id,
          set: { predictionId, transactionId, status: 'open', updatedAt: Date.now() },
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

export function localExampleValuesFor(
  record: FeedbackRecordInput & {
    embedding?: number[] | null;
    embeddingModelId?: string | null;
    embeddingUpdatedAt?: number | null;
  },
): LocalModelExample {
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
    institutionId: record.institutionId,
    reviewedAt: record.reviewedAt ?? Date.now(),
    source: record.source,
    embedding: record.embedding ?? null,
    embeddingModelId: record.embeddingModelId ?? null,
    embeddingUpdatedAt: record.embeddingUpdatedAt ?? null,
  });
}

async function embeddingWriter(options: EmbeddingWriteOptions): Promise<EmbeddingRuntime> {
  if (options.embedText) {
    return {
      status: 'ready',
      embeddingModelId: options.embeddingModelId ?? 'test-embedding',
      dimensions: options.dimensions ?? 384,
      embedText: options.embedText,
    };
  }
  return getDefaultEmbeddingRuntime();
}

async function backfillMissingEmbeddings(
  db: DB,
  examples: LocalModelExample[],
  runtime: EmbeddingRuntime,
  now: () => number,
): Promise<LocalModelExample[]> {
  if (runtime.status !== 'ready') return examples;
  const updated: LocalModelExample[] = [];
  for (const example of examples) {
    if (example.embedding?.length === runtime.dimensions && example.embeddingModelId === runtime.embeddingModelId) {
      updated.push(example);
      continue;
    }
    const embedding = await runtime.embedText(textForEmbedding(example));
    if (!embedding) {
      updated.push(example);
      continue;
    }
    const patched = { ...example, embedding, embeddingModelId: runtime.embeddingModelId, embeddingUpdatedAt: now() };
    db.update(localModelExamples)
      .set({ embedding, embeddingModelId: runtime.embeddingModelId, embeddingUpdatedAt: patched.embeddingUpdatedAt })
      .where(eq(localModelExamples.id, example.id))
      .run();
    updated.push(patched);
  }
  return updated;
}

function loadClassifierHead(db: DB): ({ head: LocalClassifierHead; stale: boolean } & Pick<LocalClassifierHead, 'embeddingModelId' | 'dimensions' | 'exampleCount'>) | null {
  const row = db.select().from(localClassifierHeads).where(eq(localClassifierHeads.id, LOCAL_MODEL_VERSION)).get();
  if (!row) return null;
  return {
    stale: row.stale,
    embeddingModelId: row.embeddingModelId,
    dimensions: row.dimensions,
    exampleCount: row.exampleCount,
    head: {
      modelVersion: row.modelVersion,
      embeddingModelId: row.embeddingModelId,
      dimensions: row.dimensions,
      labels: row.labels as LocalClassifierHead['labels'],
      weights: row.weights,
      bias: row.bias,
      exampleCount: row.exampleCount,
      checksum: row.checksum,
      trainedAt: row.trainedAt,
    },
  };
}

function rebuildClassifierHead(
  db: DB,
  examples: Array<LocalModelExample & { embedding: number[] }>,
  runtime: EmbeddingRuntime,
  now: () => number,
): LocalClassifierHead | null {
  const trainingExamples = examples.map((example) => ({
    id: example.id,
    merchant: example.merchant,
    flow: example.flow,
    category: example.category,
    subcategory: example.subcategory,
    embedding: example.embedding,
  }));
  const head = trainSoftmaxHead(trainingExamples, {
    modelVersion: LOCAL_MODEL_VERSION,
    embeddingModelId: runtime.embeddingModelId,
    dimensions: runtime.dimensions,
    trainedAt: now(),
  });
  if (!head) return null;

  db.insert(localClassifierHeads)
    .values({
      id: LOCAL_MODEL_VERSION,
      modelVersion: head.modelVersion,
      embeddingModelId: head.embeddingModelId,
      dimensions: head.dimensions,
      labels: head.labels,
      weights: head.weights,
      bias: head.bias,
      exampleCount: head.exampleCount,
      checksum: head.checksum,
      stale: false,
      trainedAt: head.trainedAt,
      updatedAt: now(),
    })
    .onConflictDoUpdate({
      target: localClassifierHeads.id,
      set: {
        modelVersion: head.modelVersion,
        embeddingModelId: head.embeddingModelId,
        dimensions: head.dimensions,
        labels: head.labels,
        weights: head.weights,
        bias: head.bias,
        exampleCount: head.exampleCount,
        checksum: head.checksum,
        stale: false,
        trainedAt: head.trainedAt,
        updatedAt: now(),
      },
    })
    .run();
  return head;
}

function textForEmbedding(record: Pick<FeedbackRecordInput, 'merchant' | 'rawDescription' | 'institutionId'>): string {
  return [record.merchant, record.rawDescription, record.institutionId].filter(Boolean).join(' ');
}
