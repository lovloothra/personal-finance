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
  accountClassified: number;
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
      category: transactions.category,
      subcategory: transactions.subcategory,
      merchant: transactions.merchant,
      ownAccountId: transactions.ownAccountId,
      ownAccountKind: transactions.ownAccountKind,
      counterpartyRaw: transactions.counterpartyRaw,
      isInternalTransfer: transactions.isInternalTransfer,
      suspectedTransfer: transactions.suspectedTransfer,
      layer: transactions.layer,
      classificationReason: transactions.classificationReason,
      profileSignalUsed: transactions.profileSignalUsed,
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
      category: r.category,
      ownAccountId: r.ownAccountId,
      ownAccountKind: r.ownAccountKind,
      counterpartyKind: resolveCounterparty(r.counterpartyRaw, cpRegistry).counterpartyKind,
      merchant: r.merchant,
    })),
    { selfNames },
  );

  const newlyTransfer = rows.filter((r) => transfer.transferIds.has(r.id) && !r.isInternalTransfer).map((r) => r.id);
  const newlySuspected = rows
    .filter((r) => transfer.suspectedIds.has(r.id) && !r.suspectedTransfer && !r.isInternalTransfer)
    .map((r) => r.id);
  const accountClassified = rows.filter((r) => {
    const c = transfer.accountClassifications.get(r.id);
    return c && (
      r.flow !== c.flow
      || r.category !== c.category
      || r.subcategory !== c.subcategory
      || r.merchant !== null
      || r.isInternalTransfer !== (c.isInternalTransfer ?? false)
      || r.suspectedTransfer
      || r.classificationReason !== c.reason
      || r.profileSignalUsed !== c.signal
      || r.layer !== c.layer
    );
  });

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
    for (const row of accountClassified) {
      const c = transfer.accountClassifications.get(row.id)!;
      tx.update(transactions)
        .set({
          flow: c.flow,
          category: c.category,
          subcategory: c.subcategory,
          merchant: null,
          confidence: c.confidence,
          layer: c.layer,
          classificationSource: 'deterministic',
          acceptedPredictionId: null,
          classificationReason: c.reason,
          profileSignalUsed: c.signal,
          isInternalTransfer: c.isInternalTransfer ?? false,
          suspectedTransfer: false,
          reviewRequired: false,
          updatedAt: Date.now(),
        })
        .where(inArray(transactions.id, [row.id]))
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

  return {
    newlyLinked: newlyTransfer.length,
    newlySuspected: newlySuspected.length,
    accountClassified: accountClassified.length,
    links: transfer.links.length,
  };
}
