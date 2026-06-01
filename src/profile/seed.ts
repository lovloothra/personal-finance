/**
 * Persist the profile seed into the encrypted DB profile/account tables.
 * Rupee amounts are converted to paise. Idempotent: clears and re-inserts the
 * list-style tables, upserts the singletons. Server-only (touches the DB).
 */
import 'server-only';
import { inArray } from 'drizzle-orm';
import type { DB } from '@/db/client';
import {
  profilePersonal,
  profileFamily,
  profileHome,
  profileLifestyle,
  profileHouseHelp,
  profileSubscriptions,
  profileAnnualExpenses,
  profileOneTimeProjects,
  accountsBank,
  accountsCard,
  accountsBroker,
  accountsInvestmentPlatform,
  loans,
  insurancePolicies,
  institutions,
} from '@/db/schema';
import { providerIds } from './signals';
import type { ProfileSeed } from './types';

/** Throw a friendly error if any referenced institutionId is not in the packs. */
function validateInstitutionRefs(db: DB, seed: ProfileSeed): void {
  const referenced = providerIds(seed);
  if (referenced.length === 0) return;
  const found = db
    .select({ id: institutions.id })
    .from(institutions)
    .where(inArray(institutions.id, referenced))
    .all()
    .map((r) => r.id);
  const missing = referenced.filter((id) => !found.includes(id));
  if (missing.length) {
    throw new Error(
      `These institutionId values are not in the loaded packs: ${missing.join(', ')}.\n` +
        'Check packs/in/*.json for the exact ids (run `npm run db:load-packs` first), then fix secrets/profile.local.json.',
    );
  }
}

const toPaise = (r?: number) => (r == null ? null : Math.round(r * 100));
let counter = 0;
const rid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

