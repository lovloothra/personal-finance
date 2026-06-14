/**
 * One-time backfill: re-derive ownAccountId/ownAccountKind for parsed_documents
 * and their transactions that were imported before the account-aware feature.
 *
 * Uses the stored rawText (no re-download) and the same extractAccountLast4 +
 * resolveOwnAccount logic as the live ingest pipeline — single source of truth.
 *
 * Idempotent: docs where ownAccountId is already set are skipped.
 *
 * Run: PF_DB_PATH=/tmp/pf-backfill-test.db tsx --conditions=react-server scripts/backfill-account-ids.ts
 */
import { eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { accountsBank, accountsCard, parsedDocuments, transactions } from '@/db/schema';
import { resolveOwnAccount, type OwnAccountRow } from '@/ingest/account-reconcile';
import { extractAccountLast4 } from '@/parsers/in/generic-bank';

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

  // Only process docs where ownAccountId has not yet been stamped (idempotency).
  const docs = db
    .select({
      id: parsedDocuments.id,
      institutionId: parsedDocuments.institutionId,
      docType: parsedDocuments.docType,
      rawText: parsedDocuments.rawText,
      ownAccountId: parsedDocuments.ownAccountId,
    })
    .from(parsedDocuments)
    .where(isNull(parsedDocuments.ownAccountId))
    .all();

  let stamped = 0;
  let unresolved = 0;
  let txnsUpdated = 0;
  const total = docs.length;

  for (const doc of docs) {
    const last4 = extractAccountLast4(doc.rawText ?? '');

    const resolved = resolveOwnAccount(
      {
        institutionId: doc.institutionId,
        accountLast4: last4,
        docType: doc.docType ?? undefined,
      },
      ownAccounts,
    );

    // If a new stub account was minted, persist it and add to in-memory list
    // so subsequent docs in this batch can match it (mirrors pipeline.ts).
    if (resolved.stubCreated && resolved.ownAccountId) {
      const stub = {
        id: resolved.ownAccountId,
        institutionId: doc.institutionId,
        last4: last4 ?? null,
      };
      if (resolved.ownAccountKind === 'card') {
        db.insert(accountsCard).values(stub).onConflictDoNothing().run();
      } else {
        db.insert(accountsBank).values(stub).onConflictDoNothing().run();
      }
      ownAccounts.push({ ...stub, kind: resolved.ownAccountKind! });
    }

    // Wrap the doc + transaction updates in a single transaction for atomicity.
    db.transaction((tx) => {
      tx
        .update(parsedDocuments)
        .set({
          accountLast4: last4 ?? null,
          ownAccountId: resolved.ownAccountId,
          ownAccountKind: resolved.ownAccountKind,
        })
        .where(eq(parsedDocuments.id, doc.id))
        .run();

      if (resolved.ownAccountId !== null) {
        const result = tx
          .update(transactions)
          .set({
            ownAccountId: resolved.ownAccountId,
            ownAccountKind: resolved.ownAccountKind,
          })
          .where(eq(transactions.documentId, doc.id))
          .run();
        txnsUpdated += result.changes;
        stamped++;
      } else {
        // No last4 found in header — leave transactions null for manual assignment.
        unresolved++;
      }
    });
  }

  console.log(
    `backfilled ownAccountId: stamped ${stamped}/${total} documents (${txnsUpdated} transactions), ` +
      `${unresolved} documents had no header last4 (left for manual assignment)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfill-account-ids] failed:', err);
    process.exit(1);
  });
