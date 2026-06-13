// Dev fixtures lifted from the design handoff's data.jsx.
// Source of truth until the SQLite-backed selectors land.
// Persona: Aditya & Sneha Iyer, Bengaluru — all fictional.

export type Confidence = 'high' | 'med' | 'low';
export type FlowDir = 'in' | 'out';
export type Cadence = 'Monthly' | 'Yearly' | 'Quarterly' | 'Irregular';
export type SubStatus = 'confirmed' | 'likely' | 'dismissed';
export type ReviewKind =
  | 'locked_pdf'
  | 'uncategorised'
  | 'low_confidence'
  | 'missing_profile';

export type FyKey = string; // was '2025-26' | '2026-27'

export interface FySummary {
  label: string;
  sub: string;
  income: number;
  expenses: number;
  invested: number;
  taxesPaid: number;
  savingsRate: number;
  prevSavingsRate: number;
  coverage: number;
  messages: number;
  runDate: string;
}

export interface IncomeMonth {
  m: string;
  salary: number;
  other: number;
}

export interface CategoryChild {
  name: string;
  amt: number;
}

export interface Category {
  id: string;
  name: string;
  amt: number;
  color: string;
  recurring: boolean;
  project?: string;
  children: CategoryChild[];
}

export interface TxnSource {
  type: 'email' | 'pdf';
  from: string;
  subject: string;
  date: string;
  body: string;
}

export interface Txn {
  id: string;
  date: string;
  merchant: string;
  cat: string;
  sub: string;
  amt: number;
  flow: FlowDir;
  ledgerFlow?: 'income' | 'expense' | 'transfer' | 'investment';
  conf: Confidence;
  acct: string;
  method: string;
  layer: number;
  reason: string;
  signal: string | null;
  classificationSource?: 'deterministic' | 'local_ml';
  acceptedPredictionId?: string | null;
  glyph: string;
  color: string;
  transfer?: boolean;
  recurring?: boolean;
  project?: string;
  taxSection?: string;
  review?: boolean;
  source: TxnSource;
}

export interface Subscription {
  id: string;
  name: string;
  cat: string;
  amt: number;
  cadence: Cadence;
  next: string;
  status: SubStatus;
  glyph: string;
  color: string;
  last: string;
}

export interface Investment {
  platform: string;
  kind: string;
  invested: number;
  value: number;
  color: string;
  glyph: string;
}

export interface Liability {
  name: string;
  kind: string;
  outstanding: number;
  emi: number;
  color: string;
  glyph: string;
  detail: string;
  taxSection?: string;
}

export interface InsurancePolicy {
  name: string;
  premium: number;
  section: string;
  glyph: string;
  color: string;
}

export interface TaxDeduction {
  section: string;
  label: string;
  amount: number;
  cap: number | null;
  evidence: number;
}

