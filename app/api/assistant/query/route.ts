import { and, desc, eq, like, or, sql, type SQL } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { reviewItems, subscriptionsDetected, taxEvidence, transactions } from '@/db/schema';
import { selectAssistantTool, type AssistantToolSelection } from '@/assistant/query';
import { synthesizeWithOllama } from '@/assistant/ollama';
import { badRequest, json } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as { question?: string };
    const question = body.question?.trim();
    if (!question) return badRequest('Provide a finance question.');

    const selection = selectAssistantTool(question);
    const db = await getDb();
    const toolCalls = [{ tool: selection.tool, args: selection.args }];
    const result = runTool(db, selection);
    const llm = await synthesizeWithOllama({ question, toolCalls, toolResult: result });
    return json({
      question,
      toolCalls,
      ...result,
      deterministicAnswer: result.answer,
      answer: llm.status === 'ok' ? llm.answer : result.answer,
      llm,
    });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Assistant query failed.', 500);
  }
}

function runTool(db: Awaited<ReturnType<typeof getDb>>, selection: AssistantToolSelection) {
  switch (selection.tool) {
    case 'cashflow':
      return cashflow(db, selection.args.fyKey);
    case 'category_spend':
      return categorySpend(db, selection.args.category, selection.args.fyKey);
    case 'merchant_search':
      return merchantSearch(db, selection.args.merchant, selection.args.fyKey);
    case 'tax_evidence':
      return taxEvidenceTool(db, selection.args.section, selection.args.fyKey);
    case 'subscriptions':
      return subscriptionsTool(db);
    case 'review_queue':
      return reviewQueue(db);
    case 'provenance':
      return provenance(db, selection.args);
    case 'unsupported':
      return cannotAnswer();
  }
}

function cashflow(db: Awaited<ReturnType<typeof getDb>>, fyKey?: string) {
  const filters = [fyKey ? eq(transactions.fyKey, fyKey) : null].filter(Boolean) as SQL[];
  const rows = db
    .select({ flow: transactions.flow, amount: sql<number>`sum(${transactions.amount})` })
    .from(transactions)
    .where(andMaybe(filters))
    .groupBy(transactions.flow)
    .all();
  if (rows.length === 0) return cannotAnswer();

  const income = rows.filter((r) => r.flow === 'income').reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  const outflow = rows
    .filter((r) => r.flow === 'expense' || r.flow === 'investment')
    .reduce((sum, r) => sum + Math.abs(Number(r.amount ?? 0)), 0);
  const net = income - outflow;
  const evidence = latestTransactions(db, filters);
  return {
    answer: `${fyKey ? `${fyKey} ` : ''}Cashflow: income ${formatInr(income)}, outflow ${formatInr(outflow)}, net ${formatInr(net)}.`,
    aggregates: { income, outflow, net },
    evidence,
  };
}

function categorySpend(db: Awaited<ReturnType<typeof getDb>>, category: string, fyKey?: string) {
  const filters = [eq(transactions.category, category), fyKey ? eq(transactions.fyKey, fyKey) : null].filter(Boolean) as SQL[];
  const total = db
    .select({ amount: sql<number>`sum(abs(${transactions.amount}))` })
    .from(transactions)
    .where(andMaybe(filters))
    .get()?.amount;
  const evidence = latestTransactions(db, filters);
  if (!total || evidence.transactionIds.length === 0) return cannotAnswer();
  return {
    answer: `${category} spend${fyKey ? ` in ${fyKey}` : ''}: ${formatInr(Number(total))}.`,
    aggregates: { category, total: Number(total) },
    evidence,
  };
}

function merchantSearch(db: Awaited<ReturnType<typeof getDb>>, merchant: string, fyKey?: string) {
  const pattern = `%${merchant.replace(/[%_]/g, '').trim()}%`;
  const filters = [
    or(like(transactions.merchant, pattern), like(transactions.rawDescription, pattern)),
    fyKey ? eq(transactions.fyKey, fyKey) : null,
  ].filter(Boolean) as SQL[];
  const evidence = latestTransactions(db, filters, 25);
  if (evidence.transactionIds.length === 0) return cannotAnswer();
  return {
    answer: `Found ${evidence.transactionIds.length} recent transaction${evidence.transactionIds.length === 1 ? '' : 's'} matching "${merchant}".`,
    evidence,
  };
}

