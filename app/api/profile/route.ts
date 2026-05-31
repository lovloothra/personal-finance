import { inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { institutions } from '@/db/schema';
import { writeProfileSeed, readRawSeed } from '@/profile/write';
import { persistProfile } from '@/profile/seed';
import { json, badRequest, assertSameOrigin } from '@/server/api';
import type { ProfileSeed } from '@/profile/types';

async function labelsFor(ids: string[]): Promise<Record<string, string>> {
  const real = ids.filter(Boolean);
  if (real.length === 0) return {};
  const db = await getDb();
  const rows = db.select({ id: institutions.id, name: institutions.displayName }).from(institutions).where(inArray(institutions.id, real)).all();
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface EssentialsPayload {
  fullName?: string;
  pan?: string;
  dob?: string; // ISO
  employer?: string;
  primaryBankId?: string;
  primaryBankLast4?: string;
  creditCardId?: string;
  creditCardLast4?: string;
}

/** Return current essentials for prefilling the form. */
export async function GET(): Promise<Response> {
  const seed = readRawSeed();
  const primaryBankId = seed.banks?.find((b) => b.isPrimary)?.institutionId ?? seed.banks?.[0]?.institutionId ?? '';
  const creditCardId = seed.cards?.[0]?.institutionId ?? '';
  const labels = await labelsFor([primaryBankId, creditCardId]);
  return json({
    fullName: seed.personal?.fullName ?? '',
    pan: seed.personal?.pan ?? '',
    dob: seed.personal?.dob ?? '',
    employer: seed.employer?.name ?? '',
    primaryBankId,
    primaryBankLabel: labels[primaryBankId] ?? '',
    primaryBankLast4: seed.banks?.find((b) => b.isPrimary)?.last4 ?? seed.banks?.[0]?.last4 ?? '',
    creditCardId,
    creditCardLabel: labels[creditCardId] ?? '',
    creditCardLast4: seed.cards?.[0]?.last4 ?? '',
  });
}

/** Save essentials: write the seed file (source of truth) + persist to the DB. */
export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const body = (await req.json()) as EssentialsPayload;

    // Build a patch from only the fields the user actually provided. Blank
    // fields are omitted so the existing saved value is preserved on merge;
    // overall validity (name required) is enforced by writeProfileSeed's schema.
    const patch: Partial<ProfileSeed> = {};
    const personal: Record<string, string> = {};
    if (body.fullName?.trim()) personal.fullName = body.fullName.trim();
    if (body.pan?.trim()) personal.pan = body.pan.trim().toUpperCase();
    if (body.dob?.trim()) personal.dob = body.dob.trim();
    if (Object.keys(personal).length) patch.personal = personal as ProfileSeed['personal'];

    if (body.employer?.trim()) {
      patch.employer = { name: body.employer.trim(), aliases: [body.employer.trim().toLowerCase()] };
    }
    if (body.primaryBankId) {
      patch.banks = [{ institutionId: body.primaryBankId, last4: body.primaryBankLast4?.trim() || undefined, isPrimary: true }];
    }
    if (body.creditCardId) {
      patch.cards = [{ institutionId: body.creditCardId, last4: body.creditCardLast4?.trim() || undefined }];
    }

    const seed = writeProfileSeed(patch);
    const db = await getDb();
    const counts = persistProfile(db, seed);
    return json({ ok: true, counts });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to save profile.');
  }
}
