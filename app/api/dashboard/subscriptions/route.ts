import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { subscriptionsDetected } from '@/db/schema';
import { subscriptionsRollup } from '@/ledger/rollups';
import { json, badRequest, assertSameOrigin } from '@/server/api';

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

const STATUSES = new Set(['confirmed', 'likely', 'dismissed']);

/** Persist a confirm / dismiss so it survives reloads and re-detection. */
export async function PATCH(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const { id, status } = (await req.json()) as { id?: string; status?: string };
    if (!id || !status || !STATUSES.has(status)) return badRequest('Provide a subscription id and a valid status.');
    const db = await getDb();
    db.update(subscriptionsDetected).set({ status, updatedAt: Date.now() }).where(eq(subscriptionsDetected.id, id)).run();
    return json({ ok: true });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to update subscription.', 500);
  }
}
