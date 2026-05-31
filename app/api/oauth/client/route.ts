import { hasClientCredentials, saveClientCredentials } from '@/gmail/oauth';
import { json, badRequest, assertSameOrigin } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return json({ hasClient: hasClientCredentials() });
}

/** Save the user's downloaded Desktop OAuth client JSON to gitignored secrets. */
export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const body = (await req.json()) as { json?: string };
    if (!body.json || typeof body.json !== 'string') return badRequest('Provide the OAuth client JSON in the "json" field.');
    const { clientId } = saveClientCredentials(body.json);
    return json({ ok: true, clientId });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to save client.');
  }
}
