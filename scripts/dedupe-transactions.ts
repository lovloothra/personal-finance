/**
 * One-time cleanup: remove cross-document duplicate transactions stored before
 * ingest-time dedup covered other runs (G2). Groups rows by the dedup key
 * (date + amount + descriptor signature + account); within a group, rows from
 * MORE THAN ONE document are duplicates — the earliest-created row survives,
 * the rest are removed (children detached first, same as re-parse). Rows
 * duplicated WITHIN one document are real spending and are never touched.
 *
 * Idempotent: a second run finds nothing to remove.
 *
 * Rehearse on a copy first:
 *   PF_DB_PATH=exports/<backup>.db tsx --conditions=react-server scripts/dedupe-transactions.ts
 * Then run for real:
 *   tsx --conditions=react-server scripts/dedupe-transactions.ts
 */
import { getDb, dbPath } from '@/db/client';
import { transactions } from '@/db/schema';
import { dedupKey } from '@/ingest/dedup';
import { detachTransactionChildren } from '@/ingest/clear-output';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const req = createRequire(join(process.cwd(), 'package.json'));
const { inArray } = req('drizzle-orm') as typeof import('drizzle-orm');

async function main(): Promise<void> {
  const db = await getDb();
  console.log(`[dedupe] db: ${dbPath()}`);

  const rows = db
    .select({
      id: transactions.id,
      documentId: transactions.documentId,
      date: transactions.txnDate,
      amount: transactions.amount,
      rawDescription: transactions.rawDescription,
      ownAccountId: transactions.ownAccountId,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .all();

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = dedupKey({ ...r, rawDescription: r.rawDescription ?? '' });
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const excessIds: string[] = [];
  let dupGroups = 0;
  for (const g of groups.values()) {
    const docs = new Set(g.map((r) => r.documentId ?? ''));
    if (g.length < 2 || docs.size < 2) continue; // same-doc repeats are real spending
    dupGroups++;
    // Keep the earliest-created row; every row from OTHER documents goes.
    const sorted = [...g].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    const keepDoc = sorted[0].documentId;
    for (const r of sorted.slice(1)) if (r.documentId !== keepDoc) excessIds.push(r.id);
  }

  if (excessIds.length === 0) {
    console.log(`[dedupe] nothing to remove (${rows.length} rows, 0 cross-document duplicate groups)`);
    return;
  }

  detachTransactionChildren(db, excessIds);
  for (let i = 0; i < excessIds.length; i += 500) {
    db.delete(transactions).where(inArray(transactions.id, excessIds.slice(i, i + 500))).run();
  }
  console.log(`[dedupe] removed ${excessIds.length} duplicate rows across ${dupGroups} groups (${rows.length} rows scanned)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[dedupe] failed:', err);
    process.exit(1);
  });
