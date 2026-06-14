import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { transactions, gmailMessages } from '@/db/schema';
import { json, badRequest } from '@/server/api';
import type { Flow } from '@/classifier/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const fy = url.searchParams.get('fy') ?? '2025-26';
    const flow = url.searchParams.get('flow'); // income|expense|transfer|investment|null
    const q = url.searchParams.get('q')?.trim().toLowerCase() ?? '';
    const db = await getDb();
    const conds = [eq(transactions.fyKey, fy)];
    if (flow) conds.push(eq(transactions.flow, flow as Flow));
    if (q) conds.push(sql`(lower(coalesce(${transactions.merchant},'')) like ${'%' + q + '%'}
      or lower(coalesce(${transactions.rawDescription},'')) like ${'%' + q + '%'}
      or lower(coalesce(${transactions.category},'')) like ${'%' + q + '%'})`);
    const rows = db
      .select({
        id: transactions.id, date: transactions.txnDate,
        merchant: sql<string>`coalesce(${transactions.merchant}, ${transactions.subcategory}, ${transactions.category})`,
        cat: transactions.category, sub: transactions.subcategory, amt: transactions.amount,
        flow: transactions.flow, conf: transactions.confidence,
        from: gmailMessages.fromAddr, subject: gmailMessages.subject,
      })
      .from(transactions)
      .leftJoin(gmailMessages, eq(transactions.messageId, gmailMessages.id))
      .where(and(...conds))
      .orderBy(desc(transactions.txnDate))
      .limit(300)
      .all()
      .map((r) => ({ ...r, amt: Math.round((r.amt ?? 0) / 100) }));
    return json({ rows });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to list transactions.', 500);
  }
}
