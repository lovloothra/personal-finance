/**
 * Repair backfill: re-derive ownAccountId/ownAccountKind/ownAccountSource for
 * parsed_documents and their transactions.
 *
 * Covers BOTH broken populations:
 *   - never-attributed docs (ownAccountId IS NULL), and
 *   - orphaned docs/txns whose ownAccountId points at an account row that no
 *     longer exists (profile re-seeds used to mint fresh ids — fixed in
 *     src/profile/seed.ts, but the stale references remain).
 *
 * Uses the stored rawText and the same extractAccountLast4 / isCardStatementText /
 * resolveOwnAccount logic as the live ingest pipeline — single source of truth.
 * Also corrects docType for card statements that were stored as bank_statement,
 * and completes a registered account's missing last4 when a unique match
 * reveals it (e.g. a card registered without its number).
 *
 * Idempotent: docs whose ownAccountId already resolves to a live account (or
 * that a user assigned by hand) are skipped, so re-running is a no-op.
 *
 * Rehearse first: PF_DB_PATH=/tmp/pf-backfill-test.db tsx --conditions=react-server scripts/backfill-account-ids.ts
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { accountsBank, accountsCard, institutions, parsedDocuments, transactions } from '@/db/schema';
import { resolveOwnAccount, type OwnAccountRow } from '@/ingest/account-reconcile';
import { extractAccountLast4, isCardStatementText } from '@/parsers/in/generic-bank';

/**
 * Owner-confirmed account fixes (2026-07-08): the HDFC credit card ··1567
 * appears in 5 stored statements but was never registered. Register it under
 * the card-issuer institution so the statements match it here and a future
 * profile re-seed claims it by natural key instead of duplicating it.
 */
function registerKnownAccounts(db: Awaited<ReturnType<typeof getDb>>, ownAccounts: OwnAccountRow[]): void {
  const wanted = { institutionId: 'hdfc-bank-cards', last4: '1567' };
  const exists = ownAccounts.some(
    (a) => a.kind === 'card' && a.last4 === wanted.last4 && (a.institutionId === wanted.institutionId || a.institutionId === 'hdfc-bank'),
  );
  if (exists) return;
  const inst = db.select({ id: institutions.id }).from(institutions).where(eq(institutions.id, wanted.institutionId)).get();
  if (!inst) {
    console.warn(`  cannot register ··${wanted.last4}: institution ${wanted.institutionId} not loaded (run db:load-packs)`);
    return;
  }
  const row = { id: `card_${randomUUID().slice(0, 8)}`, institutionId: wanted.institutionId, last4: wanted.last4 };
  db.insert(accountsCard).values(row).run();
  ownAccounts.push({ ...row, kind: 'card' });
  console.log(`  registered HDFC credit card ··${wanted.last4} as ${row.id} (owner-confirmed)`);
}

