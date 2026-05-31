/**
 * Gmail query builder.
 *
 * Turns the India pack's gmail-templates.json (per-provider sender/subject
 * hints + ready-made query fragments) into concrete Gmail search queries,
 * scoped to a financial-year date window and, optionally, filtered to only the
 * providers the household actually uses (so we don't sweep every bank in the
 * country).
 *
 * Read-only by construction: queries only ever search; they never mutate.
 * `buildQueries` is pure given the templates; `loadGmailTemplates` does the fs
 * read so the pure core stays unit-testable.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fyWindow, gmailDayAfter, toGmailDate, type FyKey } from '@/ledger/fy';

export interface GmailTemplate {
  id: string;
  provider_id: string;
  doc_type: string;
  sender_hints: string[];
  subject_hints: string[];
  query_fragments: string[];
  attachment_mime_hints?: string[];
  password_rule_tags?: string[];
}

export interface GmailQuery {
  templateId: string;
  providerId: string;
  docType: string;
  query: string;
  passwordRuleTags: string[];
}

export interface BuildQueriesOptions {
  templates: GmailTemplate[];
  fy: FyKey;
  /** If provided, only build queries for these provider ids (from the profile). */
  providerIds?: string[];
  /** Extra base exclusions appended to every query (deduped against fragments). */
  baseExclusions?: string[];
}

const DEFAULT_EXCLUSIONS = ['-in:spam', '-in:trash'];

function packsRoot(): string {
  return process.env.PF_PACKS_DIR ?? join(process.cwd(), 'packs', 'in');
}

/** Read gmail-templates.json from the India pack. */
export function loadGmailTemplates(dir = packsRoot()): GmailTemplate[] {
  const path = join(dir, 'gmail-templates.json');
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, 'utf8')) as { templates?: GmailTemplate[] };
  return data.templates ?? [];
}

/**
 * Build one query per template, scoped to the FY window. Gmail's `before:` is
 * exclusive, so we pass the day after the FY's last day. Fragments are
 * preserved verbatim (they already encode from:/subject: groupings) and the
 * window + base exclusions are appended without duplication.
 */
export function buildQueries(opts: BuildQueriesOptions): GmailQuery[] {
  const window = fyWindow(opts.fy);
  const exclusions = opts.baseExclusions ?? DEFAULT_EXCLUSIONS;
  const wanted = opts.providerIds ? new Set(opts.providerIds) : null;

  const seen = new Set<string>();
  const out: GmailQuery[] = [];

  for (const t of opts.templates) {
    if (wanted && !wanted.has(t.provider_id)) continue;

    const parts: string[] = [];
    const push = (frag: string) => {
      const f = frag.trim();
      if (f && !parts.includes(f)) parts.push(f);
    };

    for (const frag of t.query_fragments ?? []) push(frag);
    for (const ex of exclusions) push(ex);
    push(`after:${toGmailDate(window.start)}`);
    push(`before:${gmailDayAfter(window.end)}`);

    const query = parts.join(' ');
    if (seen.has(query)) continue;
    seen.add(query);

    out.push({
      templateId: t.id,
      providerId: t.provider_id,
      docType: t.doc_type,
      query,
      passwordRuleTags: t.password_rule_tags ?? [],
    });
  }

  return out;
}
