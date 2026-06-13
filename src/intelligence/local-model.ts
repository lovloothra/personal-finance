import { signature } from '@/classifier/normalize';
import { LAYER, type Classification, type Confidence, type Flow, type RawTxn } from '@/classifier/types';

export const LOCAL_ML_LAYER = 10;
export const LOCAL_MODEL_VERSION = 'local-memory-v1';

export type ClassificationSource = 'deterministic' | 'local_ml';
export type LocalReviewStatus = 'none' | 'required' | 'suggested' | 'accepted';
export type FeedbackSource = 'review_assignment' | 'user_override' | 'suggestion_accept';

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
    model: 'local_memory_similarity';
    features: {
      signature: string;
      tokens: string[];
      amountBucket: string;
      direction: 'credit' | 'debit';
      institutionId: string | null;
    };
    evidenceCount: number;
    margin: number;
    nearest: Array<{ exampleId: string; score: number; signature: string }>;
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

interface LocalDecisionOptions {
  minEvidenceForAutoAccept?: number;
  minAutoAcceptScore?: number;
  minAutoAcceptMargin?: number;
  categoryAllowlist?: string[];
}

interface TargetFeatures {
  signature: string;
  tokens: string[];
  amountBucket: string;
  direction: 'credit' | 'debit';
  institutionId: string | null;
}

interface ScoredExample {
  example: LocalModelExample;
  score: number;
}

const DEFAULT_MIN_EVIDENCE = 3;
const DEFAULT_MIN_SCORE = 0.72;
const DEFAULT_MIN_MARGIN = 0.08;

const CATEGORY_ALLOWLIST = new Set([
  'Cash',
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
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
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
  };
}

export function predictLocalClassification(
  txn: RawTxn,
  deterministicResult: Classification,
  examples: LocalModelExample[],
): LocalPrediction | null {
  const features = featuresFor(txn);
  const compatible = examples.filter((e) => isExampleCompatible(txn, deterministicResult, e));
  if (compatible.length === 0) return null;

  const scored = compatible
    .map((example) => ({ example, score: scoreExample(features, example) }))
    .filter((s) => s.score >= 0.3)
    .sort(compareScoredExamples);

  if (scored.length === 0) return null;

  const groups = new Map<string, ScoredExample[]>();
  for (const item of scored) {
    const key = labelKey(item.example);
    const current = groups.get(key) ?? [];
    current.push(item);
    groups.set(key, current);
  }

  const ranked = [...groups.values()]
    .map((items) => {
      const evidence = items.filter((item) => item.score >= 0.45);
      const best = items[0];
      const avgEvidence =
        evidence.length > 0 ? evidence.reduce((sum, item) => sum + item.score, 0) / evidence.length : best.score;
      const groupScore = Math.min(0.99, avgEvidence + Math.min(evidence.length, 4) * 0.015);
      return { items, evidence, best, groupScore };
    })
    .sort((a, b) => b.groupScore - a.groupScore || b.evidence.length - a.evidence.length);

  const top = ranked[0];
  const runnerUp = ranked[1];
  const margin = Math.max(0, top.groupScore - (runnerUp?.groupScore ?? 0));
  const evidence = top.evidence.length > 0 ? top.evidence : [top.best];
  const confidence = confidenceFor(top.groupScore, evidence.length, margin);
  const winner = top.best.example;
  const evidenceSet = new Set(evidence.map((item) => item.example.id));
  const evidenceIds = examples.filter((example) => evidenceSet.has(example.id)).map((example) => example.id);
  const nearest = scored.slice(0, 5).map((item) => ({
    exampleId: item.example.id,
    score: roundScore(item.score),
    signature: item.example.signature,
  }));

  return {
    category: winner.category,
    subcategory: winner.subcategory,
    merchant: winner.merchant,
    flow: winner.flow,
    confidenceScore: roundScore(top.groupScore),
    confidence,
    reason: `Local memory: ${evidence.length} reviewed example${evidence.length === 1 ? '' : 's'} for ${winner.merchant} -> ${winner.category}${winner.subcategory ? ` / ${winner.subcategory}` : ''}.`,
    provenance: {
      model: 'local_memory_similarity',
      features,
      evidenceCount: evidence.length,
      margin: roundScore(margin),
      nearest,
    },
    evidenceIds,
    modelVersion: LOCAL_MODEL_VERSION,
  };
}

