import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProfileSeedSchema } from '../types';
import { buildClassifierSignals, providerIds, passwordInputs } from '../signals';

const seed = ProfileSeedSchema.parse({
  personal: { fullName: 'Aditya Iyer', dob: '1988-07-15', pan: 'ABCDE1234F', mobile: '9876543210', city: 'Bengaluru' },
  spouse: { fullName: 'Sneha Iyer', dob: '1990-02-20', pan: 'PQRSX6789L' },
  employer: { name: 'Nexora Systems', aliases: ['nexora systems'], monthlyNetSalary: 180000 },
  home: { ownership: 'rented', monthlyRent: 55000, landlordName: 'R. Venkatesh' },
  banks: [{ institutionId: 'hdfc-bank', last4: '1234', customerId: '12345678' }],
  cards: [{ institutionId: 'hdfc-bank-cards', last4: '7702' }],
  brokers: [{ institutionId: 'groww', name: 'Groww', taxSection: '80C' }],
  insurers: [{ institutionId: 'star-health', name: 'Star Health', kind: 'health', taxSection: '80D' }],
  loans: [{ institutionId: 'hdfc-bank', kind: 'home', emiAmount: 65000 }],
  houseHelp: [{ name: 'Lakshmi', role: 'maid', monthlyAmount: 12000, upiHandle: 'lakshmi@oksbi' }],
  projects: [{ id: 'goa-trip', name: 'Goa anniversary trip', startDate: '2026-03-01', endDate: '2026-03-31', categoryHints: ['travel'] }],
});

test('classifier signals convert rupees to paise', () => {
  const s = buildClassifierSignals(seed);
  assert.equal(s.employer?.monthlyAmount, 18000000); // ₹1,80,000 → paise
  assert.equal(s.rent?.monthlyRent, 5500000); // ₹55,000 → paise
  assert.equal(s.houseHelp?.[0].monthlyAmount, 1200000);
  assert.equal(s.loans?.[0].emiAmount, 6500000);
  assert.equal(s.brokers?.[0].taxSection, '80C');
  assert.equal(s.cards?.[0].label, '··7702');
});

test('providerIds unions all institution references', () => {
  const ids = providerIds(seed).sort();
  assert.deepEqual(ids, ['groww', 'hdfc-bank', 'hdfc-bank-cards', 'star-health'].sort());
});

test('passwordInputs gathers personal + account identifiers', () => {
  const p = passwordInputs(seed);
  assert.deepEqual(p.dobs.sort(), ['1988-07-15', '1990-02-20']);
  assert.deepEqual(p.pans.sort(), ['ABCDE1234F', 'PQRSX6789L']);
  assert.deepEqual(p.last4s.sort(), ['1234', '7702']);
  assert.deepEqual(p.customerIds, ['12345678']);
  assert.deepEqual(p.mobiles, ['9876543210']);
});

test('minimal onboarding profile remains valid with empty full-life sections', () => {
  const minimal = ProfileSeedSchema.parse({ personal: { fullName: 'Lov Loothra' } });
  assert.deepEqual(minimal.banks, []);
  assert.deepEqual(minimal.cards, []);
  assert.deepEqual(minimal.dependents, []);
  assert.deepEqual(minimal.investmentPlatforms, []);
  assert.deepEqual(minimal.subscriptions, []);
  assert.deepEqual(minimal.annualExpenses, []);
});

test('full-life onboarding profile feeds providers, passwords, and investment signals', () => {
  const full = ProfileSeedSchema.parse({
    personal: { fullName: 'Lov Loothra', dob: '1988-07-15', pan: 'ABCDE1234F', mobile: '9876543210' },
    spouse: { fullName: 'Sneha Iyer', dob: '1990-02-20', pan: 'PQRSX6789L' },
    dependents: [{ relation: 'parent', fullName: 'Anita Loothra', dob: '1959-04-12', isDependent: true, hasIncome: false }],
    banks: [{ institutionId: 'hdfc-bank', last4: '1234', customerId: '12345678', isPrimary: true }],
    cards: [{ institutionId: 'hdfc-bank-cards', last4: '7702', creditLimit: 500000, statementDay: 18 }],
    investmentPlatforms: [{ institutionId: 'nps-hdfc-pension-platform', name: 'HDFC Pension', kind: 'nps', taxSection: '80CCD1B' }],
    insurers: [{ institutionId: 'star-health-insurer', name: 'Star Health', kind: 'health', taxSection: '80D', premium: 31200, cadence: 'yearly', coversParents: true }],
    loans: [{ institutionId: 'hdfc-bank', kind: 'home', emiAmount: 65000, outstanding: 4820000, interestRate: 8.4, emiDay: 5 }],
    subscriptions: [{ name: 'Cursor AI', amount: 1600, cadence: 'monthly', category: 'AI tools' }],
    annualExpenses: [{ name: 'School fees', amount: 120000, month: 6, category: 'Education' }],
    goals: { savingsRateTarget: 45, retirementAge: 50, emergencyFundMonths: 12 },
    tax: { regimePreference: 'compare', annual80C: 150000, annual80D: 50000, nps80CCD1B: 50000 },
  });

  assert.ok(providerIds(full).includes('nps-hdfc-pension-platform'));
  assert.ok(providerIds(full).includes('star-health-insurer'));
  const passwords = passwordInputs(full);
  assert.ok(passwords.names.includes('Anita Loothra'));
  assert.ok(passwords.dobs.includes('1959-04-12'));
  const signals = buildClassifierSignals(full);
  assert.ok(signals.brokers?.some((b) => b.institutionId === 'nps-hdfc-pension-platform' && b.taxSection === '80CCD1B'));
});

test('seed rejects malformed dates', () => {
  const bad = ProfileSeedSchema.safeParse({ personal: { fullName: 'X', dob: '15-07-1988' } });
  assert.equal(bad.success, false);
});
