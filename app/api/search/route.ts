import { getDb } from '@/db/client';
import { searchTransactions } from '@/ledger/rollups';
import { json, badRequest } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  try {
    const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
    if (q.length < 2) return json({ q, results: [] });
    const db = await getDb();
    return json({ q, results: searchTransactions(db, q) });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Search failed.', 500);
  }
}
