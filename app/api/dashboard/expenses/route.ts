import { getDb } from '@/db/client';
import { expensesRollup } from '@/ledger/rollups';
import { json, badRequest } from '@/server/api';
import type { FyKey } from '@/ledger/fy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  try {
    const fy = (new URL(req.url).searchParams.get('fy') ?? '2025-26') as FyKey;
    const db = await getDb();
    return json(expensesRollup(db, fy));
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to build expenses.', 500);
  }
}
