/**
 * Old-vs-new regime comparison.
 *
 * Given gross income, detected deductions, and (optionally) employer NPS
 * 80CCD(2), produces the TaxFy-shaped result the Tax page renders side-by-side,
 * plus a recommendation and human-readable tips. Pure and deterministic.
 */
import {
  REGIMES,
  computeRegimeTax,
  type FyKey,
  type RegimeResult,
} from './regimes-in';
import {
  deriveDeductions,
  totalDeductions,
  type DetectedDeduction,
  type TaxDeduction,
} from './deductions';

export interface TaxRegimeView {
  taxable: number;
  tax: number;
  surcharge: number;
  cess: number;
  total: number;
}

export interface TaxTip {
  t: string;
  d: string;
}

export interface TaxComparison {
  fy: string;
  grossIncome: number;
  deductions: TaxDeduction[];
  old: TaxRegimeView;
  new: TaxRegimeView;
  /** Which regime is cheaper. */
  recommended: 'old' | 'new';
  /** Rupee saving of the recommended regime over the other. */
  saving: number;
  tips: TaxTip[];
}

export interface CompareInput {
  fy: FyKey;
  grossIncome: number;
  detected: DetectedDeduction[];
  /** Employer NPS 80CCD(2) — the only major deduction allowed in new regime. */
  employerNps?: number;
}

const view = (r: RegimeResult): TaxRegimeView => ({
  taxable: r.taxable,
  tax: r.tax,
  surcharge: r.surcharge,
  cess: r.cess,
  total: r.total,
});

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function compareRegimes(input: CompareInput): TaxComparison {
  const defs = REGIMES[input.fy];
  const deductions = deriveDeductions(input.detected);
  const itemized = totalDeductions(deductions);
  const employerNps = input.employerNps ?? 0;

  const oldTaxable = input.grossIncome - defs.old.standardDeduction - itemized;
  const newTaxable = input.grossIncome - defs.new.standardDeduction - employerNps;

  const oldRes = computeRegimeTax(oldTaxable, defs.old);
  const newRes = computeRegimeTax(newTaxable, defs.new);

  const recommended = oldRes.total <= newRes.total ? 'old' : 'new';
  const saving = Math.abs(oldRes.total - newRes.total);

  return {
    fy: `FY ${input.fy.replace('-', '–')}`,
    grossIncome: input.grossIncome,
    deductions,
    old: view(oldRes),
    new: view(newRes),
    recommended,
    saving,
    tips: buildTips({ deductions, recommended, saving, oldRes, newRes }),
  };
}

function buildTips(args: {
  deductions: TaxDeduction[];
  recommended: 'old' | 'new';
  saving: number;
  oldRes: RegimeResult;
  newRes: RegimeResult;
}): TaxTip[] {
  const tips: TaxTip[] = [];

  if (args.saving > 0) {
    const r = args.recommended === 'old' ? 'old regime' : 'new regime';
    tips.push({
      t: `${args.recommended === 'old' ? 'Old' : 'New'} regime saves you ${inr(args.saving)}.`,
      d: `Based on detected evidence, the ${r} is cheaper this year by ${inr(args.saving)}. Verify with your CA before filing.`,
    });
  } else {
    tips.push({
      t: 'Both regimes cost the same.',
      d: 'Your detected deductions leave the two regimes neck and neck this year.',
    });
  }

  // Headroom tips for capped sections.
  for (const d of args.deductions) {
    if (d.cap != null && d.amount < d.cap) {
      const left = d.cap - d.amount;
      tips.push({
        t: `${d.section} has ${inr(left)} left.`,
        d: `You can claim up to ${inr(d.cap)} under ${d.section}; ${inr(left)} of headroom is unused.`,
      });
    } else if (d.cap != null && d.amount >= d.cap) {
      tips.push({
        t: `${d.section} is maxed.`,
        d: `All ${inr(d.cap)} of ${d.section} headroom is used. No action needed.`,
      });
    }
  }

  return tips;
}
