/**
 * Internal-transfer detection & dedup.
 *
 * Money the household moves between its OWN accounts/cards is not income or
 * expense — but it appears on both statements (a debit from account A, a credit
 * into account B / a card "payment received"). Counting both double-counts and
 * wrecks the savings rate. This pass links those debit↔credit pairs and marks
 * them so the rollups exclude them.
 *
 * Precision over recall: we only treat a debit as an internal transfer when we
 * find a matching credit on a DIFFERENT statement with the same amount within a
 * few days, AND at least one side carries an explicit transfer signal. Two
 * exceptions are safe to mark single-sided because they are transfers by
 * definition: a credit-card bill payment (a debit paying your own card) and a
 * card "payment received" credit.
 *
 * Pure & deterministic.
 */

/** Explicit transfer rails (not generic UPI, which is mostly real spending). */
const TRANSFER_RE = /\b(neft|imps|rtgs|inft|fund(?:s)?\s*(?:trf|transfer)|funds? trf|self|own a\/?c|own account|trf to|transfer to|cc payment|credit card payment|card payment|payment received|bill ?desk|billpay|auto ?pay)\b|cred\.club/i;

/** Signals specific to credit-card bill payments (safe to mark single-sided).
 * cred.club is CRED's card-bill VPA — a debit there is a card payment by
 * definition (CRED's utility/rent VPAs use different handles). */
const CC_PAYMENT_RE = /\b(cc payment|credit card payment|card payment|card bill|auto ?pay|payment received|received towards)\b|cred\.club/i;

export interface LinkTxn {
  id: string;
  date: string; // ISO YYYY-MM-DD
  amount: number; // signed paise
  rawDescription: string;
  documentId?: string | null;
  flow?: string;
  /** The own account this txn sits in (from document reconciliation). */
  ownAccountId?: string | null;
  /** Resolved counterparty kind, when known. */
  counterpartyKind?: 'own_account' | 'known_own' | 'external' | 'unknown';
  /** Resolved merchant, used by the suspected-transfer heuristic (Task 9). */
  merchant?: string | null;
}

export interface TransferLink {
  debitId: string;
  creditId: string;
  kind: 'cc_payment' | 'account_transfer';
}

export interface TransferResult {
  transferIds: Set<string>;
  links: TransferLink[];
}

const DAY = 86_400_000;
const within = (a: string, b: string, days: number) =>
  Math.abs(new Date(a + 'T00:00:00Z').getTime() - new Date(b + 'T00:00:00Z').getTime()) <= days * DAY;

/** A transfer to/from your OWN name is a self-transfer regardless of the rail. */
function selfNameHit(desc: string, selfNames: string[]): boolean {
  const d = desc.toLowerCase();
  return selfNames.some((n) => n.length >= 3 && d.includes(n.toLowerCase()));
}

/** A genuine transfer signal on a single txn, independent of account stamping.
 * (ownAccountId alone is NOT a signal — it's on nearly every txn now.) */
function hasExplicitSignal(t: LinkTxn, selfNames: string[]): boolean {
  return (
    t.flow === 'transfer' ||
    t.counterpartyKind === 'own_account' ||
    t.counterpartyKind === 'known_own' ||
    TRANSFER_RE.test(t.rawDescription) ||
    selfNameHit(t.rawDescription, selfNames)
  );
}

function isCandidate(t: LinkTxn, selfNames: string[]): boolean {
  return (
    t.flow === 'transfer' ||
    t.counterpartyKind === 'own_account' ||
    t.counterpartyKind === 'known_own' ||
    !!t.ownAccountId ||
    TRANSFER_RE.test(t.rawDescription) ||
    selfNameHit(t.rawDescription, selfNames)
  );
}

/**
 * Link internal transfers across a batch of classified transactions.
 * `selfNames` are the household's own name tokens (e.g. ["lov","loothra"]) so a
 * transfer mentioning your own name is treated as a self-transfer.
 * Returns the set of transaction ids that are internal transfers, plus the
 * matched debit/credit pairs.
 */
export function linkInternalTransfers(txns: LinkTxn[], opts: { windowDays?: number; selfNames?: string[] } = {}): TransferResult {
  const windowDays = opts.windowDays ?? 4;
  const selfNames = opts.selfNames ?? [];
  const transferIds = new Set<string>();
  const links: TransferLink[] = [];

  const debits = txns.filter((t) => t.amount < 0 && isCandidate(t, selfNames));
  const credits = txns.filter((t) => t.amount > 0 && isCandidate(t, selfNames));
  const usedCredit = new Set<string>();

  // 1. Pair debit↔credit across different statements (same amount, near dates).
  for (const d of debits) {
    const match = credits.find(
      (c) =>
        !usedCredit.has(c.id) &&
        Math.abs(c.amount) === Math.abs(d.amount) &&
        within(c.date, d.date, windowDays) &&
        !(d.documentId && c.documentId && d.documentId === c.documentId) &&
        // Relaxed keyword-less pairing: two different own accounts with no
        // resolved merchant on either leg. Requiring bare legs prevents
        // coincidental equal-amount expense/income (e.g. rent debit from HDFC
        // and salary credit into ICICI) from being mislinked as a transfer.
        ((!!d.ownAccountId && !!c.ownAccountId && d.ownAccountId !== c.ownAccountId && !d.merchant && !c.merchant) ||
          (hasExplicitSignal(d, selfNames) && hasExplicitSignal(c, selfNames))),
    );
    if (match) {
      usedCredit.add(match.id);
      transferIds.add(d.id);
      transferIds.add(match.id);
      const kind = CC_PAYMENT_RE.test(d.rawDescription) || CC_PAYMENT_RE.test(match.rawDescription) ? 'cc_payment' : 'account_transfer';
      links.push({ debitId: d.id, creditId: match.id, kind });
    }
  }

  // 2. Single-sided cases that are transfers by definition (counterpart
  //    statement may simply not be imported):
  //      - a credit-card bill payment (debit paying your own card)
  //      - a card "payment received" credit
  for (const d of debits) {
    if (!transferIds.has(d.id) && CC_PAYMENT_RE.test(d.rawDescription)) transferIds.add(d.id);
  }
  for (const c of credits) {
    if (!transferIds.has(c.id) && /\bpayment received\b/i.test(c.rawDescription)) transferIds.add(c.id);
  }

  // 3. Own-entity counterparty: a transfer by definition, even single-sided.
  //    Iterate all txns (not just candidates) in case the txn has counterpartyKind
  //    but no keyword or ownAccountId that would have placed it in debits/credits.
  for (const t of txns) {
    if (!transferIds.has(t.id) && (t.counterpartyKind === 'own_account' || t.counterpartyKind === 'known_own')) {
      transferIds.add(t.id);
    }
  }

  return { transferIds, links };
}
