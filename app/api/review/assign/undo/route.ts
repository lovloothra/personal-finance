import { desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { reviewUndoJournal } from '@/db/schema';
import { detectSubscriptions } from '@/ledger/subscriptions';
import { rebuildClassificationReviewItems } from '@/ingest/review-items';
import { json, badRequest, assertSameOrigin } from '@/server/api';
import { isUndoSnapshot, restoreSnapshot } from '@/review/undo-journal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function latestUnconsumed(db: Awaited<ReturnType<typeof getDb>>) {
  return db
    .select()
    .from(reviewUndoJournal)
    .where(isNull(reviewUndoJournal.consumedAt))
    .orderBy(desc(reviewUndoJournal.createdAt), desc(reviewUndoJournal.id))
    .limit(1)
    .get();
}

/** The most recent undoable assignment's op id (or null) — lets the client
 * re-hydrate its undo affordance after a reload; the journal is the source
 * of truth, not client storage. */
export async function GET(): Promise<Response> {
  try {
    const db = await getDb();
    const row = latestUnconsumed(db);
    return json({ opId: row?.id ?? null });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Undo lookup failed.', 500);
  }
}

/**
 * Undo the MOST RECENT assignment, exactly: restore every snapshotted row to
 * its prior state (created rows are deleted, updated rows get their prior
 * values back — assign upserts, so deletion alone would destroy pre-existing
 * overrides/aliases/feedback). Only the latest unconsumed op is eligible;
 * anything older is refused rather than partially unwound.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const body = (await req.json().catch(() => ({}))) as { opId?: string };
    if (!body.opId) return badRequest('Provide the opId returned by the assignment.');

    const db = await getDb();
    const latest = latestUnconsumed(db);
    if (!latest) return badRequest('Nothing to undo.', 409);
    if (latest.id !== body.opId) {
      return badRequest('Only the most recent assignment can be undone.', 409);
    }
    if (!isUndoSnapshot(latest.payload)) {
      return badRequest('Undo record is unreadable — the assignment stands.', 500);
    }
    const snap = latest.payload;

    let restoredTxns = 0;
    db.transaction((tx) => {
      ({ restoredTxns } = restoreSnapshot(tx, snap));
      tx.update(reviewUndoJournal)
        .set({ consumedAt: Date.now() })
        .where(eq(reviewUndoJournal.id, latest.id))
        .run();
    });

    // Projections after commit — same contract as assign: the undo is
    // committed even if the derived views need another pass.
    let projectionSynced = true;
    let warning: string | undefined;
    try {
      detectSubscriptions(db);
      rebuildClassificationReviewItems(db);
    } catch (err) {
      projectionSynced = false;
      warning = `Undo applied, but refreshing derived views failed: ${err instanceof Error ? err.message : String(err)}. They'll self-heal on the next assign or reclassify.`;
    }

    return json({ ok: true, restored: restoredTxns, projectionSynced, ...(warning ? { warning } : {}) });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Undo failed.', 500);
  }
}
