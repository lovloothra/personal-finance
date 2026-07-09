/**
 * DNS-rebinding guard for every API route.
 *
 * The app binds to 127.0.0.1 with no auth. A malicious page can rebind its own
 * domain's DNS to 127.0.0.1, becoming "same-origin" with the app and reading
 * every GET API (and driving the EventSource import). The Host header still
 * carries the attacker's domain on such requests — so only loopback hosts are
 * served. Complements assertSameOrigin (src/server/api.ts), which covers
 * cross-origin POSTs but never ran for GETs.
 */
import { NextResponse, type NextRequest } from 'next/server';

const LOOPBACK_HOST_RE = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

export function middleware(req: NextRequest): NextResponse {
  const host = req.headers.get('host') ?? '';
  if (!LOOPBACK_HOST_RE.test(host)) {
    return new NextResponse(JSON.stringify({ error: 'Forbidden: loopback only.' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
