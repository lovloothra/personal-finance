/**
 * Ledger-wide internal-transfer relink (additive).
 *
 * Batch-time linking only sees the current run, so a self-transfer whose
 * debit leg was imported in run 1 and credit leg in run 2 never paired —
 * the debit counted as expense and the credit as income. This pass runs
 * after every ingest over the WHOLE ledger (mirroring the reclassify path)
 * and:
 *   - rebuilds internal_transfer_links from the full pair set;
 *   - stamps rows that are NEWLY transfers (flow/category/isInternalTransfer,
 *     clears suspectedTransfer + review);
 *   - marks newly suspected round-number credits for review.
 * It is ADDITIVE only: it never un-marks an existing transfer — full
 * re-derivation (including removals) is `reclassifyAll`'s job.
 */
import 'server-only';
import { inArray } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { counterparties as counterpartiesTable, internalTransferLinks, transactions } from '@/db/schema';
import { linkInternalTransfers } from '@/classifier/transfers';
import { resolveCounterparty, type CounterpartyEntry } from '@/classifier/counterparties';
import { loadProfileSeed } from '@/profile/signals';

export interface RelinkResult {
  newlyLinked: number;
  newlySuspected: number;
  links: number;
}

export function relinkTransfersLedgerWide(db: DB): RelinkResult {
  const rows = db
    .select({
      id: transactions.id,
      txnDate: transactions.txnDate,
      amount: transactions.amount,
      rawDescription: transactions.rawDescription,
      documentId: transactions.documentId,
      flow: transactions.flow,
      merchant: transactions.merchant,
      ownAccountId: transactions.ownAccountId,
      counterpartyRaw: transactions.counterpartyRaw,
      isInternalTransfer: transactions.isInternalTransfer,
      suspectedTransfer: transactions.suspectedTransfer,
    })
    .from(transactions)
    .all();

  const cpRegistry: CounterpartyEntry[] = db
    .select()
    .from(counterpartiesTable)
    .all()
    .map((c) => ({ id: c.id, kind: c.kind, isOwnMoney: c.isOwnMoney, matchers: c.matchers ?? undefined }));

  let selfNames: string[] = [];
  try {
    const seed = loadProfileSeed();
    selfNames = [seed.personal.fullName, seed.spouse?.fullName]
      .filter(Boolean)
      .flatMap((n) => (n as string).split(/\s+/))
      .filter((tok) => tok.length >= 3);
  } catch {
    selfNames = [];
  }

  const transfer = linkInternalTransfers(
    rows.map((r) => ({
      id: r.id,
      date: r.txnDate,
      amount: r.amount,
      rawDescription: r.rawDescription ?? '',
      documentId: r.documentId,
      flow: r.flow ?? undefined,
      ownAccountId: r.ownAccountId,
      counterpartyKind: resolveCounterparty(r.counterpartyRaw, cpRegistry).counterpartyKind,
      merchant: r.merchant,
    })),
    { selfNames },
  );

  const newlyTransfer = rows.filter((r) => transfer.transferIds.has(r.id) && !r.isInternalTransfer).map((r) => r.id);
  const newlySuspected = rows
    .filter((r) => transfer.suspectedIds.has(r.id) && !r.suspectedTransfer && !r.isInternalTransfer)
    .map((r) => r.id);

  db.transaction((tx) => {
    for (let i = 0; i < newlyTransfer.length; i += 500) {
      tx.update(transactions)
        .set({
          flow: 'transfer',
          category: 'Transfer',
          isInternalTransfer: true,
          suspectedTransfer: false,
          reviewRequired: false,
          classificationReason:
            'Internal transfer: matched to its opposite leg across statements (cross-run relink). Excluded from income/expense rollups.',
          updatedAt: Date.now(),
        })
        .where(inArray(transactions.id, newlyTransfer.slice(i, i + 500)))
        .run();
    }
    for (let i = 0; i < newlySuspected.length; i += 500) {
      tx.update(transactions)
        .set({ suspectedTransfer: true, reviewRequired: true, updatedAt: Date.now() })
        .where(inArray(transactions.id, newlySuspected.slice(i, i + 500)))
        .run();
    }

    // Rebuild the links table from the full ledger-wide pair set.
    tx.delete(internalTransferLinks).run();
    for (const link of transfer.links) {
      tx.insert(internalTransferLinks)
        .values({
          id: `lnk_${link.debitId}_${link.creditId}`.slice(0, 80),
          kind: link.kind,
          debitTxnId: link.debitId,
          creditTxnId: link.creditId,
          confidence: 'high',
        })
        .onConflictDoNothing()
        .run();
    }
  });

  return { newlyLinked: newlyTransfer.length, newlySuspected: newlySuspected.length, links: transfer.links.length };
}
