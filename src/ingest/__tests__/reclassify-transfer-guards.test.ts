import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-reclassify-transfer-')), 'test.db');
process.env.PF_DB_PASSPHRASE = 'test-passphrase';
process.env.PF_PROFILE_PATH = join(tmpdir(), 'pf-missing-reclassify-profile.json');

test('reclassify preserves canonical user transfers and never also suspects them', async () => {
  const { getDb } = await import('@/db/client');
  const { transactions, userOverrides } = await import('@/db/schema');
  const { signature } = await import('@/classifier/normalize');
  const { reclassifyAll } = await import('../reclassify');
  const db = await getDb();
  const rawDescription = 'MOBILE BANKING DFC bank';

  db.insert(transactions).values({
    id: 'canonical-transfer-credit',
    txnDate: '2025-10-01',
    amount: 50000000,
    rawDescription,
    flow: 'transfer',
    category: 'self_transfer',
    reviewRequired: false,
    isInternalTransfer: true,
    suspectedTransfer: false,
  }).run();
  db.insert(userOverrides).values({
    id: 'override-transfer',
    matchSignature: signature(rawDescription),
    flow: 'transfer',
    category: 'self_transfer',
  }).run();

  await reclassifyAll(db);
  const row = db.select().from(transactions).get()!;
  assert.equal(row.flow, 'transfer');
  assert.equal(row.category, 'self_transfer');
  assert.equal(row.isInternalTransfer, true);
  assert.equal(row.suspectedTransfer, false);
  assert.equal(row.reviewRequired, false);
  assert.equal(row.profileSignalUsed, 'user.override');
});

test('reclassify leaves legacy Transfer storage unchanged', async () => {
  const { getDb } = await import('@/db/client');
  const { transactions, userOverrides } = await import('@/db/schema');
  const { signature } = await import('@/classifier/normalize');
  const { reclassifyAll } = await import('../reclassify');
  const db = await getDb();
  const rawDescription = 'MMT INTERIORS IDFC BANK';

  db.insert(transactions).values({
    id: 'legacy-transfer',
    txnDate: '2025-10-02',
    amount: -50000000,
    rawDescription,
    flow: 'transfer',
    category: 'Transfer',
    reviewRequired: false,
    isInternalTransfer: true,
    suspectedTransfer: false,
  }).run();
  db.insert(userOverrides).values({
    id: 'override-legacy-transfer',
    matchSignature: signature(rawDescription),
    flow: 'transfer',
    category: 'self_transfer',
  }).run();

  await reclassifyAll(db);
  const row = db.select().from(transactions).where(eq(transactions.id, 'legacy-transfer')).get()!;
  assert.equal(row.category, 'Transfer');
  assert.equal(row.isInternalTransfer, true);
  assert.equal(row.suspectedTransfer, false);
});
