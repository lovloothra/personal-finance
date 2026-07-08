import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { accountsBank, accountsCard, classificationPredictions, gmailMessages, localModelSuggestions, transactions } from '@/db/schema';
import { signature } from '@/classifier/normalize';
import { json, badRequest } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


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
  // Account-aware fields (null when unknown / not yet wired)
  ownAccountId: string | null;
  ownAccountKind: 'bank' | 'card' | null;
  accountNickname: string | null;
  accountLast4: string | null;
  institutionId: string | null;
  counterpartyRaw: string | null;
  counterpartyKind: 'own_account' | 'known_own' | 'external' | 'unknown' | null;
  suspectedTransfer: boolean;
  localSuggestion?: {
    id: string;
    merchant: string;
    category: string;
    subcategory: string | null;
    confidence: string;
    confidenceScore: number;
    reason: string;
    evidenceCount: number;
  } | null;
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
    const allRows = db
      .select({
        id: transactions.id,
        rawDescription: transactions.rawDescription,
        amount: transactions.amount,
        txnDate: transactions.txnDate,
        flow: transactions.flow,
        category: transactions.category,
        ownAccountId: transactions.ownAccountId,
        ownAccountKind: transactions.ownAccountKind,
        counterpartyRaw: transactions.counterpartyRaw,
        counterpartyKind: transactions.counterpartyKind,
        suspectedTransfer: transactions.suspectedTransfer,
      })
      .from(transactions)
      .where(eq(transactions.reviewRequired, true))
      .all();

    // Pre-fetch all relevant bank and card accounts for account-chip lookup.
    const bankAccounts = db.select({
      id: accountsBank.id,
      nickname: accountsBank.nickname,
      last4: accountsBank.last4,
      institutionId: accountsBank.institutionId,
    }).from(accountsBank).all();
    const cardAccounts = db.select({
      id: accountsCard.id,
      nickname: accountsCard.nickname,
      last4: accountsCard.last4,
      institutionId: accountsCard.institutionId,
    }).from(accountsCard).all();
    const bankById = new Map(bankAccounts.map((a) => [a.id, a]));
    const cardById = new Map(cardAccounts.map((a) => [a.id, a]));

    const q = new URL(req.url).searchParams.get('q')?.trim().toLowerCase() ?? '';
    const rows = q
      ? allRows.filter((r) => (r.rawDescription ?? '').toLowerCase().includes(q))
      : allRows;

    const suggestions = db
      .select({
        id: localModelSuggestions.id,
        transactionId: localModelSuggestions.transactionId,
        merchant: classificationPredictions.predictedMerchant,
        category: classificationPredictions.category,
        subcategory: classificationPredictions.subcategory,
        confidence: classificationPredictions.confidence,
        confidenceScore: classificationPredictions.confidenceScore,
        reason: classificationPredictions.reason,
        evidenceIds: classificationPredictions.evidenceIds,
      })
      .from(localModelSuggestions)
      .innerJoin(classificationPredictions, eq(localModelSuggestions.predictionId, classificationPredictions.id))
      .where(eq(localModelSuggestions.status, 'open'))
      .all();
    const suggestionByTxn = new Map(
      suggestions.map((s) => [
        s.transactionId,
        {
          id: s.id,
          merchant: s.merchant,
          category: s.category,
          subcategory: s.subcategory,
          confidence: s.confidence,
          confidenceScore: s.confidenceScore,
          reason: s.reason,
          evidenceCount: Array.isArray(s.evidenceIds) ? s.evidenceIds.length : 0,
        },
      ]),
    );

    const groups = new Map<string, Group>();
    for (const r of rows) {
      const desc = r.rawDescription ?? '';
      const sig = signature(desc);
      if (!sig) continue;
      const localSuggestion = suggestionByTxn.get(r.id) ?? null;
      const g = groups.get(sig);
      if (g) {
        g.count += 1;
        g.total += Math.abs(r.amount);
        if (r.txnDate < g.firstDate) g.firstDate = r.txnDate;
        if (r.txnDate > g.lastDate) g.lastDate = r.txnDate;
        if (!g.localSuggestion && localSuggestion) g.localSuggestion = localSuggestion;
        // Propagate suspected-transfer flag if any txn in the group has it.
        if (r.suspectedTransfer) g.suspectedTransfer = true;
      } else {
        // Resolve account info from pre-fetched maps.
        let accountNickname: string | null = null;
        let accountLast4: string | null = null;
        let institutionId: string | null = null;
        if (r.ownAccountId && r.ownAccountKind) {
          const acct = r.ownAccountKind === 'bank'
            ? bankById.get(r.ownAccountId)
            : cardById.get(r.ownAccountId);
          if (acct) {
            accountNickname = acct.nickname ?? null;
            accountLast4 = acct.last4 ?? null;
            institutionId = acct.institutionId ?? null;
          }
        }
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
          ownAccountId: r.ownAccountId ?? null,
          ownAccountKind: r.ownAccountKind ?? null,
          accountNickname,
          accountLast4,
          institutionId,
          counterpartyRaw: r.counterpartyRaw ?? null,
          counterpartyKind: r.counterpartyKind ?? null,
          suspectedTransfer: r.suspectedTransfer ?? false,
          localSuggestion,
        });
      }
    }

    // Amounts leave the API in whole rupees, matching every other dashboard DTO.
    const sorted = [...groups.values()]
      .sort((a, b) => b.total - a.total || b.count - a.count)
      .map((g) => ({ ...g, total: Math.round(g.total / 100) }));

    // The user's most-assigned categories, so the picker can lead with a
    // ranked shortlist instead of the full taxonomy wall.
    const catCounts = new Map<string, number>();
    const categorized = db
      .select({ category: transactions.category })
      .from(transactions)
      .where(eq(transactions.reviewRequired, false))
      .all();
    for (const { category } of categorized) {
      if (!category || category.toLowerCase() === 'uncategorised') continue;
      const key = category.toLowerCase();
      catCounts.set(key, (catCounts.get(key) ?? 0) + 1);
    }
    const topCategories = [...catCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k]) => k);

    return json({
      hasData: rows.length > 0,
      totalTransactions: rows.length,
      totalGroups: sorted.length,
      groups: sorted.slice(0, 150),
      topCategories,
    });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to list uncategorised transactions.', 500);
  }
}
