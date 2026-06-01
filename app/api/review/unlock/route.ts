import { inArray, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { attachments, documentPasswords, reviewItems } from '@/db/schema';
import { runIngest } from '@/ingest/pipeline';
import { json, badRequest, assertSameOrigin } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Add a document password and retry every locked statement with it (plus the
 * profile-derived candidates). Re-ingests only the previously locked/failed
 * attachments, so already-parsed statements aren't touched.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const body = (await req.json()) as { password?: string; label?: string };
    const password = body.password?.trim();
    if (!password) return badRequest('Provide the document password.');

    const db = await getDb();

    // Store the password (deduped by value) so it's tried on this and future runs.
    const existing = db.select({ id: documentPasswords.id }).from(documentPasswords).where(eq(documentPasswords.value, password)).get();
    if (!existing) {
      db.insert(documentPasswords).values({ id: `pw_${Date.now().toString(36)}`, value: password, label: body.label ?? null }).run();
    }

    // Retry only the unresolved attachments (locked/scanned/failed) — leave the
    // already-extracted ones alone. Idempotent re-ingest avoids any duplicates.
    const lockedBefore = db.select({ n: sql<number>`count(*)` }).from(reviewItems).where(eq(reviewItems.kind, 'locked_pdf')).get()?.n ?? 0;
    db.update(attachments).set({ status: 'pending' }).where(inArray(attachments.status, ['review', 'failed'])).run();

    const result = await runIngest(db);

    const stillLocked = db.select({ n: sql<number>`count(*)` }).from(reviewItems).where(eq(reviewItems.kind, 'locked_pdf')).get()?.n ?? 0;
    const unlocked = Math.max(0, lockedBefore - stillLocked);

    return json({ ok: true, unlocked, stillLocked, transactions: result.transactions, documents: result.documents });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Unlock failed.', 500);
  }
}
