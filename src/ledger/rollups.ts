/**
 * FY rollups: aggregate stored transactions into the shapes the dashboard
 * renders. Transactions are stored in signed paise; the dashboard works in
 * whole rupees, so every figure here is converted (÷100) on the way out.
 *
 * Internal transfers (CC payments, inter-account moves) are excluded from
 * income/expense rollups so money isn't double-counted — exactly the guarantee
 * the provenance drawer advertises.
 */
import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { transactions, gmailMessages, profilePersonal } from '@/db/schema';
import type { Flow } from '@/classifier/types';
import { compareRegimes, type TaxComparison, type DetectedDeduction, type Section } from '@/tax';
import { loadProfileSeed } from '@/profile/signals';
import { fyKey as makeFyKey, type FyKey } from './fy';

const PALETTE = ['#6354E6', '#FF8A6B', '#15A877', '#3B82F6', '#F59E0B', '#A855F7', '#EF4444', '#14B8A6'];
const toR = (paise: number | null | undefined) => Math.round((paise ?? 0) / 100);

export interface CategoryRollup {
  name: string;
  amount: number; // rupees
  color: string;
}
export interface MerchantRollup {
  name: string;
  amount: number; // rupees
  color: string;
  glyph: string;
}
export interface RecentTxn {
  id: string;
  date: string;
  merchant: string;
  cat: string;
  sub: string | null;
  amt: number; // rupees, signed
  flow: string;
  conf: string | null;
  layer: number | null;
  reason: string | null;
  signal: string | null;
  reviewRequired: boolean;
  source: { from: string | null; subject: string | null };
}

export interface OverviewRollup {
  fy: FyKey;
  hasData: boolean;
  name: string | null;
  income: number;
  expenses: number;
  invested: number;
  taxesPaid: number;
  net: number;
  savingsRate: number;
  prevSavingsRate: number;
  coverage: number | null;
  txnCount: number;
  topCategories: CategoryRollup[];
  topMerchants: MerchantRollup[];
  recent: RecentTxn[];
}

/** Sum (paise) of a flow within an FY, excluding internal transfers. */
function flowSum(db: DB, fy: string, flow: Flow): number {
  const row = db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .where(and(eq(transactions.fyKey, fy), eq(transactions.flow, flow), eq(transactions.isInternalTransfer, false)))
    .get();
  return row?.total ?? 0;
}

function savingsRate(incomeR: number, expenseR: number): number {
  return incomeR > 0 ? Math.round(((incomeR - expenseR) / incomeR) * 100) : 0;
}

