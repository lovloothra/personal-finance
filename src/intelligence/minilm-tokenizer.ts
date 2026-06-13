import { readFileSync } from 'node:fs';

export interface EncodedWordPieceText {
  tokens: string[];
  inputIds: number[];
  attentionMask: number[];
  tokenTypeIds: number[];
}

export interface WordPieceEncodeOptions {
  maxLength: number;
}

const SPECIAL = {
  pad: '[PAD]',
  unk: '[UNK]',
  cls: '[CLS]',
  sep: '[SEP]',
};

export function loadWordPieceVocab(path: string): Map<string, number> {
  const entries = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((token, index) => [token.trim(), index] as const)
    .filter(([token]) => token.length > 0);
  return new Map(entries);
}

export class WordPieceTokenizer {
  private readonly vocab: Map<string, number>;
  private readonly unkId: number;
  private readonly padId: number;
  private readonly clsId: number;
  private readonly sepId: number;

  constructor(vocab: Map<string, number>) {
    this.vocab = vocab;
    this.unkId = requiredId(vocab, SPECIAL.unk);
    this.padId = requiredId(vocab, SPECIAL.pad);
    this.clsId = requiredId(vocab, SPECIAL.cls);
    this.sepId = requiredId(vocab, SPECIAL.sep);
  }

  encode(text: string, options: WordPieceEncodeOptions): EncodedWordPieceText {
    if (options.maxLength < 2) throw new Error('maxLength must leave room for CLS and SEP tokens.');
    const content = this.tokenize(text).slice(0, options.maxLength - 2);
    const tokens = [SPECIAL.cls, ...content, SPECIAL.sep];
    while (tokens.length < options.maxLength) tokens.push(SPECIAL.pad);

    const inputIds = tokens.map((token) => this.vocab.get(token) ?? this.unkId);
    return {
      tokens,
      inputIds,
      attentionMask: tokens.map((token) => (token === SPECIAL.pad ? 0 : 1)),
      tokenTypeIds: tokens.map(() => 0),
    };
  }

  tokenize(text: string): string[] {
    const tokens: string[] = [];
    for (const token of basicTokens(text)) {
      tokens.push(...this.wordPieces(token));
    }
    return tokens;
  }

  private wordPieces(token: string): string[] {
    if (this.vocab.has(token)) return [token];
    if (token.length > 100) return [SPECIAL.unk];

    const pieces: string[] = [];
    let start = 0;
    while (start < token.length) {
      let end = token.length;
      let current: string | null = null;
      while (start < end) {
        const candidate = `${start === 0 ? '' : '##'}${token.slice(start, end)}`;
        if (this.vocab.has(candidate)) {
          current = candidate;
          break;
        }
        end--;
      }
      if (!current) return [SPECIAL.unk];
      pieces.push(current);
      start = end;
    }
    return pieces;
  }
}

function requiredId(vocab: Map<string, number>, token: string): number {
  const id = vocab.get(token);
  if (id === undefined) throw new Error(`WordPiece vocab missing ${token}.`);
  return id;
}

function basicTokens(text: string): string[] {
  const normalized = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  const tokens: string[] = [];
  let current = '';

  for (const char of normalized) {
    if (/[\p{Letter}\p{Number}]/u.test(char)) {
      current += char;
      continue;
    }
    if (current) {
      tokens.push(current);
      current = '';
    }
    if (!/\s/u.test(char)) tokens.push(char);
  }
  if (current) tokens.push(current);
  return tokens;
}
