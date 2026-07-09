import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { accountsBank, accountsCard, attachments, institutions, parsedDocuments, reviewItems, transactions } from '@/db/schema';
import { signature } from '@/classifier/normalize';
import { json, badRequest, assertSameOrigin } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AccountOption {
  id: string;
  kind: 'bank' | 'card';
  institutionId: string | null;
  institutionName: string | null;
  last4: string | null;
  nickname: string | null;
}

async function listAccounts(): Promise<AccountOption[]> {
  const db = await getDb();
  const instName = new Map(
    db.select({ id: institutions.id, displayName: institutions.displayName }).from(institutions).all().map((i) => [i.id, i.displayName]),
  );
  const withName = (a: { id: string; institutionId: string | null; last4: string | null; nickname: string | null }, kind: 'bank' | 'card') => ({
    ...a,
    kind,
    institutionName: a.institutionId ? instName.get(a.institutionId) ?? a.institutionId : null,
  });
  return [
    ...db.select({ id: accountsBank.id, institutionId: accountsBank.institutionId, last4: accountsBank.last4, nickname: accountsBank.nickname }).from(accountsBank).all().map((a) => withName(a, 'bank')),
    ...db.select({ id: accountsCard.id, institutionId: accountsCard.institutionId, last4: accountsCard.last4, nickname: accountsCard.nickname }).from(accountsCard).all().map((a) => withName(a, 'card')),
  ];
}

/**
 * The documents behind one triage group that still need an account. Account
 * identity lives at the DOCUMENT altitude — a statement is FROM one account —
 * so the picker lists source documents, and assigning stamps the document
 * plus every transaction parsed from it.
 *
 * GET /api/review/assign-account?signature=<group signature>
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const sig = new URL(req.url).searchParams.get('signature')?.trim();
    if (!sig) return badRequest('Provide the description signature of the triage group.');
    const db = await getDb();

    const pending = db
      .select({ id: transactions.id, rawDescription: transactions.rawDescription, documentId: transactions.documentId })
      .from(transactions)
      .where(eq(transactions.reviewRequired, true))
      .all();
    const docIds = [...new Set(pending.filter((t) => signature(t.rawDescription ?? '') === sig && t.documentId).map((t) => t.documentId!))];

    const accounts = await listAccounts();
    const liveIds = new Set(accounts.map((a) => a.id));

    const docs = docIds.length
      ? db
          .select({
            id: parsedDocuments.id,
            institutionId: parsedDocuments.institutionId,
            docType: parsedDocuments.docType,
            ownAccountId: parsedDocuments.ownAccountId,
            filename: attachments.filename,
          })
          .from(parsedDocuments)
          .leftJoin(attachments, eq(parsedDocuments.attachmentId, attachments.id))
          .where(inArray(parsedDocuments.id, docIds))
          .all()
      : [];

    const unassigned = docs
      .filter((d) => !d.ownAccountId || !liveIds.has(d.ownAccountId))
      .map((d) => {
        const txns = db
          .select({ date: transactions.txnDate })
          .from(transactions)
          .where(eq(transactions.documentId, d.id))
          .all()
          .map((t) => t.date)
          .sort();
        return {
          id: d.id,
          institutionId: d.institutionId,
          docType: d.docType,
          filename: d.filename,
          txnCount: txns.length,
          firstDate: txns[0] ?? null,
          lastDate: txns[txns.length - 1] ?? null,
        };
      });

    return json({ docs: unassigned, accounts });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to list unassigned documents.', 500);
  }
}

/**
 * Assign a registered account (or register a new one) to a parsed document,
 * stamping the document AND all its transactions with source 'user_assigned',
 * and resolving the document's account review items.
 *
 * POST { documentId, accountId }
 * POST { documentId, register: { kind, institutionId, last4?, nickname? } }
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const body = (await req.json()) as {
      documentId?: string;
      accountId?: string;
      register?: { kind?: string; institutionId?: string; last4?: string; nickname?: string };
    };
    const documentId = body.documentId?.trim();
    if (!documentId) return badRequest('Provide the documentId to assign.');

    const db = await getDb();
    const doc = db.select({ id: parsedDocuments.id }).from(parsedDocuments).where(eq(parsedDocuments.id, documentId)).get();
    if (!doc) return badRequest('No such document.');

    let accountId: string;
    let kind: 'bank' | 'card';

    if (body.accountId) {
      const accounts = await listAccounts();
      const found = accounts.find((a) => a.id === body.accountId);
      if (!found) return badRequest('No such registered account.');
      accountId = found.id;
      kind = found.kind;
    } else if (body.register) {
      const r = body.register;
      if (r.kind !== 'bank' && r.kind !== 'card') return badRequest('register.kind must be "bank" or "card".');
      if (!r.institutionId) return badRequest('Provide register.institutionId.');
      const inst = db.select({ id: institutions.id }).from(institutions).where(eq(institutions.id, r.institutionId)).get();
      if (!inst) return badRequest('Unknown institution.');
      const last4 = r.last4?.trim() || null;
      if (last4 && !/^\d{4}$/.test(last4)) return badRequest('last4 must be exactly 4 digits.');
      kind = r.kind;
      accountId = `${kind}_${randomUUID().slice(0, 8)}`;
      const row = { id: accountId, institutionId: r.institutionId, last4, nickname: r.nickname?.trim() || null };
      if (kind === 'card') db.insert(accountsCard).values(row).run();
      else db.insert(accountsBank).values(row).run();
    } else {
      return badRequest('Provide accountId or register.');
    }

    let updatedTxns = 0;
    db.transaction((tx) => {
      tx.update(parsedDocuments)
        .set({ ownAccountId: accountId, ownAccountKind: kind, ownAccountSource: 'user_assigned' })
        .where(eq(parsedDocuments.id, documentId))
        .run();
      updatedTxns = tx
        .update(transactions)
        .set({ ownAccountId: accountId, ownAccountKind: kind })
        .where(eq(transactions.documentId, documentId))
        .run().changes;
      tx.update(reviewItems)
        .set({ status: 'resolved', updatedAt: Date.now() })
        .where(and(eq(reviewItems.refId, documentId), eq(reviewItems.kind, 'account_unresolved')))
        .run();
    });

    return json({ ok: true, updatedTxns, accountId, kind });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Assign account failed.', 500);
  }
}
