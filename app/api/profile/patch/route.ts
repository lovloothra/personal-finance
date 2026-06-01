import { applyProfilePatch } from '@/server/profile-model';
import { json, badRequest, assertSameOrigin } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const body = (await req.json()) as { values?: Record<string, string> };
    if (!body.values || typeof body.values !== 'object') return badRequest('Provide a values object.');
    await applyProfilePatch(body.values);
    return json({ ok: true });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to save profile.', 500);
  }
}
