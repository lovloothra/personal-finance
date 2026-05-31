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

test('seed rejects malformed dates', () => {
  const bad = ProfileSeedSchema.safeParse({ personal: { fullName: 'X', dob: '15-07-1988' } });
  assert.equal(bad.success, false);
});
