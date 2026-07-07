import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCounterparty, type CounterpartyEntry } from '../counterparties';

const registry: CounterpartyEntry[] = [
  { id: 'cp_self_icici', kind: 'own_account', isOwnMoney: true, matchers: { last4: ['7702'], nameTokens: ['lov loothra'] } },
  { id: 'cp_cred', kind: 'card_bill', isOwnMoney: true, matchers: { vpaFragments: ['cred.club'] } },
  { id: 'cp_landlord', kind: 'family', isOwnMoney: false, matchers: { nameTokens: ['ramesh kumar'] } },
];

test('resolves own account by name token', () => {
  const r = resolveCounterparty('LOV LOOTHRA', registry);
  assert.deepEqual(r, { counterpartyId: 'cp_self_icici', counterpartyKind: 'own_account' });
});

test('resolves card bill VPA as known_own', () => {
  const r = resolveCounterparty('payment@cred.club', registry);
  assert.deepEqual(r, { counterpartyId: 'cp_cred', counterpartyKind: 'known_own' });
});

test('resolves a non-own match as external', () => {
  const r = resolveCounterparty('ramesh kumar', registry);
  assert.deepEqual(r, { counterpartyId: 'cp_landlord', counterpartyKind: 'external' });
});

test('null counterparty is unknown', () => {
  const r = resolveCounterparty(null, registry);
  assert.deepEqual(r, { counterpartyId: null, counterpartyKind: 'unknown' });
});