/** Write the seed into the DB. Returns a summary of row counts. */
export function persistProfile(db: DB, seed: ProfileSeed): Record<string, number> {
  validateInstitutionRefs(db, seed);
  return db.transaction((tx) => {
    const ts = Date.now();

    tx
      .insert(profilePersonal)
      .values({
        id: 'self',
        fullName: seed.personal.fullName,
        dob: seed.personal.dob ?? null,
        pan: seed.personal.pan ?? null,
        city: seed.personal.city ?? null,
        primaryEmail: seed.personal.email ?? null,
        updatedAt: ts,
      })
      .onConflictDoUpdate({
        target: profilePersonal.id,
        set: {
          fullName: seed.personal.fullName,
          dob: seed.personal.dob ?? null,
          pan: seed.personal.pan ?? null,
          city: seed.personal.city ?? null,
          primaryEmail: seed.personal.email ?? null,
          updatedAt: ts,
        },
      })
      .run();

    if (seed.home) {
      tx
        .insert(profileHome)
        .values({
          id: 'home',
          ownership: seed.home.ownership ?? null,
          monthlyRent: toPaise(seed.home.monthlyRent),
          cityTier: seed.home.cityTier ?? null,
          hasHomeLoan: seed.loans.some((l) => l.kind === 'home'),
          updatedAt: ts,
        })
        .onConflictDoUpdate({
          target: profileHome.id,
          set: {
            ownership: seed.home.ownership ?? null,
            monthlyRent: toPaise(seed.home.monthlyRent),
            cityTier: seed.home.cityTier ?? null,
            hasHomeLoan: seed.loans.some((l) => l.kind === 'home'),
            updatedAt: ts,
          },
        })
        .run();
    }

    tx.delete(profileFamily).run();
    if (seed.spouse) {
      tx
        .insert(profileFamily)
        .values({
          id: rid('family'),
          relation: 'spouse',
          fullName: seed.spouse.fullName,
          dob: seed.spouse.dob ?? null,
          isDependent: false,
          hasIncome: false,
        })
        .run();
    }
    for (const d of seed.dependents) {
      tx
        .insert(profileFamily)
        .values({
          id: rid('family'),
          relation: d.relation,
          fullName: d.fullName,
          dob: d.dob ?? null,
          isDependent: d.isDependent,
          hasIncome: d.hasIncome,
        })
        .run();
    }

    // List tables: replace wholesale for a clean re-seed.
    tx.delete(accountsBank).run();
    for (const b of seed.banks) {
      tx
        .insert(accountsBank)
        .values({
          id: rid('bank'),
          institutionId: b.institutionId,
          nickname: b.nickname ?? null,
          last4: b.last4 ?? null,
          accountType: b.accountType ?? null,
          isPrimary: b.isPrimary ?? false,
        })
        .run();
    }

    tx.delete(accountsCard).run();
    for (const c of seed.cards) {
      tx.insert(accountsCard).values({
        id: rid('card'),
        institutionId: c.institutionId,
        nickname: c.nickname ?? null,
        last4: c.last4 ?? null,
        network: c.network ?? null,
        creditLimit: toPaise(c.creditLimit),
        statementDay: c.statementDay ?? null,
      }).run();
    }

    tx.delete(accountsBroker).run();
    for (const b of seed.brokers) {
      tx.insert(accountsBroker).values({ id: rid('broker'), institutionId: b.institutionId, nickname: b.name }).run();
    }

    tx.delete(accountsInvestmentPlatform).run();
    for (const p of seed.investmentPlatforms) {
      tx.insert(accountsInvestmentPlatform).values({
        id: rid('platform'),
        institutionId: p.institutionId,
        nickname: p.name,
        kind: p.kind ?? null,
      }).run();
    }

    tx.delete(loans).run();
    for (const l of seed.loans) {
      tx.insert(loans).values({
        id: rid('loan'),
        institutionId: l.institutionId ?? null,
        kind: l.kind,
        principal: toPaise(l.principal),
        outstanding: toPaise(l.outstanding),
        emiAmount: toPaise(l.emiAmount),
        emiDay: l.emiDay ?? null,
        interestRate: l.interestRate ?? null,
        startDate: l.startDate ?? null,
        endDate: l.endDate ?? null,
      }).run();
    }

    tx.delete(insurancePolicies).run();
    for (const i of seed.insurers) {
      tx.insert(insurancePolicies).values({
        id: rid('ins'),
        institutionId: i.institutionId ?? null,
        kind: i.kind,
        policyNumberLast4: i.policyNumberLast4 ?? null,
        premium: toPaise(i.premium),
        cadence: i.cadence ?? null,
        sumAssured: toPaise(i.sumAssured),
        renewalMonth: i.renewalMonth ?? null,
        coversSelf: i.coversSelf ?? true,
        coversParents: i.coversParents ?? false,
      }).run();
    }

    tx.delete(profileHouseHelp).run();
    for (const h of seed.houseHelp) {
      tx
        .insert(profileHouseHelp)
        .values({ id: rid('hh'), role: h.role, monthlyAmount: toPaise(h.monthlyAmount), paymentMode: h.upiHandle ? 'upi' : null, upiHandle: h.upiHandle ?? null })
        .run();
    }

    tx.delete(profileSubscriptions).run();
    for (const s of seed.subscriptions) {
      tx.insert(profileSubscriptions).values({
        id: rid('sub'),
        name: s.name,
        amount: toPaise(s.amount),
        cadence: s.cadence ?? null,
        category: s.category ?? null,
      }).run();
    }

    tx.delete(profileAnnualExpenses).run();
    for (const e of seed.annualExpenses) {
      tx.insert(profileAnnualExpenses).values({
        id: rid('annual'),
        name: e.name,
        amount: toPaise(e.amount),
        month: e.month ?? null,
        category: e.category ?? null,
      }).run();
    }

    tx.delete(profileOneTimeProjects).run();
    for (const p of seed.projects) {
      tx
        .insert(profileOneTimeProjects)
        .values({ id: p.id, name: p.name, budget: toPaise(p.budget), startDate: p.startDate ?? null, endDate: p.endDate ?? null, status: p.status ?? 'planned' })
        .run();
    }

    tx
      .insert(profileLifestyle)
      .values({
        id: 'lifestyle',
        data: {
          goals: seed.goals,
          tax: seed.tax,
          onboarding: seed.onboarding,
          home: seed.home ? { landlordName: seed.home.landlordName, hraInSalary: seed.home.hraInSalary } : undefined,
        },
        updatedAt: ts,
      })
      .onConflictDoUpdate({
        target: profileLifestyle.id,
        set: {
          data: {
            goals: seed.goals,
            tax: seed.tax,
            onboarding: seed.onboarding,
            home: seed.home ? { landlordName: seed.home.landlordName, hraInSalary: seed.home.hraInSalary } : undefined,
          },
          updatedAt: ts,
        },
      })
      .run();

    return {
      banks: seed.banks.length,
      cards: seed.cards.length,
      brokers: seed.brokers.length,
      investmentPlatforms: seed.investmentPlatforms.length,
      loans: seed.loans.length,
      insurers: seed.insurers.length,
      dependents: seed.dependents.length,
      houseHelp: seed.houseHelp.length,
      subscriptions: seed.subscriptions.length,
      annualExpenses: seed.annualExpenses.length,
      projects: seed.projects.length,
    };
  });
}
