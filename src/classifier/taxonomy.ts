/**
 * Canonical category taxonomy keyed by flow. Replaces the ad-hoc free-form
 * category strings (mixed casing and dotted paths). `normalizeCategory` folds
 * legacy strings onto canonical keys for the one-time data migration and the UI.
 */
import type { Flow } from './types';

export const TAXONOMY: Record<Flow, string[]> = {
  income: ['salary', 'interest', 'dividend', 'capital_gains', 'rental_income', 'reimbursement', 'refund', 'gift', 'other_income'],
  expense: [
    'housing', 'rent', 'utilities', 'electricity', 'water', 'gas', 'mobile_internet',
    'groceries', 'food_delivery', 'dining', 'quick_commerce', 'transport', 'fuel', 'cabs',
    'travel', 'hotels', 'health', 'pharmacy', 'insurance', 'subscriptions', 'household',
    'charity', 'loan', 'uncategorised',
  ],
  transfer: ['self_transfer', 'cc_payment', 'atm_cash'],
  investment: ['investment'],
};

/** Legacy free-form string -> canonical key. Lowercased lookup. */
const LEGACY_MAP: Record<string, string> = {
  salary: 'salary',
  income: 'other_income',
  interest: 'interest',
  dividend: 'dividend',
  refund: 'refund',
  transfer: 'self_transfer',
  'credit card payment': 'cc_payment',
  'card autopay': 'cc_payment',
  'atm withdrawal': 'atm_cash',
  cash: 'atm_cash',
  rent: 'rent',
  housing: 'housing',
  utilities: 'utilities',
  electricity: 'electricity',
  water: 'water',
  gas: 'gas',
  'mobile/internet': 'mobile_internet',
  transport: 'transport',
  fuel: 'fuel',
  hotels: 'hotels',
  insurance: 'insurance',
  loan: 'loan',
  subscriptions: 'subscriptions',
  household: 'household',
  charity: 'charity',
  investment: 'investment',
  'quick-commerce': 'quick_commerce',
  'expenses.travel': 'travel',
  'expenses.groceries': 'groceries',
  'expenses.transport.cabs': 'cabs',
  'expenses.quick_commerce': 'quick_commerce',
  'expenses.health.pharmacy': 'pharmacy',
  'expenses.food_delivery': 'food_delivery',
};

export function categoriesForFlow(flow: Flow): string[] {
  return TAXONOMY[flow];
}

export function normalizeCategory(legacy: string | null | undefined): string {
  if (!legacy) return 'uncategorised';
  const key = legacy.trim().toLowerCase();
  if (LEGACY_MAP[key]) return LEGACY_MAP[key];
  // already canonical?
  for (const cats of Object.values(TAXONOMY)) if (cats.includes(key)) return key;
  // dotted path: take the leaf and snake-case it
  const leaf = key.split('.').pop()!.replace(/-/g, '_');
  for (const cats of Object.values(TAXONOMY)) if (cats.includes(leaf)) return leaf;
  return 'uncategorised';
}
