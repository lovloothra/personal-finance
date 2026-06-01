import { getDb } from '@/db/client';
import { sourcesRollup } from '@/ledger/rollups';
import { json, badRequest } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const db = await getDb();
    return json(sourcesRollup(db));
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to build sources.', 500);
  }
}
