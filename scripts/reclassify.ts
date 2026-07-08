/**
 * CLI: re-run classification over every stored transaction (no re-parsing).
 *
 * Use after classifier rules, packs, profile, or overrides change so fixes
 * apply retroactively. Safe to re-run (idempotent given the same inputs).
 *
 * Run: tsx --conditions=react-server scripts/reclassify.ts
 * Rehearse on a copy first:
 *   PF_DB_PATH=exports/<backup>.db tsx --conditions=react-server scripts/reclassify.ts
 */
import { getDb, dbPath } from '@/db/client';
import { reclassifyAll } from '@/ingest/reclassify';

async function main(): Promise<void> {
  const db = await getDb();
  console.log(`[reclassify] db: ${dbPath()}`);
  const res = await reclassifyAll(db);
  console.log(`[reclassify] ${res.changed}/${res.transactions} transactions changed`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[reclassify] failed:', err);
    process.exit(1);
  });
