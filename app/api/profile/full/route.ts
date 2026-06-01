import { buildProfileView } from '@/server/profile-model';
import { json, badRequest } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    return json(await buildProfileView());
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to load profile.', 500);
  }
}
