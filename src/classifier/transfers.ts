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
import { isCredBillDeskCcPayment } from './cc-payment-signals';
import { LAYER, type Classification } from './types';

/** Explicit transfer rails (not generic UPI, which is mostly real spending).
 * "autopay" is deliberately NOT here: UPI AUTOPAY is the mandate rail for
 * Netflix/Spotify/SIP/insurance — real spending. Autopay only signals a
 * transfer with card-bill context (CARD_AUTOPAY_RE). */
const TRANSFER_RE = /\b(neft|imps|rtgs|inft|fund(?:s)?\s*(?:trf|transfer)|funds? trf|self|own a\/?c|own account|trf to|transfer to|cc payment|credit card payment|card payment|payment received|bill ?desk|billpay)\b|cred\.club/i;

/** Autopay WITH card context — a card-bill standing instruction. Bare
 * "autopay" must never match (see TRANSFER_RE note). */
const CARD_AUTOPAY_RE = /auto ?pay.{0,40}\bcard\b|\bcard\b.{0,40}auto ?pay/i;

/** Suspected-transfer thresholds (one tunable place). A credit at/above the
 * minimum that is an exact multiple of the step, with no merchant and no
 * resolved counterparty, is quarantined rather than counted as income. */
const ROUND_TRANSFER_MIN_PAISE = 100_000 * 100; // ₹1,00,000
const ROUND_TRANSFER_STEP_PAISE = 10_000 * 100; // ₹10,000

/** Signals specific to credit-card bill payments (safe to mark single-sided).
 * cred.club is CRED's card-bill VPA — a debit there is a card payment by
 * definition (CRED's utility/rent VPAs use different handles). Card-bill
 * context is REQUIRED: bare "auto ?pay" used to be in this list and silently
 * turned every UPI-AUTOPAY merchant mandate into a vanished expense. */
const CC_PAYMENT_RE = /\b(cc payment|credit card payment|card payment|card bill)\b|cred\.club/i;

/** Credit-side wording used by card issuers for bill payments. This is only
 * trusted when the transaction sits on an attributed credit-card statement;
 * the same generic words on a bank account are not sufficient. */
const CARD_PAYMENT_CREDIT_RE = /\b(payment received|tele transfer credit|payment thank ?you|online payment)\b/i;

/** True when the description is a card-bill payment signal. */
function isCcPayment(desc: string): boolean {
  return CC_PAYMENT_RE.test(desc) || CARD_AUTOPAY_RE.test(desc) || isCredBillDeskCcPayment(desc);
}

export interface LinkTxn {
  id: string;
  date: string; // ISO YYYY-MM-DD
  amount: number; // signed paise
  rawDescription: string;
  documentId?: string | null;
  flow?: string;
  /** The own account this txn sits in (from document reconciliation). */
  ownAccountId?: string | null;
  /** Whether the source statement belongs to a bank account or credit card. */
  ownAccountKind?: 'bank' | 'card' | null;
  /** Deterministic category before the account-aware linking pass. */
  category?: string | null;
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
  suspectedIds: Set<string>;
  links: TransferLink[];
  /** Account-aware post-classifications for card credits and both legs of a
   * matched card payment. These outrank generic income/expense guesses. */
  accountClassifications: Map<string, Classification>;
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
    CARD_AUTOPAY_RE.test(t.rawDescription) ||
    selfNameHit(t.rawDescription, selfNames)
  );
}

function isCandidate(t: LinkTxn, selfNames: string[]): boolean {
  return (
    t.flow === 'transfer' ||
    t.counterpartyKind === 'own_account' ||
    t.counterpartyKind === 'known_own' ||
    !!t.ownAccountId ||
    !!t.ownAccountKind ||
    TRANSFER_RE.test(t.rawDescription) ||
    CARD_AUTOPAY_RE.test(t.rawDescription) ||
    selfNameHit(t.rawDescription, selfNames)
  );
}

function isExactBankToCardPair(debit: LinkTxn, credit: LinkTxn): boolean {
  return debit.ownAccountKind === 'bank'
    && credit.ownAccountKind === 'card'
    && debit.date === credit.date;
}

function isBankCardPaymentToCardCredit(debit: LinkTxn, credit: LinkTxn): boolean {
  return debit.ownAccountKind === 'bank'
    && credit.ownAccountKind === 'card'
    && (debit.category === 'cc_payment' || isCcPayment(debit.rawDescription));
}

function isCcPair(debit: LinkTxn, credit: LinkTxn): boolean {
  return credit.ownAccountKind === 'card'
    || isExactBankToCardPair(debit, credit)
    || debit.category === 'cc_payment'
    || credit.category === 'cc_payment'
    || isCcPayment(debit.rawDescription)
    || isCcPayment(credit.rawDescription)
    || CARD_PAYMENT_CREDIT_RE.test(credit.rawDescription);
}

function ccPaymentClassification(reason: string, signal: string): Classification {
  return {
    flow: 'transfer',
    category: 'cc_payment',
    subcategory: 'Credit card payment',
    merchant: null,
    confidence: 'high',
    reason,
    signal,
    layer: LAYER.TRANSFER_DEDUPE,
    reviewRequired: false,
    isInternalTransfer: true,
  };
}

