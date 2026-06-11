import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { json, badRequest, assertSameOrigin } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Write a consistent snapshot of the encrypted database into exports/.
 * VACUUM INTO preserves SQLCipher encryption, so the backup file is unreadable
 * without the keychain passphrase — safe to copy anywhere.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const db = await getDb();
    const dir = join(process.cwd(), 'exports');
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = join(dir, `personal-finance-backup-${stamp}.db`);
    db.run(sql`vacuum into ${file}`);
    const bytes = statSync(file).size;
    return json({ ok: true, file: `exports/personal-finance-backup-${stamp}.db`, bytes });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Backup failed.', 500);
  }
}
