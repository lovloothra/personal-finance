import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { createOAuthClient, authUrl, hasClientCredentials } from '@/gmail/oauth';
import { json, badRequest } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OAUTH_CALLBACK_PATH = '/api/auth/google/callback';
export const OAUTH_STATE_COOKIE = 'pf_oauth_state';

/** Begin the OAuth flow: return the Google consent URL for the loopback redirect. */
export async function GET(req: Request): Promise<Response> {
  if (!hasClientCredentials()) {
    return badRequest('No OAuth client configured yet. Add your Desktop client first.');
  }
  const origin = new URL(req.url).origin; // http://127.0.0.1:3000
  const redirectUri = `${origin}${OAUTH_CALLBACK_PATH}`;
  const state = randomBytes(16).toString('hex');

  (await cookies()).set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  const client = createOAuthClient(redirectUri);
  const url = authUrl(client) + `&state=${state}`;
  return json({ url, redirectUri });
}
