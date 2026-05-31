/**
 * Server-side glue for the onboarding import: turn the saved profile into
 * FY-scoped Gmail queries and resolve provider display names for the UI.
 */
import 'server-only';
import { inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { institutions } from '@/db/schema';
import { loadProfileSeed, providerIds } from '@/profile/signals';
import { loadGmailTemplates, buildQueries, type GmailQuery } from '@/gmail/query-builder';
import type { FyKey } from '@/ledger/fy';

export interface ProfileQueries {
  queries: GmailQuery[];
  providerIds: string[];
}

/** Build the FY queries for the saved profile (or all templates with `all`). */
export function buildProfileQueries(fy: FyKey, all = false): ProfileQueries {
  const seed = loadProfileSeed();
  const ids = all ? undefined : providerIds(seed);
  const templates = loadGmailTemplates();
  const queries = buildQueries({ templates, fy, providerIds: ids });
  return { queries, providerIds: ids ?? [] };
}

/** Map provider ids to human display names for the "senders detected" summary. */
export async function providerDisplayNames(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  return db
    .select({ name: institutions.displayName })
    .from(institutions)
    .where(inArray(institutions.id, ids))
    .all()
    .map((r) => r.name);
}
