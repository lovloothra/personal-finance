import { createHash } from 'node:crypto';

import type { Flow } from '@/classifier/types';

export interface EmbeddedTrainingExample {
  id: string;
  merchant: string;
  flow: Flow;
  category: string;
  subcategory: string | null;
  embedding: number[];
}

export interface SoftmaxLabel {
  id: string;
  flow: Flow;
  category: string;
  subcategory: string | null;
}

export interface LocalClassifierHead {
  modelVersion: string;
  embeddingModelId: string;
  dimensions: number;
  labels: SoftmaxLabel[];
  weights: number[][];
  bias: number[];
  exampleCount: number;
  checksum: string;
  trainedAt: number;
}

export interface TrainSoftmaxHeadOptions {
  modelVersion: string;
  embeddingModelId: string;
  dimensions: number;
  trainedAt?: number;
}

export interface SoftmaxPrediction {
  label: SoftmaxLabel;
  probability: number;
  margin: number;
  distribution: Array<SoftmaxLabel & { probability: number }>;
  nearest: Array<{ exampleId: string; score: number; merchant: string }>;
  evidenceCount: number;
}

const TEMPERATURE = 8;

export function trainSoftmaxHead(examples: EmbeddedTrainingExample[], options: TrainSoftmaxHeadOptions): LocalClassifierHead | null {
  const usable = examples
    .filter((example) => example.embedding.length === options.dimensions)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  if (usable.length === 0) return null;

  const groups = new Map<string, EmbeddedTrainingExample[]>();
  for (const example of usable) {
    const key = labelKey(example);
    groups.set(key, [...(groups.get(key) ?? []), example]);
  }

  const labels = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => labelFromExample(group[0]));
  const weights = labels.map((label) => {
    const group = groups.get(label.id) ?? [];
    const centroid = Array.from({ length: options.dimensions }, () => 0);
    for (const example of group) {
      const embedding = l2Normalize(example.embedding);
      for (let i = 0; i < options.dimensions; i++) centroid[i] += embedding[i];
    }
    return l2Normalize(centroid.map((value) => value / Math.max(1, group.length)));
  });
  const bias = labels.map((label) => Math.log((groups.get(label.id)?.length ?? 1) / usable.length));

  return {
    modelVersion: options.modelVersion,
    embeddingModelId: options.embeddingModelId,
    dimensions: options.dimensions,
    labels,
    weights,
    bias,
    exampleCount: usable.length,
    checksum: checksumExamples(usable),
    trainedAt: options.trainedAt ?? Date.now(),
  };
}

export function predictSoftmaxHead(
  head: LocalClassifierHead,
  embedding: number[],
  examples: EmbeddedTrainingExample[],
): SoftmaxPrediction | null {
  if (embedding.length !== head.dimensions || head.labels.length === 0) return null;
  const normalized = l2Normalize(embedding);
  const logits = head.weights.map((weight, index) => dot(normalized, weight) * TEMPERATURE + head.bias[index]);
  const probabilities = softmax(logits);
  const ranked = head.labels
    .map((label, index) => ({ ...label, probability: probabilities[index] }))
    .sort((a, b) => b.probability - a.probability);
  const winner = ranked[0];
  if (!winner) return null;
  const runnerUp = ranked[1]?.probability ?? 0;
  const sameLabel = examples.filter((example) => labelKey(example) === winner.id && example.embedding.length === head.dimensions);
  const nearest = sameLabel
    .map((example) => ({
      exampleId: example.id,
      score: round(dot(normalized, l2Normalize(example.embedding))),
      merchant: example.merchant,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    label: winner,
    probability: round(winner.probability),
    margin: round(winner.probability - runnerUp),
    distribution: ranked.map((item) => ({ ...item, probability: round(item.probability) })),
    nearest,
    evidenceCount: sameLabel.length,
  };
}

export function labelKey(input: Pick<EmbeddedTrainingExample, 'flow' | 'category' | 'subcategory'>): string {
  return `${input.flow}|${input.category}|${input.subcategory ?? ''}`;
}

export function labelFromExample(example: EmbeddedTrainingExample): SoftmaxLabel {
  return {
    id: labelKey(example),
    flow: example.flow,
    category: example.category,
    subcategory: example.subcategory ?? null,
  };
}

function checksumExamples(examples: EmbeddedTrainingExample[]): string {
  const digest = examples.map((example) => ({
    id: example.id,
    label: labelKey(example),
    merchant: example.merchant,
    embedding: example.embedding.map((value) => Number(value.toFixed(8))),
  }));
  return createHash('sha256').update(JSON.stringify(digest)).digest('hex');
}

function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector.map(() => 0);
  return vector.map((value) => value / norm);
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((logit) => Math.exp(logit - max));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
