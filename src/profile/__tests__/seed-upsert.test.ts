/**
 * Re-seeding the profile must never orphan transactions: account rows are
 * matched by natural key (institutionId + last4) and keep their ids across
 * saves. Regression for the re-seed that minted fresh ids every time and
 * silently broke every transactions.ownAccountId reference.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-seed-upsert-')), 'test.db');
process.env.PF_DB_PASSPHRASE = 'test-passphrase';

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { getDb, type DB } from '@/db/client';
import { accountsBank, accountsCard, institutions, parsedDocuments, profileOneTimeProjects, transactions } from '@/db/schema';
import { persistProfile } from '../seed';
import { ProfileSeedSchema } from '../types';

const seedWith = (banks: unknown[], cards: unknown[] = []) =>
  ProfileSeedSchema.parse({ personal: { fullName: 'Test User' }, banks, cards });

let db: DB;

before(async () => {
  db = await getDb();
  for (const id of ['hdfc-bank', 'icici-bank', 'hdfc-bank-cards', 'icici-bank-cards']) {
    db.insert(institutions).values({ id, displayName: id, category: 'bank' }).onConflictDoNothing().run();
  }
});

test('re-seeding the same accounts keeps their ids', async () => {
  persistProfile(db, seedWith(
    [{ institutionId: 'hdfc-bank', last4: '9563' }],
    [{ institutionId: 'hdfc-bank-cards', last4: '2663' }],
  ));
  const bankId = db.select({ id: accountsBank.id }).from(accountsBank).get()!.id;
  const cardId = db.select({ id: accountsCard.id }).from(accountsCard).get()!.id;

  persistProfile(db, seedWith(
    [{ institutionId: 'hdfc-bank', last4: '9563', nickname: 'Salary' }],
    [{ institutionId: 'hdfc-bank-cards', last4: '2663' }],
  ));
  const banksAfter = db.select().from(accountsBank).all();
  const cardsAfter = db.select().from(accountsCard).all();
  assert.equal(banksAfter.length, 1);
  assert.equal(banksAfter[0].id, bankId);
  assert.equal(banksAfter[0].nickname, 'Salary');
  assert.equal(cardsAfter.length, 1);
  assert.equal(cardsAfter[0].id, cardId);
});

test('a row registered without last4 is claimed, not duplicated, and keeps a learned last4', async () => {
  persistProfile(db, seedWith([], [
    { institutionId: 'hdfc-bank-cards', last4: '2663' },
    { institutionId: 'icici-bank-cards' },
  ]));
  const icici = db.select().from(accountsCard).all().find((c) => c.institutionId === 'icici-bank-cards')!;
  // Simulate the backfill learning the card's last4 from a statement.
  db.update(accountsCard).set({ last4: '9012' }).where(eq(accountsCard.id, icici.id)).run();

  // Re-seed still says "no last4" — the row must keep its id AND its last4.
  persistProfile(db, seedWith([], [
    { institutionId: 'hdfc-bank-cards', last4: '2663' },
    { institutionId: 'icici-bank-cards' },
  ]));
  const after = db.select().from(accountsCard).all().filter((c) => c.institutionId === 'icici-bank-cards');
  assert.equal(after.length, 1);
  assert.equal(after[0].id, icici.id);
  assert.equal(after[0].last4, '9012');
});

test('re-seeding never crashes or orphans project-tagged transactions', async () => {
  const seedWithProject = (projects: unknown[]) =>
    ProfileSeedSchema.parse({ personal: { fullName: 'Test User' }, banks: [], cards: [], projects });

  persistProfile(db, seedWithProject([{ id: 'proj-reno', name: 'Renovation' }]));
  db.insert(transactions).values({
    id: 'txn_proj_1', txnDate: '2026-05-01', amount: -250000, currency: 'INR',
    projectId: 'proj-reno',
  }).run();

  // Any later save (even of an unrelated chapter) re-persists projects; the old
  // delete-all-reinsert threw FOREIGN KEY constraint failed right here.
  persistProfile(db, seedWithProject([{ id: 'proj-reno', name: 'Renovation 2.0' }]));
  const kept = db.select().from(profileOneTimeProjects).all();
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, 'proj-reno');
  assert.equal(kept[0].name, 'Renovation 2.0');

  // Dropped from the seed while still referenced → the row must survive.
  persistProfile(db, seedWithProject([]));
  assert.ok(db.select().from(profileOneTimeProjects).all().find((p) => p.id === 'proj-reno'),
    'referenced project must not be deleted by a re-seed');

  // Unreferenced → the next re-seed removes it.
  db.delete(transactions).where(eq(transactions.id, 'txn_proj_1')).run();
  persistProfile(db, seedWithProject([]));
  assert.equal(db.select().from(profileOneTimeProjects).all().length, 0);
});

test('accounts dropped from the seed survive while transactions reference them', async () => {
  persistProfile(db, seedWith([
    { institutionId: 'hdfc-bank', last4: '9563' },
    { institutionId: 'icici-bank', last4: '2840' },
  ]));
  const icici = db.select().from(accountsBank).all().find((b) => b.institutionId === 'icici-bank')!;
  db.insert(parsedDocuments).values({ id: 'doc_ref_1', ownAccountId: icici.id, ownAccountKind: 'bank' }).run();
  db.insert(transactions).values({
    id: 'txn_ref_1', documentId: 'doc_ref_1', txnDate: '2026-04-01', amount: -1000,
    currency: 'INR', ownAccountId: icici.id, ownAccountKind: 'bank',
  }).run();

  // Seed no longer lists the ICICI account — but it is referenced, so it stays.
  persistProfile(db, seedWith([{ institutionId: 'hdfc-bank', last4: '9563' }]));
  const kept = db.select().from(accountsBank).all().find((b) => b.id === icici.id);
  assert.ok(kept, 'referenced account must not be deleted by a re-seed');

  // Once nothing references it, the next re-seed removes it.
  db.delete(transactions).where(eq(transactions.id, 'txn_ref_1')).run();
  db.delete(parsedDocuments).where(eq(parsedDocuments.id, 'doc_ref_1')).run();
  persistProfile(db, seedWith([{ institutionId: 'hdfc-bank', last4: '9563' }]));
  const gone = db.select().from(accountsBank).all().find((b) => b.id === icici.id);
  assert.equal(gone, undefined);
});
