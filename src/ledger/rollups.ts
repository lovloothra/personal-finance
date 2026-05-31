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
import { transactions, gmailMessages } from '@/db/schema';
import type { Flow } from '@/classifier/types';
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

  return {
    fy,
    hasData: txnCount > 0,
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
