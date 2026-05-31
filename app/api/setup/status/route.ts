import { getSetupStatus } from '@/server/setup';
import { json } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return json(await getSetupStatus());
}
