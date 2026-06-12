import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { transactions, gmailMessages } from '@/db/schema';
import { signature } from '@/classifier/normalize';
import { json, badRequest } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASE_CATEGORIES = [
  'Food Delivery', 'Quick Commerce', 'Groceries', 'Dining', 'Travel', 'Transport', 'Shopping',
  'Utilities', 'Housing', 'Loan', 'Insurance', 'Investment', 'Health', 'Fitness', 'Education',
  'Entertainment', 'Ott', 'Subscriptions', 'Software', 'Salary', 'Income', 'Refund', 'Transfer',
  'Credit card payment', 'Cash', 'Household', 'Fees & Charges', 'Gifts & Donations', 'Personal Care',
];

interface Group {
  signature: string;
  sample: string;
  suggestedMerchant: string;
  count: number;
  total: number; // paise, sum of absolute amounts
  flow: string;
  category: string | null;
  firstDate: string;
  lastDate: string;
}

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Transactions awaiting review, grouped by normalized description signature so
 * one assignment can clear every occurrence of the same merchant at once.
 * Pass ?signature= to get the individual transactions behind one group, with
 * their source emails, so the user can judge before assigning.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const db = await getDb();

    const detailSig = new URL(req.url).searchParams.get('signature')?.trim();
    if (detailSig) {
      const detail = db
        .select({
          id: transactions.id,
          date: transactions.txnDate,
          amount: transactions.amount,
          rawDescription: transactions.rawDescription,
          reason: transactions.classificationReason,
          from: gmailMessages.fromAddr,
          subject: gmailMessages.subject,
        })
        .from(transactions)
        .leftJoin(gmailMessages, eq(transactions.messageId, gmailMessages.id))
        .where(eq(transactions.reviewRequired, true))
        .all()
        .filter((t) => signature(t.rawDescription ?? '') === detailSig)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((t) => ({ ...t, amount: Math.round(t.amount / 100) })); // paise → rupees
      return json({ signature: detailSig, txns: detail.slice(0, 100) });
    }
    const rows = db
      .select({
        rawDescription: transactions.rawDescription,
        amount: transactions.amount,
        txnDate: transactions.txnDate,
        flow: transactions.flow,
        category: transactions.category,
      })
      .from(transactions)
      .where(eq(transactions.reviewRequired, true))
      .all();

    const groups = new Map<string, Group>();
    for (const r of rows) {
      const desc = r.rawDescription ?? '';
      const sig = signature(desc);
      if (!sig) continue;
      const g = groups.get(sig);
      if (g) {
        g.count += 1;
        g.total += Math.abs(r.amount);
        if (r.txnDate < g.firstDate) g.firstDate = r.txnDate;
        if (r.txnDate > g.lastDate) g.lastDate = r.txnDate;
      } else {
        groups.set(sig, {
          signature: sig,
          sample: desc.trim().slice(0, 80),
          suggestedMerchant: titleCase(sig).slice(0, 40),
          count: 1,
          total: Math.abs(r.amount),
          flow: r.flow ?? (r.amount < 0 ? 'expense' : 'income'),
          category: r.category === 'Uncategorised' ? null : r.category,
          firstDate: r.txnDate,
          lastDate: r.txnDate,
        });
      }
    }

    // Amounts leave the API in whole rupees, matching every other dashboard DTO.
    const sorted = [...groups.values()]
      .sort((a, b) => b.count - a.count || b.total - a.total)
      .map((g) => ({ ...g, total: Math.round(g.total / 100) }));

    const cats = new Set<string>(BASE_CATEGORIES);
    for (const r of rows) if (r.category && r.category !== 'Uncategorised') cats.add(r.category);

    return json({
      hasData: rows.length > 0,
      totalTransactions: rows.length,
      totalGroups: sorted.length,
      groups: sorted.slice(0, 150),
      categories: [...cats].sort(),
    });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to list uncategorised transactions.', 500);
  }
}
