/**
 * Country-pack loader.
 *
 * Reads the existing India pack seed JSON under packs/in/*.json (the files,
 * schema, validator, and refresh script that already shipped) and projects them
 * into two DB tables:
 *
 *   - institutions     — every provider/issuer/product/merchant entity, with
 *                        source = 'pack:in' so user-added rows can coexist.
 *   - merchant_aliases — one row per merchant alias, feeding classifier layer 4.
 *
 * Pack rows are treated as read-only system rows: upserts only touch rows whose
 * source is 'pack:in', never user rows. The normalization step is a pure
 * function (readPacks) so it can be unit-tested without opening the DB.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, notInArray } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { institutions, merchantAliases } from '@/db/schema';

const PACK_ID = 'in';
const PACK_SOURCE = 'pack:in' as const;

/** Patterns are matched as case-insensitive substrings, so a 1–3 char name
 * ("Vi", "Jio", "Ola") would match inside thousands of unrelated descriptors.
 * Require ≥ 4 chars; shorter brands rely on their longer aliases. */
const MIN_ALIAS_LEN = 4;

export interface SeedRow {
  id: string;
  display_name: string;
  legal_name?: string;
  category: string;
  type?: string;
  aliases?: string[];
  sources?: unknown[];
  confidence?: 'high' | 'med' | 'medium' | 'low';
  status?: string;
  issuer_id?: string;
  provider_id?: string;
}

export interface NormalizedInstitution {
  id: string;
  displayName: string;
  legalName: string | null;
  category: string;
  type: string | null;
  aliases: string[];
  sources: unknown[];
  confidence: 'high' | 'med' | 'low';
  status: string;
  source: typeof PACK_SOURCE;
  packVersion: string | null;
}

export interface NormalizedAlias {
  id: string;
  pattern: string;
  canonicalMerchant: string;
  category: string | null;
  subcategory: string | null;
  source: typeof PACK_SOURCE;
  confidence: 'high' | 'med' | 'low';
}

export interface PackData {
  institutions: NormalizedInstitution[];
  aliases: NormalizedAlias[];
}

function packsRoot(): string {
  return process.env.PF_PACKS_DIR ?? join(process.cwd(), 'packs', PACK_ID);
}

function normConfidence(c?: string): 'high' | 'med' | 'low' {
  if (c === 'low') return 'low';
  if (c === 'med' || c === 'medium') return 'med';
  return 'high';
}

function toInstitution(row: SeedRow, version: string | null): NormalizedInstitution {
  return {
    id: row.id,
    displayName: row.display_name,
    legalName: row.legal_name ?? null,
    category: row.category,
    type: row.type ?? null,
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    sources: Array.isArray(row.sources) ? row.sources : [],
    confidence: normConfidence(row.confidence),
    status: row.status ?? 'active',
    source: PACK_SOURCE,
    packVersion: version,
  };
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Split a dotted taxonomy like "expenses.transport.cabs" into a category and
 * subcategory. We keep the human-meaningful tail two segments.
 */
function splitTaxonomy(taxonomy?: string): { category: string | null; subcategory: string | null } {
  if (!taxonomy) return { category: null, subcategory: null };
  const parts = taxonomy.split('.');
  if (parts.length === 1) return { category: parts[0], subcategory: null };
  return {
    category: parts.slice(0, -1).join('.'),
    subcategory: parts[parts.length - 1],
  };
}

/**
 * Read and normalize all pack files. Pure — no DB access. Returns the full set
 * of institution rows and merchant-alias rows ready to upsert.
 */
export function readPacks(dir = packsRoot()): PackData {
  const out: PackData = { institutions: [], aliases: [] };
  if (!existsSync(dir)) return out;

  const readJson = (path: string): Record<string, unknown> =>
    JSON.parse(readFileSync(path, 'utf8'));

  // Top-level provider packs: providers[] (banks, brokers, insurers,
  // investment-platforms, lenders).
  for (const file of ['banks', 'brokers', 'insurers', 'investment-platforms', 'lenders']) {
    const path = join(dir, `${file}.json`);
    if (!existsSync(path)) continue;
    const data = readJson(path);
    const version = (data.version as string) ?? null;
    for (const row of (data.providers as SeedRow[]) ?? []) {
      out.institutions.push(toInstitution(row, version));
    }
  }

  // Credit cards: issuers[] + products[].
  const ccPath = join(dir, 'credit-cards.json');
  if (existsSync(ccPath)) {
    const data = readJson(ccPath);
    const version = (data.version as string) ?? null;
    for (const row of (data.issuers as SeedRow[]) ?? []) {
      out.institutions.push(toInstitution(row, version));
    }
    for (const row of (data.products as SeedRow[]) ?? []) {
      out.institutions.push(toInstitution(row, version));
    }
  }

  // Merchant packs under merchants/*.json: merchants[] with a dotted category.
  const merchantsDir = join(dir, 'merchants');
  if (existsSync(merchantsDir)) {
    for (const fname of readdirSync(merchantsDir)) {
      if (!fname.endsWith('.json')) continue;
      const data = readJson(join(merchantsDir, fname));
      const version = (data.version as string) ?? null;
      const { category, subcategory } = splitTaxonomy(data.category as string | undefined);
      for (const row of (data.merchants as SeedRow[]) ?? []) {
        out.institutions.push(toInstitution(row, version));
        const confidence = normConfidence(row.confidence);
        const aliasSet = new Set<string>([row.display_name, ...(row.aliases ?? [])]);
        for (const alias of aliasSet) {
          if (!alias || alias.trim().length < MIN_ALIAS_LEN) continue;
          out.aliases.push({
            id: `${row.id}:${slug(alias)}`,
            pattern: alias.toLowerCase(),
            canonicalMerchant: row.display_name,
            category,
            subcategory,
            source: PACK_SOURCE,
            confidence,
          });
        }
      }
    }
  }

  // A merchant (and therefore an alias slug) can legitimately appear in more
  // than one merchant pack. Collapse by id, last-write-wins, so the emitted
  // rows are exactly what lands in the DB.
  return {
    institutions: dedupeById(out.institutions),
    aliases: dedupeById(out.aliases),
  };
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of rows) map.set(r.id, r);
  return [...map.values()];
}

