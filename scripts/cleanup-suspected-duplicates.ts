/**
 * One-time historical cleanup for token-prefix narration drift across
 * overlapping statements. Dry-run is the default; deletion requires --apply.
 *
 * Dry-run on a safe copy:
 *   PF_DB_PATH=/tmp/pf-cleanup-rehearsal.db PF_DB_PASSPHRASE=... \
 *     tsx --conditions=react-server scripts/cleanup-suspected-duplicates.ts
 * Apply to that safe copy:
 *   PF_DB_PATH=/tmp/pf-cleanup-rehearsal.db PF_DB_PASSPHRASE=... \
 *     tsx --conditions=react-server scripts/cleanup-suspected-duplicates.ts --apply
 *
 * Never run --apply against the real DB without a fresh backup, an approved
 * printed deletion set, and explicit owner approval.
 */
import { dbPath, getDb } from '@/db/client';
import { applyDuplicateCleanup, planDuplicateCleanup } from '@/ingest/duplicate-cleanup';

function printPair(pair: ReturnType<typeof planDuplicateCleanup>['pairs'][number], index: number): void {
  console.log(`[cleanup] pair ${index + 1}`);
  console.log(`  keep:   ${pair.keeper.id} | ${pair.keeper.docId} | ${pair.keeper.date} | ${pair.keeper.amount}`);
  console.log(`          ${pair.keeper.rawDescription}`);
  console.log(`  remove: ${pair.candidate.id} | ${pair.candidate.docId} | ${pair.candidate.date} | ${pair.candidate.amount}`);
  console.log(`          ${pair.candidate.rawDescription}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== '--apply');
  if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(', ')}. Only --apply is supported.`);
  const apply = args.includes('--apply');
  const db = await getDb();
  console.log(`[cleanup] db: ${dbPath()}`);
  console.log(`[cleanup] mode: ${apply ? 'APPLY' : 'DRY RUN'}`);

  const plan = planDuplicateCleanup(db);
  plan.pairs.forEach(printPair);
  if (!apply) {
    console.log(`[cleanup] would remove ${plan.pairs.length}/${plan.totalRows} rows; ${plan.keptDecisionsSkipped} kept decision(s) skipped`);
    console.log('[cleanup] no changes written; pass --apply only after reviewing this exact set');
    return;
  }

  const result = applyDuplicateCleanup(db);
  console.log(`[cleanup] removed ${result.removed}/${result.totalRows} rows; ${result.totalAfter} remain; ${result.keptDecisionsSkipped} kept decision(s) skipped`);
}

main().catch((error) => {
  console.error('[cleanup] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
