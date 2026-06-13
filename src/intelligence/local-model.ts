import { signature } from '@/classifier/normalize';
import { LAYER, type Classification, type Confidence, type Flow, type RawTxn } from '@/classifier/types';

import {
  predictSoftmaxHead,
  type EmbeddedTrainingExample,
  type LocalClassifierHead,
  type SoftmaxPrediction,
} from './classifier-head';

export const LOCAL_ML_LAYER = 10;
export const LOCAL_MODEL_VERSION = 'minilm-softmax-v1';

export type ClassificationSource = 'deterministic' | 'local_ml';
export type LocalReviewStatus = 'none' | 'required' | 'suggested' | 'accepted';
export type FeedbackSource = 'review_assignment' | 'user_override' | 'suggestion_accept';
export type LocalClassifierStatus = 'ready' | 'disabled';

export interface LocalModelExample {
  id: string;
  feedbackId: string;
  transactionId: string | null;
  signature: string;
  rawDescription: string;
  merchant: string;
  merchantTokens: string[];
  category: string;
  subcategory: string | null;
  flow: Flow;
  amount: number;
  amountBucket: string;
  direction: 'credit' | 'debit';
  institutionId: string | null;
  reviewedAt: number;
  source: FeedbackSource;
  embedding?: number[] | null;
  embeddingModelId?: string | null;
  embeddingUpdatedAt?: number | null;
}

export interface LocalClassifierState {
  status: LocalClassifierStatus;
  embeddingModelId: string;
  examples: LocalModelExample[];
  head: LocalClassifierHead | null;
  reason?: string;
  embedText(text: string): Promise<number[] | null>;
}

export interface LocalPrediction {
  category: string;
  subcategory: string | null;
  merchant: string;
  flow: Flow;
  confidenceScore: number;
  confidence: Confidence;
  reason: string;
  provenance: {
    model: 'minilm_softmax_head';
    features: {
      signature: string;
      amountBucket: string;
      direction: 'credit' | 'debit';
      institutionId: string | null;
    };
    evidenceCount: number;
    margin: number;
    nearest: Array<{ exampleId: string; score: number; merchant: string }>;
    distribution: Array<{ flow: Flow; category: string; subcategory: string | null; probability: number }>;
    modelChecksum: string;
    embeddingModelId: string;
    headVersion: string;
  };
  evidenceIds: string[];
  modelVersion: string;
}

export interface ClassificationDecision {
  deterministicResult: Classification;
  localPrediction: LocalPrediction | null;
  finalResult: Classification;
  source: ClassificationSource;
  reviewStatus: LocalReviewStatus;
  auditRecordId: string | null;
}

export interface LocalDecisionOptions {
  minEvidenceForAutoAccept?: number;
  minAutoAcceptScore?: number;
  minAutoAcceptMargin?: number;
  categoryAllowlist?: string[];
}

interface TargetFeatures {
  signature: string;
  amountBucket: string;
  direction: 'credit' | 'debit';
  institutionId: string | null;
}

const DEFAULT_MIN_EVIDENCE = 2;
const DEFAULT_MIN_SCORE = 0.9;
const DEFAULT_MIN_MARGIN = 0.65;
const CATEGORY_ALLOWLIST = new Set([
  'Dining',
  'Education',
  'Entertainment',
  'Fees & Charges',
  'Fitness',
  'Food Delivery',
  'Gifts & Donations',
  'Groceries',
  'Health',
  'Household',
  'Housing',
  'Income',
  'Insurance',
  'Investment',
  'Loan',
  'Ott',
  'Personal Care',
  'Quick Commerce',
  'Refund',
  'Salary',
  'Shopping',
  'Software',
  'Subscriptions',
  'Transport',
  'Travel',
  'Utilities',
]);

const STOPWORDS = new Set([
  'ach',
  'bank',
  'card',
  'credit',
  'debit',
  'imps',
  'india',
  'inr',
  'limited',
  'ltd',
  'neft',
  'payment',
  'private',
  'pvt',
  'ref',
  'rtgs',
  'services',
  'txn',
  'upi',
]);

export function directionForAmount(amount: number): 'credit' | 'debit' {
  return amount >= 0 ? 'credit' : 'debit';
}

export function amountBucketFor(amount: number): string {
  const absRupees = Math.round(Math.abs(amount) / 100);
  const direction = amount >= 0 ? 'income' : 'expense';
  if (absRupees < 100) return `${direction}:0-100`;
  if (absRupees < 500) return `${direction}:100-500`;
  if (absRupees < 1000) return `${direction}:500-1000`;
  if (absRupees < 5000) return `${direction}:1000-5000`;
  if (absRupees < 25000) return `${direction}:5000-25000`;
  return `${direction}:25000+`;
}

