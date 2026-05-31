/**
 * Golden tests for the pack loader's pure normalization (no DB, no keychain).
 * Asserts the existing packs/in/*.json seeds project into the expected
 * institution + merchant-alias shapes the classifier and UI depend on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPacks } from '../src/packs/loader.ts';

const data = readPacks();

test('loads institutions across every expected pack category', () => {
  const byCat = new Map<string, number>();
  for (const i of data.institutions) byCat.set(i.category, (byCat.get(i.category) ?? 0) + 1);

  // Each provider pack must contribute at least one institution.
  for (const cat of [
    'bank',
    'broker',
    'insurer',
    'investment_platform',
    'lender',
    'credit_card_issuer',
    'credit_card_product',
    'merchant',
  ]) {
    assert.ok((byCat.get(cat) ?? 0) > 0, `expected at least one institution for category ${cat}`);
  }
});

test('every institution is normalized with required fields', () => {
  for (const i of data.institutions) {
    assert.ok(i.id, 'id present');
    assert.ok(i.displayName, `displayName present for ${i.id}`);
    assert.ok(['high', 'med', 'low'].includes(i.confidence), `confidence normalized for ${i.id}`);
    assert.equal(i.source, 'pack:in', `pack source tag for ${i.id}`);
    assert.ok(Array.isArray(i.aliases), `aliases array for ${i.id}`);
  }
});

test('institution ids are unique', () => {
  const seen = new Set<string>();
  for (const i of data.institutions) {
    assert.ok(!seen.has(i.id), `duplicate institution id: ${i.id}`);
    seen.add(i.id);
  }
});

test('merchant aliases carry a dotted taxonomy and lowercased pattern', () => {
  assert.ok(data.aliases.length > 0, 'aliases produced');
  const uber = data.aliases.filter((a) => a.canonicalMerchant === 'Uber India');
  assert.ok(uber.length > 0, 'Uber aliases present');
  for (const a of uber) {
    assert.equal(a.pattern, a.pattern.toLowerCase(), 'pattern lowercased');
    assert.equal(a.category, 'expenses.transport');
    assert.equal(a.subcategory, 'cabs');
    assert.equal(a.source, 'pack:in');
  }
});

test('alias ids are unique (dedup across packs)', () => {
  const seen = new Set<string>();
  for (const a of data.aliases) {
    assert.ok(!seen.has(a.id), `duplicate alias id: ${a.id}`);
    seen.add(a.id);
  }
});
