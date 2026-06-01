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
import { institutions } from '@/db/schema';
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
  const labels = await instLabels([
    ...(seed.banks ?? []).map((b) => b.institutionId),
    ...(seed.cards ?? []).map((c) => c.institutionId),
    ...(seed.brokers ?? []).map((b) => b.institutionId),
    ...(seed.investmentPlatforms ?? []).map((p) => p.institutionId),
    ...(seed.insurers ?? []).map((i) => i.institutionId ?? ''),
    ...(seed.loans ?? []).map((l) => l.institutionId ?? ''),
  ].filter(Boolean) as string[]);

  const bankFields = [0, 1, 2].flatMap((i) => {
    const b = seed.banks?.[i];
    return [
      { key: `banks.${i}.institutionId`, label: `Bank ${i + 1}`, type: 'institution' as const, category: 'bank', value: b?.institutionId ? labels[b.institutionId] ?? '' : '', currentId: b?.institutionId },
      { key: `banks.${i}.last4`, label: `Bank ${i + 1} last 4`, type: 'text' as const, value: b?.last4 ?? '' },
      { key: `banks.${i}.accountType`, label: `Bank ${i + 1} type`, type: 'select' as const, options: ['salary', 'savings', 'current'], value: b?.accountType ?? '' },
      { key: `banks.${i}.customerId`, label: `Bank ${i + 1} customer ID`, type: 'text' as const, value: b?.customerId ?? '', hint: 'Used for statement password candidates when needed.' },
    ];
  });

  const cardFields = [0, 1, 2].flatMap((i) => {
    const c = seed.cards?.[i];
    return [
      { key: `cards.${i}.institutionId`, label: `Card ${i + 1} issuer`, type: 'institution' as const, category: 'credit_card_issuer', value: c?.institutionId ? labels[c.institutionId] ?? '' : '', currentId: c?.institutionId },
      { key: `cards.${i}.last4`, label: `Card ${i + 1} last 4`, type: 'text' as const, value: c?.last4 ?? '' },
      { key: `cards.${i}.network`, label: `Card ${i + 1} network`, type: 'select' as const, options: ['visa', 'mastercard', 'rupay', 'amex'], value: c?.network ?? '' },
      { key: `cards.${i}.statementDay`, label: `Card ${i + 1} statement day`, type: 'number' as const, value: num(c?.statementDay) },
    ];
  });

  const loanFields = [0, 1, 2].flatMap((i) => {
    const l = seed.loans?.[i];
    return [
      { key: `loans.${i}.kind`, label: `Loan ${i + 1} type`, type: 'select' as const, options: ['home', 'auto', 'personal', 'education'], value: l?.kind ?? '' },
      { key: `loans.${i}.institutionId`, label: `Loan ${i + 1} lender`, type: 'institution' as const, category: 'lender', value: l?.institutionId ? labels[l.institutionId] ?? '' : '', currentId: l?.institutionId },
      { key: `loans.${i}.emiAmount`, label: `Loan ${i + 1} EMI (₹)`, type: 'number' as const, value: num(l?.emiAmount) },
      { key: `loans.${i}.outstanding`, label: `Loan ${i + 1} outstanding (₹)`, type: 'number' as const, value: num(l?.outstanding) },
    ];
  });

  const brokerFields = [0, 1, 2].flatMap((i) => {
    const b = seed.brokers?.[i];
    return [
      { key: `brokers.${i}.institutionId`, label: `Broker ${i + 1}`, type: 'institution' as const, category: 'broker', value: b?.institutionId ? labels[b.institutionId] ?? '' : '', currentId: b?.institutionId },
      { key: `brokers.${i}.name`, label: `Broker ${i + 1} display name`, type: 'text' as const, value: b?.name ?? '' },
      { key: `brokers.${i}.taxSection`, label: `Broker ${i + 1} tax section`, type: 'select' as const, options: ['80C', '80CCD1B', 'none'], value: b?.taxSection ?? '' },
    ];
  });

  const platformFields = [0, 1, 2].flatMap((i) => {
    const p = seed.investmentPlatforms?.[i];
    return [
      { key: `investmentPlatforms.${i}.institutionId`, label: `Platform ${i + 1}`, type: 'institution' as const, category: 'investment_platform', value: p?.institutionId ? labels[p.institutionId] ?? '' : '', currentId: p?.institutionId },
      { key: `investmentPlatforms.${i}.name`, label: `Platform ${i + 1} name`, type: 'text' as const, value: p?.name ?? '' },
      { key: `investmentPlatforms.${i}.kind`, label: `Platform ${i + 1} kind`, type: 'select' as const, options: ['mutual_fund', 'nps', 'pension', 'gold'], value: p?.kind ?? '' },
      { key: `investmentPlatforms.${i}.taxSection`, label: `Platform ${i + 1} tax section`, type: 'select' as const, options: ['80C', '80CCD1B', 'none'], value: p?.taxSection ?? '' },
    ];
  });

  const insurerFields = [0, 1, 2].flatMap((i) => {
    const ins = seed.insurers?.[i];
    return [
      { key: `insurers.${i}.institutionId`, label: `Insurer ${i + 1}`, type: 'institution' as const, category: 'insurer', value: ins?.institutionId ? labels[ins.institutionId] ?? '' : '', currentId: ins?.institutionId },
      { key: `insurers.${i}.name`, label: `Insurer ${i + 1} name`, type: 'text' as const, value: ins?.name ?? '' },
      { key: `insurers.${i}.kind`, label: `Insurer ${i + 1} type`, type: 'select' as const, options: ['health', 'term', 'life', 'vehicle'], value: ins?.kind ?? '' },
      { key: `insurers.${i}.premium`, label: `Insurer ${i + 1} premium (₹)`, type: 'number' as const, value: num(ins?.premium) },
      { key: `insurers.${i}.taxSection`, label: `Insurer ${i + 1} tax section`, type: 'select' as const, options: ['80D', '80C', 'none'], value: ins?.taxSection ?? '' },
    ];
  });

  const subscriptionFields = [0, 1, 2, 3].flatMap((i) => {
    const s = seed.subscriptions?.[i];
    return [
      { key: `subscriptions.${i}.name`, label: `Subscription ${i + 1}`, type: 'text' as const, value: s?.name ?? '' },
      { key: `subscriptions.${i}.amount`, label: `Subscription ${i + 1} amount (₹)`, type: 'number' as const, value: num(s?.amount) },
      { key: `subscriptions.${i}.cadence`, label: `Subscription ${i + 1} cadence`, type: 'select' as const, options: ['monthly', 'quarterly', 'yearly'], value: s?.cadence ?? '' },
      { key: `subscriptions.${i}.category`, label: `Subscription ${i + 1} category`, type: 'text' as const, value: s?.category ?? '' },
    ];
  });

  const houseHelpFields = [0, 1, 2].flatMap((i) => {
    const h = seed.houseHelp?.[i];
    return [
      { key: `houseHelp.${i}.name`, label: `House help ${i + 1} name`, type: 'text' as const, value: h?.name ?? '' },
      { key: `houseHelp.${i}.role`, label: `House help ${i + 1} role`, type: 'select' as const, options: ['maid', 'cook', 'driver', 'nanny', 'gardener'], value: h?.role ?? '' },
      { key: `houseHelp.${i}.monthlyAmount`, label: `House help ${i + 1} monthly (₹)`, type: 'number' as const, value: num(h?.monthlyAmount) },
      { key: `houseHelp.${i}.upiHandle`, label: `House help ${i + 1} UPI`, type: 'text' as const, value: h?.upiHandle ?? '' },
    ];
  });

  const projectFields = [0, 1, 2].flatMap((i) => {
    const p = seed.projects?.[i];
    return [
      { key: `projects.${i}.name`, label: `Project ${i + 1}`, type: 'text' as const, value: p?.name ?? '' },
      { key: `projects.${i}.budget`, label: `Project ${i + 1} budget (₹)`, type: 'number' as const, value: num(p?.budget) },
      { key: `projects.${i}.startDate`, label: `Project ${i + 1} start`, type: 'date' as const, value: p?.startDate ?? '' },
      { key: `projects.${i}.endDate`, label: `Project ${i + 1} end`, type: 'date' as const, value: p?.endDate ?? '' },
      { key: `projects.${i}.categoryHints`, label: `Project ${i + 1} category hints`, type: 'text' as const, value: p?.categoryHints?.join(', ') ?? '' },
    ];
  });

  const sections: SectionView[] = [
    {
      id: 'personal',
      name: 'You',
      why: 'PAN, date of birth and mobile derive statement-password candidates on-device.',
      editable: true,
      pct: 0,
      fields: [
        { key: 'personal.fullName', label: 'Full name', type: 'text', value: seed.personal?.fullName ?? '' },
        { key: 'personal.pan', label: 'PAN', type: 'text', value: seed.personal?.pan ?? '', hint: 'Used only to derive statement passwords.' },
        { key: 'personal.dob', label: 'Date of birth', type: 'date', value: seed.personal?.dob ?? '', hint: 'Helps unlock password-protected statements.' },
        { key: 'personal.mobile', label: 'Mobile', type: 'text', value: seed.personal?.mobile ?? '', hint: 'Some statement passwords use mobile last-4.' },
        { key: 'personal.city', label: 'City', type: 'text', value: seed.personal?.city ?? '' },
        { key: 'personal.email', label: 'Email', type: 'text', value: seed.personal?.email ?? '' },
        { key: 'spouse.fullName', label: 'Spouse name', type: 'text', value: seed.spouse?.fullName ?? '', hint: 'Recognises shared accounts and dependent insurance.' },
        { key: 'spouse.pan', label: 'Spouse PAN', type: 'text', value: seed.spouse?.pan ?? '', hint: 'Unlocks statements addressed to your spouse.' },
        { key: 'spouse.dob', label: 'Spouse DOB', type: 'date', value: seed.spouse?.dob ?? '' },
        { key: 'dependents.0.fullName', label: 'Dependent 1 name', type: 'text', value: seed.dependents?.[0]?.fullName ?? '' },
        { key: 'dependents.0.relation', label: 'Dependent 1 relation', type: 'select', options: ['child', 'parent', 'dependent'], value: seed.dependents?.[0]?.relation ?? '' },
        { key: 'dependents.0.dob', label: 'Dependent 1 DOB', type: 'date', value: seed.dependents?.[0]?.dob ?? '' },
      ],
    },
    {
      id: 'income',
      name: 'Income',
      why: 'Detects salary credits and separates them from transfers or reimbursements.',
      editable: true,
      pct: 0,
      fields: [
        { key: 'employer.name', label: 'Employer', type: 'text', value: seed.employer?.name ?? '', hint: 'Name as it appears on salary credits.' },
        { key: 'employer.monthlyNetSalary', label: 'Monthly net salary (₹)', type: 'number', value: num(seed.employer?.monthlyNetSalary), hint: 'Helps match the right credit as salary.' },
      ],
    },
    {
      id: 'home',
      name: 'Home',
      why: 'Matches rent payments and computes your HRA exemption for tax.',
      editable: true,
      pct: 0,
      fields: [
        { key: 'home.ownership', label: 'Ownership', type: 'select', options: ['owned', 'rented', 'family'], value: seed.home?.ownership ?? '' },
        { key: 'home.cityTier', label: 'City tier', type: 'select', options: ['metro', 'non_metro'], value: seed.home?.cityTier ?? '' },
        { key: 'home.monthlyRent', label: 'Monthly rent (₹)', type: 'number', value: num(seed.home?.monthlyRent) },
        { key: 'home.landlordName', label: 'Landlord / payee', type: 'text', value: seed.home?.landlordName ?? '' },
        { key: 'home.hraInSalary', label: 'HRA in salary, annual (₹)', type: 'number', value: num(seed.home?.hraInSalary), hint: 'From your salary structure; used for HRA exemption.' },
      ],
    },
    {
      id: 'money',
      name: 'Money',
      why: 'Banks, cards and EMIs scope Gmail queries, unlock statements, and prevent double-counting.',
      editable: true,
      pct: 0,
      fields: [...bankFields, ...cardFields, ...loanFields],
    },
    {
      id: 'investments',
      name: 'Future',
      why: 'Tags SIPs, NPS, insurance and tax evidence to the right platform and section.',
      editable: true,
      pct: 0,
      fields: [...brokerFields, ...platformFields, ...insurerFields],
    },
    {
      id: 'subscriptions',
      name: 'Spending',
      why: 'Known recurring costs, household payments and big one-off projects improve categorisation from day one.',
      editable: true,
      pct: 0,
      fields: [...subscriptionFields, ...houseHelpFields, ...projectFields],
    },
    {
      id: 'goals',
      name: 'Goals & tax',
      why: 'Savings goals and tax setup frame the workbench after import.',
      editable: true,
      pct: 0,
      fields: [
        { key: 'goals.savingsRateTarget', label: 'Savings-rate target (%)', type: 'number', value: num(seed.goals?.savingsRateTarget) },
        { key: 'goals.retirementAge', label: 'Retirement target age', type: 'number', value: num(seed.goals?.retirementAge) },
        { key: 'goals.retirementCorpus', label: 'Retirement corpus target (₹)', type: 'number', value: num(seed.goals?.retirementCorpus) },
        { key: 'goals.emergencyFundMonths', label: 'Emergency fund months', type: 'number', value: num(seed.goals?.emergencyFundMonths) },
        { key: 'tax.regimePreference', label: 'Tax regime preference', type: 'select', options: ['compare', 'old', 'new'], value: seed.tax?.regimePreference ?? '' },
        { key: 'tax.annual80C', label: 'Expected 80C (₹)', type: 'number', value: num(seed.tax?.annual80C) },
        { key: 'tax.annual80D', label: 'Expected 80D (₹)', type: 'number', value: num(seed.tax?.annual80D) },
        { key: 'tax.nps80CCD1B', label: 'Expected NPS 80CCD(1B) (₹)', type: 'number', value: num(seed.tax?.nps80CCD1B) },
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
  const none = (s?: string | null) => (s && s !== 'none' ? s : undefined);
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `project-${Date.now()}`;
  const hasPrefix = (prefix: string) => Object.keys(values).some((k) => k.startsWith(`${prefix}.`));

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

  // spouse + dependents
  if (['spouse.fullName', 'spouse.pan', 'spouse.dob'].some(has)) {
    const name = has('spouse.fullName') ? v('spouse.fullName') : existing.spouse?.fullName ?? '';
    if (name) {
      patch.spouse = {
        fullName: name,
        pan: has('spouse.pan') ? v('spouse.pan').toUpperCase() || undefined : existing.spouse?.pan,
        dob: has('spouse.dob') ? v('spouse.dob') || undefined : existing.spouse?.dob,
        mobile: existing.spouse?.mobile,
      };
    }
  }
  if (hasPrefix('dependents')) {
    patch.dependents = [0, 1, 2]
      .map((i) => {
        const name = v(`dependents.${i}.fullName`);
        if (!name) return null;
        return {
          fullName: name,
          relation: v(`dependents.${i}.relation`) || 'dependent',
          dob: v(`dependents.${i}.dob`) || undefined,
          isDependent: true,
          hasIncome: false,
        };
      })
      .filter(Boolean) as ProfileSeed['dependents'];
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
  if (['home.ownership', 'home.cityTier', 'home.monthlyRent', 'home.landlordName', 'home.hraInSalary'].some(has)) {
    patch.home = {
      ownership: (has('home.ownership') ? v('home.ownership') || undefined : existing.home?.ownership) as 'owned' | 'rented' | 'family' | undefined,
      monthlyRent: has('home.monthlyRent') ? numv('home.monthlyRent') : existing.home?.monthlyRent,
      landlordName: has('home.landlordName') ? v('home.landlordName') || undefined : existing.home?.landlordName,
      cityTier: (has('home.cityTier') ? v('home.cityTier') || undefined : existing.home?.cityTier) as 'metro' | 'non_metro' | undefined,
      hraInSalary: has('home.hraInSalary') ? numv('home.hraInSalary') : existing.home?.hraInSalary,
    };
  }

  if (hasPrefix('banks') || ['accounts.primaryBankId', 'accounts.primaryBankLast4'].some(has)) {
    patch.banks = [0, 1, 2]
      .map((i) => {
        const id = v(`banks.${i}.institutionId`) || (i === 0 ? v('accounts.primaryBankId') : '');
        if (!id) return null;
        return {
          institutionId: id,
          last4: v(`banks.${i}.last4`) || (i === 0 ? v('accounts.primaryBankLast4') : '') || undefined,
          customerId: v(`banks.${i}.customerId`) || undefined,
          accountType: v(`banks.${i}.accountType`) || undefined,
          isPrimary: i === 0,
        };
      })
      .filter(Boolean) as ProfileSeed['banks'];
  }
  if (hasPrefix('cards') || ['accounts.creditCardId', 'accounts.creditCardLast4'].some(has)) {
    patch.cards = [0, 1, 2]
      .map((i) => {
        const id = v(`cards.${i}.institutionId`) || (i === 0 ? v('accounts.creditCardId') : '');
        if (!id) return null;
        return {
          institutionId: id,
          last4: v(`cards.${i}.last4`) || (i === 0 ? v('accounts.creditCardLast4') : '') || undefined,
          network: v(`cards.${i}.network`) || undefined,
          statementDay: numv(`cards.${i}.statementDay`),
        };
      })
      .filter(Boolean) as ProfileSeed['cards'];
  }
  if (hasPrefix('loans')) {
    patch.loans = [0, 1, 2]
      .map((i) => {
        const kind = v(`loans.${i}.kind`);
        const institutionId = v(`loans.${i}.institutionId`);
        if (!kind && !institutionId) return null;
        return {
          kind: kind || 'loan',
          institutionId: institutionId || undefined,
          emiAmount: numv(`loans.${i}.emiAmount`),
          outstanding: numv(`loans.${i}.outstanding`),
          interestRate: numv(`loans.${i}.interestRate`),
          emiDay: numv(`loans.${i}.emiDay`),
        };
      })
      .filter(Boolean) as ProfileSeed['loans'];
  }
  if (hasPrefix('brokers')) {
    patch.brokers = [0, 1, 2]
      .map((i) => {
        const institutionId = v(`brokers.${i}.institutionId`);
        const name = v(`brokers.${i}.name`);
        if (!institutionId || !name) return null;
        return { institutionId, name, taxSection: none(v(`brokers.${i}.taxSection`)) ?? null };
      })
      .filter(Boolean) as ProfileSeed['brokers'];
  }
  if (hasPrefix('investmentPlatforms')) {
    patch.investmentPlatforms = [0, 1, 2]
      .map((i) => {
        const institutionId = v(`investmentPlatforms.${i}.institutionId`);
        const name = v(`investmentPlatforms.${i}.name`);
        if (!institutionId || !name) return null;
        return {
          institutionId,
          name,
          kind: v(`investmentPlatforms.${i}.kind`) || undefined,
          taxSection: none(v(`investmentPlatforms.${i}.taxSection`)) ?? null,
        };
      })
      .filter(Boolean) as ProfileSeed['investmentPlatforms'];
  }
  if (hasPrefix('insurers')) {
    patch.insurers = [0, 1, 2]
      .map((i) => {
        const name = v(`insurers.${i}.name`);
        const kind = v(`insurers.${i}.kind`);
        if (!name || !kind) return null;
        return {
          institutionId: v(`insurers.${i}.institutionId`) || undefined,
          name,
          kind,
          premium: numv(`insurers.${i}.premium`),
          taxSection: none(v(`insurers.${i}.taxSection`)) ?? null,
        };
      })
      .filter(Boolean) as ProfileSeed['insurers'];
  }
  if (hasPrefix('subscriptions')) {
    patch.subscriptions = [0, 1, 2, 3]
      .map((i) => {
        const name = v(`subscriptions.${i}.name`);
        if (!name) return null;
        return { name, amount: numv(`subscriptions.${i}.amount`), cadence: v(`subscriptions.${i}.cadence`) || undefined, category: v(`subscriptions.${i}.category`) || undefined };
      })
      .filter(Boolean) as ProfileSeed['subscriptions'];
  }
  if (hasPrefix('houseHelp')) {
    patch.houseHelp = [0, 1, 2]
      .map((i) => {
        const name = v(`houseHelp.${i}.name`);
        const role = v(`houseHelp.${i}.role`);
        if (!name || !role) return null;
        return { name, role, monthlyAmount: numv(`houseHelp.${i}.monthlyAmount`), upiHandle: v(`houseHelp.${i}.upiHandle`) || undefined };
      })
      .filter(Boolean) as ProfileSeed['houseHelp'];
  }
  if (hasPrefix('projects')) {
    patch.projects = [0, 1, 2]
      .map((i) => {
        const name = v(`projects.${i}.name`);
        if (!name) return null;
        return {
          id: existing.projects?.[i]?.id ?? slug(name),
          name,
          budget: numv(`projects.${i}.budget`),
          startDate: v(`projects.${i}.startDate`) || undefined,
          endDate: v(`projects.${i}.endDate`) || undefined,
          categoryHints: v(`projects.${i}.categoryHints`).split(',').map((x) => x.trim()).filter(Boolean),
        };
      })
      .filter(Boolean) as ProfileSeed['projects'];
  }
  if (hasPrefix('goals')) {
    patch.goals = {
      savingsRateTarget: has('goals.savingsRateTarget') ? numv('goals.savingsRateTarget') : existing.goals?.savingsRateTarget,
      retirementAge: has('goals.retirementAge') ? numv('goals.retirementAge') : existing.goals?.retirementAge,
      retirementCorpus: has('goals.retirementCorpus') ? numv('goals.retirementCorpus') : existing.goals?.retirementCorpus,
      emergencyFundMonths: has('goals.emergencyFundMonths') ? numv('goals.emergencyFundMonths') : existing.goals?.emergencyFundMonths,
    };
  }
  if (hasPrefix('tax')) {
    patch.tax = {
      regimePreference: none(v('tax.regimePreference')) as ProfileSeed['tax']['regimePreference'],
      annual80C: has('tax.annual80C') ? numv('tax.annual80C') : existing.tax?.annual80C,
      annual80D: has('tax.annual80D') ? numv('tax.annual80D') : existing.tax?.annual80D,
      nps80CCD1B: has('tax.nps80CCD1B') ? numv('tax.nps80CCD1B') : existing.tax?.nps80CCD1B,
    };
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
