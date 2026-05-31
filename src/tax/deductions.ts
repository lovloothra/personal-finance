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
}

/** Raw detected totals per section, before caps. */
export interface DetectedDeduction {
  section: Section;
  label: string;
  rawAmount: number;
  evidence: number;
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
    return { section: d.section, label: d.label, amount, cap, evidence: d.evidence };
  });
}

/** Total deductible amount across rows (used to derive old-regime taxable). */
export function totalDeductions(deductions: TaxDeduction[]): number {
  return deductions.reduce((sum, d) => sum + d.amount, 0);
}
