import { getDb } from '@/db/client';
import { loadPacksIntoDb } from '@/packs/loader';
import { reclassifyAll } from '@/ingest/reclassify';
import { json, badRequest, assertSameOrigin } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Refresh pack data and re-run classification across all stored transactions.
 * Applies new overrides, pack aliases, and rule changes to existing data
 * without touching the original PDFs.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const db = await getDb();
    loadPacksIntoDb(db);
    const result = reclassifyAll(db);
    return json({ ok: true, ...result });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Reclassify failed.', 500);
  }
}
