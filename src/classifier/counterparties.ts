/**
 * Own-entity counterparty registry + resolver. The registry names the
 * household's own accounts and known transfer counterparties (own banks not
 * imported, family, broker, card-bill VPAs). Resolving a transaction's
 * counterparty against it tells the transfer engine whether money actually left
 * the household. Pure & deterministic — the registry is passed in.
 */
export interface CounterpartyEntry {
  id: string;
  kind: 'own_account' | 'card_bill' | 'family' | 'broker' | 'other_own';
  isOwnMoney: boolean;
  matchers?: {
    vpaFragments?: string[];
    nameTokens?: string[];
    last4?: string[];
    institutionId?: string;
  };
}

export type CounterpartyKind = 'own_account' | 'known_own' | 'external' | 'unknown';

export interface CounterpartyResolution {
  counterpartyId: string | null;
  counterpartyKind: CounterpartyKind;
}

function entryMatches(raw: string, e: CounterpartyEntry): boolean {
  const d = raw.toLowerCase();
  const m = e.matchers ?? {};
  if (m.vpaFragments?.some((f) => d.includes(f.toLowerCase()))) return true;
  if (m.nameTokens?.some((t) => t.length >= 3 && d.includes(t.toLowerCase()))) return true;
  if (m.last4?.some((l) => d.includes(l))) return true;
  return false;
}

export function resolveCounterparty(raw: string | null | undefined, registry: CounterpartyEntry[]): CounterpartyResolution {
  if (!raw) return { counterpartyId: null, counterpartyKind: 'unknown' };
  const hit = registry.find((e) => entryMatches(raw, e));
  if (!hit) return { counterpartyId: null, counterpartyKind: 'unknown' };
  if (!hit.isOwnMoney) return { counterpartyId: hit.id, counterpartyKind: 'external' };
  return { counterpartyId: hit.id, counterpartyKind: hit.kind === 'own_account' ? 'own_account' : 'known_own' };
}
