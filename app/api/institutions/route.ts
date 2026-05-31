import { and, eq, like, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { institutions } from '@/db/schema';
import { json } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Search institutions for the onboarding pickers so users never hand-type pack
 * ids. GET /api/institutions?q=hdfc&category=bank&limit=20
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const category = url.searchParams.get('category') ?? undefined;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 50);

  const db = await getDb();
  const filters = [] as ReturnType<typeof eq>[];
  if (category) filters.push(eq(institutions.category, category));
  if (q) {
    filters.push(
      or(
        like(sql`lower(${institutions.displayName})`, `%${q}%`),
        like(sql`lower(${institutions.id})`, `%${q}%`),
        like(sql`lower(${institutions.aliases})`, `%${q}%`),
      )!,
    );
  }

  const rows = db
    .select({ id: institutions.id, displayName: institutions.displayName, category: institutions.category, type: institutions.type })
    .from(institutions)
    .where(filters.length ? and(...filters) : undefined)
    .limit(limit)
    .all();

  return json({ institutions: rows });
}
