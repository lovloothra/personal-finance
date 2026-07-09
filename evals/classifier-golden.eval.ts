/**
 * Classifier golden-set eval.
 *
 * Runs the deterministic pipeline (layers 1-7) over labeled fixtures using the
 * REAL packs/in merchant aliases + built-in keyword rules + a synthetic
 * profile, and reports an accuracy scorecard. Unlike unit tests, this is an
 * aggregate quality gate: it fails only when accuracy drops below threshold,
 * so individual rule changes show up as score movement, not brittle breaks.
 *
 * Run:            npm run eval:classifier
 * Gate threshold: PF_EVAL_MIN_ACCURACY (default 0.95)
 *
 * Pure — no DB, no keychain, no react-server condition needed.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from '@/classifier/pipeline';
import { normalizeCategory } from '@/classifier/taxonomy';
import { DEFAULT_KEYWORD_RULES } from '@/classifier/keyword-rules';
import type { ClassifyContext, RawTxn, MerchantAlias } from '@/classifier/types';
import { readPacks } from '@/packs/loader';

interface GoldenCase {
  id: string;
  desc: string;
  amount: number;
  expect: { flow: string; category: string };
  expectReview?: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));
const { cases } = JSON.parse(readFileSync(join(here, 'fixtures', 'golden-txns.json'), 'utf8')) as {
  cases: GoldenCase[];
};

// Same alias source as production (packs/in seeds, pure read — no DB).
const aliases: MerchantAlias[] = readPacks().aliases.map((a) => ({
  pattern: a.pattern,
  canonicalMerchant: a.canonicalMerchant,
  category: a.category,
  subcategory: a.subcategory,
  source: a.source,
  confidence: a.confidence,
}));

// Synthetic profile mirroring secrets/profile.local.json shape. Keep in sync
// with fixture cases that exercise layer 2 (salary/rent/EMI/broker/insurer).
const ctx: ClassifyContext = {
  overrides: [],
  profile: {
    employer: { name: 'Acme Technologies', aliases: ['acme technologies'], monthlyAmount: 25000000 },
    rent: { landlordName: 'Sharma', monthlyRent: 4500000 },
    loans: [{ kind: 'home', emiAmount: 6500000 }],
    brokers: [{ institutionId: 'zerodha', name: 'Zerodha' }],
    insurers: [{ name: 'HDFC Ergo', kind: 'health', taxSection: '80D' }],
    cards: [{ institutionId: 'hdfc-bank-cards', last4: '7702', label: 'HDFC Infinia' }],
  },
  providerRules: [],
  merchantAliases: aliases,
  keywordRules: DEFAULT_KEYWORD_RULES,
  recurrence: new Map(),
};

function normCat(c: string): string {
  return normalizeCategory(c).toLowerCase();
}

let pass = 0;
const failures: string[] = [];
const layerHist = new Map<number, number>();

for (const c of cases) {
  const txn: RawTxn = {
    id: c.id,
    date: '2026-06-15',
    amount: c.amount,
    currency: 'INR',
    rawDescription: c.desc,
  };
  const v = classify(txn, ctx);
  layerHist.set(v.layer, (layerHist.get(v.layer) ?? 0) + 1);

  const flowOk = v.flow === c.expect.flow;
  const catOk = normCat(v.category) === normCat(c.expect.category);
  const reviewOk = c.expectReview === undefined || v.reviewRequired === c.expectReview;

  if (flowOk && catOk && reviewOk) {
    pass++;
  } else {
    failures.push(
      `  ✗ ${c.id}: expected ${c.expect.flow}/${c.expect.category}${c.expectReview ? ' [review]' : ''}` +
        ` got ${v.flow}/${v.category}${v.reviewRequired ? ' [review]' : ''} (layer ${v.layer}, signal ${v.signal ?? '-'})`,
    );
  }
}

const total = cases.length;
const accuracy = pass / total;
const threshold = Number(process.env.PF_EVAL_MIN_ACCURACY ?? '0.95');

console.log(`\nClassifier golden eval — ${pass}/${total} correct (${(accuracy * 100).toFixed(1)}%)`);
console.log(
  'Layer distribution:',
  [...layerHist.entries()].sort((a, b) => a[0] - b[0]).map(([l, n]) => `L${l}:${n}`).join(' '),
);
if (failures.length) {
  console.log('\nMismatches:');
  for (const f of failures) console.log(f);
}
if (accuracy < threshold) {
  console.error(`\nFAIL: accuracy ${(accuracy * 100).toFixed(1)}% below threshold ${(threshold * 100).toFixed(0)}%`);
  process.exit(1);
}
console.log(`\nPASS (threshold ${(threshold * 100).toFixed(0)}%)`);
