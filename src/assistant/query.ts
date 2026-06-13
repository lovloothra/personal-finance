export type AssistantTool =
  | 'cashflow'
  | 'category_spend'
  | 'merchant_search'
  | 'tax_evidence'
  | 'subscriptions'
  | 'review_queue'
  | 'provenance'
  | 'unsupported';

export type AssistantToolSelection =
  | { tool: 'cashflow'; args: { fyKey?: string } }
  | { tool: 'category_spend'; args: { category: string; fyKey?: string } }
  | { tool: 'merchant_search'; args: { merchant: string; fyKey?: string } }
  | { tool: 'tax_evidence'; args: { section?: string; fyKey?: string } }
  | { tool: 'subscriptions'; args: { fyKey?: string } }
  | { tool: 'review_queue'; args: Record<string, never> }
  | { tool: 'provenance'; args: { transactionId?: string; merchant?: string } }
  | { tool: 'unsupported'; args: { reason: 'unsafe_or_unsupported' } };

const CATEGORY_ALIASES: Array<[RegExp, string]> = [
  [/\bfood delivery\b|\bswiggy\b|\bzomato\b/, 'Food Delivery'],
  [/\bquick commerce\b|\bzepto\b|\bblinkit\b|\binstamart\b/, 'Quick Commerce'],
  [/\bgrocer(?:y|ies)\b|\bsupermarket\b/, 'Groceries'],
  [/\bdining\b|\brestaurant\b|\beats?\b/, 'Dining'],
  [/\btravel\b|\bflight\b|\bhotel\b/, 'Travel'],
  [/\btransport\b|\bcab\b|\bfuel\b|\bmetro\b/, 'Transport'],
  [/\bshopping\b|\bclothes\b|\bfashion\b/, 'Shopping'],
  [/\butilit(?:y|ies)\b|\belectricity\b|\bwater\b|\bgas\b/, 'Utilities'],
  [/\bhousing\b|\brent\b/, 'Housing'],
  [/\bloan\b|\bemi\b/, 'Loan'],
  [/\binsurance\b|\bpremium\b/, 'Insurance'],
  [/\binvest(?:ment|ments)?\b|\bsip\b/, 'Investment'],
  [/\bhealth\b|\bmedical\b|\bdoctor\b/, 'Health'],
  [/\bfitness\b|\bgym\b/, 'Fitness'],
  [/\beducation\b|\bschool\b|\btuition\b/, 'Education'],
  [/\bentertainment\b|\bmovie\b/, 'Entertainment'],
  [/\bsubscriptions?\b|\brecurring\b/, 'Subscriptions'],
  [/\bsoftware\b|\bsaas\b/, 'Software'],
  [/\bsalary\b/, 'Salary'],
  [/\bincome\b/, 'Income'],
  [/\brefund\b/, 'Refund'],
];

export function selectAssistantTool(question: string): AssistantToolSelection {
  const q = question.toLowerCase().trim();
  if (!q || hasUnsafeSqlShape(q)) return { tool: 'unsupported', args: { reason: 'unsafe_or_unsupported' } };

  const fyKey = extractFyKey(q);
  if (/\breview\b|\buncategorised\b|\buncategorized\b|\blow confidence\b/.test(q)) {
    return { tool: 'review_queue', args: {} };
  }
  if (/\bsubscription|\brecurring\b/.test(q)) return { tool: 'subscriptions', args: withFy(fyKey) };
  if (/\btax\b|\b80c\b|\b80d\b|\bhra\b|\b24b\b/.test(q)) {
    return { tool: 'tax_evidence', args: withFy(fyKey, { section: extractTaxSection(q) }) };
  }
  if (/\bprovenance\b|\bsource\b|\bwhy\b|\bclassified\b|\bclassification\b/.test(q)) {
    return { tool: 'provenance', args: extractProvenanceArgs(q) };
  }
  if (/\bcash\s*flow\b|\bcashflow\b|\bnet\b|\bincome vs expense\b/.test(q)) {
    return { tool: 'cashflow', args: withFy(fyKey) };
  }
  if (/\bspend\b|\bspent\b|\bexpense\b/.test(q)) {
    const category = extractCategory(q);
    if (category) return { tool: 'category_spend', args: withFy(fyKey, { category }) };
  }
  const merchant = extractMerchant(q);
  if (merchant) return { tool: 'merchant_search', args: withFy(fyKey, { merchant }) };

  return { tool: 'unsupported', args: { reason: 'unsafe_or_unsupported' } };
}

function hasUnsafeSqlShape(q: string): boolean {
  return /\b(sql|select|insert|update|delete|drop|alter|pragma|attach|detach|union|sqlite_master)\b/.test(q);
}

function extractFyKey(q: string): string | undefined {
  const match = q.match(/\b(?:fy\s*)?(20\d{2})[-/](\d{2})\b/);
  return match ? `${match[1]}-${match[2]}` : undefined;
}

function extractTaxSection(q: string): string | undefined {
  const match = q.match(/\b(80c|80d|80ccd1b|24b|hra)\b/);
  return match?.[1]?.toUpperCase();
}

function extractCategory(q: string): string | null {
  for (const [pattern, category] of CATEGORY_ALIASES) {
    if (pattern.test(q)) return category;
  }
  return null;
}

function extractMerchant(q: string): string | null {
  const match = q.match(/\b(?:merchant|at|from|with)\s+([a-z0-9 .&_-]{3,40})/);
  return match?.[1]?.replace(/[?.!,]+$/g, '').trim() || null;
}

function extractProvenanceArgs(q: string): { transactionId?: string; merchant?: string } {
  const txn = q.match(/\b(txn[_-][a-z0-9_-]+)\b/);
  if (txn) return { transactionId: txn[1] };
  const merchant = extractMerchant(q);
  return merchant ? { merchant } : {};
}

function withFy<T extends Record<string, unknown>>(fyKey: string | undefined, args = {} as T): T & { fyKey?: string } {
  const clean = Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined)) as T;
  return fyKey ? { ...clean, fyKey } : clean;
}
