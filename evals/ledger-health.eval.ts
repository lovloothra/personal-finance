/**
 * Ledger health eval — data-quality scorecard over the (encrypted) DB.
 *
 * Read-only. Reports the metrics that docs/GOALS.md goals are measured by:
 * account attribution, duplicates, categorisation coverage, transfer hygiene,
 * and classification provenance distribution. Always exits 0 — it is a
 * report, not a gate; goals define their own acceptance thresholds on it.
 *
 * Run:               npm run eval:ledger            (real DB via keychain)
 * Against a copy:    PF_DB_PATH=/tmp/x.db PF_DB_PASSPHRASE=... npm run eval:ledger
 */
import { getDb } from '@/db/client';
import { transactions } from '@/db/schema';
import { signature } from '@/classifier/normalize';

function pct(n: number, total: number): string {
  return total === 0 ? '—' : `${((n / total) * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const db = await getDb();
  const rows = db
    .select({
      id: transactions.id,
      txnDate: transactions.txnDate,
      amount: transactions.amount,
      rawDescription: transactions.rawDescription,
      flow: transactions.flow,
      category: transactions.category,
      confidence: transactions.confidence,
      reviewRequired: transactions.reviewRequired,
      isInternalTransfer: transactions.isInternalTransfer,
      suspectedTransfer: transactions.suspectedTransfer,
      classificationSource: transactions.classificationSource,
      layer: transactions.layer,
      ownAccountId: transactions.ownAccountId,
      fyKey: transactions.fyKey,
    })
    .from(transactions)
    .all();

  const total = rows.length;
  console.log(`\nLedger health — ${total} transactions`);
  if (total === 0) {
    console.log('DB is empty; nothing to score.');
    return;
  }

  // --- Goal 1: account attribution ---------------------------------------
  const noAccount = rows.filter((r) => !r.ownAccountId).length;
  console.log(`\n[accounts]   with ownAccountId: ${total - noAccount}/${total} (${pct(total - noAccount, total)}); missing: ${noAccount}`);

  // --- Goal 2: duplicates (same key the ingest dedup uses, + account) -----
  const groups = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.txnDate}|${r.amount}|${signature(r.rawDescription ?? '')}|${r.ownAccountId ?? ''}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const dupGroups = [...groups.values()].filter((n) => n > 1);
  const excess = dupGroups.reduce((s, n) => s + n - 1, 0);
  console.log(`[duplicates] suspect groups: ${dupGroups.length}; excess rows: ${excess}`);

  // --- Goal 3: categorisation coverage ------------------------------------
  const uncategorised = rows.filter((r) => !r.category || r.category.toLowerCase() === 'uncategorised').length;
  const inReview = rows.filter((r) => r.reviewRequired).length;
  const confHist = new Map<string, number>();
  for (const r of rows) confHist.set(r.confidence ?? 'null', (confHist.get(r.confidence ?? 'null') ?? 0) + 1);
  console.log(`[categories] uncategorised: ${uncategorised} (${pct(uncategorised, total)}); review queue: ${inReview} (${pct(inReview, total)})`);
  console.log(`[confidence] ${[...confHist.entries()].map(([k, n]) => `${k}:${n}`).join(' ')}`);

  // --- Transfer hygiene ----------------------------------------------------
  const suspected = rows.filter((r) => r.suspectedTransfer).length;
  const internal = rows.filter((r) => r.isInternalTransfer).length;
  console.log(`[transfers]  internal (linked): ${internal}; suspected (unresolved): ${suspected}`);

  // --- Provenance distribution ---------------------------------------------
  const srcHist = new Map<string, number>();
  const layerHist = new Map<string, number>();
  for (const r of rows) {
    srcHist.set(r.classificationSource ?? 'null', (srcHist.get(r.classificationSource ?? 'null') ?? 0) + 1);
    layerHist.set(String(r.layer ?? '-'), (layerHist.get(String(r.layer ?? '-')) ?? 0) + 1);
  }
  console.log(`[source]     ${[...srcHist.entries()].map(([k, n]) => `${k}:${n}`).join(' ')}`);
  console.log(`[layers]     ${[...layerHist.entries()].sort().map(([k, n]) => `L${k}:${n}`).join(' ')}`);

  // --- FY coverage -----------------------------------------------------------
  const fyHist = new Map<string, number>();
  for (const r of rows) fyHist.set(r.fyKey ?? 'null', (fyHist.get(r.fyKey ?? 'null') ?? 0) + 1);
  console.log(`[fy]         ${[...fyHist.entries()].sort().map(([k, n]) => `${k}:${n}`).join(' ')}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[ledger-health] failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
