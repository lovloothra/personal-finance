import { getDb } from '@/db/client';
import { getAuthedClient } from '@/gmail/oauth';
import { estimateRun, fetchRun } from '@/gmail/fetcher';
import { evaluateConsent } from '@/gmail/consent-gate';
import { buildProfileQueries } from '@/server/import';
import { sse } from '@/server/api';
import type { FyKey } from '@/ledger/fy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stream the import as Server-Sent Events. Re-estimates, applies the consent
 * gate (emits `consent_required` unless ?yes=1), then downloads with live
 * progress. Events carry { phase, message, messageCount?, attachmentCount?, bytes? }.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const fy = (url.searchParams.get('fy') ?? '2025-26') as FyKey;
  const all = url.searchParams.get('all') === '1';
  const yes = url.searchParams.get('yes') === '1';

  return sse(async (send) => {
    const { queries } = buildProfileQueries(fy, all);
    if (queries.length === 0) {
      send({ phase: 'error', message: 'No matching providers for this profile.' });
      return;
    }

    const db = await getDb();
    const auth = await getAuthedClient(db);

    send({ phase: 'estimate', message: 'Estimating download size…' });
    const estimate = await estimateRun(auth, queries, (e) => send(e));

    const consent = evaluateConsent(estimate.bytesEstimated);
    if (consent.required && !yes) {
      send({
        phase: 'consent_required',
        message: `This download is about ${consent.humanEstimate}.`,
        bytes: estimate.bytesEstimated,
        messageCount: estimate.messageCount,
      });
      return;
    }

    const result = await fetchRun(auth, db, estimate, {
      fyKey: fy,
      bytesEstimated: estimate.bytesEstimated,
      onProgress: (e) => send(e),
    });
    send({ phase: 'done', message: 'Import complete', ...result });
  });
}
