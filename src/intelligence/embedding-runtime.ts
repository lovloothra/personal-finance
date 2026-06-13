import 'server-only';

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { loadWordPieceVocab, WordPieceTokenizer, type EncodedWordPieceText } from './minilm-tokenizer';

export type EncodedText = EncodedWordPieceText;

export interface EmbeddingTensorLike {
  data: unknown;
  dims: readonly number[];
}

export interface EmbeddingSession {
  run(feeds: Record<string, unknown>): Promise<Record<string, EmbeddingTensorLike>>;
}

export interface EmbedTextsWithSessionOptions {
  session: EmbeddingSession;
  encode(text: string, options: { maxLength: number }): EncodedText;
  texts: string[];
  dimensions: number;
  maxLength: number;
  createTensor(type: 'int64', data: BigInt64Array, dims: number[]): unknown;
}

export interface MiniLMModelMetadata {
  modelId: string;
  version: string;
  dimensions: number;
  maxLength: number;
  pooling: 'mean';
  onnx: { path: string; sha256: string };
  vocab: { path: string; sha256: string };
}

export interface EmbeddingRuntime {
  status: 'ready' | 'disabled';
  embeddingModelId: string;
  dimensions: number;
  reason?: string;
  embedText(text: string): Promise<number[] | null>;
}

const DEFAULT_MODEL_DIR = join(process.cwd(), 'models', 'classification', 'all-MiniLM-L6-v2');
let cachedRuntime: Promise<EmbeddingRuntime> | null = null;

export function meanPoolTokenEmbeddings(data: Float32Array | number[], dims: readonly number[], attentionMask: number[], batchIndex = 0): number[] {
  const [, sequenceLength, dimensions] = dims;
  const pooled = Array.from({ length: dimensions }, () => 0);
  let tokens = 0;
  const batchOffset = batchIndex * sequenceLength * dimensions;

  for (let token = 0; token < sequenceLength; token++) {
    if (!attentionMask[token]) continue;
    tokens++;
    const tokenOffset = batchOffset + token * dimensions;
    for (let dim = 0; dim < dimensions; dim++) pooled[dim] += Number(data[tokenOffset + dim]);
  }

  if (tokens === 0) return pooled;
  return pooled.map((value) => value / tokens);
}

export function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector.map(() => 0);
  return vector.map((value) => value / norm);
}

export async function embedTextsWithSession(options: EmbedTextsWithSessionOptions): Promise<number[][]> {
  const encoded = options.texts.map((text) => options.encode(text, { maxLength: options.maxLength }));
  const batch = encoded.length;
  const shape = [batch, options.maxLength];
  const flatten = (field: keyof Pick<EncodedText, 'inputIds' | 'attentionMask' | 'tokenTypeIds'>) =>
    BigInt64Array.from(encoded.flatMap((item) => item[field]).map(BigInt));

  const feeds = {
    input_ids: options.createTensor('int64', flatten('inputIds'), shape),
    attention_mask: options.createTensor('int64', flatten('attentionMask'), shape),
    token_type_ids: options.createTensor('int64', flatten('tokenTypeIds'), shape),
  };
  const output = await options.session.run(feeds);
  const hidden = output.last_hidden_state ?? Object.values(output)[0];
  if (!hidden) throw new Error('ONNX embedding model returned no hidden-state output.');
  if (hidden.dims.length !== 3 || hidden.dims[2] !== options.dimensions) {
    throw new Error(`Unexpected embedding output shape ${hidden.dims.join('x')}.`);
  }

  return encoded.map((item, index) => l2Normalize(meanPoolTokenEmbeddings(hidden.data as Float32Array, hidden.dims, item.attentionMask, index)));
}

export async function getDefaultEmbeddingRuntime(modelDir = DEFAULT_MODEL_DIR): Promise<EmbeddingRuntime> {
  cachedRuntime ??= createEmbeddingRuntime(modelDir);
  return cachedRuntime;
}

export async function createEmbeddingRuntime(modelDir = DEFAULT_MODEL_DIR): Promise<EmbeddingRuntime> {
  try {
    const metadata = readModelMetadata(modelDir);
    validateBundle(modelDir, metadata);
    const vocab = loadWordPieceVocab(join(modelDir, metadata.vocab.path));
    const tokenizer = new WordPieceTokenizer(vocab);
    const ort = await import('onnxruntime-node');
    const session = await ort.InferenceSession.create(join(modelDir, metadata.onnx.path));
    const tensorFactory = (type: 'int64', data: BigInt64Array, dims: number[]) => new ort.Tensor(type, data, dims);

    return {
      status: 'ready',
      embeddingModelId: metadata.modelId,
      dimensions: metadata.dimensions,
      async embedText(text: string): Promise<number[] | null> {
        const [embedding] = await embedTextsWithSession({
          session,
          encode: (value, options) => tokenizer.encode(value, options),
          texts: [text],
          dimensions: metadata.dimensions,
          maxLength: metadata.maxLength,
          createTensor: tensorFactory,
        });
        return embedding;
      },
    };
  } catch (err) {
    return {
      status: 'disabled',
      embeddingModelId: 'sentence-transformers/all-MiniLM-L6-v2',
      dimensions: 384,
      reason: err instanceof Error ? err.message : 'Embedding runtime unavailable.',
      async embedText() {
        return null;
      },
    };
  }
}

function readModelMetadata(modelDir: string): MiniLMModelMetadata {
  return JSON.parse(readFileSync(join(modelDir, 'model.json'), 'utf8')) as MiniLMModelMetadata;
}

function validateBundle(modelDir: string, metadata: MiniLMModelMetadata): void {
  const modelPath = join(modelDir, metadata.onnx.path);
  const vocabPath = join(modelDir, metadata.vocab.path);
  for (const path of [modelPath, vocabPath]) {
    if (!existsSync(path)) throw new Error(`Model artifact missing: ${path}`);
  }
  if (looksLikeGitLfsPointer(modelPath)) {
    throw new Error(`Model artifact is a Git LFS pointer. Run git lfs pull for ${dirname(modelPath)}.`);
  }
  assertSha256(modelPath, metadata.onnx.sha256);
  assertSha256(vocabPath, metadata.vocab.sha256);
}

function assertSha256(path: string, expected: string): void {
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (actual !== expected) throw new Error(`SHA256 mismatch for ${path}: expected ${expected}, got ${actual}.`);
}

function looksLikeGitLfsPointer(path: string): boolean {
  if (statSync(path).size > 1024) return false;
  return readFileSync(path, 'utf8').startsWith('version https://git-lfs.github.com/spec/v1');
}