function taxEvidenceTool(db: Awaited<ReturnType<typeof getDb>>, section?: string, fyKey?: string) {
  const filters = [section ? eq(taxEvidence.section, section) : null, fyKey ? eq(taxEvidence.fyKey, fyKey) : null].filter(Boolean) as SQL[];
  const rows = db
    .select({
      id: taxEvidence.id,
      section: taxEvidence.section,
      amount: taxEvidence.amount,
      transactionId: taxEvidence.transactionId,
      note: taxEvidence.note,
    })
    .from(taxEvidence)
    .where(andMaybe(filters))
    .all();
  if (rows.length === 0) return cannotAnswer();
  const total = rows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  return {
    answer: `Tax evidence${section ? ` for ${section}` : ''}: ${formatInr(total)} across ${rows.length} item${rows.length === 1 ? '' : 's'}.`,
    aggregates: { total, count: rows.length },
    evidence: { transactionIds: rows.map((r) => r.transactionId).filter(Boolean), rows },
  };
}

function subscriptionsTool(db: Awaited<ReturnType<typeof getDb>>) {
  const rows = db
    .select({
      id: subscriptionsDetected.id,
      merchant: subscriptionsDetected.merchant,
      amount: subscriptionsDetected.amount,
      cadence: subscriptionsDetected.cadence,
      nextChargeEta: subscriptionsDetected.nextChargeEta,
      occurrences: subscriptionsDetected.occurrences,
    })
    .from(subscriptionsDetected)
    .all();
  if (rows.length === 0) return cannotAnswer();
  return {
    answer: `Found ${rows.length} likely subscription${rows.length === 1 ? '' : 's'}.`,
    evidence: { transactionIds: [], rows },
  };
}

function reviewQueue(db: Awaited<ReturnType<typeof getDb>>) {
  const rows = db
    .select({ kind: reviewItems.kind, count: sql<number>`count(*)` })
    .from(reviewItems)
    .where(eq(reviewItems.status, 'open'))
    .groupBy(reviewItems.kind)
    .all();
  const total = rows.reduce((sum, r) => sum + Number(r.count ?? 0), 0);
  return {
    answer: total > 0 ? `Review queue has ${total} open item${total === 1 ? '' : 's'}.` : 'Review queue is empty.',
    aggregates: { total, byKind: rows },
    evidence: { transactionIds: [] },
  };
}

function provenance(db: Awaited<ReturnType<typeof getDb>>, args: { transactionId?: string; merchant?: string }) {
  const filters: SQL[] = [];
  if (args.transactionId) filters.push(eq(transactions.id, args.transactionId));
  if (args.merchant) filters.push(like(transactions.merchant, `%${args.merchant.replace(/[%_]/g, '')}%`));
  if (filters.length === 0) return cannotAnswer();
  const rows = db
    .select({
      id: transactions.id,
      date: transactions.txnDate,
      merchant: transactions.merchant,
      category: transactions.category,
      subcategory: transactions.subcategory,
      source: transactions.classificationSource,
      acceptedPredictionId: transactions.acceptedPredictionId,
      layer: transactions.layer,
      reason: transactions.classificationReason,
      rawDescription: transactions.rawDescription,
    })
    .from(transactions)
    .where(andMaybe(filters))
    .orderBy(desc(transactions.txnDate))
    .limit(10)
    .all();
  if (rows.length === 0) return cannotAnswer();
  return {
    answer: `Found provenance for ${rows.length} transaction${rows.length === 1 ? '' : 's'}.`,
    evidence: { transactionIds: rows.map((r) => r.id), rows },
  };
}

function latestTransactions(db: Awaited<ReturnType<typeof getDb>>, filters: SQL[], limit = 20) {
  const rows = db
    .select({
      id: transactions.id,
      date: transactions.txnDate,
      amount: transactions.amount,
      merchant: transactions.merchant,
      category: transactions.category,
      source: transactions.classificationSource,
    })
    .from(transactions)
    .where(andMaybe(filters))
    .orderBy(desc(transactions.txnDate))
    .limit(limit)
    .all();
  return { transactionIds: rows.map((r) => r.id), rows };
}

function andMaybe(filters: SQL[]): SQL | undefined {
  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  return and(...filters);
}

function cannotAnswer() {
  return {
    answer: 'Cannot answer from current local ledger data.',
    evidence: { transactionIds: [] },
  };
}

function formatInr(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Math.round(paise / 100),
  );
}