export function overviewRollup(db: DB, fy: FyKey): OverviewRollup {
  const incomeP = flowSum(db, fy, 'income');
  const expenseP = Math.abs(flowSum(db, fy, 'expense'));
  const investedP = Math.abs(flowSum(db, fy, 'investment'));

  const income = toR(incomeP);
  const expenses = toR(expenseP);
  const invested = toR(investedP);

  // Previous FY savings rate for the delta chip.
  const prevFy = makeFyKey(Number(fy.slice(0, 4)) - 1);
  const prevIncome = toR(flowSum(db, prevFy, 'income'));
  const prevExpense = toR(Math.abs(flowSum(db, prevFy, 'expense')));

  // Taxes paid: transactions tagged to a tax/TDS category.
  const taxRow = db
    .select({ total: sql<number>`coalesce(sum(abs(${transactions.amount})), 0)` })
    .from(transactions)
    .where(and(eq(transactions.fyKey, fy), sql`lower(${transactions.category}) in ('tax', 'taxes', 'tds')`))
    .get();
  const taxesPaid = toR(taxRow?.total ?? 0);

  const txnCount = (db.select({ n: sql<number>`count(*)` }).from(transactions).where(eq(transactions.fyKey, fy)).get()?.n ?? 0) as number;

  const topCategories: CategoryRollup[] = db
    .select({ name: transactions.category, total: sql<number>`sum(abs(${transactions.amount}))` })
    .from(transactions)
    .where(and(eq(transactions.fyKey, fy), eq(transactions.flow, 'expense'), eq(transactions.isInternalTransfer, false)))
    .groupBy(transactions.category)
    .orderBy(desc(sql`sum(abs(${transactions.amount}))`))
    .limit(6)
    .all()
    .map((r, i) => ({ name: r.name ?? 'Uncategorised', amount: toR(r.total), color: PALETTE[i % PALETTE.length] }));

  const topMerchants: MerchantRollup[] = db
    .select({ name: sql<string>`coalesce(${transactions.merchant}, ${transactions.subcategory}, ${transactions.category})`, total: sql<number>`sum(abs(${transactions.amount}))` })
    .from(transactions)
    .where(and(eq(transactions.fyKey, fy), eq(transactions.isInternalTransfer, false)))
    .groupBy(sql`coalesce(${transactions.merchant}, ${transactions.subcategory}, ${transactions.category})`)
    .orderBy(desc(sql`sum(abs(${transactions.amount}))`))
    .limit(5)
    .all()
    .map((r, i) => {
      const name = r.name ?? 'Unknown';
      return { name, amount: toR(r.total), color: PALETTE[i % PALETTE.length], glyph: name.charAt(0).toUpperCase() };
    });

  const recent: RecentTxn[] = db
    .select({
      id: transactions.id,
      date: transactions.txnDate,
      merchant: sql<string>`coalesce(${transactions.merchant}, ${transactions.subcategory}, ${transactions.category})`,
      cat: transactions.category,
      sub: transactions.subcategory,
      amt: transactions.amount,
      flow: transactions.flow,
      conf: transactions.confidence,
      layer: transactions.layer,
      reason: transactions.classificationReason,
      signal: transactions.profileSignalUsed,
      reviewRequired: transactions.reviewRequired,
      from: gmailMessages.fromAddr,
      subject: gmailMessages.subject,
    })
    .from(transactions)
    .leftJoin(gmailMessages, eq(transactions.messageId, gmailMessages.id))
    .where(eq(transactions.fyKey, fy))
    .orderBy(desc(transactions.txnDate))
    .limit(8)
    .all()
    .map((r) => ({
      id: r.id,
      date: r.date,
      merchant: r.merchant ?? 'Unknown',
      cat: r.cat ?? 'Uncategorised',
      sub: r.sub,
      amt: toR(r.amt),
      flow: r.flow ?? 'expense',
      conf: r.conf,
      layer: r.layer,
      reason: r.reason,
      signal: r.signal,
      reviewRequired: Boolean(r.reviewRequired),
      source: { from: r.from, subject: r.subject },
    }));

  const name = db.select({ n: profilePersonal.fullName }).from(profilePersonal).limit(1).get()?.n ?? null;

  return {
    fy,
    hasData: txnCount > 0,
    name,
    income,
    expenses,
    invested,
    taxesPaid,
    net: income - expenses,
    savingsRate: savingsRate(income, expenses),
    prevSavingsRate: savingsRate(prevIncome, prevExpense),
    coverage: null,
    txnCount,
    topCategories,
    topMerchants,
    recent,
  };
}

// ---------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------

const MONTH_ORDER = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

export interface IncomeRollup {
  fy: FyKey;
  hasData: boolean;
  total: number;
  salaryTotal: number;
  otherTotal: number;
  employer: string | null;
  months: { m: string; salary: number; other: number }[];
  txns: RecentTxn[];
}

/** Map a stored txn row (with optional join) into the RecentTxn shape. */
function rowToRecent(r: {
  id: string; date: string; merchant: string | null; cat: string | null; sub: string | null;
  amt: number | null; flow: string | null; conf: string | null; layer: number | null;
  reason: string | null; signal: string | null; reviewRequired: unknown; from?: string | null; subject?: string | null;
}): RecentTxn {
  return {
    id: r.id, date: r.date, merchant: r.merchant ?? 'Unknown', cat: r.cat ?? 'Uncategorised', sub: r.sub,
    amt: toR(r.amt), flow: r.flow ?? 'expense', conf: r.conf, layer: r.layer, reason: r.reason, signal: r.signal,
    reviewRequired: Boolean(r.reviewRequired), source: { from: r.from ?? null, subject: r.subject ?? null },
  };
}

