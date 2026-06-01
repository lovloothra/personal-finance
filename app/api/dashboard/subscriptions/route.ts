import { getDb } from '@/db/client';
import { subscriptionsRollup } from '@/ledger/rollups';
import { json, badRequest } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const db = await getDb();
    return json(subscriptionsRollup(db));
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to build subscriptions.', 500);
  }
}
