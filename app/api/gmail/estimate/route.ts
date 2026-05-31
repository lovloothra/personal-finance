import { getDb } from '@/db/client';
import { getAuthedClient } from '@/gmail/oauth';
import { estimateRun } from '@/gmail/fetcher';
import { evaluateConsent } from '@/gmail/consent-gate';
import { buildProfileQueries, providerDisplayNames } from '@/server/import';
import { json, badRequest } from '@/server/api';
import type { FyKey } from '@/ledger/fy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Test query: count matching messages + estimate download size. No download. */
export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const fy = (url.searchParams.get('fy') ?? '2025-26') as FyKey;
    const all = url.searchParams.get('all') === '1';

    const { queries, providerIds } = buildProfileQueries(fy, all);
    if (queries.length === 0) return badRequest('No matching providers. Add a bank/card to your profile, or retry with all senders.');

    const db = await getDb();
    const auth = await getAuthedClient(db);
    const estimate = await estimateRun(auth, queries);
    const consent = evaluateConsent(estimate.bytesEstimated);
    const matchedIds = estimate.messageIdsByQuery.filter((q) => q.ids.length > 0).map((q) => q.query.providerId);
    const senders = await providerDisplayNames([...new Set(matchedIds.length ? matchedIds : providerIds)]);

    return json({
      fy,
      messageCount: estimate.messageCount,
      bytesEstimated: estimate.bytesEstimated,
      humanEstimate: consent.humanEstimate,
      consentRequired: consent.required,
      thresholdBytes: consent.thresholdBytes,
      queryCount: queries.length,
      senders,
    });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Estimate failed.', 500);
  }
}