const recentCols = {
  id: transactions.id,
  date: transactions.txnDate,
  merchant: sql<string>`coalesce(${transactions.merchant}, ${transactions.subcategory}, ${transactions.category})`,
  cat: transactions.category,
  sub: transactions.subcategory,
  amt: transactions.amount,
  flow: transactions.flow,
  conf: transactions.confidence,
  layer: transactions.layer,
  reason: transactions.classificationReason,
  signal: transactions.profileSignalUsed,
  reviewRequired: transactions.reviewRequired,
  from: gmailMessages.fromAddr,
  subject: gmailMessages.subject,
} as const;

export function incomeRollup(db: DB, fy: FyKey): IncomeRollup {
  const rows = db
    .select({ date: transactions.txnDate, amount: transactions.amount, category: transactions.category })
    .from(transactions)
    .where(and(eq(transactions.fyKey, fy), eq(transactions.flow, 'income'), eq(transactions.isInternalTransfer, false)))
    .all();

  const months = MONTH_ORDER.map((m) => ({ m, salary: 0, other: 0 }));
  let salaryTotal = 0;
  let otherTotal = 0;
  for (const r of rows) {
    const monthIdx = MONTH_ORDER.indexOf(new Date(r.date + 'T00:00:00Z').toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }));
    const amtR = toR(r.amount);
    const isSalary = (r.category ?? '').toLowerCase() === 'salary';
    if (isSalary) salaryTotal += amtR;
    else otherTotal += amtR;
    if (monthIdx >= 0) months[monthIdx][isSalary ? 'salary' : 'other'] += amtR;
  }

  // The classifier records the employer name as the salary txn's subcategory;
  // fall back to the declared employer in the profile seed.
  let employer =
    db
      .select({ e: transactions.subcategory })
      .from(transactions)
      .where(and(eq(transactions.fyKey, fy), sql`lower(${transactions.category}) = 'salary'`, sql`${transactions.subcategory} is not null`))
      .limit(1)
      .get()?.e ?? null;
  if (!employer) {
    try {
      employer = loadProfileSeed().employer?.name ?? null;
    } catch {
      employer = null;
    }
  }
  const txns = db.select(recentCols).from(transactions).leftJoin(gmailMessages, eq(transactions.messageId, gmailMessages.id))
    .where(and(eq(transactions.fyKey, fy), eq(transactions.flow, 'income')))
    .orderBy(desc(transactions.txnDate)).limit(50).all().map(rowToRecent);

  return { fy, hasData: rows.length > 0, total: salaryTotal + otherTotal, salaryTotal, otherTotal, employer, months, txns };
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export interface ExpenseCategory {
  name: string;
  amt: number;
  color: string;
  recurring: boolean;
  project: string | null;
  children: { name: string; amt: number }[];
}
export interface ExpensesRollup {
  fy: FyKey;
  hasData: boolean;
  total: number;
  categories: ExpenseCategory[];
  txns: RecentTxn[];
}

export function expensesRollup(db: DB, fy: FyKey): ExpensesRollup {
  const rows = db
    .select({
      category: transactions.category,
      subcategory: transactions.subcategory,
      amt: sql<number>`sum(abs(${transactions.amount}))`,
      recurring: sql<number>`max(${transactions.isRecurring})`,
      project: sql<string | null>`max(${transactions.projectId})`,
    })
    .from(transactions)
    .where(and(eq(transactions.fyKey, fy), eq(transactions.flow, 'expense'), eq(transactions.isInternalTransfer, false)))
    .groupBy(transactions.category, transactions.subcategory)
    .all();

  const byCat = new Map<string, ExpenseCategory>();
  for (const r of rows) {
    const name = r.category ?? 'Uncategorised';
    const cat = byCat.get(name) ?? { name, amt: 0, color: '', recurring: false, project: null, children: [] };
    const amtR = toR(r.amt);
    cat.amt += amtR;
    if (r.recurring) cat.recurring = true;
    if (r.project) cat.project = r.project;
    if (r.subcategory) cat.children.push({ name: r.subcategory, amt: amtR });
    byCat.set(name, cat);
  }
  const categories = [...byCat.values()]
    .sort((a, b) => b.amt - a.amt)
    .map((c, i) => ({ ...c, color: PALETTE[i % PALETTE.length] }));
  const total = categories.reduce((s, c) => s + c.amt, 0);

  const txns = db.select(recentCols).from(transactions).leftJoin(gmailMessages, eq(transactions.messageId, gmailMessages.id))
    .where(and(eq(transactions.fyKey, fy), eq(transactions.flow, 'expense'), eq(transactions.isInternalTransfer, false)))
    .orderBy(desc(transactions.txnDate)).limit(100).all().map(rowToRecent);

  return { fy, hasData: rows.length > 0, total, categories, txns };
}

