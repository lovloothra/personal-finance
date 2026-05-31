/**
 * India income-tax regimes — FY 2025-26 (AY 2026-27) and FY 2026-27 (AY 2027-28).
 *
 * All amounts are in whole rupees (not paise) to match the TaxFy UI shape.
 *
 * Sources of truth encoded here:
 *  - New-regime slabs as revised by the Finance Act 2025 (the standing
 *    structure carried into FY 2026-27 absent a later amendment).
 *  - Old-regime slabs unchanged for years.
 *  - 4% Health & Education cess on (tax + surcharge).
 *  - Section 87A rebate: old regime up to ₹5,00,000 taxable (max ₹12,500);
 *    new regime up to ₹12,00,000 taxable (max ₹60,000) WITH marginal relief.
 *  - Surcharge slabs on tax; new regime caps surcharge at 25%.
 *
 * NOTE: surcharge marginal relief is not modelled (only relevant above ₹50L).
 * This is a planning estimate — verify with a CA. Tax filing is out of scope.
 */

export type RegimeKey = 'old' | 'new';
export type FyKey = '2025-26' | '2026-27';

export interface Slab {
  /** Upper bound of this slab in rupees, or null for the top open band. */
  upTo: number | null;
  rate: number; // fraction, e.g. 0.05
}

export interface SurchargeBand {
  /** Income strictly greater than this gets `rate`. */
  over: number;
  rate: number;
}

export interface RegimeDef {
  slabs: Slab[];
  standardDeduction: number;
  /** Section 87A. */
  rebate: { taxableCeiling: number; maxRebate: number; marginalRelief: boolean };
  surcharge: SurchargeBand[];
  /** Deductions like 80C/80D/HRA/24b allowed under this regime. */
  allowsItemizedDeductions: boolean;
}

const CESS_RATE = 0.04;

const OLD_SLABS: Slab[] = [
  { upTo: 250000, rate: 0 },
  { upTo: 500000, rate: 0.05 },
  { upTo: 1000000, rate: 0.2 },
  { upTo: null, rate: 0.3 },
];

// Finance Act 2025 new-regime slabs (FY 2025-26 onward).
const NEW_SLABS_2025: Slab[] = [
  { upTo: 400000, rate: 0 },
  { upTo: 800000, rate: 0.05 },
  { upTo: 1200000, rate: 0.1 },
  { upTo: 1600000, rate: 0.15 },
  { upTo: 2000000, rate: 0.2 },
  { upTo: 2400000, rate: 0.25 },
  { upTo: null, rate: 0.3 },
];

const OLD_SURCHARGE: SurchargeBand[] = [
  { over: 5000000, rate: 0.1 },
  { over: 10000000, rate: 0.15 },
  { over: 20000000, rate: 0.25 },
  { over: 50000000, rate: 0.37 },
];

// New regime caps surcharge at 25%.
const NEW_SURCHARGE: SurchargeBand[] = [
  { over: 5000000, rate: 0.1 },
  { over: 10000000, rate: 0.15 },
  { over: 20000000, rate: 0.25 },
];

function oldRegime(): RegimeDef {
  return {
    slabs: OLD_SLABS,
    standardDeduction: 50000,
    rebate: { taxableCeiling: 500000, maxRebate: 12500, marginalRelief: false },
    surcharge: OLD_SURCHARGE,
    allowsItemizedDeductions: true,
  };
}

function newRegime(): RegimeDef {
  return {
    slabs: NEW_SLABS_2025,
    standardDeduction: 75000,
    rebate: { taxableCeiling: 1200000, maxRebate: 60000, marginalRelief: true },
    surcharge: NEW_SURCHARGE,
    allowsItemizedDeductions: false,
  };
}

/** Regime definitions per FY. FY 2026-27 mirrors 2025-26 until amended. */
export const REGIMES: Record<FyKey, Record<RegimeKey, RegimeDef>> = {
  '2025-26': { old: oldRegime(), new: newRegime() },
  '2026-27': { old: oldRegime(), new: newRegime() },
};

/** Progressive slab tax on a taxable income (rupees). */
export function slabTax(taxable: number, slabs: Slab[]): number {
  let tax = 0;
  let lower = 0;
  for (const slab of slabs) {
    const upper = slab.upTo ?? Infinity;
    if (taxable > lower) {
      const band = Math.min(taxable, upper) - lower;
      tax += band * slab.rate;
    }
    lower = upper;
    if (taxable <= upper) break;
  }
  return tax;
}

function surchargeFor(taxBeforeSurcharge: number, totalIncome: number, bands: SurchargeBand[]): number {
  let rate = 0;
  for (const b of bands) if (totalIncome > b.over) rate = b.rate;
  return Math.round(taxBeforeSurcharge * rate);
}

export interface RegimeResult {
  taxable: number;
  /** Tax after 87A rebate, before surcharge & cess. */
  tax: number;
  rebate: number;
  surcharge: number;
  cess: number;
  total: number;
}

/**
 * Compute tax for a regime given the already-derived taxable income.
 * Rounds to whole rupees at each statutory step.
 */
export function computeRegimeTax(taxable: number, def: RegimeDef): RegimeResult {
  const taxableR = Math.max(0, Math.round(taxable));
  let baseTax = slabTax(taxableR, def.slabs);

  // Section 87A rebate.
  let rebate = 0;
  if (taxableR <= def.rebate.taxableCeiling) {
    rebate = Math.min(baseTax, def.rebate.maxRebate);
  } else if (def.rebate.marginalRelief) {
    // Tax payable cannot exceed income above the rebate ceiling.
    const excess = taxableR - def.rebate.taxableCeiling;
    if (baseTax > excess) rebate = baseTax - excess;
  }
  const taxAfterRebate = Math.round(baseTax - rebate);

  const surcharge = surchargeFor(taxAfterRebate, taxableR, def.surcharge);
  const cess = Math.round((taxAfterRebate + surcharge) * CESS_RATE);
  const total = taxAfterRebate + surcharge + cess;

  return { taxable: taxableR, tax: taxAfterRebate, rebate, surcharge, cess, total };
}
