/**
 * CLI: process downloaded attachments into classified transactions.
 *
 *   npm run ingest
 *
 * Unlock → extract → parse → classify → store. Idempotent (only pending
 * attachments). Run after `npm run gmail:fetch`.
 */
import { getDb } from '@/db/client';
import { runIngest } from '@/ingest/pipeline';

async function main(): Promise<void> {
  const db = await getDb();
  const result = await runIngest(db, {
    onProgress: (e) => process.stdout.write(`\r  ${e.phase}: ${e.message}`.padEnd(80)),
  });
  process.stdout.write('\n');
  console.log(
    `✅ Ingest complete: ${result.documents} documents, ${result.transactions} transactions, ${result.reviewItems} review items.`,
  );
  console.log('   By FY:', result.byFy);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\n[ingest] failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