export function decideClassification(
  txn: RawTxn,
  deterministicResult: Classification,
  examples: LocalModelExample[],
  options: LocalDecisionOptions = {},
): ClassificationDecision {
  if (!isLocalPredictionEligible(deterministicResult)) {
    return baseDecision(deterministicResult, deterministicResult.reviewRequired ? 'required' : 'none');
  }

  const localPrediction = predictLocalClassification(txn, deterministicResult, examples);
  if (!localPrediction) {
    return baseDecision(deterministicResult, deterministicResult.reviewRequired ? 'required' : 'none');
  }

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
        signal: 'local_ml.memory',
        layer: LOCAL_ML_LAYER,
        reviewRequired: false,
        taxSection: null,
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

function baseDecision(result: Classification, reviewStatus: LocalReviewStatus): ClassificationDecision {
  return {
    deterministicResult: result,
    localPrediction: null,
    finalResult: result,
    source: 'deterministic',
    reviewStatus,
    auditRecordId: null,
  };
}

function featuresFor(txn: RawTxn): TargetFeatures {
  const sig = signature(txn.rawDescription);
  return {
    signature: sig,
    tokens: merchantTokensFrom(`${txn.merchant ?? ''} ${txn.rawDescription}`),
    amountBucket: amountBucketFor(txn.amount),
    direction: directionForAmount(txn.amount),
    institutionId: txn.institutionId ?? null,
  };
}

function isExampleCompatible(txn: RawTxn, deterministicResult: Classification, example: LocalModelExample): boolean {
  if (example.flow === 'transfer' || example.category === 'Transfer') return false;
  if (example.direction !== directionForAmount(txn.amount)) return false;
  if (txn.amount > 0) return example.flow === 'income';
  if (deterministicResult.flow === 'investment') return example.flow === 'investment';
  return example.flow === 'expense' || example.flow === 'investment';
}

function scoreExample(features: TargetFeatures, example: LocalModelExample): number {
  const tokenScore = jaccard(features.tokens, example.merchantTokens.length ? example.merchantTokens : merchantTokensFrom(example.signature));
  const signatureScore = features.signature === example.signature ? 1 : jaccard(features.signature.split(' '), example.signature.split(' '));
  const institutionScore = features.institutionId && features.institutionId === example.institutionId ? 1 : 0;
  const amountScore = features.amountBucket === example.amountBucket ? 1 : 0;

  return (
    tokenScore * 0.5 +
    signatureScore * 0.3 +
    institutionScore * 0.1 +
    amountScore * 0.07 +
    (features.direction === example.direction ? 0.03 : 0)
  );
}

function confidenceFor(score: number, evidenceCount: number, margin: number): Confidence {
  if (evidenceCount >= DEFAULT_MIN_EVIDENCE && score >= DEFAULT_MIN_SCORE && margin >= DEFAULT_MIN_MARGIN) {
    return 'high';
  }
  if (evidenceCount >= 1 && score >= 0.45) return 'med';
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
  if (prediction.flow === 'transfer') return false;
  if (txn.amount > 0) return prediction.flow === 'income';
  return prediction.flow === 'expense' || prediction.flow === 'investment';
}

function labelKey(example: LocalModelExample): string {
  return [example.flow, example.merchant, example.category, example.subcategory ?? ''].join('\u001f');
}

function jaccard(left: string[], right: string[]): number {
  const a = new Set(left.filter(Boolean));
  const b = new Set(right.filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function compareScoredExamples(a: ScoredExample, b: ScoredExample): number {
  return b.score - a.score || b.example.reviewedAt - a.example.reviewedAt || a.example.id.localeCompare(b.example.id);
}

function roundScore(n: number): number {
  return Math.round(n * 1000) / 1000;
}