function cardRefundClassification(): Classification {
  return {
    flow: 'income',
    category: 'refund',
    subcategory: 'Credit card refund / reversal',
    merchant: null,
    confidence: 'high',
    reason: 'Credit on an attributed credit-card statement with no matching bank-payment leg; classified as a refund or reversal, never salary or other income.',
    signal: 'account.card_credit_refund',
    layer: LAYER.TRANSFER_DEDUPE,
    reviewRequired: false,
    isInternalTransfer: false,
  };
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
  const suspectedIds = new Set<string>();
  const links: TransferLink[] = [];
  const accountClassifications = new Map<string, Classification>();

  const debits = txns.filter((t) => t.amount < 0 && isCandidate(t, selfNames));
  const credits = txns.filter((t) => t.amount > 0 && isCandidate(t, selfNames));
  const usedCredit = new Set<string>();

  // 1. Pair debit↔credit across different statements (same amount, near dates).
  for (const d of debits) {
    const candidates = credits.filter(
        (c) =>
        !usedCredit.has(c.id) &&
        Math.abs(c.amount) === Math.abs(d.amount) &&
        within(c.date, d.date, windowDays) &&
        !(d.documentId && c.documentId && d.documentId === c.documentId) &&
        // Relaxed keyword-less pairing: two different own accounts with no
        // resolved merchant on either leg. Requiring bare legs prevents
        // coincidental equal-amount expense/income (e.g. rent debit from HDFC
        // and salary credit into ICICI) from being mislinked as a transfer.
        (isExactBankToCardPair(d, c) ||
          isBankCardPaymentToCardCredit(d, c) ||
          (c.ownAccountKind !== 'card' && !!d.ownAccountId && !!c.ownAccountId && d.ownAccountId !== c.ownAccountId && !d.merchant && !c.merchant) ||
          (hasExplicitSignal(d, selfNames) && hasExplicitSignal(c, selfNames))),
      );
    const cardCandidates = candidates
      .filter((c) => isExactBankToCardPair(d, c) || isBankCardPaymentToCardCredit(d, c))
      .sort((a, b) => {
        const exactA = isExactBankToCardPair(d, a) ? 0 : 1;
        const exactB = isExactBankToCardPair(d, b) ? 0 : 1;
        const gapA = Math.abs(new Date(a.date).getTime() - new Date(d.date).getTime());
        const gapB = Math.abs(new Date(b.date).getTime() - new Date(d.date).getTime());
        return exactA - exactB || gapA - gapB || a.id.localeCompare(b.id);
      });
    const match = cardCandidates[0] ?? candidates[0];
    if (match) {
      usedCredit.add(match.id);
      transferIds.add(d.id);
      transferIds.add(match.id);
      const kind = isCcPair(d, match) ? 'cc_payment' : 'account_transfer';
      links.push({ debitId: d.id, creditId: match.id, kind });
      if (kind === 'cc_payment') {
        const classification = ccPaymentClassification(
          'Credit-card payment: matched a bank-statement debit to a credit-card-statement credit by signed amount and posting date. Both legs are excluded from income and spending.',
          'transfer.cc_payment_pair',
        );
        accountClassifications.set(d.id, classification);
        accountClassifications.set(match.id, classification);
      }
    }
  }

  // 2. Single-sided cases that are transfers by definition (counterpart
  //    statement may simply not be imported):
  //      - a credit-card bill payment (debit paying your own card)
  //      - a card "payment received" credit
  for (const d of debits) {
    if (!transferIds.has(d.id) && isCcPayment(d.rawDescription)) transferIds.add(d.id);
  }
  for (const c of credits) {
    if (!transferIds.has(c.id) && /\bpayment received\b/i.test(c.rawDescription)) {
      transferIds.add(c.id);
    }
    if (!transferIds.has(c.id) && c.ownAccountKind === 'card' && CARD_PAYMENT_CREDIT_RE.test(c.rawDescription)) {
      transferIds.add(c.id);
    }
    if (transferIds.has(c.id)
      && !accountClassifications.has(c.id)
      && c.ownAccountKind === 'card'
      && CARD_PAYMENT_CREDIT_RE.test(c.rawDescription)) {
      accountClassifications.set(c.id, ccPaymentClassification(
        'Credit-card payment: the attributed card statement records an inbound payment credit. Excluded from income even when the bank-side statement is unavailable.',
        'transfer.card_payment_credit',
      ));
    }
  }

  // 2b. Every other inbound credit on an attributed card statement is a
  //     refund/reversal by ledger semantics. It must never enter salary,
  //     interest, dividend, or other-income classification paths.
  for (const c of credits) {
    if (c.ownAccountKind !== 'card' || transferIds.has(c.id)) continue;
    accountClassifications.set(c.id, cardRefundClassification());
  }

  // 3. Own-entity counterparty: a transfer by definition, even single-sided.
  //    Iterate all txns (not just candidates) in case the txn has counterpartyKind
  //    but no keyword or ownAccountId that would have placed it in debits/credits.
  for (const t of txns) {
    if (!transferIds.has(t.id) && (t.counterpartyKind === 'own_account' || t.counterpartyKind === 'known_own')) {
      transferIds.add(t.id);
    }
  }

  // 4. Suspected-transfer heuristic: large round-number credits with no
  //    merchant and no resolved counterparty, not already confirmed transfers.
  for (const c of txns.filter((t) => t.amount > 0)) {
    if (transferIds.has(c.id)) continue;
    if (accountClassifications.has(c.id)) continue;
    if (c.merchant) continue;
    if (c.counterpartyKind && c.counterpartyKind !== 'unknown') continue;
    if (c.amount >= ROUND_TRANSFER_MIN_PAISE && c.amount % ROUND_TRANSFER_STEP_PAISE === 0) {
      suspectedIds.add(c.id);
    }
  }

  return { transferIds, suspectedIds, links, accountClassifications };
}