// ---------------------------------------------------------------------------
// Tax — feed src/tax compareRegimes from detected evidence
// ---------------------------------------------------------------------------

export interface TaxRollup {
  fy: FyKey;
  hasData: boolean;
  comparison: TaxComparison | null;
  evidence: RecentTxn[];
}

/** Normalise stored tax-section tags to the canonical Section keys. */
function normSection(s: string): Section | null {
  const m: Record<string, Section> = {
    '80c': '80C', '80d': '80D', '24b': '24(b)', '24(b)': '24(b)',
    '80ccd1b': '80CCD(1B)', '80ccd(1b)': '80CCD(1B)', hra: 'HRA',
  };
  return m[s.toLowerCase()] ?? null;
}
const SECTION_LABEL: Record<Section, string> = {
  '80C': 'ELSS / EPF / life (detected)',
  '80CCD(1B)': 'NPS additional contribution',
  '80D': 'Health premiums',
  HRA: 'Rent paid (HRA exemption)',
  '24(b)': 'Home-loan interest (EMI-derived)',
};

export function taxRollup(db: DB, fy: FyKey): TaxRollup {
  const income = incomeRollup(db, fy).total;

  const tagged = db
    .select({ section: transactions.taxSection, amt: sql<number>`sum(abs(${transactions.amount}))`, n: sql<number>`count(*)` })
    .from(transactions)
    .where(and(eq(transactions.fyKey, fy), sql`${transactions.taxSection} is not null`))
    .groupBy(transactions.taxSection)
    .all();

  const detected: DetectedDeduction[] = [];
  for (const t of tagged) {
    const sec = t.section ? normSection(t.section) : null;
    if (!sec) continue;
    detected.push({ section: sec, label: SECTION_LABEL[sec], rawAmount: toR(t.amt), evidence: t.n });
  }
  // HRA from detected rent, if not already tagged.
  if (!detected.some((d) => d.section === 'HRA')) {
    const rent = db
      .select({ amt: sql<number>`coalesce(sum(abs(${transactions.amount})),0)`, n: sql<number>`count(*)` })
      .from(transactions)
      .where(and(eq(transactions.fyKey, fy), eq(transactions.flow, 'expense'), sql`lower(${transactions.subcategory}) = 'rent'`))
      .get();
    if (rent && rent.amt > 0) detected.push({ section: 'HRA', label: SECTION_LABEL.HRA, rawAmount: toR(rent.amt), evidence: rent.n });
  }

  // The tax module ships slabs for these FYs; others fall back to no comparison.
  const supported = fy === '2025-26' || fy === '2026-27';
  const hasData = income > 0 && supported;
  const comparison = hasData ? compareRegimes({ fy: fy as '2025-26' | '2026-27', grossIncome: income, detected }) : null;

  const evidence = db.select(recentCols).from(transactions).leftJoin(gmailMessages, eq(transactions.messageId, gmailMessages.id))
    .where(and(eq(transactions.fyKey, fy), sql`${transactions.taxSection} is not null`))
    .orderBy(desc(transactions.txnDate)).limit(50).all().map(rowToRecent);

  return { fy, hasData, comparison, evidence };
}
