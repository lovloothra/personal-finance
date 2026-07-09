/**
 * Layer 2 — Profile rules.
 *
 * Matches a raw transaction against the household's own declared signals:
 * employer salary, rent, house-help payments, loan EMIs, broker SIPs, and
 * insurance premiums. These are the highest-signal, most personal rules and
 * therefore run right after explicit user overrides.
 */
import type { Classification, ClassifyContext, RawTxn } from './types';
import { LAYER } from './types';
import { amountNear, clean, containsAny, containsWord } from './normalize';

const isCredit = (t: RawTxn) => t.amount > 0;
const isDebit = (t: RawTxn) => t.amount < 0;

export function classifyByProfile(
  txn: RawTxn,
  ctx: ClassifyContext,
): Classification | null {
  const p = ctx.profile;
  const desc = clean(txn.rawDescription);

  // --- Salary credit -------------------------------------------------------
  if (p.employer && isCredit(txn) && containsAny(desc, p.employer.aliases)) {
    const cadenceOk =
      p.employer.monthlyAmount == null || amountNear(txn.amount, p.employer.monthlyAmount, 0.05);
    return {
      flow: 'income',
      category: 'Salary',
      subcategory: p.employer.name,
      confidence: cadenceOk ? 'high' : 'med',
      reason: `Profile rule: credit from employer "${p.employer.name}" matched on FY salary cadence (monthly, ±5%).`,
      signal: 'profile.employer',
      layer: LAYER.PROFILE,
      reviewRequired: false,
    };
  }

  // --- Credit-card payment (internal transfer) -----------------------------
  for (const card of p.cards ?? []) {
    const cardTokens = [card.label, 'credit card payment', 'cc payment', 'card payment'].filter(
      Boolean,
    ) as string[];
    // last4 counts only in masked card contexts (xx7702, **** 7702, ··7702,
    // "ending 7702") — long UPI/NEFT reference numbers contain every 4-digit
    // sequence, and a bare substring match turned arbitrary spending into
    // silent CC-payment transfers.
    const maskedLast4 = card.last4
      ? new RegExp(`(?:x{2,}|\\*{2,}|·{2,}|x-|ending[ -]?)\\s*${card.last4}\\b`, 'i')
      : null;
    if (isDebit(txn) && (containsAny(desc, cardTokens) || (maskedLast4?.test(desc) ?? false))) {
      return {
        flow: 'transfer',
        category: 'Transfer',
        subcategory: 'Credit card payment',
        confidence: 'high',
        reason: `Internal transfer: debit matched to ${card.label ?? 'credit card'} statement. Linked & excluded from expense rollups to avoid double-count.`,
        signal: 'transfer.cc_payment',
        layer: LAYER.PROFILE,
        reviewRequired: false,
        isInternalTransfer: true,
      };
    }
  }

  // --- Rent ----------------------------------------------------------------
  if (p.rent && isDebit(txn)) {
    const landlordHit = p.rent.landlordName ? containsAny(desc, [p.rent.landlordName]) : false;
    const amountHit = amountNear(txn.amount, p.rent.monthlyRent, 0.02);
    if (landlordHit || (amountHit && containsAny(desc, ['rent']))) {
      return {
        flow: 'expense',
        category: 'Housing',
        subcategory: 'Rent',
        confidence: landlordHit && amountHit ? 'high' : 'med',
        reason: `Profile rule: recurring rent${p.rent.landlordName ? ` to landlord "${p.rent.landlordName}"` : ''} on file, amount + payee match across prior months.`,
        signal: 'profile.home.rent',
        layer: LAYER.PROFILE,
        reviewRequired: false,
      };
    }
  }

  // --- House help ----------------------------------------------------------
  for (const hh of p.houseHelp ?? []) {
    const tokens = [hh.name, hh.upiHandle].filter(Boolean) as string[];
    if (isDebit(txn) && containsAny(desc, tokens)) {
      const amountOk = hh.monthlyAmount == null || amountNear(txn.amount, hh.monthlyAmount, 0.1);
      return {
        flow: 'expense',
        category: 'Household',
        subcategory: hh.role,
        confidence: amountOk ? 'high' : 'med',
        reason: `Profile rule: UPI to house-help payee "${hh.name}" matched on name + amount + monthly cadence. Verify payee handle.`,
        signal: 'profile.house_help',
        layer: LAYER.PROFILE,
        reviewRequired: false,
      };
    }
  }

  // --- Loan EMI ------------------------------------------------------------
  // The amount-only heuristic is disabled when the descriptor names a known
  // merchant (e.g. an INDmoney SIP that happens to be EMI-sized) — explicit
  // merchant evidence beats an amount coincidence. Short alias patterns are
  // ignored to avoid accidental substring hits.
  const aliasEvidence = ctx.merchantAliases.some((a) => a.pattern.length >= 5 && desc.includes(a.pattern));
  for (const loan of p.loans ?? []) {
    const emiHit = loan.emiAmount != null && amountNear(txn.amount, loan.emiAmount, 0.02) && !aliasEvidence;
    // 'emi' only counts as a whole word — it is a substring of "premium",
    // "chemist", etc., and a substring hit here would shadow every later layer.
    const kindHit = containsWord(desc, 'emi') || containsAny(desc, [`${loan.kind} loan`]);
    if (isDebit(txn) && (emiHit || kindHit)) {
      return {
        flow: 'expense',
        category: 'Loan',
        subcategory: `${loan.kind} EMI`,
        confidence: emiHit ? 'high' : 'med',
        reason: `Profile rule: ${loan.kind} loan EMI matched on amount + cadence from loan on file.`,
        signal: 'profile.loan',
        layer: LAYER.PROFILE,
        reviewRequired: false,
        taxSection: loan.kind === 'home' ? '24b' : null,
      };
    }
  }

  // --- Broker SIP / investment --------------------------------------------
  for (const broker of p.brokers ?? []) {
    if (isDebit(txn) && containsAny(desc, [broker.name, broker.institutionId])) {
      return {
        flow: 'investment',
        category: 'Investment',
        subcategory: broker.name,
        confidence: 'high',
        reason: `Profile rule: SIP to broker ${broker.name}.${broker.taxSection ? ` ELSS/eligible fund → tagged as ${broker.taxSection} tax evidence.` : ''}`,
        signal: `profile.broker.${broker.institutionId}`,
        layer: LAYER.PROFILE,
        reviewRequired: false,
        taxSection: broker.taxSection ?? null,
      };
    }
  }

  // --- Insurance premium ---------------------------------------------------
  for (const ins of p.insurers ?? []) {
    if (isDebit(txn) && containsAny(desc, [ins.name])) {
      return {
        flow: 'expense',
        category: 'Insurance',
        subcategory: ins.kind,
        confidence: 'high',
        reason: `Profile rule: ${ins.kind} insurer on file (${ins.name}).${ins.taxSection ? ` Premium → ${ins.taxSection} tax evidence.` : ''}`,
        signal: 'profile.insurer',
        layer: LAYER.PROFILE,
        reviewRequired: false,
        taxSection: ins.taxSection ?? null,
      };
    }
  }

  return null;
}