export interface TaxRegime {
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

export interface TaxFy {
  fy: string;
  grossIncome: number;
  deductions: TaxDeduction[];
  old: TaxRegime;
  new: TaxRegime;
  tips: TaxTip[];
}

export interface ReviewItem {
  id: string;
  kind: ReviewKind;
  icon: string;
  title: string;
  desc: string;
  action: string;
  count?: number;
}

export interface GmailRun {
  date: string;
  q: string;
  msgs: number;
  bytes: string;
  status: 'ok' | 'warn';
}

export interface ProfileSection {
  id: string;
  name: string;
  pct: number;
  fields: string;
  why: string;
}

export interface ClassifierLayer {
  n: number;
  name: string;
  desc: string;
}

export interface Household {
  name: string;
  initials: string;
  spouse: string;
  city: string;
  pan: string;
  employer: string;
  role: string;
}

export const household: Household = {
  name: 'Aditya Iyer',
  initials: 'AI',
  spouse: 'Sneha Iyer',
  city: 'Bengaluru, KA',
  pan: 'ABXPI····7K',
  employer: 'Nexora Systems Pvt Ltd',
  role: 'Staff Software Engineer',
};

export const fys: Record<FyKey, FySummary> = {
  '2025-26': {
    label: 'FY 2025–26',
    sub: 'Apr 2025 – Mar 2026 · complete',
    income: 4218000,
    expenses: 2106400,
    invested: 1284000,
    taxesPaid: 612000,
    savingsRate: 50,
    prevSavingsRate: 44,
    coverage: 94,
    messages: 14820,
    runDate: '12 Apr 2026, 9:14 AM',
  },
  '2026-27': {
    label: 'FY 2026–27',
    sub: 'Apr 2026 – Mar 2027 · YTD (2 months)',
    income: 742000,
    expenses: 358200,
    invested: 214000,
    taxesPaid: 104000,
    savingsRate: 52,
    prevSavingsRate: 50,
    coverage: 89,
    messages: 1140,
    runDate: '28 May 2026, 7:42 AM',
  },
};

/** A summary for any FY key — falls back to a synthesized label for live FYs
 *  not present in the demo `fys` map. */
export function fySummary(key: FyKey): FySummary {
  return fys[key] ?? {
    ...fys['2025-26'],
    label: `FY ${key}`,
  };
}

export const incomeMonths: IncomeMonth[] = [
  { m: 'Apr', salary: 318000, other: 0 },
  { m: 'May', salary: 318000, other: 24000 },
  { m: 'Jun', salary: 318000, other: 0 },
  { m: 'Jul', salary: 318000, other: 86000 },
  { m: 'Aug', salary: 318000, other: 0 },
  { m: 'Sep', salary: 318000, other: 41000 },
  { m: 'Oct', salary: 318000, other: 0 },
  { m: 'Nov', salary: 318000, other: 158000 },
  { m: 'Dec', salary: 318000, other: 0 },
  { m: 'Jan', salary: 318000, other: 62000 },
  { m: 'Feb', salary: 318000, other: 0 },
  { m: 'Mar', salary: 354000, other: 96000 },
];

export const categories: Category[] = [
  {
    id: 'housing', name: 'Housing & rent', amt: 720000, color: '#6354E6', recurring: true,
    children: [
      { name: 'Rent — Prestige Lakeside', amt: 660000 },
      { name: 'Society maintenance', amt: 60000 },
    ],
  },
  {
    id: 'food', name: 'Food & groceries', amt: 384200, color: '#15A877', recurring: true,
    children: [
      { name: 'Quick-commerce (Zepto, Blinkit)', amt: 168200 },
      { name: 'Dining out', amt: 132000 },
      { name: 'Groceries (BigBasket)', amt: 84000 },
    ],
  },
  {
    id: 'transport', name: 'Transport', amt: 196000, color: '#FF8A6B', recurring: true,
    children: [
      { name: 'Cabs (Uber, Rapido)', amt: 96000 },
      { name: 'Fuel', amt: 64000 },
      { name: 'FASTag', amt: 36000 },
    ],
  },
  {
    id: 'utilities', name: 'Utilities & bills', amt: 148000, color: '#3B82F6', recurring: true,
    children: [
      { name: 'Electricity (BESCOM)', amt: 72000 },
      { name: 'Broadband (ACT)', amt: 18000 },
      { name: 'Mobile (Jio, Airtel)', amt: 19200 },
      { name: 'Gas + water', amt: 38800 },
    ],
  },
  {
    id: 'subs', name: 'Subscriptions', amt: 142800, color: '#A855F7', recurring: true,
    children: [
      { name: 'Streaming & media', amt: 28800 },
      { name: 'AI & dev tools', amt: 78000 },
      { name: 'Fitness (Cult.fit)', amt: 36000 },
    ],
  },
  {
    id: 'health', name: 'Health & wellness', amt: 124000, color: '#15A877', recurring: false,
    children: [
      { name: 'Pharmacy', amt: 42000 },
      { name: 'Doctor visits', amt: 38000 },
      { name: 'Diagnostics', amt: 44000 },
    ],
  },
  {
    id: 'shopping', name: 'Shopping & lifestyle', amt: 168400, color: '#FF8A6B', recurring: false,
    children: [
      { name: 'Amazon / Flipkart', amt: 98400 },
      { name: 'Apparel', amt: 70000 },
    ],
  },
  {
    id: 'help', name: 'House help & services', amt: 132000, color: '#F59E0B', recurring: true,
    children: [
      { name: 'Cook — Lakshmi (UPI)', amt: 72000 },
      { name: 'Cleaning — Ramesh (UPI)', amt: 60000 },
    ],
  },
  {
    id: 'travel', name: 'Travel (one-time)', amt: 91000, color: '#3B82F6', recurring: false,
    project: 'Goa anniversary trip',
    children: [
      { name: 'Flights (IndiGo)', amt: 38000 },
      { name: 'Hotel (Goa)', amt: 53000 },
    ],
  },
];

export const txns: Txn[] = [
  {
    id: 't1', date: '01 Mar 2026', merchant: 'Nexora Systems Pvt Ltd', cat: 'Salary', sub: 'Net salary credit',
    amt: 354000, flow: 'in', conf: 'high', acct: 'HDFC ··4821', method: 'NEFT credit',
    layer: 2, reason: 'Profile rule: credit from employer "Nexora Systems" matched on FY salary cadence (monthly, ±5%).',
    signal: 'profile.employer', glyph: 'N', color: '#6354E6',
    source: { type: 'email', from: 'payroll@nexora.systems', subject: 'Your salary for March 2026 has been credited', date: '01 Mar 2026', body: 'Net pay of ₹3,54,000.00 credited to A/C ending 4821. Gross ₹4,92,500 · TDS ₹98,500 · PF ₹40,000.' },
  },
  {
    id: 't2', date: '03 Mar 2026', merchant: 'Prestige Property Mgmt', cat: 'Housing & rent', sub: 'Rent — March',
    amt: 55000, flow: 'out', conf: 'high', acct: 'HDFC ··4821', method: 'NEFT',
    layer: 2, reason: 'Profile rule: recurring rent to landlord on file, amount + payee match across 11 prior months.',
    signal: 'profile.home.rent', glyph: 'P', color: '#FF8A6B',
    source: { type: 'email', from: 'noreply@nobroker.in', subject: 'Rent payment successful — ₹55,000', date: '03 Mar 2026', body: 'Your rent of ₹55,000 to Prestige Property Mgmt for Mar 2026 was successful via NoBroker Pay.' },
  },
  {
    id: 't3', date: '05 Mar 2026', merchant: 'HDFC Credit Card', cat: 'Card payment', sub: 'Statement payment',
    amt: 128400, flow: 'out', conf: 'high', acct: 'HDFC ··4821', method: 'Auto-debit',
    layer: 2, transfer: true, reason: 'Internal transfer: debit matched to HDFC card ··7702 statement total. Linked & excluded from expense rollups to avoid double-count.',
    signal: 'transfer.cc_payment', glyph: 'H', color: '#6354E6',
    source: { type: 'email', from: 'statements@hdfcbank.net', subject: 'Payment received — HDFC Bank Credit Card', date: '05 Mar 2026', body: 'We have received ₹1,28,400.00 towards your card ending 7702. Thank you.' },
  },
  {
    id: 't4', date: '07 Mar 2026', merchant: 'Lakshmi (Cook)', cat: 'House help', sub: 'Monthly wages',
    amt: 12000, flow: 'out', conf: 'med', acct: 'UPI · GPay', method: 'UPI',
    layer: 2, reason: 'Profile rule: UPI to house-help payee "Lakshmi" matched on name + amount + monthly cadence. Verify payee handle.',
    signal: 'profile.house_help', glyph: 'L', color: '#F59E0B',
    source: { type: 'email', from: 'noreply@gpay.google.com', subject: 'You paid ₹12,000 to Lakshmi B', date: '07 Mar 2026', body: 'Paid ₹12,000.00 to lakshmi.b@okhdfcbank via UPI. UPI ref 6042··1180.' },
  },
  {
    id: 't5', date: '09 Mar 2026', merchant: 'Zepto', cat: 'Food & groceries', sub: 'Quick-commerce',
    amt: 1840, flow: 'out', conf: 'high', acct: 'HDFC CC ··7702', method: 'Card',
    layer: 4, reason: 'Merchant alias: "ZEPTO MARKETPLACE BLR" → Zepto (quick-commerce pack). Category from pack default.',
    signal: 'pack.merchants.quick-commerce', glyph: 'Z', color: '#15A877',
    source: { type: 'email', from: 'orders@zeptonow.com', subject: 'Order delivered — ₹1,840', date: '09 Mar 2026', body: '12 items delivered in 9 minutes. Order total ₹1,840.00 paid via HDFC card ··7702.' },
  },
  {
    id: 't6', date: '11 Mar 2026', merchant: 'Cursor', cat: 'Subscriptions', sub: 'AI & dev tools',
    amt: 1720, flow: 'out', conf: 'med', acct: 'HDFC CC ··7702', method: 'Card',
    layer: 6, recurring: true, reason: 'Recurrence: $20 USD charge from "CURSOR AI" seen monthly for 8 months → flagged as subscription. FX-converted.',
    signal: 'recurrence.monthly', glyph: 'C', color: '#A855F7',
    source: { type: 'email', from: 'receipts@cursor.com', subject: 'Your receipt from Cursor', date: '11 Mar 2026', body: 'Cursor Pro — $20.00 (₹1,720.00). Next renewal 11 Apr 2026.' },
  },
  {
    id: 't7', date: '14 Mar 2026', merchant: 'IndiGo', cat: 'Travel', sub: 'Goa anniversary trip',
    amt: 38000, flow: 'out', conf: 'high', acct: 'HDFC CC ··7702', method: 'Card', project: 'Goa anniversary trip',
    layer: 9, reason: 'One-time project: matches "Goa anniversary trip" window (Mar 2026) + travel merchant. Isolated from recurring-lifestyle rollups.',
    signal: 'project.one_time', glyph: 'I', color: '#3B82F6',
    source: { type: 'email', from: 'no-reply@goindigo.in', subject: 'Booking confirmed — BLR → GOI', date: '14 Mar 2026', body: '2 passengers · BLR→GOI 22 Mar, GOI→BLR 26 Mar. Total ₹38,000.00.' },
  },
  {
    id: 't8', date: '16 Mar 2026', merchant: 'Groww', cat: 'Investment', sub: 'ELSS SIP — 80C',
    amt: 25000, flow: 'out', conf: 'high', acct: 'HDFC ··4821', method: 'SIP auto-debit', taxSection: '80C',
    layer: 2, reason: 'Profile rule: SIP to broker Groww. ELSS fund → tagged as 80C tax evidence.',
    signal: 'profile.broker.groww', glyph: 'G', color: '#15A877',
    source: { type: 'email', from: 'noreply@groww.in', subject: 'SIP successful — Axis ELSS Tax Saver', date: '16 Mar 2026', body: 'Your SIP of ₹25,000.00 in Axis ELSS Tax Saver (Direct-Growth) was successful. Units allotted: 312.4.' },
  },
  {
    id: 't9', date: '18 Mar 2026', merchant: 'BESCOM', cat: 'Utilities & bills', sub: 'Electricity',
    amt: 6240, flow: 'out', conf: 'high', acct: 'HDFC ··4821', method: 'Auto-pay',
    layer: 3, reason: 'Provider rule: BESCOM (institutions pack) → Utilities/Electricity.',
    signal: 'pack.institutions', glyph: 'B', color: '#3B82F6',
    source: { type: 'email', from: 'ebill@bescom.org', subject: 'Electricity bill paid — ₹6,240', date: '18 Mar 2026', body: 'Bill for RR No. 31··902 paid. Units 642 kWh. Amount ₹6,240.00.' },
  },
  {
    id: 't10', date: '21 Mar 2026', merchant: 'UPI/8147··2290', cat: 'Uncategorised', sub: 'Needs review',
    amt: 4500, flow: 'out', conf: 'low', acct: 'UPI · GPay', method: 'UPI',
    layer: 7, review: true, reason: 'Fallback: no override, profile, provider, alias, keyword, or recurrence match. Raw UPI handle only. Sent to review queue.',
    signal: null, glyph: '?', color: '#94A3B8',
    source: { type: 'email', from: 'noreply@gpay.google.com', subject: 'You paid ₹4,500 to 8147··2290@ybl', date: '21 Mar 2026', body: 'Paid ₹4,500.00 via UPI. No merchant name available.' },
  },
  {
    id: 't11', date: '24 Mar 2026', merchant: 'Star Health', cat: 'Insurance', sub: 'Health premium — 80D',
    amt: 31200, flow: 'out', conf: 'high', acct: 'HDFC ··4821', method: 'Net banking', taxSection: '80D',
    layer: 2, reason: 'Profile rule: health insurer on file (Star Health, family floater). Premium → 80D tax evidence.',
    signal: 'profile.insurer', glyph: 'S', color: '#15A877',
    source: { type: 'email', from: 'policy@starhealth.in', subject: 'Premium received — Family Health Optima', date: '24 Mar 2026', body: 'Premium ₹31,200.00 received for policy ··4471 (self, spouse, 2 dependents). Valid to 23 Mar 2027.' },
  },
  {
    id: 't12', date: '27 Mar 2026', merchant: 'Cult.fit', cat: 'Subscriptions', sub: 'Fitness',
    amt: 3000, flow: 'out', conf: 'high', acct: 'HDFC CC ··7702', method: 'Card',
    layer: 6, recurring: true, reason: 'Recurrence + alias: "CULTFIT" monthly for 12 months → confirmed subscription.',
    signal: 'recurrence.monthly', glyph: 'C', color: '#A855F7',
    source: { type: 'email', from: 'noreply@cult.fit', subject: 'Cult Pass renewed — ₹3,000', date: '27 Mar 2026', body: 'Your Cult Pass Elite renewed for ₹3,000.00. Next charge 27 Apr 2026.' },
  },
];

export const subscriptions: Subscription[] = [
  { id: 's1', name: 'Cursor Pro', cat: 'AI & dev tools', amt: 1720, cadence: 'Monthly', next: '11 Jun 2026', status: 'confirmed', glyph: 'C', color: '#A855F7', last: '₹1,720 on 11 May' },
  { id: 's2', name: 'Cult.fit Elite', cat: 'Fitness', amt: 3000, cadence: 'Monthly', next: '27 Jun 2026', status: 'confirmed', glyph: 'C', color: '#FF8A6B', last: '₹3,000 on 27 May' },
  { id: 's3', name: 'Netflix Premium', cat: 'Streaming', amt: 649, cadence: 'Monthly', next: '04 Jun 2026', status: 'confirmed', glyph: 'N', color: '#6354E6', last: '₹649 on 04 May' },
  { id: 's4', name: 'Spotify Family', cat: 'Streaming', amt: 179, cadence: 'Monthly', next: '09 Jun 2026', status: 'confirmed', glyph: 'S', color: '#15A877', last: '₹179 on 09 May' },
  { id: 's5', name: 'Claude Pro', cat: 'AI & dev tools', amt: 1720, cadence: 'Monthly', next: '15 Jun 2026', status: 'confirmed', glyph: 'C', color: '#FF8A6B', last: '₹1,720 on 15 May' },
  { id: 's6', name: 'GitHub Copilot', cat: 'AI & dev tools', amt: 860, cadence: 'Monthly', next: '02 Jun 2026', status: 'confirmed', glyph: 'G', color: '#3B82F6', last: '₹860 on 02 May' },
  { id: 's7', name: 'Amazon Prime', cat: 'Shopping', amt: 1499, cadence: 'Yearly', next: '18 Nov 2026', status: 'confirmed', glyph: 'A', color: '#6354E6', last: '₹1,499 on 18 Nov' },
  { id: 's8', name: 'Notion Plus', cat: 'Productivity', amt: 720, cadence: 'Monthly', next: '06 Jun 2026', status: 'likely', glyph: 'N', color: '#15A877', last: '₹720 — seen 5 months' },
  { id: 's9', name: 'iCloud+ 2TB', cat: 'Storage', amt: 749, cadence: 'Monthly', next: '12 Jun 2026', status: 'likely', glyph: 'i', color: '#3B82F6', last: '₹749 — seen 4 months' },
  { id: 's10', name: 'Hotstar Super', cat: 'Streaming', amt: 499, cadence: 'Yearly', next: '—', status: 'likely', glyph: 'H', color: '#A855F7', last: '₹499 — single charge' },
];

export const investments: Investment[] = [
  { platform: 'Groww', kind: 'Mutual funds · ELSS, index', invested: 540000, value: 612400, color: '#15A877', glyph: 'G' },
  { platform: 'Zerodha', kind: 'Equity · direct stocks', invested: 380000, value: 441800, color: '#6354E6', glyph: 'Z' },
  { platform: 'NPS (Protean)', kind: 'Retirement · 80CCD(1B)', invested: 200000, value: 224600, color: '#3B82F6', glyph: 'N' },
  { platform: 'Kuvera', kind: 'Mutual funds · debt', invested: 164000, value: 171200, color: '#FF8A6B', glyph: 'K' },
];

export const liabilities: Liability[] = [
  { name: 'Home loan — HDFC', kind: 'EMI ₹62,000/mo · 8.4%', outstanding: 4820000, emi: 62000, color: '#6354E6', glyph: 'H', taxSection: '24(b)', detail: 'Principal ₹18,400 · Interest ₹43,600 per EMI' },
  { name: 'Car loan — ICICI', kind: 'EMI ₹18,400/mo · 9.1%', outstanding: 412000, emi: 18400, color: '#3B82F6', glyph: 'I', detail: '14 of 36 EMIs remaining' },
  { name: 'HDFC Credit Card ··7702', kind: 'Revolving · paid in full', outstanding: 0, emi: 0, color: '#FF8A6B', glyph: 'H', detail: 'No interest charged — cleared monthly' },
];

export const insurance: InsurancePolicy[] = [
  { name: 'Star Health — Family Optima', premium: 31200, section: '80D', glyph: 'S', color: '#15A877' },
  { name: 'HDFC Life — Term (₹2 Cr)', premium: 28800, section: '80C', glyph: 'H', color: '#6354E6' },
  { name: 'Bajaj — Parents health', premium: 42000, section: '80D', glyph: 'B', color: '#3B82F6' },
];

export const tax: TaxFy = {
  fy: 'FY 2025–26',
  grossIncome: 4920000,
  deductions: [
    { section: '80C', label: 'ELSS + term life + EPF + tuition', amount: 150000, cap: 150000, evidence: 6 },
    { section: '80CCD(1B)', label: 'NPS additional contribution', amount: 50000, cap: 50000, evidence: 3 },
    { section: '80D', label: 'Health premiums (self + parents)', amount: 73200, cap: 75000, evidence: 4 },
    { section: 'HRA', label: 'House rent allowance exemption', amount: 396000, cap: null, evidence: 11 },
    { section: '24(b)', label: 'Home loan interest', amount: 200000, cap: 200000, evidence: 12 },
  ],
  old: { taxable: 4050800, tax: 612000, surcharge: 0, cess: 24480, total: 636480 },
  new: { taxable: 4845000, tax: 731000, surcharge: 0, cess: 29240, total: 760240 },
  tips: [
    { t: '80C is maxed.', d: 'All ₹1,50,000 headroom is used across ELSS, EPF and term-life premium. No action needed.' },
    { t: 'Old regime saves you ₹1,23,760.', d: 'Your HRA (₹3,96,000) and home-loan interest (₹2,00,000) make the old regime materially cheaper this year.' },
    { t: '80D has ₹1,800 left.', d: 'You can claim up to ₹75,000; preventive health check-ups for your parents would close the gap.' },
  ],
};

export const review: ReviewItem[] = [
  { id: 'r1', kind: 'locked_pdf', icon: 'lock-keyhole', title: 'Axis Bank statement — Jan 2026 is password-protected', desc: 'qpdf tried 4 profile-derived candidates (DOB, PAN, last-4, mobile) and none worked. Add a hint to unlock.', action: 'Add password' },
  { id: 'r2', kind: 'uncategorised', icon: 'help-circle', title: '14 merchants are uncategorised', desc: 'Mostly raw UPI handles with no merchant name. Bulk-assign categories to clear them in one pass.', action: 'Bulk assign', count: 14 },
  { id: 'r3', kind: 'low_confidence', icon: 'gauge', title: '6 classifications are low-confidence', desc: 'These matched only on weak keyword signals. A quick confirm teaches the classifier for next time.', action: 'Review 6', count: 6 },
  { id: 'r4', kind: 'missing_profile', icon: 'user-round', title: 'Add your second bank to improve coverage', desc: "We see credits referencing an ICICI account that isn't in your profile. Adding it lifts coverage to ~98%.", action: 'Add account' },
  { id: 'r5', kind: 'locked_pdf', icon: 'scan-line', title: 'SBI statement — Nov 2025 is a scanned image', desc: "OCR (Tesseract) recovered text at 81% confidence. Spot-check 3 figures we weren't sure about.", action: 'Check OCR', count: 3 },
];

export const runs: GmailRun[] = [
  { date: '28 May 2026, 7:42 AM', q: 'from:(payroll@nexora.systems OR statements@hdfcbank.net) after:2026/04/01', msgs: 142, bytes: '38 MB', status: 'ok' },
  { date: '12 Apr 2026, 9:14 AM', q: 'subject:(statement OR receipt OR invoice) -in:spam -in:trash after:2025/04/01 before:2026/04/01', msgs: 14820, bytes: '2.1 GB', status: 'ok' },
  { date: '12 Apr 2026, 9:02 AM', q: 'from:(*@groww.in OR *@zerodha.com OR *@nps*) has:attachment', msgs: 286, bytes: '94 MB', status: 'ok' },
  { date: '11 Apr 2026, 8:48 PM', q: 'label:^smartlabel_receipt has:attachment larger:1M', msgs: 1204, bytes: '1.4 GB', status: 'warn' },
];

export const profileSections: ProfileSection[] = [
  { id: 'personal', name: 'Personal', pct: 100, fields: 'Name, PAN, DOB, city', why: 'PAN and DOB derive passwords for locked statement PDFs.' },
  { id: 'accounts', name: 'Banks & cards', pct: 80, fields: '2 banks, 2 cards', why: 'Last-4 digits link card payments and unlock statements.' },
  { id: 'employer', name: 'Employer & income', pct: 100, fields: 'Nexora Systems, salary', why: 'Detects salary credits and separates them from other income.' },
  { id: 'family', name: 'Family', pct: 60, fields: 'Spouse, 2 dependents', why: 'Identifies house-help payees and dependent insurance.' },
  { id: 'home', name: 'Home & rent', pct: 100, fields: 'Rent ₹55,000, landlord', why: 'Matches rent payments and computes HRA exemption.' },
  { id: 'investments', name: 'Brokers & platforms', pct: 75, fields: 'Groww, Zerodha, NPS', why: 'Tags SIPs and contributions to the right platform and tax section.' },
  { id: 'subscriptions', name: 'Subscriptions', pct: 40, fields: '7 confirmed', why: 'Improves recurring-charge detection accuracy.' },
  { id: 'annual', name: 'Annual & one-time', pct: 30, fields: 'Goa trip', why: 'Isolates big one-off spends from your monthly lifestyle view.' },
];

export const classifierLayers: ClassifierLayer[] = [
  { n: 1, name: 'User overrides', desc: 'Exact rules you set' },
  { n: 2, name: 'Profile rules', desc: 'Salary, EMI, rent, house-help, insurance' },
  { n: 3, name: 'Provider rules', desc: 'Bank / institution patterns' },
  { n: 4, name: 'Merchant aliases', desc: 'Pack + your aliases' },
  { n: 5, name: 'Keyword rules', desc: 'Generic descriptors' },
  { n: 6, name: 'Recurrence', desc: 'Subscription cadence detection' },
  { n: 7, name: 'Fallback', desc: 'Uncategorised → review queue' },
  { n: 8, name: 'Transfer dedupe', desc: 'Internal movement excluded from rollups' },
  { n: 9, name: 'Project isolation', desc: 'One-time project spend separated' },
  { n: 10, name: 'Local memory', desc: 'Reviewed examples on this device' },
];
