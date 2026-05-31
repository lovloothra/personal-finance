/**
 * CLI: fetch Gmail statements/receipts for a financial year.
 *
 *   npm run gmail:fetch -- --fy=2025-26 [--all] [--yes]
 *
 * Pipeline: profile seed → provider ids → gmail templates → FY-scoped queries
 * → authorized client → metadata estimate → consent gate (>1 GB needs --yes)
 * → download messages + attachments (SHA-256 deduped) to ./attachments.
 *
 * --all   ignore the profile's provider filter and query every template
 * --yes   pre-approve the download even if it exceeds the 1 GB consent gate
 */
import { getDb } from '@/db/client';
import { getAuthedClient } from '@/gmail/oauth';
import { loadGmailTemplates, buildQueries } from '@/gmail/query-builder';
import { estimateRun, fetchRun } from '@/gmail/fetcher';
import { evaluateConsent } from '@/gmail/consent-gate';
import { loadProfileSeed, providerIds } from '@/profile/signals';
import type { FyKey } from '@/ledger/fy';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main(): Promise<void> {
  const fy = (arg('fy') ?? '2025-26') as FyKey;
  const seed = loadProfileSeed();
  const templates = loadGmailTemplates();
  const ids = flag('all') ? undefined : providerIds(seed);
  const queries = buildQueries({ templates, fy, providerIds: ids });

  if (queries.length === 0) {
    console.log('No matching templates for your providers. Try --all, or add accounts to your profile.');
    return;
  }
  console.log(`FY ${fy}: ${queries.length} queries (providers: ${ids ? ids.join(', ') : 'ALL'})`);

  const db = await getDb();
  const auth = await getAuthedClient(db);

  console.log('Estimating download size (metadata pass)…');
  const estimate = await estimateRun(auth, queries, (e) => {
    if (e.phase === 'estimate') process.stdout.write(`\r  ${e.messageCount} messages, ~${e.bytes} bytes`);
  });
  process.stdout.write('\n');

  const consent = evaluateConsent(estimate.bytesEstimated);
  console.log(`Estimate: ${estimate.messageCount} messages, ${consent.humanEstimate}.`);
  if (consent.required && !flag('yes')) {
    console.log(
      `\n⚠️  This exceeds the ${(consent.thresholdBytes / 1e9).toFixed(0)} GB consent gate.\n` +
        'Re-run with --yes to approve the download.',
    );
    return;
  }

  console.log('Downloading…');
  const result = await fetchRun(auth, db, estimate, {
    fyKey: fy,
    bytesEstimated: estimate.bytesEstimated,
    onProgress: (e) => {
      if (e.phase === 'fetch' || e.phase === 'attachment') {
        process.stdout.write(`\r  ${e.messageCount ?? '—'} msgs, ${e.attachmentCount ?? 0} attachments`);
      }
    },
  });
  process.stdout.write('\n');
  console.log(
    `✅ Done. ${result.messageCount} messages, ${result.attachmentCount} attachments → ./attachments (run ${result.runId}).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\n[gmail:fetch] failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