export function merchantTokensFrom(raw: string): string[] {
  const seen = new Set<string>();
  const tokens = signature(raw)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  for (const token of tokens) seen.add(token);
  return [...seen];
}

export function isLocalPredictionEligible(result: Classification): boolean {
  if (result.flow === 'transfer' || result.isInternalTransfer) return false;
  if (result.taxSection) return false;
  if (result.projectId || result.layer === LAYER.PROJECT_ISOLATION) return false;
  if (
    result.layer === LAYER.USER_OVERRIDE ||
    result.layer === LAYER.PROFILE ||
    result.layer === LAYER.PROVIDER ||
    result.layer === LAYER.MERCHANT_ALIAS ||
    result.layer === LAYER.TRANSFER_DEDUPE
  ) {
    return false;
  }
  return result.reviewRequired || result.confidence === 'low' || result.layer === LAYER.FALLBACK;
}

export function makeLocalModelExample(input: {
  id: string;
  feedbackId: string;
  transactionId?: string | null;
  rawDescription: string;
  merchant: string;
  category: string;
  subcategory?: string | null;
  flow: Flow;
  amount: number;
  institutionId?: string | null;
  reviewedAt: number;
  source: FeedbackSource;
  embedding?: number[] | null;
  embeddingModelId?: string | null;
  embeddingUpdatedAt?: number | null;
}): LocalModelExample {
  const sig = signature(input.rawDescription);
  return {
    id: input.id,
    feedbackId: input.feedbackId,
    transactionId: input.transactionId ?? null,
    signature: sig,
    rawDescription: input.rawDescription,
    merchant: input.merchant,
    merchantTokens: merchantTokensFrom(`${input.merchant} ${input.rawDescription}`),
    category: input.category,
    subcategory: input.subcategory ?? null,
    flow: input.flow,
    amount: input.amount,
    amountBucket: amountBucketFor(input.amount),
    direction: directionForAmount(input.amount),
    institutionId: input.institutionId ?? null,
    reviewedAt: input.reviewedAt,
    source: input.source,
    embedding: input.embedding ?? null,
    embeddingModelId: input.embeddingModelId ?? null,
    embeddingUpdatedAt: input.embeddingUpdatedAt ?? null,
  };
}

export async function decideClassification(
  txn: RawTxn,
  deterministicResult: Classification,
  state: LocalClassifierState,
  options: LocalDecisionOptions = {},
): Promise<ClassificationDecision> {
  if (!isLocalPredictionEligible(deterministicResult)) {
    return baseDecision(deterministicResult, deterministicResult.reviewRequired ? 'required' : 'none');
  }
  if (state.status !== 'ready' || !state.head) {
    return baseDecision(deterministicResult, deterministicResult.reviewRequired ? 'required' : 'none');
  }

  const compatible = state.examples.filter((example) => isExampleCompatible(txn, example, state.embeddingModelId));
  if (compatible.length === 0) {
    return baseDecision(deterministicResult, deterministicResult.reviewRequired ? 'required' : 'none');
  }

  const embedding = await state.embedText(textForEmbedding(txn));
  if (!embedding) return baseDecision(deterministicResult, deterministicResult.reviewRequired ? 'required' : 'none');

  const headPrediction = predictSoftmaxHead(state.head, embedding, compatibleTrainingExamples(compatible));
  if (!headPrediction || !isPredictionFlowCompatible(txn, headPrediction.label.flow)) {
    return baseDecision(deterministicResult, deterministicResult.reviewRequired ? 'required' : 'none');
  }

  const localPrediction = toLocalPrediction(txn, state, headPrediction);
  if (canAutoAccept(txn, localPrediction, options)) {
    return {
      deterministicResult,
      localPrediction,
      finalResult: {
        ...deterministicResult,
        flow: localPrediction.flow,
        category: localPrediction.category,
        subcategory: localPrediction.subcategory,
        merchant: localPrediction.merchant,
        confidence: 'high',
        reason: localPrediction.reason,
        signal: 'local_ml.minilm',
        layer: LOCAL_ML_LAYER,
        reviewRequired: false,
      },
      source: 'local_ml',
      reviewStatus: 'accepted',
      auditRecordId: null,
    };
  }

  return {
    deterministicResult,
    localPrediction,
    finalResult: deterministicResult,
    source: 'deterministic',
    reviewStatus: localPrediction.confidence === 'low' ? 'required' : 'suggested',
    auditRecordId: null,
  };
}

