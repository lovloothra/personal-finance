/**
 * Derive runtime signals from the profile seed.
 *
 * One profile document feeds three consumers:
 *   - classifier ProfileSignals (amounts converted rupees → paise)
 *   - the set of institution/provider ids the household uses (query filtering)
 *   - PDF password-candidate inputs (DOB / PAN / mobile / names / last4 / cust id)
 *
 * Pure given a ProfileSeed; the fs read lives in loadProfileSeed.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ProfileSignals } from '@/classifier/types';
import { ProfileSeedSchema, type ProfileSeed } from './types';

const RUPEES = 100; // paise per rupee
const toPaise = (rupees?: number): number | undefined =>
  rupees == null ? undefined : Math.round(rupees * RUPEES);

function seedPath(): string {
  return process.env.PF_PROFILE_PATH ?? join(process.cwd(), 'secrets', 'profile.local.json');
}

/** Load + validate the profile seed. Throws a friendly error if missing/invalid. */
export function loadProfileSeed(path = seedPath()): ProfileSeed {
  if (!existsSync(path)) {
    throw new Error(
      `Profile seed not found at ${path}.\n` +
        'Copy secrets/profile.example.json to secrets/profile.local.json and fill in your details.',
    );
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const parsed = ProfileSeedSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid profile seed at ${path}:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}

/** Build the classifier ProfileSignals (paise). */
export function buildClassifierSignals(seed: ProfileSeed): ProfileSignals {
  return {
    employer: seed.employer
      ? {
          name: seed.employer.name,
          aliases: seed.employer.aliases.length ? seed.employer.aliases : [seed.employer.name],
          monthlyAmount: toPaise(seed.employer.monthlyNetSalary),
        }
      : undefined,
    rent:
      seed.home?.monthlyRent != null
        ? { landlordName: seed.home.landlordName, monthlyRent: toPaise(seed.home.monthlyRent)! }
        : undefined,
    houseHelp: seed.houseHelp.map((h) => ({
      name: h.name,
      role: h.role,
      monthlyAmount: toPaise(h.monthlyAmount),
      upiHandle: h.upiHandle,
    })),
    loans: seed.loans.map((l) => ({
      institutionId: l.institutionId,
      kind: l.kind,
      emiAmount: toPaise(l.emiAmount),
    })),
    cards: seed.cards.map((c) => ({
      institutionId: c.institutionId,
      last4: c.last4,
      label: c.nickname ?? (c.last4 ? `··${c.last4}` : undefined),
    })),
    brokers: [
      ...seed.brokers.map((b) => ({
        institutionId: b.institutionId,
        name: b.name,
        taxSection: b.taxSection ?? null,
      })),
      ...seed.investmentPlatforms.map((p) => ({
        institutionId: p.institutionId,
        name: p.name,
        taxSection: p.taxSection ?? null,
      })),
    ],
    insurers: seed.insurers.map((i) => ({
      institutionId: i.institutionId,
      name: i.name,
      kind: i.kind,
      taxSection: i.taxSection ?? null,
    })),
    projects: seed.projects
      .filter((p) => p.startDate && p.endDate)
      .map((p) => ({
        id: p.id,
        name: p.name,
        startDate: p.startDate!,
        endDate: p.endDate!,
        categoryHints: p.categoryHints,
      })),
  };
}

/** Institution ids the household uses — used to scope Gmail queries. */
export function providerIds(seed: ProfileSeed): string[] {
  const ids = new Set<string>();
  for (const b of seed.banks) ids.add(b.institutionId);
  for (const c of seed.cards) ids.add(c.institutionId);
  for (const b of seed.brokers) ids.add(b.institutionId);
  for (const p of seed.investmentPlatforms) ids.add(p.institutionId);
  for (const i of seed.insurers) if (i.institutionId) ids.add(i.institutionId);
  for (const l of seed.loans) if (l.institutionId) ids.add(l.institutionId);
  return [...ids];
}

/** Raw inputs for PDF password-candidate generation. */
export interface PasswordInputs {
  dobs: string[]; // ISO
  pans: string[];
  mobiles: string[];
  names: string[];
  last4s: string[];
  customerIds: string[];
}

export function passwordInputs(seed: ProfileSeed): PasswordInputs {
  const people = [seed.personal, seed.spouse, ...seed.dependents].filter(Boolean) as NonNullable<typeof seed.spouse>[];
  const dobs = people.map((p) => p.dob).filter(Boolean) as string[];
  const pans = people.map((p) => p.pan).filter(Boolean) as string[];
  const mobiles = people.map((p) => p.mobile).filter(Boolean) as string[];
  const names = people.map((p) => p.fullName).filter(Boolean);
  const last4s = [
    ...seed.banks.map((b) => b.last4),
    ...seed.cards.map((c) => c.last4),
  ].filter(Boolean) as string[];
  const customerIds = seed.banks.map((b) => b.customerId).filter(Boolean) as string[];
  return { dobs, pans, mobiles, names, last4s, customerIds };
}
