/**
 * Persist the profile seed into the encrypted DB profile/account tables.
 * Rupee amounts are converted to paise. Idempotent: clears and re-inserts the
 * list-style tables, upserts the singletons. Server-only (touches the DB).
 */
import 'server-only';
import { eq, inArray } from 'drizzle-orm';
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
  parsedDocuments,
  transactions,
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

/**
 * Match a seed account against the existing rows by natural key so a re-seed
 * KEEPS the row's id — transactions and parsed_documents reference these ids,
 * and minting fresh ones on every save silently orphans all attribution
 * (which is exactly what happened before this existed).
 *
 * Pass 1: institutionId + last4. Pass 2: institutionId alone, when either
 * side's last4 is unknown and only one candidate remains (a row registered
 * before its last4 was learned must not become a duplicate).
 */
function claimByNaturalKey<T extends { id: string; institutionId: string | null; last4: string | null }>(
  existing: T[],
  claimed: Set<string>,
  institutionId: string | null,
  last4: string | null,
): T | undefined {
  const pool = existing.filter((e) => !claimed.has(e.id) && e.institutionId === institutionId);
  const exact = pool.find((e) => (e.last4 ?? null) === last4);
  const found = exact ?? (pool.length === 1 && (pool[0].last4 == null || last4 == null) ? pool[0] : undefined);
  if (found) claimed.add(found.id);
  return found;
}

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

    // Banks and cards are referenced by transactions.ownAccountId — upsert by
    // natural key instead of replacing wholesale (see claimByNaturalKey).
    const existingBanks = tx.select().from(accountsBank).all();
    const claimedBanks = new Set<string>();
    for (const b of seed.banks) {
      const found = claimByNaturalKey(existingBanks, claimedBanks, b.institutionId, b.last4 ?? null);
      const values = {
        institutionId: b.institutionId,
        nickname: b.nickname ?? null,
        // Never wipe a last4 the row already learned (e.g. from a statement).
        last4: b.last4 ?? found?.last4 ?? null,
        accountType: b.accountType ?? null,
        isPrimary: b.isPrimary ?? false,
      };
      if (found) tx.update(accountsBank).set({ ...values, updatedAt: ts }).where(eq(accountsBank.id, found.id)).run();
      else tx.insert(accountsBank).values({ id: rid('bank'), ...values }).run();
    }
    for (const e of existingBanks.filter((e) => !claimedBanks.has(e.id))) {
      // Rows dropped from the seed are deleted only when nothing references
      // them; deleting a referenced account would orphan its transactions.
      const referenced =
        tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.ownAccountId, e.id)).limit(1).get() ??
        tx.select({ id: parsedDocuments.id }).from(parsedDocuments).where(eq(parsedDocuments.ownAccountId, e.id)).limit(1).get();
      if (!referenced) tx.delete(accountsBank).where(eq(accountsBank.id, e.id)).run();
    }

    const existingCards = tx.select().from(accountsCard).all();
    const claimedCards = new Set<string>();
    for (const c of seed.cards) {
      const found = claimByNaturalKey(existingCards, claimedCards, c.institutionId, c.last4 ?? null);
      const values = {
        institutionId: c.institutionId,
        nickname: c.nickname ?? null,
        last4: c.last4 ?? found?.last4 ?? null,
        network: c.network ?? null,
        creditLimit: toPaise(c.creditLimit),
        statementDay: c.statementDay ?? null,
      };
      if (found) tx.update(accountsCard).set({ ...values, updatedAt: ts }).where(eq(accountsCard.id, found.id)).run();
      else tx.insert(accountsCard).values({ id: rid('card'), ...values }).run();
    }
    for (const e of existingCards.filter((e) => !claimedCards.has(e.id))) {
      const referenced =
        tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.ownAccountId, e.id)).limit(1).get() ??
        tx.select({ id: parsedDocuments.id }).from(parsedDocuments).where(eq(parsedDocuments.ownAccountId, e.id)).limit(1).get();
      if (!referenced) tx.delete(accountsCard).where(eq(accountsCard.id, e.id)).run();
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

    // Projects carry stable user-provided ids and transactions.project_id
    // FK-references them: delete-all-reinsert threw the moment a transaction
    // was tagged (layer-9 project isolation). Upsert by id; drop only rows
    // absent from the seed AND unreferenced — same policy as accounts above.
    const existingProjects = tx.select().from(profileOneTimeProjects).all();
    const seedProjectIds = new Set(seed.projects.map((p) => p.id));
    for (const e of existingProjects.filter((e) => !seedProjectIds.has(e.id))) {
      const referenced = tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.projectId, e.id))
        .limit(1)
        .get();
      if (!referenced) tx.delete(profileOneTimeProjects).where(eq(profileOneTimeProjects.id, e.id)).run();
    }
    for (const p of seed.projects) {
      const values = { name: p.name, budget: toPaise(p.budget), startDate: p.startDate ?? null, endDate: p.endDate ?? null, status: p.status ?? 'planned' };
      tx
        .insert(profileOneTimeProjects)
        .values({ id: p.id, ...values })
        .onConflictDoUpdate({ target: profileOneTimeProjects.id, set: values })
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
