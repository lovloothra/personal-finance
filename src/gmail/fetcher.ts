/**
 * Gmail fetcher (read-only).
 *
 * Runs the FY-scoped queries against the Gmail API, records messages, and
 * downloads PDF/attachment bytes to ./attachments with SHA-256 dedupe. Writes
 * gmail_runs / gmail_messages / attachments rows. Emits progress events so the
 * CLI (and later the onboarding SSE route) can show live status.
 *
 * Read-only by construction — only messages.list / messages.get /
 * attachments.get are called; nothing is ever modified or sent.
 */
import 'server-only';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { google, type gmail_v1 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { eq } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { gmailRuns, gmailMessages, attachments } from '@/db/schema';
import type { GmailQuery } from './query-builder';

export interface ProgressEvent {
  phase: 'estimate' | 'fetch' | 'attachment' | 'done' | 'error';
  message: string;
  messageCount?: number;
  attachmentCount?: number;
  bytes?: number;
}
export type ProgressFn = (e: ProgressEvent) => void;

function attachmentsDir(): string {
  return process.env.PF_ATTACHMENTS_DIR ?? join(process.cwd(), 'attachments');
}

function gmailFor(auth: OAuth2Client): gmail_v1.Gmail {
  return google.gmail({ version: 'v1', auth });
}

/** List every message id matching a query, following pagination. */
async function listMessageIds(gmail: gmail_v1.Gmail, q: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({ userId: 'me', q, maxResults: 500, pageToken });
    for (const m of res.data.messages ?? []) if (m.id) ids.push(m.id);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return ids;
}

/** Walk a payload tree collecting attachment parts (filename + attachmentId). */
function collectAttachmentParts(payload?: gmail_v1.Schema$MessagePart): gmail_v1.Schema$MessagePart[] {
  if (!payload) return [];
  const out: gmail_v1.Schema$MessagePart[] = [];
  const walk = (part: gmail_v1.Schema$MessagePart) => {
    if (part.filename && part.body?.attachmentId) out.push(part);
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);
  return out;
}

function header(payload: gmail_v1.Schema$MessagePart | undefined, name: string): string | undefined {
  return payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
}

export interface RunEstimate {
  messageIdsByQuery: { query: GmailQuery; ids: string[] }[];
  messageCount: number;
  bytesEstimated: number;
}

/**
 * Cheap metadata pass: collect matching message ids and sum their sizeEstimate
 * to estimate total download size for the consent gate.
 */
export async function estimateRun(
  auth: OAuth2Client,
  queries: GmailQuery[],
  onProgress: ProgressFn = () => {},
): Promise<RunEstimate> {
  const gmail = gmailFor(auth);
  const messageIdsByQuery: { query: GmailQuery; ids: string[] }[] = [];
  const seen = new Set<string>();
  let bytesEstimated = 0;

  for (const q of queries) {
    const ids = await listMessageIds(gmail, q.query);
    messageIdsByQuery.push({ query: q, ids });
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const res = await gmail.users.messages.get({ userId: 'me', id, format: 'minimal' });
      bytesEstimated += res.data.sizeEstimate ?? 0;
    }
    onProgress({ phase: 'estimate', message: `Estimated ${q.providerId}`, messageCount: seen.size, bytes: bytesEstimated });
  }

  return { messageIdsByQuery, messageCount: seen.size, bytesEstimated };
}

export interface FetchResult {
  runId: string;
  messageCount: number;
  attachmentCount: number;
  bytesDownloaded: number;
}

/**
 * Download messages + attachments for an already-estimated run. Dedupes
 * attachments by SHA-256 (so re-runs are cheap) and records everything in the
 * DB. `estimate` should come from estimateRun (after the consent gate passed).
 */
export async function fetchRun(
  auth: OAuth2Client,
  db: DB,
  estimate: RunEstimate,
  opts: { fyKey?: string; bytesEstimated?: number; onProgress?: ProgressFn } = {},
): Promise<FetchResult> {
  const onProgress = opts.onProgress ?? (() => {});
  const gmail = gmailFor(auth);
  const dir = attachmentsDir();
  mkdirSync(dir, { recursive: true });

  const runId = `run_${Date.now().toString(36)}`;
  db.insert(gmailRuns)
    .values({
      id: runId,
      status: 'running',
      fyKey: opts.fyKey,
      queryCount: estimate.messageIdsByQuery.length,
      bytesEstimated: opts.bytesEstimated ?? estimate.bytesEstimated,
    })
    .run();

  let messageCount = 0;
  let attachmentCount = 0;
  let bytesDownloaded = 0;
  const processed = new Set<string>();

  try {
    for (const { query, ids } of estimate.messageIdsByQuery) {
      for (const id of ids) {
        if (processed.has(id)) continue;
        processed.add(id);

        const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
        const msg = res.data;
        const parts = collectAttachmentParts(msg.payload);

        db.insert(gmailMessages)
          .values({
            id,
            runId,
            threadId: msg.threadId ?? null,
            fromAddr: header(msg.payload, 'From') ?? null,
            subject: header(msg.payload, 'Subject') ?? null,
            internalDate: msg.internalDate ? Number(msg.internalDate) : null,
            snippet: msg.snippet ?? null,
            matchedQuery: query.query,
            institutionId: query.providerId,
            hasAttachments: parts.length > 0,
          })
          .onConflictDoUpdate({ target: gmailMessages.id, set: { runId, matchedQuery: query.query } })
          .run();
        messageCount++;

        for (const part of parts) {
          const att = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: id,
            id: part.body!.attachmentId!,
          });
          const b64 = att.data.data;
          if (!b64) continue;
          const buf = Buffer.from(b64, 'base64url');
          const sha = createHash('sha256').update(buf).digest('hex');

          // Dedupe: skip if we already have this exact attachment.
          const existing = db.select({ id: attachments.id }).from(attachments).where(eq(attachments.sha256, sha)).get();
          if (existing) continue;

          const ext = extname(part.filename ?? '') || '.bin';
          const path = join(dir, `${sha}${ext}`);
          if (!existsSync(path)) writeFileSync(path, buf);

          db.insert(attachments)
            .values({
              id: `att_${sha.slice(0, 16)}`,
              messageId: id,
              filename: part.filename ?? null,
              mimeType: part.mimeType ?? null,
              sizeBytes: buf.length,
              sha256: sha,
              pathOnDisk: path,
              status: 'pending',
            })
            .onConflictDoNothing()
            .run();
          attachmentCount++;
          bytesDownloaded += buf.length;
          onProgress({ phase: 'attachment', message: part.filename ?? 'attachment', attachmentCount, bytes: bytesDownloaded });
        }

        if (messageCount % 25 === 0) {
          onProgress({ phase: 'fetch', message: `Fetched ${messageCount} messages`, messageCount, attachmentCount, bytes: bytesDownloaded });
        }
      }
    }

    db.update(gmailRuns)
      .set({ status: 'done', finishedAt: Date.now(), messageCount, attachmentCount, bytesDownloaded })
      .where(eq(gmailRuns.id, runId))
      .run();
    onProgress({ phase: 'done', message: 'Fetch complete', messageCount, attachmentCount, bytes: bytesDownloaded });
  } catch (err) {
    db.update(gmailRuns)
      .set({ status: 'error', finishedAt: Date.now(), messageCount, attachmentCount, bytesDownloaded, error: (err as Error).message })
      .where(eq(gmailRuns.id, runId))
      .run();
    onProgress({ phase: 'error', message: (err as Error).message });
    throw err;
  }

  return { runId, messageCount, attachmentCount, bytesDownloaded };
}
