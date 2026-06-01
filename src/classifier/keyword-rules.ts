/**
 * Layer 5 — Generic keyword rules.
 *
 * Last-resort heuristics before recurrence/fallback: broad descriptors like
 * "salary", "atm", "fuel", "electricity". Lower confidence by design. A default
 * India-oriented rule set ships here; user/pack rules can be appended.
 */
import type { Classification, ClassifyContext, KeywordRule, RawTxn, Flow } from './types';
import { LAYER } from './types';
import { clean } from './normalize';

export const DEFAULT_KEYWORD_RULES: KeywordRule[] = [
  // Internal transfers — excluded from income/expense rollups to avoid
  // double-counting a credit-card bill (the card spend + the bank payment).
  { keyword: 'credit card payment', category: 'Transfer', subcategory: 'Credit card payment', flow: 'transfer', confidence: 'high' },
  { keyword: 'cc payment', category: 'Transfer', subcategory: 'Credit card payment', flow: 'transfer', confidence: 'high' },
  { keyword: 'card payment', category: 'Transfer', subcategory: 'Credit card payment', flow: 'transfer', confidence: 'med' },
  { keyword: 'autopay', category: 'Transfer', subcategory: 'Card autopay', flow: 'transfer', confidence: 'med' },
  { keyword: 'salary', category: 'Salary', flow: 'income', confidence: 'med' },
  { keyword: 'atm', category: 'Cash', subcategory: 'ATM withdrawal', flow: 'expense', confidence: 'med' },
  { keyword: 'fuel', category: 'Transport', subcategory: 'Fuel', flow: 'expense', confidence: 'med' },
  { keyword: 'petrol', category: 'Transport', subcategory: 'Fuel', flow: 'expense', confidence: 'med' },
  { keyword: 'electricity', category: 'Utilities', subcategory: 'Electricity', flow: 'expense', confidence: 'med' },
  { keyword: 'bescom', category: 'Utilities', subcategory: 'Electricity', flow: 'expense', confidence: 'med' },
  { keyword: 'water bill', category: 'Utilities', subcategory: 'Water', flow: 'expense', confidence: 'med' },
  { keyword: 'gas', category: 'Utilities', subcategory: 'Gas', flow: 'expense', confidence: 'low' },
  { keyword: 'recharge', category: 'Utilities', subcategory: 'Mobile/Internet', flow: 'expense', confidence: 'med' },
  { keyword: 'interest', category: 'Income', subcategory: 'Interest', flow: 'income', confidence: 'low' },
  { keyword: 'dividend', category: 'Income', subcategory: 'Dividend', flow: 'income', confidence: 'med' },
  { keyword: 'refund', category: 'Refund', flow: 'income', confidence: 'low' },
];

export function classifyByKeyword(
  txn: RawTxn,
  ctx: ClassifyContext,
): Classification | null {
  const desc = clean(txn.rawDescription);

  for (const rule of ctx.keywordRules) {
    if (rule.keyword && desc.includes(rule.keyword)) {
      const flow: Flow = rule.flow ?? (txn.amount > 0 ? 'income' : 'expense');
      return {
        flow,
        category: rule.category,
        subcategory: rule.subcategory ?? null,
        confidence: rule.confidence ?? 'low',
        reason: `Keyword rule: matched "${rule.keyword}" → ${rule.category}. Weak signal — confirm to teach the classifier.`,
        signal: `keyword.${rule.keyword.replace(/\s+/g, '_')}`,
        layer: LAYER.KEYWORD,
        reviewRequired: (rule.confidence ?? 'low') === 'low',
      };
    }
  }
  return null;
}
