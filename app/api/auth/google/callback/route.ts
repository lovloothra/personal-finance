import { cookies } from 'next/headers';
import { getDb } from '@/db/client';
import { createOAuthClient, exchangeCode } from '@/gmail/oauth';
import { OAUTH_CALLBACK_PATH, OAUTH_STATE_COOKIE } from '../start/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Loopback OAuth redirect target: exchange the code, store tokens, bounce back. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const state = url.searchParams.get('state');
  const expected = (await cookies()).get(OAUTH_STATE_COOKIE)?.value;

  const back = (params: string) => Response.redirect(`${url.origin}/onboarding?${params}`, 302);

  if (error) return back(`gmail=error&reason=${encodeURIComponent(error)}`);
  if (!code) return back('gmail=error&reason=missing_code');
  if (!state || state !== expected) return back('gmail=error&reason=state_mismatch');

  try {
    const db = await getDb();
    const client = createOAuthClient(`${url.origin}${OAUTH_CALLBACK_PATH}`);
    const { email } = await exchangeCode(db, client, code);
    (await cookies()).delete(OAUTH_STATE_COOKIE);
    return back(`gmail=connected${email ? `&email=${encodeURIComponent(email)}` : ''}`);
  } catch (err) {
    return back(`gmail=error&reason=${encodeURIComponent(err instanceof Error ? err.message : 'exchange_failed')}`);
  }
}
