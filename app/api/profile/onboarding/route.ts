import { inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { institutions } from '@/db/schema';
import { readRawSeed, writeProfileSeed } from '@/profile/write';
import { persistProfile } from '@/profile/seed';
import { ProfileSeedSchema, type ProfileSeed } from '@/profile/types';
import { json, badRequest, assertSameOrigin } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function providerIds(seed: Partial<ProfileSeed>): string[] {
  return [
    ...(seed.banks ?? []).map((x) => x.institutionId),
    ...(seed.cards ?? []).map((x) => x.institutionId),
    ...(seed.brokers ?? []).map((x) => x.institutionId),
    ...(seed.investmentPlatforms ?? []).map((x) => x.institutionId),
    ...(seed.insurers ?? []).map((x) => x.institutionId ?? ''),
    ...(seed.loans ?? []).map((x) => x.institutionId ?? ''),
  ].filter(Boolean);
}

async function labelsFor(ids: string[]): Promise<Record<string, string>> {
  const real = [...new Set(ids.filter(Boolean))];
  if (real.length === 0) return {};
  const db = await getDb();
  const rows = db.select({ id: institutions.id, name: institutions.displayName }).from(institutions).where(inArray(institutions.id, real)).all();
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

export async function GET(): Promise<Response> {
  try {
    const seed = readRawSeed() as Partial<ProfileSeed>;
    return json({ seed, labels: await labelsFor(providerIds(seed)) });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to load onboarding profile.', 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const body = (await req.json()) as { profile?: Partial<ProfileSeed> };
    if (!body.profile || typeof body.profile !== 'object') return badRequest('Provide a profile object.');

    const seed = writeProfileSeed(body.profile);
    const db = await getDb();
    const counts = persistProfile(db, ProfileSeedSchema.parse(seed));
    return json({ ok: true, seed, labels: await labelsFor(providerIds(seed)), counts });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to save onboarding profile.', 500);
  }
}