async function main(): Promise<void> {
  const db = await getDb();

  // Load all registered own accounts (same pattern as pipeline.ts).
  const ownAccounts: OwnAccountRow[] = [
    ...db
      .select({ id: accountsBank.id, institutionId: accountsBank.institutionId, last4: accountsBank.last4 })
      .from(accountsBank)
      .all()
      .map((a) => ({ ...a, kind: 'bank' as const })),
    ...db
      .select({ id: accountsCard.id, institutionId: accountsCard.institutionId, last4: accountsCard.last4 })
      .from(accountsCard)
      .all()
      .map((a) => ({ ...a, kind: 'card' as const })),
  ];
  registerKnownAccounts(db, ownAccounts);
  const liveIds = new Set(ownAccounts.map((a) => a.id));

  const docs = db
    .select({
      id: parsedDocuments.id,
      institutionId: parsedDocuments.institutionId,
      docType: parsedDocuments.docType,
      rawText: parsedDocuments.rawText,
      ownAccountId: parsedDocuments.ownAccountId,
      ownAccountSource: parsedDocuments.ownAccountSource,
    })
    .from(parsedDocuments)
    .all();

  let stamped = 0;
  let skipped = 0;
  let unresolved = 0;
  let txnsUpdated = 0;
  const bySource = new Map<string, number>();

  for (const doc of docs) {
    // Idempotency: leave docs alone when their attribution is intact or the
    // user set it by hand.
    if (doc.ownAccountSource === 'user_assigned' || (doc.ownAccountId && liveIds.has(doc.ownAccountId))) {
      skipped++;
      continue;
    }

    const text = doc.rawText ?? '';
    const last4 = extractAccountLast4(text);
    const docType = isCardStatementText(text) ? 'card_statement' : (doc.docType ?? 'bank_statement');
    const txnCount = db.select({ id: transactions.id }).from(transactions).where(eq(transactions.documentId, doc.id)).all().length;

    const resolved = resolveOwnAccount(
      { institutionId: doc.institutionId, accountLast4: last4, docType, txnCount },
      ownAccounts,
    );

    // A unique match against an account registered without its last4 reveals
    // the number — complete the registered row (never overwrite a set one).
    if (resolved.source === 'institution_unique' && last4) {
      const acct = ownAccounts.find((a) => a.id === resolved.ownAccountId);
      if (acct && acct.last4 == null) {
        const table = resolved.ownAccountKind === 'card' ? accountsCard : accountsBank;
        db.update(table).set({ last4, updatedAt: Date.now() }).where(eq(table.id, acct.id)).run();
        acct.last4 = last4;
        console.log(`  completed last4 ··${last4} on ${acct.id} (${doc.institutionId})`);
      }
    }

    // If a new stub account was minted, persist it and add to the in-memory
    // list so subsequent docs in this batch can match it (mirrors pipeline.ts).
    if (resolved.stubCreated && resolved.ownAccountId) {
      const stub = { id: resolved.ownAccountId, institutionId: doc.institutionId, last4: last4 ?? null };
      if (resolved.ownAccountKind === 'card') {
        db.insert(accountsCard).values(stub).onConflictDoNothing().run();
      } else {
        db.insert(accountsBank).values(stub).onConflictDoNothing().run();
      }
      ownAccounts.push({ ...stub, kind: resolved.ownAccountKind! });
      liveIds.add(resolved.ownAccountId);
      console.log(`  minted stub ${resolved.ownAccountId} (${doc.institutionId} ··${last4}) — register it properly in the profile`);
    }

    // Wrap the doc + transaction updates in a single transaction for atomicity.
    db.transaction((tx) => {
      tx
        .update(parsedDocuments)
        .set({
          docType,
          accountLast4: last4 ?? null,
          ownAccountId: resolved.ownAccountId,
          ownAccountKind: resolved.ownAccountKind,
          ownAccountSource: resolved.source,
        })
        .where(eq(parsedDocuments.id, doc.id))
        .run();

      // Doc-level altitude: every transaction of the doc inherits its account,
      // including rows still pointing at ghost ids.
      const result = tx
        .update(transactions)
        .set({
          ownAccountId: resolved.ownAccountId,
          ownAccountKind: resolved.ownAccountKind,
        })
        .where(eq(transactions.documentId, doc.id))
        .run();
      if (resolved.ownAccountId !== null) {
        txnsUpdated += result.changes;
        stamped++;
        bySource.set(resolved.source!, (bySource.get(resolved.source!) ?? 0) + 1);
      } else {
        unresolved++;
      }
    });
  }

  console.log(
    `backfilled ownAccountId: stamped ${stamped}/${docs.length} documents (${txnsUpdated} transactions), ` +
      `${skipped} already attributed, ${unresolved} left for manual assignment`,
  );
  console.log(`by source: ${[...bySource.entries()].map(([k, n]) => `${k}:${n}`).join(' ') || '—'}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfill-account-ids] failed:', err);
    process.exit(1);
  });
