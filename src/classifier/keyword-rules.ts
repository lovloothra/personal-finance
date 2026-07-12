/**
 * Layer 5 — Generic keyword rules.
 *
 * Last-resort heuristics before recurrence/fallback: broad descriptors like
 * "salary", "atm", "fuel", "electricity". Lower confidence by design. A default
 * India-oriented rule set ships here; user/pack rules can be appended.
 */
import type { Classification, ClassifyContext, KeywordRule, RawTxn, Flow } from './types';
import { LAYER } from './types';
import { clean, containsWord } from './normalize';
import { isCredBillDeskCcPayment } from './cc-payment-signals';

export const DEFAULT_KEYWORD_RULES: KeywordRule[] = [
  // Internal transfers — excluded from income/expense rollups to avoid
  // double-counting a credit-card bill (the card spend + the bank payment).
  { keyword: 'credit card payment', category: 'Transfer', subcategory: 'Credit card payment', flow: 'transfer', confidence: 'high' },
  { keyword: 'cc payment', category: 'Transfer', subcategory: 'Credit card payment', flow: 'transfer', confidence: 'high' },
  { keyword: 'card payment', category: 'Transfer', subcategory: 'Credit card payment', flow: 'transfer', confidence: 'med' },
  // No bare-'autopay' rule: UPI AUTOPAY is the mandate rail for
  // Netflix/Spotify/SIP/insurance — real spending. Card-bill autopay is
  // detected at ingest by CARD_AUTOPAY_RE in transfers.ts (card context
  // required), which a single keyword cannot express.
  // CRED card-bill rail (cred.club VPAs). CRED's other VPAs (utilities etc.)
  // are real spending, so only the card-bill handle maps to Transfer.
  { keyword: 'cred.club', category: 'Transfer', subcategory: 'Credit card payment', flow: 'transfer', confidence: 'high' },
  { keyword: 'cred club', category: 'Transfer', subcategory: 'Credit card payment', flow: 'transfer', confidence: 'med' },
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

/**
 * Single-token keywords are substrings of everyday words — 'interest' matches
 * PINTEREST, 'gas' matches GASTRO — so they only match as whole words.
 * Multi-word phrases ("credit card payment") and punctuated handles
 * ("cred.club") are specific enough to keep substring matching.
 */
function keywordMatches(desc: string, keyword: string): boolean {
  return /^[a-z0-9]+$/.test(keyword) ? containsWord(desc, keyword) : desc.includes(keyword);
}

/**
 * A rule's forced flow must not contradict the transaction sign — an income
 * rule stamping a debit would push a negative amount into income rollups.
 * Transfers are valid in both directions (bank leg is a debit, card leg a
 * credit). Mirrors isPredictionFlowCompatible in src/intelligence/local-model.ts.
 */
function flowCompatible(amount: number, flow: Flow): boolean {
  if (flow === 'transfer') return true;
  if (amount > 0) return flow === 'income';
  return flow === 'expense' || flow === 'investment';
}

export function classifyByKeyword(
  txn: RawTxn,
  ctx: ClassifyContext,
): Classification | null {
  const desc = clean(txn.rawDescription);

  // Structural CRED-via-BillDesk card-bill rail. Requiring the full shape is
  // what makes this safe to mark as a transfer without user confirmation;
  // bare BillDesk/CRED descriptors remain ordinary review candidates.
  if (txn.amount < 0 && isCredBillDeskCcPayment(txn.rawDescription)) {
    return {
      flow: 'transfer',
      category: 'cc_payment',
      subcategory: 'Credit card payment',
      confidence: 'high',
      reason: 'Credit-card payment: debit matched the CRED-via-BillDesk BIL/ONL card-bill rail.',
      signal: 'keyword.cred_billdesk_cc_payment',
      layer: LAYER.KEYWORD,
      reviewRequired: false,
      isInternalTransfer: true,
    };
  }

  for (const rule of ctx.keywordRules) {
    if (rule.keyword && keywordMatches(desc, rule.keyword)) {
      if (rule.flow && !flowCompatible(txn.amount, rule.flow)) continue;
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
