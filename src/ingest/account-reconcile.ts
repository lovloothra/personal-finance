/**
 * Resolve a parsed document to one of the household's own accounts.
 *
 * A statement is FROM one account. Policy, in order:
 *   1. header_match — the statement header carried an account/card number that
 *      matches a registered account (institution family + kind + last4).
 *   2. institution_unique — attribute without a full header match only when
 *      the evidence still pins a single account: either the header gave a
 *      last4 and the issuer has exactly one registered same-kind account that
 *      is awaiting its last4, or the header gave nothing and the issuer has
 *      exactly one registered same-kind account AND the document actually
 *      contributes transactions (zero-txn docs — demat statements, TDS
 *      certificates, mailers — are never force-attributed).
 *   3. stub — the header gave a last4 but no registered account matches: mint
 *      a stub id (the caller persists the stub row and surfaces a review item).
 *   4. needsAssignment — nothing identifies the account; the document is
 *      flagged for the user to assign manually.
 *
 * The chosen source is recorded on the document (own_account_source) so every
 * attribution stays honest and revisable. Pure: persistence is the caller's job.
 */
import { randomUUID } from 'node:crypto';

export interface OwnAccountRow {
  id: string;
  kind: 'bank' | 'card';
  institutionId: string | null;
  last4: string | null;
}

export interface DocAccountHint {
  institutionId: string | null;
  accountLast4?: string;
  /** card_statement docs resolve against cards; everything else against banks. */
  docType?: string;
  /** Parsed transaction count — gates the no-last4 institution-unique fallback. */
  txnCount?: number;
}

export type OwnAccountSource = 'header_match' | 'institution_unique' | 'stub' | 'user_assigned';

export interface ResolvedOwnAccount {
  ownAccountId: string | null;
  ownAccountKind: 'bank' | 'card' | null;
  source: Exclude<OwnAccountSource, 'user_assigned'> | null;
  stubCreated: boolean;
  needsAssignment: boolean;
}

/**
 * Card issuers live in the packs as `<bank>-cards` siblings of the bank
 * institution (hdfc-bank ↔ hdfc-bank-cards), but statements arrive stamped
 * with whichever institution matched the sender address. Treat the pair as
 * one issuer family when matching accounts.
 */
function sameIssuerFamily(docInst: string | null, acctInst: string | null): boolean {
  if (docInst === acctInst) return true;
  if (docInst == null || acctInst == null) return false;
  return acctInst === `${docInst}-cards` || docInst === `${acctInst}-cards`;
}

export function resolveOwnAccount(hint: DocAccountHint, accounts: OwnAccountRow[]): ResolvedOwnAccount {
  const kind: 'bank' | 'card' = hint.docType === 'card_statement' ? 'card' : 'bank';
  const family = accounts.filter((a) => a.kind === kind && sameIssuerFamily(hint.institutionId, a.institutionId));

  if (hint.accountLast4) {
    const match = family.find((a) => a.last4 === hint.accountLast4);
    if (match) {
      return { ownAccountId: match.id, ownAccountKind: kind, source: 'header_match', stubCreated: false, needsAssignment: false };
    }
    // The issuer's only same-kind account is registered without a last4 —
    // claim it rather than minting a duplicate stub. The caller may use the
    // header last4 to complete the registered row.
    if (family.length === 1 && family[0].last4 == null) {
      return { ownAccountId: family[0].id, ownAccountKind: kind, source: 'institution_unique', stubCreated: false, needsAssignment: false };
    }
    const prefix = kind === 'card' ? 'card' : 'acc';
    return { ownAccountId: `${prefix}_${randomUUID().slice(0, 8)}`, ownAccountKind: kind, source: 'stub', stubCreated: true, needsAssignment: false };
  }

  // No header number at all. Only attribute when the institution pins a single
  // account of the right kind and the document carries real transactions.
  if (hint.institutionId != null && family.length === 1 && (hint.txnCount ?? 1) > 0) {
    return { ownAccountId: family[0].id, ownAccountKind: kind, source: 'institution_unique', stubCreated: false, needsAssignment: false };
  }

  return { ownAccountId: null, ownAccountKind: null, source: null, stubCreated: false, needsAssignment: true };
}
