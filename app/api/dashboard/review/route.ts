import { getDb } from '@/db/client';
import { reviewRollup } from '@/ledger/rollups';
import { json, badRequest } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const db = await getDb();
    return json(reviewRollup(db));
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to build review queue.', 500);
  }
}
