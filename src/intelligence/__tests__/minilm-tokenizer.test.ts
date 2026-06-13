import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WordPieceTokenizer } from '../minilm-tokenizer';

const tokenizer = () =>
  new WordPieceTokenizer(
    new Map([
      ['[PAD]', 0],
      ['[UNK]', 1],
      ['[CLS]', 2],
      ['[SEP]', 3],
      ['[MASK]', 4],
      ['upi', 5],
      ['/', 6],
      ['zep', 7],
      ['##to', 8],
      ['paid', 9],
      ['one', 10],
      ['two', 11],
      ['three', 12],
      ['four', 13],
    ]),
  );

test('WordPiece tokenizer lowercases text, splits punctuation, and uses subwords', () => {
  const encoded = tokenizer().encode('UPI/ZEPTO paid', { maxLength: 8 });

  assert.deepEqual(encoded.tokens, ['[CLS]', 'upi', '/', 'zep', '##to', 'paid', '[SEP]', '[PAD]']);
  assert.deepEqual(encoded.inputIds, [2, 5, 6, 7, 8, 9, 3, 0]);
  assert.deepEqual(encoded.attentionMask, [1, 1, 1, 1, 1, 1, 1, 0]);
  assert.deepEqual(encoded.tokenTypeIds, [0, 0, 0, 0, 0, 0, 0, 0]);
});

test('WordPiece tokenizer emits unknown tokens and keeps SEP within max length', () => {
  const encoded = tokenizer().encode('one two three four xylophone', { maxLength: 5 });

  assert.deepEqual(encoded.tokens, ['[CLS]', 'one', 'two', 'three', '[SEP]']);
  assert.deepEqual(encoded.inputIds, [2, 10, 11, 12, 3]);
  assert.deepEqual(encoded.attentionMask, [1, 1, 1, 1, 1]);
});
