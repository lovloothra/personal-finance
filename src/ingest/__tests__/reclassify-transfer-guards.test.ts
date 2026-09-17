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
    profileSignalUsed: 'user.override',
    classificationReason: 'User override: assigned Transfer.',
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
  assert.equal(row.classificationReason, 'User override: assigned Transfer.');
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

test('reclassify squares off bank/card legs and constrains unmatched card credits to refunds', async () => {
  const { getDb } = await import('@/db/client');
  const { internalTransferLinks, parsedDocuments, transactions } = await import('@/db/schema');
  const { reclassifyAll } = await import('../reclassify');
  const db = await getDb();

  db.insert(parsedDocuments).values([
    { id: 'doc-card-credit-bank', docType: 'bank_statement', ownAccountId: 'bank-1', ownAccountKind: 'bank' },
    { id: 'doc-card-credit-card', docType: 'card_statement', ownAccountId: 'card-1', ownAccountKind: 'card' },
    { id: 'doc-card-refund', docType: 'card_statement', ownAccountId: 'card-1', ownAccountKind: 'card' },
  ]).run();
  db.insert(transactions).values([
    {
      id: 'bank-card-payment', documentId: 'doc-card-credit-bank', txnDate: '2025-11-01', amount: -12345600,
      rawDescription: 'OPAQUE BANK DEBIT', flow: 'expense', category: 'Uncategorised',
      ownAccountId: 'bank-1', ownAccountKind: 'bank', reviewRequired: true,
    },
    {
      id: 'card-payment-credit', documentId: 'doc-card-credit-card', txnDate: '2025-11-01', amount: 12345600,
      rawDescription: 'OPAQUE CARD CREDIT', flow: 'income', category: 'Uncategorised',
      ownAccountId: 'card-1', ownAccountKind: 'card', reviewRequired: true,
    },
    {
      id: 'card-refund-credit', documentId: 'doc-card-refund', txnDate: '2025-11-02', amount: 7654300,
      rawDescription: 'MERCHANT REVERSAL REF 123', flow: 'income', category: 'Uncategorised',
      ownAccountId: 'card-1', ownAccountKind: 'card', reviewRequired: true,
    },
  ]).run();

  await reclassifyAll(db);

  for (const id of ['bank-card-payment', 'card-payment-credit']) {
    const row = db.select().from(transactions).where(eq(transactions.id, id)).get()!;
    assert.equal(row.flow, 'transfer');
    assert.equal(row.category, 'cc_payment');
    assert.equal(row.subcategory, 'Credit card payment');
    assert.equal(row.isInternalTransfer, true);
    assert.equal(row.reviewRequired, false);
    assert.equal(row.profileSignalUsed, 'transfer.cc_payment_pair');
    assert.equal(row.merchant, null);
  }
  const link = db.select().from(internalTransferLinks)
    .where(eq(internalTransferLinks.creditTxnId, 'card-payment-credit')).get()!;
  assert.equal(link.debitTxnId, 'bank-card-payment');
  assert.equal(link.kind, 'cc_payment');

  const refund = db.select().from(transactions).where(eq(transactions.id, 'card-refund-credit')).get()!;
  assert.equal(refund.flow, 'income');
  assert.equal(refund.category, 'refund');
  assert.equal(refund.subcategory, 'Credit card refund / reversal');
  assert.equal(refund.isInternalTransfer, false);
  assert.equal(refund.reviewRequired, false);
  assert.equal(refund.profileSignalUsed, 'account.card_credit_refund');
  assert.equal(refund.merchant, null);
});
