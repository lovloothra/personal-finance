/**
 * Resolve a parsed document to one of the household's own accounts.
 *
 * A statement is FROM one account. We match (institutionId + last4) against the
 * registered bank/card accounts. When the header gives a last4 but no account
 * matches, we mint a stub id (the caller persists the stub). When the header has
 * no last4 at all, we cannot decide — the document is flagged for the user to
 * assign manually. Pure: persistence is the caller's job.
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
}

export interface ResolvedOwnAccount {
  ownAccountId: string | null;
  ownAccountKind: 'bank' | 'card' | null;
  stubCreated: boolean;
  needsAssignment: boolean;
}

export function resolveOwnAccount(hint: DocAccountHint, accounts: OwnAccountRow[]): ResolvedOwnAccount {
  const kind: 'bank' | 'card' = hint.docType === 'card_statement' ? 'card' : 'bank';
  if (!hint.accountLast4) {
    return { ownAccountId: null, ownAccountKind: null, stubCreated: false, needsAssignment: true };
  }
  const match = accounts.find(
    (a) => a.kind === kind && a.institutionId === hint.institutionId && a.last4 === hint.accountLast4,
  );
  if (match) {
    return { ownAccountId: match.id, ownAccountKind: kind, stubCreated: false, needsAssignment: false };
  }
  const prefix = kind === 'card' ? 'card' : 'acc';
  return { ownAccountId: `${prefix}_${randomUUID().slice(0, 8)}`, ownAccountKind: kind, stubCreated: true, needsAssignment: false };
}
