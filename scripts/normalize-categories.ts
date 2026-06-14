/**
 * One-time backfill: fold existing free-form transaction categories onto the
 * canonical taxonomy. Idempotent — running twice is a no-op.
 * Run: tsx --conditions=react-server scripts/normalize-categories.ts
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { transactions } from '@/db/schema';
import { normalizeCategory } from '@/classifier/taxonomy';

async function main(): Promise<void> {
  const db = await getDb();
  const rows = db.select({ id: transactions.id, category: transactions.category }).from(transactions).all();
  let updated = 0;
  db.transaction((tx) => {
    for (const r of rows) {
      const canon = normalizeCategory(r.category);
      if (canon !== r.category) {
        tx.update(transactions).set({ category: canon }).where(eq(transactions.id, r.id)).run();
        updated++;
      }
    }
  });
  console.log(`normalized ${updated}/${rows.length} categories`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[normalize-categories] failed:', err);
    process.exit(1);
  });
