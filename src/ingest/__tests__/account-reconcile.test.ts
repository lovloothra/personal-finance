import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOwnAccount } from '../account-reconcile';

const accounts = [
  { id: 'acc_hdfc1', kind: 'bank' as const, institutionId: 'hdfc-bank', last4: '7702' },
  { id: 'card_hdfc1', kind: 'card' as const, institutionId: 'hdfc-bank-cards', last4: '1234' },
];

test('matches an existing account by institution + last4', () => {
  const r = resolveOwnAccount({ institutionId: 'hdfc-bank', accountLast4: '7702', txnCount: 3 }, accounts);
  assert.deepEqual(r, {
    ownAccountId: 'acc_hdfc1',
    ownAccountKind: 'bank',
    source: 'header_match',
    stubCreated: false,
    needsAssignment: false,
  });
});

test('a card statement matches cards registered under the issuer\'s -cards institution', () => {
  const r = resolveOwnAccount(
    { institutionId: 'hdfc-bank', accountLast4: '1234', docType: 'card_statement', txnCount: 5 },
    accounts,
  );
  assert.equal(r.ownAccountId, 'card_hdfc1');
  assert.equal(r.ownAccountKind, 'card');
  assert.equal(r.source, 'header_match');
});

test('a card statement never matches a bank account with the same last4', () => {
  const withCollision = [
    ...accounts,
    { id: 'acc_x', kind: 'bank' as const, institutionId: 'icici-bank', last4: '5555' },
  ];
  const r = resolveOwnAccount(
    { institutionId: 'icici-bank', accountLast4: '5555', docType: 'card_statement', txnCount: 2 },
    withCollision,
  );
  assert.notEqual(r.ownAccountId, 'acc_x');
  assert.equal(r.ownAccountKind, 'card');
});

test('signals a stub when institution+last4 known but no account matches', () => {
  const r = resolveOwnAccount({ institutionId: 'hdfc-bank', accountLast4: '9999', txnCount: 3 }, accounts);
  assert.equal(r.stubCreated, true);
  assert.equal(r.ownAccountKind, 'bank');
  assert.equal(r.source, 'stub');
  assert.equal(r.needsAssignment, false);
  assert.ok(r.ownAccountId?.startsWith('acc_'));
});

test('a header last4 with a single registered same-kind account awaiting its last4 matches it', () => {
  const iciciCards = [
    { id: 'card_icici1', kind: 'card' as const, institutionId: 'icici-bank-cards', last4: null },
  ];
  const r = resolveOwnAccount(
    { institutionId: 'icici-bank', accountLast4: '9012', docType: 'card_statement', txnCount: 4 },
    iciciCards,
  );
  assert.equal(r.ownAccountId, 'card_icici1');
  assert.equal(r.source, 'institution_unique');
  assert.equal(r.stubCreated, false);
});

test('institution-unique fallback: no header last4, exactly one same-kind account at the institution', () => {
  const r = resolveOwnAccount({ institutionId: 'hdfc-bank', accountLast4: undefined, txnCount: 12 }, accounts);
  assert.equal(r.ownAccountId, 'acc_hdfc1');
  assert.equal(r.ownAccountKind, 'bank');
  assert.equal(r.source, 'institution_unique');
  assert.equal(r.needsAssignment, false);
});

test('institution-unique fallback never fires for documents with zero transactions', () => {
  // Demat statements, TDS certificates and T&C mailers parse to zero txns —
  // force-attributing those to a bank account would be dishonest.
  const r = resolveOwnAccount({ institutionId: 'hdfc-bank', accountLast4: undefined, txnCount: 0 }, accounts);
  assert.equal(r.ownAccountId, null);
  assert.equal(r.needsAssignment, true);
});

test('no fallback when the institution has multiple same-kind accounts', () => {
  const two = [
    ...accounts,
    { id: 'acc_hdfc2', kind: 'bank' as const, institutionId: 'hdfc-bank', last4: '8888' },
  ];
  const r = resolveOwnAccount({ institutionId: 'hdfc-bank', accountLast4: undefined, txnCount: 9 }, two);
  assert.equal(r.ownAccountId, null);
  assert.equal(r.needsAssignment, true);
});

test('no fallback when the document has no institution', () => {
  const r = resolveOwnAccount({ institutionId: null, accountLast4: undefined, txnCount: 9 }, accounts);
  assert.equal(r.ownAccountId, null);
  assert.equal(r.needsAssignment, true);
});

test('flags for manual assignment when nothing identifies the account', () => {
  const r = resolveOwnAccount({ institutionId: 'axis-bank', accountLast4: undefined, txnCount: 3 }, accounts);
  assert.equal(r.needsAssignment, true);
  assert.equal(r.ownAccountId, null);
  assert.equal(r.source, null);
});
