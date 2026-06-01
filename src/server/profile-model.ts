/**
 * Profile view-model: turns the profile seed into clean, section-by-section
 * field views for the Profile page (real values, or empty with a hint to
 * complete — never generic placeholder data), and applies edits back to the
 * seed + encrypted DB.
 *
 * Field types tell the UI which input to render. Institution fields carry the
 * resolved display name plus the underlying id so the picker can prefill.
 */
import 'server-only';
import { inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { institutions, subscriptionsDetected, transactions } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { readRawSeed, writeProfileSeed } from '@/profile/write';
import { persistProfile } from '@/profile/seed';
import { ProfileSeedSchema, type ProfileSeed } from '@/profile/types';

export type FieldType = 'text' | 'date' | 'number' | 'select' | 'institution';

export interface FieldView {
  key: string;
  label: string;
  type: FieldType;
  value: string; // display value ('' when unset)
  hint?: string;
  options?: string[]; // for select
  category?: string; // for institution picker
  currentId?: string; // for institution (the selected id)
  readOnly?: boolean; // detected/derived sections
}

export interface SectionView {
  id: string;
  name: string;
  why: string;
  fields: FieldView[];
  pct: number;
  editable: boolean;
}

async function instLabels(ids: string[]): Promise<Record<string, string>> {
  const real = ids.filter(Boolean);
  if (!real.length) return {};
  const db = await getDb();
  return Object.fromEntries(
    db.select({ id: institutions.id, n: institutions.displayName }).from(institutions).where(inArray(institutions.id, real)).all().map((r) => [r.id, r.n]),
  );
}

const num = (n?: number) => (n == null ? '' : String(n));

function pctOf(fields: FieldView[]): number {
  const counted = fields.filter((f) => !f.readOnly);
  if (!counted.length) return 100;
  const filled = counted.filter((f) => f.value.trim() !== '').length;
  return Math.round((filled / counted.length) * 100);
}

/** Build the full profile view from the seed (+ a couple of detected summaries). */
export async function buildProfileView(): Promise<{ sections: SectionView[]; overall: number }> {
  const seed = readRawSeed() as Partial<ProfileSeed>;
  const bank = seed.banks?.find((b) => b.isPrimary) ?? seed.banks?.[0];
  const card = seed.cards?.[0];
  const labels = await instLabels([bank?.institutionId, card?.institutionId, ...(seed.brokers ?? []).map((b) => b.institutionId), ...(seed.insurers ?? []).map((i) => i.institutionId ?? '')].filter(Boolean) as string[]);

  const db = await getDb();
  const subCount = (db.select({ n: sql<number>`count(*)` }).from(subscriptionsDetected).get()?.n ?? 0) as number;
  const projTxnFy = seed.projects?.length ?? 0;
  void transactions; // (reserved for future detected summaries)

  const sections: SectionView[] = [
    {
      id: 'personal',
      name: 'Personal',
      why: 'PAN and date of birth derive the passwords for locked statement PDFs, on-device.',
      editable: true,
      pct: 0,
      fields: [
        { key: 'personal.fullName', label: 'Full name', type: 'text', value: seed.personal?.fullName ?? '' },
        { key: 'personal.pan', label: 'PAN', type: 'text', value: seed.personal?.pan ?? '', hint: 'Used only to derive statement passwords.' },
        { key: 'personal.dob', label: 'Date of birth', type: 'date', value: seed.personal?.dob ?? '', hint: 'Helps unlock password-protected statements.' },
        { key: 'personal.mobile', label: 'Mobile', type: 'text', value: seed.personal?.mobile ?? '', hint: 'Some statement passwords use mobile last-4.' },
        { key: 'personal.city', label: 'City', type: 'text', value: seed.personal?.city ?? '' },
        { key: 'personal.email', label: 'Email', type: 'text', value: seed.personal?.email ?? '' },
      ],
    },
    {
      id: 'accounts',
      name: 'Banks & cards',
      why: 'Account and card last-4 digits link payments and unlock statements.',
      editable: true,
      pct: 0,
      fields: [
        { key: 'accounts.primaryBankId', label: 'Primary bank', type: 'institution', category: 'bank', value: bank?.institutionId ? labels[bank.institutionId] ?? '' : '', currentId: bank?.institutionId },
        { key: 'accounts.primaryBankLast4', label: 'Bank a/c last 4', type: 'text', value: bank?.last4 ?? '' },
        { key: 'accounts.creditCardId', label: 'Credit card issuer', type: 'institution', category: 'credit_card_issuer', value: card?.institutionId ? labels[card.institutionId] ?? '' : '', currentId: card?.institutionId },
        { key: 'accounts.creditCardLast4', label: 'Card last 4', type: 'text', value: card?.last4 ?? '' },
      ],
    },
    {
      id: 'employer',
      name: 'Employer & income',
      why: 'Detects your salary credits and separates them from other income.',
      editable: true,
      pct: 0,
      fields: [
        { key: 'employer.name', label: 'Employer', type: 'text', value: seed.employer?.name ?? '', hint: 'Name as it appears on salary credits.' },
        { key: 'employer.monthlyNetSalary', label: 'Monthly net salary (₹)', type: 'number', value: num(seed.employer?.monthlyNetSalary), hint: 'Helps match the right credit as salary.' },
      ],
    },
    {
      id: 'home',
      name: 'Home & rent',
      why: 'Matches rent payments and computes your HRA exemption for tax.',
      editable: true,
      pct: 0,
      fields: [
        { key: 'home.ownership', label: 'Ownership', type: 'select', options: ['owned', 'rented', 'family'], value: seed.home?.ownership ?? '' },
        { key: 'home.monthlyRent', label: 'Monthly rent (₹)', type: 'number', value: num(seed.home?.monthlyRent) },
        { key: 'home.landlordName', label: 'Landlord / payee', type: 'text', value: seed.home?.landlordName ?? '' },
        { key: 'home.hraInSalary', label: 'HRA in salary, annual (₹)', type: 'number', value: num(seed.home?.hraInSalary), hint: 'From your salary structure; used for HRA exemption.' },
      ],
    },
    {
      id: 'family',
      name: 'Family',
      why: 'Identifies dependents and enables their insurance/80D detection.',
      editable: true,
      pct: 0,
      fields: [
        { key: 'spouse.fullName', label: 'Spouse name', type: 'text', value: seed.spouse?.fullName ?? '', hint: 'Recognises shared accounts and dependent insurance.' },
        { key: 'spouse.pan', label: 'Spouse PAN', type: 'text', value: seed.spouse?.pan ?? '', hint: 'Unlocks statements addressed to your spouse.' },
      ],
    },
    {
      id: 'investments',
      name: 'Brokers & platforms',
      why: 'Tags SIPs and contributions to the right platform and tax section.',
      editable: false,
      pct: 0,
      fields: [
        {
          key: 'brokers',
          label: 'Brokers',
          type: 'text',
          readOnly: true,
          value: (seed.brokers ?? []).map((b) => b.name).join(', '),
          hint: (seed.brokers?.length ?? 0) === 0 ? 'Add your brokers (Groww, Zerodha…) during import to tag SIPs.' : undefined,
        },
        {
          key: 'insurers',
          label: 'Insurers',
          type: 'text',
          readOnly: true,
          value: (seed.insurers ?? []).map((i) => i.name).join(', '),
          hint: (seed.insurers?.length ?? 0) === 0 ? 'Add insurers to detect 80C/80D premium evidence.' : undefined,
        },
      ],
    },
    {
      id: 'subscriptions',
      name: 'Subscriptions',
      why: 'Recurring charges detected from your statements.',
      editable: false,
      pct: 0,
      fields: [
        {
          key: 'subscriptions',
          label: 'Detected subscriptions',
          type: 'text',
          readOnly: true,
          value: subCount > 0 ? `${subCount} tracked` : '',
          hint: subCount === 0 ? 'Detected automatically after you import statements.' : undefined,
        },
      ],
    },
    {
      id: 'annual',
      name: 'Annual & one-time',
      why: 'Isolates big one-off spends (trips, fees) from your monthly view.',
      editable: false,
      pct: 0,
      fields: [
        {
          key: 'projects',
          label: 'One-time projects',
          type: 'text',
          readOnly: true,
          value: (seed.projects ?? []).map((p) => p.name).join(', '),
          hint: projTxnFy === 0 ? 'Define one-time projects (a trip, a renovation) to isolate them.' : undefined,
        },
      ],
    },
  ];

  for (const s of sections) s.pct = pctOf(s.fields);
  const editableSections = sections.filter((s) => s.editable);
  const overall = editableSections.length ? Math.round(editableSections.reduce((a, s) => a + s.pct, 0) / editableSections.length) : 0;
  return { sections, overall };
}

/** Apply a section edit (key → value map) back to the seed + DB. */
export async function applyProfilePatch(values: Record<string, string>): Promise<void> {
  const existing = readRawSeed() as Partial<ProfileSeed>;
  const v = (k: string) => (values[k] ?? '').trim();
  const has = (k: string) => k in values;
  const numv = (k: string) => {
    const x = v(k);
    return x ? Number(x.replace(/[^\d.]/g, '')) : undefined;
  };

  const patch: Partial<ProfileSeed> = {};

  // personal
  if (['personal.fullName', 'personal.pan', 'personal.dob', 'personal.mobile', 'personal.city', 'personal.email'].some(has)) {
    patch.personal = {
      fullName: has('personal.fullName') ? v('personal.fullName') : existing.personal?.fullName ?? '',
      pan: has('personal.pan') ? v('personal.pan').toUpperCase() || undefined : existing.personal?.pan,
      dob: has('personal.dob') ? v('personal.dob') || undefined : existing.personal?.dob,
      mobile: has('personal.mobile') ? v('personal.mobile') || undefined : existing.personal?.mobile,
      city: has('personal.city') ? v('personal.city') || undefined : existing.personal?.city,
      email: has('personal.email') ? v('personal.email') || undefined : existing.personal?.email,
    };
  }

  // spouse
  if (['spouse.fullName', 'spouse.pan'].some(has)) {
    const name = has('spouse.fullName') ? v('spouse.fullName') : existing.spouse?.fullName ?? '';
    if (name) {
      patch.spouse = {
        fullName: name,
        pan: has('spouse.pan') ? v('spouse.pan').toUpperCase() || undefined : existing.spouse?.pan,
        dob: existing.spouse?.dob,
        mobile: existing.spouse?.mobile,
      };
    }
  }

  // employer
  if (['employer.name', 'employer.monthlyNetSalary'].some(has)) {
    const name = has('employer.name') ? v('employer.name') : existing.employer?.name ?? '';
    if (name) {
      patch.employer = {
        name,
        aliases: existing.employer?.aliases?.length ? existing.employer.aliases : [name.toLowerCase()],
        monthlyNetSalary: has('employer.monthlyNetSalary') ? numv('employer.monthlyNetSalary') : existing.employer?.monthlyNetSalary,
      };
    }
  }

  // home
  if (['home.ownership', 'home.monthlyRent', 'home.landlordName', 'home.hraInSalary'].some(has)) {
    patch.home = {
      ownership: (has('home.ownership') ? v('home.ownership') || undefined : existing.home?.ownership) as 'owned' | 'rented' | 'family' | undefined,
      monthlyRent: has('home.monthlyRent') ? numv('home.monthlyRent') : existing.home?.monthlyRent,
      landlordName: has('home.landlordName') ? v('home.landlordName') || undefined : existing.home?.landlordName,
      cityTier: existing.home?.cityTier,
      hraInSalary: has('home.hraInSalary') ? numv('home.hraInSalary') : existing.home?.hraInSalary,
    };
  }

  // accounts (primary bank + card)
  if (['accounts.primaryBankId', 'accounts.primaryBankLast4'].some(has)) {
    const id = has('accounts.primaryBankId') ? v('accounts.primaryBankId') : existing.banks?.[0]?.institutionId ?? '';
    if (id) {
      patch.banks = [{ institutionId: id, last4: (has('accounts.primaryBankLast4') ? v('accounts.primaryBankLast4') : existing.banks?.[0]?.last4) || undefined, isPrimary: true, ...(existing.banks?.[0]?.customerId ? { customerId: existing.banks[0].customerId } : {}) }];
    }
  }
  if (['accounts.creditCardId', 'accounts.creditCardLast4'].some(has)) {
    const id = has('accounts.creditCardId') ? v('accounts.creditCardId') : existing.cards?.[0]?.institutionId ?? '';
    if (id) {
      patch.cards = [{ institutionId: id, last4: (has('accounts.creditCardLast4') ? v('accounts.creditCardLast4') : existing.cards?.[0]?.last4) || undefined }];
    }
  }

  const seed = writeProfileSeed(patch);
  // Mirror into the encrypted DB (best-effort; institution refs must exist).
  try {
    const db = await getDb();
    persistProfile(db, ProfileSeedSchema.parse(seed));
  } catch {
    /* seed is the source of truth; DB mirror is non-fatal */
  }
}
