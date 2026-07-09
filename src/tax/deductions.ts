/**
 * Deduction derivation (old regime).
 *
 * Turns detected tax evidence (aggregated from tagged transactions) into the
 * TaxDeduction rows the UI shows, applying statutory caps. Only the old regime
 * allows these itemised deductions; the new regime ignores them (bar the
 * standard deduction + employer NPS 80CCD(2)).
 */

export type Section = '80C' | '80CCD(1B)' | '80D' | 'HRA' | '24(b)';

export interface TaxDeduction {
  section: string;
  label: string;
  amount: number; // claimed amount in rupees (post-cap)
  cap: number | null;
  evidence: number; // count of supporting transactions
  /** Caveat shown next to the row (e.g. HRA estimate / not computed). */
  note?: string;
}

/** Raw detected totals per section, before caps. */
export interface DetectedDeduction {
  section: Section;
  label: string;
  rawAmount: number;
  evidence: number;
  note?: string;
}

/** Statutory caps (rupees). HRA has no flat cap (computed exemption). */
export const DEDUCTION_CAPS: Record<Section, number | null> = {
  '80C': 150000,
  '80CCD(1B)': 50000,
  '80D': 75000, // self + senior-citizen parents ceiling; adjust per profile
  HRA: null,
  '24(b)': 200000, // self-occupied home-loan interest
};

/** Apply caps to detected evidence, producing display-ready deduction rows. */
export function deriveDeductions(detected: DetectedDeduction[]): TaxDeduction[] {
  return detected.map((d) => {
    const cap = DEDUCTION_CAPS[d.section];
    const amount = cap == null ? d.rawAmount : Math.min(d.rawAmount, cap);
    return { section: d.section, label: d.label, amount, cap, evidence: d.evidence, note: d.note };
  });
}

export interface HraInput {
  /** Rent actually paid this FY (rupees), from detected rent transactions. */
  annualRentPaid: number;
  /** HRA component of salary (rupees/yr) — profile `home.hraInSalary`. */
  annualHraReceived?: number;
  /** Basic + DA (rupees/yr) when known; not collected today. */
  annualBasicSalary?: number;
  cityTier?: 'metro' | 'non_metro';
}

export interface HraExemption {
  amount: number; // rupees, ≥ 0
  computed: boolean;
  note?: string;
}

/**
 * Statutory HRA exemption: min(HRA received, rent − 10% of basic,
 * 40/50% of basic by city tier) — NOT the full rent paid, which overstates
 * the old-regime deduction by lakhs. Without basic salary we fall back to
 * min(rent, HRA received) and say so; without the HRA-in-salary figure we
 * refuse to guess and claim nothing.
 */
export function computeHraExemption(i: HraInput): HraExemption {
  if (!i.annualHraReceived || i.annualHraReceived <= 0) {
    return {
      amount: 0,
      computed: false,
      note: 'Not computed — add "Annual HRA in salary" to your profile to claim the exemption.',
    };
  }
  if (i.annualBasicSalary && i.annualBasicSalary > 0) {
    const rentMinus = i.annualRentPaid - 0.1 * i.annualBasicSalary;
    const cityCap = (i.cityTier === 'metro' ? 0.5 : 0.4) * i.annualBasicSalary;
    return {
      amount: Math.max(0, Math.round(Math.min(i.annualHraReceived, rentMinus, cityCap))),
      computed: true,
    };
  }
  return {
    amount: Math.max(0, Math.round(Math.min(i.annualHraReceived, i.annualRentPaid))),
    computed: true,
    note: 'Estimate — statutory min() needs your basic salary; using min(HRA received, rent paid).',
  };
}

/** Total deductible amount across rows (used to derive old-regime taxable). */
export function totalDeductions(deductions: TaxDeduction[]): number {
  return deductions.reduce((sum, d) => sum + d.amount, 0);
}
