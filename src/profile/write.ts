/**
 * Write the profile seed JSON (the source of truth the CLIs + signals read)
 * from data collected in the onboarding UI. Merges over any existing file so
 * advanced fields added later aren't clobbered by an essentials re-save.
 */
import 'server-only';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ProfileSeedSchema, type ProfileSeed } from './types';

function seedPath(): string {
  return process.env.PF_PROFILE_PATH ?? join(process.cwd(), 'secrets', 'profile.local.json');
}

/** Read the existing seed if present (unvalidated, best-effort). */
export function readRawSeed(path = seedPath()): Partial<ProfileSeed> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Merge `patch` over the existing seed, validate the result, and write it back.
 * Singleton objects are deep-merged so a chapter save never drops fields it
 * doesn't collect. Array sections (banks, cards, …) are replaced wholesale when
 * present in the patch.
 * Returns the validated seed.
 */
export function writeProfileSeed(patch: Partial<ProfileSeed>, path = seedPath()): ProfileSeed {
  const existing = readRawSeed(path);
  // Drop undefined keys so a blank optional field doesn't clobber a saved one.
  const defined = <T extends object>(o?: T): Partial<T> =>
    Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>;
  const merged = {
    ...existing,
    ...patch,
    personal: { ...existing.personal, ...defined(patch.personal) },
    ...(patch.home || existing.home ? { home: { ...existing.home, ...defined(patch.home) } } : {}),
    goals: { ...existing.goals, ...defined(patch.goals) },
    tax: { ...existing.tax, ...defined(patch.tax) },
    onboarding: { ...existing.onboarding, ...defined(patch.onboarding) },
  };
  const parsed = ProfileSeedSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(`Profile is incomplete or invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(parsed.data, null, 2), { mode: 0o600 });
  return parsed.data;
}
