import { getDb } from '@/db/client';
import { availableFys } from '@/ledger/rollups';
import { json, badRequest } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const db = await getDb();
    const fys = availableFys(db);
    return json({ fys, latest: fys[0] ?? null });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to list FYs.', 500);
  }
}
