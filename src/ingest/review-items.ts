/**
 * Classification-derived review items (uncategorised / low-confidence) are a
 * projection of `transactions.review_required` — they must be REBUILT, never
 * appended, or re-ingesting/reclassifying duplicates them and the queue count
 * drifts away from reality. Locked-PDF items are attachment-level and are not
 * touched here. Ids are deterministic per transaction so rebuilds are stable.
 */
import 'server-only';
import { eq, inArray } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { transactions, reviewItems } from '@/db/schema';

export function rebuildClassificationReviewItems(db: DB): number {
  const rows = db
    .select({
      id: transactions.id,
      rawDescription: transactions.rawDescription,
      category: transactions.category,
      reason: transactions.classificationReason,
    })
    .from(transactions)
    .where(eq(transactions.reviewRequired, true))
    .all();

  db.transaction((tx) => {
    tx.delete(reviewItems).where(inArray(reviewItems.kind, ['uncategorised', 'low_confidence'])).run();
    for (const r of rows) {
      tx.insert(reviewItems)
        .values({
          id: `rev_txn_${r.id}`.slice(0, 80),
          kind: r.category === 'Uncategorised' ? 'uncategorised' : 'low_confidence',
          refId: r.id,
          title: `Needs a look: ${(r.rawDescription ?? 'transaction').slice(0, 48)}`,
          detail: r.reason ?? '',
          severity: 'info',
          status: 'open',
        })
        .onConflictDoNothing()
        .run();
    }
  });

  return rows.length;
}