/**
 * Upsert pack data into the DB. Only pack-sourced rows are inserted/updated;
 * user rows (source = 'user') are never touched. Returns counts loaded.
 */
export function loadPacksIntoDb(db: DB, dir = packsRoot()): { institutions: number; aliases: number } {
  const data = readPacks(dir);

  db.transaction((tx) => {
    for (const r of data.institutions) {
      const ts = Date.now();
      tx
        .insert(institutions)
        .values({
          id: r.id,
          displayName: r.displayName,
          legalName: r.legalName,
          category: r.category,
          type: r.type,
          aliases: r.aliases,
          sources: r.sources,
          confidence: r.confidence,
          status: r.status,
          source: r.source,
          packVersion: r.packVersion,
          updatedAt: ts,
        })
        .onConflictDoUpdate({
          target: institutions.id,
          set: {
            displayName: r.displayName,
            legalName: r.legalName,
            category: r.category,
            type: r.type,
            aliases: r.aliases,
            sources: r.sources,
            confidence: r.confidence,
            status: r.status,
            source: r.source,
            packVersion: r.packVersion,
            updatedAt: ts,
          },
          // Never clobber a row a user has taken ownership of.
          setWhere: eq(institutions.source, PACK_SOURCE),
        })
        .run();
    }

    for (const r of data.aliases) {
      const ts = Date.now();
      tx
        .insert(merchantAliases)
        .values({
          id: r.id,
          pattern: r.pattern,
          canonicalMerchant: r.canonicalMerchant,
          category: r.category,
          subcategory: r.subcategory,
          source: r.source,
          confidence: r.confidence,
          updatedAt: ts,
        })
        .onConflictDoUpdate({
          target: merchantAliases.id,
          set: {
            pattern: r.pattern,
            canonicalMerchant: r.canonicalMerchant,
            category: r.category,
            subcategory: r.subcategory,
            source: r.source,
            confidence: r.confidence,
            updatedAt: ts,
          },
          setWhere: eq(merchantAliases.source, PACK_SOURCE),
        })
        .run();
    }

    // Purge stale pack aliases that this load no longer emits (renamed,
    // removed, or dropped for being too short) — keeps the table self-healing.
    // User-owned rows (source != pack:in) are never touched.
    const liveIds = data.aliases.map((r) => r.id);
    if (liveIds.length) {
      tx.delete(merchantAliases)
        .where(and(eq(merchantAliases.source, PACK_SOURCE), notInArray(merchantAliases.id, liveIds)))
        .run();
    }
  });

  return { institutions: data.institutions.length, aliases: data.aliases.length };
}
