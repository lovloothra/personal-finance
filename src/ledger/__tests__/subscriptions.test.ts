/**
 * Subscription detection: known merchants dedupe to one row and confirm even
 * when sparse (annual plans); unknown charges need a real recurrence; fee noise
 * is rejected; user statuses survive a rebuild.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-subs-')), 'test.db');

import { eq } from 'drizzle-orm';
import { getDb, type DB } from '@/db/client';
import { transactions, subscriptionsDetected } from '@/db/schema';
import { detectSubscriptions } from '@/ledger/subscriptions';

let db: DB;
let n = 0;

function insert(p: { merchant: string | null; category: string; layer: number; amount: number; date: string; raw: string }) {
  db.insert(transactions).values({
    id: `t${n++}`,
    txnDate: p.date,
    amount: p.amount, // negative paise = debit
    currency: 'INR',
    rawDescription: p.raw,
    merchant: p.merchant,
    flow: 'expense',
    category: p.category,
    layer: p.layer,
    isInternalTransfer: false,
    fyKey: '2025-26',
  }).run();
}

before(async () => {
  db = await getDb();

  // Netflix billed under two different raw descriptors across months.
  ['2025-09-05', '2025-10-05', '2025-11-05', '2025-12-05', '2026-01-05', '2026-02-05'].forEach((d, i) =>
    insert({ merchant: 'Netflix', category: 'Ott', layer: 4, amount: -64900, date: d, raw: i % 2 ? 'NETFLIX.COM MUMBAI' : 'NETFLIX DI SI MUMBAI C l' }));
  // A single annual OTT charge.
  insert({ merchant: 'JioHotstar', category: 'Ott', layer: 4, amount: -219900, date: '2026-02-08', raw: 'JIOHOTSTAR ANNUAL' });
  // A genuine unknown monthly recurrence.
  ['2025-11-10', '2025-12-10', '2026-01-10'].forEach((d) =>
    insert({ merchant: null, category: 'Subscriptions', layer: 6, amount: -50000, date: d, raw: '13017957075 ADDRESSHEALTH BANGALORE IN 30' }));
  // Fee noise that recurs but is under the ₹30 floor.
  ['2025-11-01', '2025-12-01', '2026-01-01'].forEach((d) =>
    insert({ merchant: null, category: 'Subscriptions', layer: 6, amount: -400, date: d, raw: 'MARKUP FEE' }));

  detectSubscriptions(db);
});

test('known merchant billed under varied descriptors dedupes to one row', () => {
  const netflix = db.select().from(subscriptionsDetected).all().filter((s) => s.merchant === 'Netflix');
  assert.equal(netflix.length, 1);
  assert.equal(netflix[0].status, 'confirmed');
  assert.equal(netflix[0].cadence, 'monthly');
  assert.equal(netflix[0].occurrences, 6);
});

test('a lone annual known-merchant charge is a confirmed yearly subscription', () => {
  const hotstar = db.select().from(subscriptionsDetected).all().find((s) => s.merchant === 'JioHotstar');
  assert.ok(hotstar);
  assert.equal(hotstar.cadence, 'yearly');
  assert.equal(hotstar.status, 'confirmed');
});

test('unknown recurrence surfaces as likely with a cleaned label', () => {
  const ah = db.select().from(subscriptionsDetected).all().find((s) => /ADDRESSHEALTH/.test(s.merchant));
  assert.ok(ah);
  assert.equal(ah.status, 'likely');
  assert.doesNotMatch(ah.merchant, /13017957075/); // long code stripped
  assert.match(ah.merchant, /ADDRESSHEALTH BANGALORE/); // real words kept
});

test('sub-₹30 fee noise is not a subscription', () => {
  const fee = db.select().from(subscriptionsDetected).all().find((s) => /MARKUP/.test(s.merchant));
  assert.equal(fee, undefined);
});

test('user-set status survives a rebuild', () => {
  const netflixId = db.select().from(subscriptionsDetected).all().find((s) => s.merchant === 'Netflix')!.id;
  db.update(subscriptionsDetected).set({ status: 'dismissed' }).where(eq(subscriptionsDetected.id, netflixId)).run();
  detectSubscriptions(db);
  const after = db.select().from(subscriptionsDetected).all().find((s) => s.id === netflixId);
  assert.equal(after?.status, 'dismissed');
});