function toLocalPrediction(txn: RawTxn, state: LocalClassifierState, prediction: SoftmaxPrediction): LocalPrediction {
  const merchant = prediction.nearest[0]?.merchant ?? prediction.label.category;
  return {
    category: prediction.label.category,
    subcategory: prediction.label.subcategory,
    merchant,
    flow: prediction.label.flow,
    confidenceScore: prediction.probability,
    confidence: confidenceFor(prediction.probability, prediction.evidenceCount, prediction.margin),
    reason: `MiniLM local model: ${prediction.evidenceCount} reviewed example${prediction.evidenceCount === 1 ? '' : 's'} for ${merchant} -> ${prediction.label.category}${prediction.label.subcategory ? ` / ${prediction.label.subcategory}` : ''}.`,
    provenance: {
      model: 'minilm_softmax_head',
      features: featuresFor(txn),
      evidenceCount: prediction.evidenceCount,
      margin: prediction.margin,
      nearest: prediction.nearest,
      distribution: prediction.distribution.map((item) => ({
        flow: item.flow,
        category: item.category,
        subcategory: item.subcategory,
        probability: item.probability,
      })),
      modelChecksum: state.head?.checksum ?? '',
      embeddingModelId: state.embeddingModelId,
      headVersion: state.head?.modelVersion ?? LOCAL_MODEL_VERSION,
    },
    evidenceIds: prediction.nearest.map((item) => item.exampleId),
    modelVersion: state.head?.modelVersion ?? LOCAL_MODEL_VERSION,
  };
}

function compatibleTrainingExamples(examples: LocalModelExample[]): EmbeddedTrainingExample[] {
  return examples
    .filter((example): example is LocalModelExample & { embedding: number[] } => Array.isArray(example.embedding))
    .map((example) => ({
      id: example.id,
      merchant: example.merchant,
      flow: example.flow,
      category: example.category,
      subcategory: example.subcategory,
      embedding: example.embedding,
    }));
}

function isExampleCompatible(txn: RawTxn, example: LocalModelExample, embeddingModelId: string): boolean {
  if (!example.embedding || example.embeddingModelId !== embeddingModelId) return false;
  if (!isPredictionFlowCompatible(txn, example.flow)) return false;
  if (txn.institutionId && example.institutionId && txn.institutionId !== example.institutionId) return false;
  return true;
}

function isPredictionFlowCompatible(txn: RawTxn, flow: Flow): boolean {
  if (flow === 'transfer') return false;
  if (txn.amount > 0) return flow === 'income';
  return flow === 'expense' || flow === 'investment';
}

function confidenceFor(score: number, evidenceCount: number, margin: number): Confidence {
  if (evidenceCount >= DEFAULT_MIN_EVIDENCE && score >= DEFAULT_MIN_SCORE && margin >= DEFAULT_MIN_MARGIN) return 'high';
  if (score >= 0.45) return 'med';
  return 'low';
}

function canAutoAccept(txn: RawTxn, prediction: LocalPrediction, options: LocalDecisionOptions): boolean {
  const allowlist = new Set(options.categoryAllowlist ?? CATEGORY_ALLOWLIST);
  const minEvidence = options.minEvidenceForAutoAccept ?? DEFAULT_MIN_EVIDENCE;
  const minScore = options.minAutoAcceptScore ?? DEFAULT_MIN_SCORE;
  const minMargin = options.minAutoAcceptMargin ?? DEFAULT_MIN_MARGIN;

  if (prediction.confidence !== 'high') return false;
  if (prediction.provenance.evidenceCount < minEvidence) return false;
  if (prediction.confidenceScore < minScore) return false;
  if (prediction.provenance.margin < minMargin) return false;
  if (!allowlist.has(prediction.category)) return false;
  return isPredictionFlowCompatible(txn, prediction.flow);
}

function featuresFor(txn: RawTxn): TargetFeatures {
  return {
    signature: signature(txn.rawDescription),
    amountBucket: amountBucketFor(txn.amount),
    direction: directionForAmount(txn.amount),
    institutionId: txn.institutionId ?? null,
  };
}

function textForEmbedding(txn: RawTxn): string {
  return [txn.merchant, txn.rawDescription, txn.institutionId].filter(Boolean).join(' ');
}

function baseDecision(finalResult: Classification, reviewStatus: LocalReviewStatus): ClassificationDecision {
  return {
    deterministicResult: finalResult,
    localPrediction: null,
    finalResult,
    source: 'deterministic',
    reviewStatus,
    auditRecordId: null,
  };
}
