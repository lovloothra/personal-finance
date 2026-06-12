import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { attachments } from '@/db/schema';
import { loadPacksIntoDb } from '@/packs/loader';
import { reclassifyAll } from '@/ingest/reclassify';
import { runIngest } from '@/ingest/pipeline';
import { json, badRequest, assertSameOrigin } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Refresh pack data and re-run classification across all stored transactions.
 *
 * Default: re-classify only — applies new overrides, pack aliases, and rule
 * changes without touching the original PDFs.
 *
 * With `{ "reparse": true }`: every already-extracted statement goes back
 * through the parser first (PDF text → rows → transactions), then the whole
 * ledger re-classifies. Use after parser improvements; idempotent because
 * document and transaction ids are deterministic per attachment.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const body = (await req.json().catch(() => ({}))) as { reparse?: boolean };
    const db = await getDb();
    loadPacksIntoDb(db);

    if (body?.reparse) {
      db.update(attachments).set({ status: 'pending' }).where(eq(attachments.status, 'extracted')).run();
      const result = await runIngest(db);
      return json({ ok: true, reparsed: true, documents: result.documents, transactions: result.transactions, duplicatesDropped: result.duplicatesDropped });
    }

    const result = reclassifyAll(db);
    return json({ ok: true, ...result });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Reclassify failed.', 500);
  }
}
