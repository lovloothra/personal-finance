import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOwnAccount } from '../account-reconcile';

const accounts = [
  { id: 'acc_hdfc1', kind: 'bank' as const, institutionId: 'in/hdfc-bank', last4: '7702' },
  { id: 'card_hdfc1', kind: 'card' as const, institutionId: 'in/hdfc-card', last4: '1234' },
];

test('matches an existing account by institution + last4', () => {
  const r = resolveOwnAccount({ institutionId: 'in/hdfc-bank', accountLast4: '7702' }, accounts);
  assert.deepEqual(r, { ownAccountId: 'acc_hdfc1', ownAccountKind: 'bank', stubCreated: false, needsAssignment: false });
});

test('signals a stub when institution+last4 known but no account matches', () => {
  const r = resolveOwnAccount({ institutionId: 'in/hdfc-bank', accountLast4: '9999' }, accounts);
  assert.equal(r.stubCreated, true);
  assert.equal(r.ownAccountKind, 'bank');
  assert.equal(r.needsAssignment, false);
  assert.ok(r.ownAccountId.startsWith('acc_'));
});

test('flags for manual assignment when no last4 in header', () => {
  const r = resolveOwnAccount({ institutionId: 'in/hdfc-bank', accountLast4: undefined }, accounts);
  assert.equal(r.needsAssignment, true);
  assert.equal(r.ownAccountId, null);
});
