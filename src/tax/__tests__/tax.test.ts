/**
 * Golden tests for the India tax module. Every expected figure below is
 * hand-computed from the FY 2025-26 slabs and asserted to the rupee, per the
 * plan's verification step 9.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGIMES, computeRegimeTax, slabTax } from '../regimes-in';
import { compareRegimes } from '../compare';
import { deriveDeductions, totalDeductions } from '../deductions';

const NEW = REGIMES['2025-26'].new;
const OLD = REGIMES['2025-26'].old;

test('new regime: taxable ₹12,00,000 is fully rebated under 87A', () => {
  // slab tax = 20,000 + 40,000 = 60,000; rebate caps it to 0.
  const r = computeRegimeTax(1200000, NEW);
  assert.equal(slabTax(1200000, NEW.slabs), 60000);
  assert.equal(r.rebate, 60000);
  assert.equal(r.tax, 0);
  assert.equal(r.total, 0);
});

test('new regime: taxable ₹16,00,000 → ₹1,24,800 total', () => {
  const r = computeRegimeTax(1600000, NEW);
  assert.equal(r.tax, 120000); // 20k + 40k + 60k
  assert.equal(r.rebate, 0);
  assert.equal(r.cess, 4800); // 4% of 1,20,000
  assert.equal(r.total, 124800);
});

test('new regime: marginal relief just above ₹12L (taxable ₹12,10,000)', () => {
  const r = computeRegimeTax(1210000, NEW);
  // slab tax = 20k + 40k + 1,500 = 61,500; relief caps tax to the ₹10,000 excess.
  assert.equal(r.tax, 10000);
  assert.equal(r.rebate, 51500);
  assert.equal(r.cess, 400);
  assert.equal(r.total, 10400);
});

test('old regime: taxable ₹10,00,000 → ₹1,17,000 total', () => {
  const r = computeRegimeTax(1000000, OLD);
  assert.equal(r.tax, 112500); // 12,500 + 1,00,000
  assert.equal(r.cess, 4500);
  assert.equal(r.total, 117000);
});

test('old regime: taxable ₹5,00,000 fully rebated under 87A', () => {
  const r = computeRegimeTax(500000, OLD);
  assert.equal(r.rebate, 12500);
  assert.equal(r.total, 0);
});

test('deductions are capped to statutory limits', () => {
  const d = deriveDeductions([
    { section: '80C', label: 'ELSS + EPF', rawAmount: 220000, evidence: 6 },
    { section: '80D', label: 'Health', rawAmount: 50000, evidence: 3 },
    { section: 'HRA', label: 'Rent', rawAmount: 396000, evidence: 11 },
  ]);
  assert.equal(d[0].amount, 150000); // 80C capped
  assert.equal(d[1].amount, 50000); // 80D under cap, unchanged
  assert.equal(d[2].amount, 396000); // HRA uncapped
  assert.equal(totalDeductions(d), 596000);
});

test('compareRegimes picks the cheaper regime with correct saving', () => {
  // Gross ₹12,75,000, no itemised deductions, no employer NPS.
  // old taxable = 12,75,000 − 50,000 = 12,25,000 → tax 1,80,000, cess 7,200, total 1,87,200
  // new taxable = 12,75,000 − 75,000 = 12,00,000 → total 0 (87A)
  const c = compareRegimes({ fy: '2025-26', grossIncome: 1275000, detected: [] });
  assert.equal(c.old.taxable, 1225000);
  assert.equal(c.old.tax, 180000);
  assert.equal(c.old.total, 187200);
  assert.equal(c.new.taxable, 1200000);
  assert.equal(c.new.total, 0);
  assert.equal(c.recommended, 'new');
  assert.equal(c.saving, 187200);
});

test('compareRegimes: high earner with deductions favouring old regime', () => {
  // Gross ₹49,20,000 with full itemised deductions.
  const c = compareRegimes({
    fy: '2025-26',
    grossIncome: 4920000,
    detected: [
      { section: '80C', label: 'ELSS+EPF+life', rawAmount: 150000, evidence: 6 },
      { section: '80CCD(1B)', label: 'NPS', rawAmount: 50000, evidence: 3 },
      { section: '80D', label: 'Health', rawAmount: 73200, evidence: 4 },
      { section: 'HRA', label: 'Rent', rawAmount: 396000, evidence: 11 },
      { section: '24(b)', label: 'Home loan interest', rawAmount: 200000, evidence: 12 },
    ],
  });
  // itemised = 150000+50000+73200+396000+200000 = 869200
  // old taxable = 4920000 − 50000 − 869200 = 4000800
  assert.equal(c.old.taxable, 4000800);
  // old slab tax: 12,500 + 1,00,000 + 30% of (4000800−1000000)=900240 → 10,12,740
  assert.equal(c.old.tax, 1012740);
  // new taxable = 4920000 − 75000 = 4845000
  assert.equal(c.new.taxable, 4845000);
  assert.equal(c.recommended, 'old');
  assert.ok(c.saving > 0);
});
