'use client';
import { useState } from 'react';
import type { useSpending, UncatGroup } from '../../data/useSpending';
import { Money } from '../../primitives/Money';
import { CategoryChipPicker } from '../../primitives/CategoryChipPicker';
import { InstLogo } from '../../primitives/InstLogo';
import { categoriesForFlow, labelForCategory, normalizeCategory } from '@/classifier/taxonomy';
import type { Flow } from '@/classifier/types';

interface Detail { id: string; date: string; amount: number; rawDescription: string | null; from: string | null; subject: string | null; }

/** Small chip showing which of the user's own accounts this group belongs to. */
function AccountChip({ group }: { group: UncatGroup }) {
  const { institutionId, accountLast4, accountNickname, ownAccountKind } = group;

  if (!group.ownAccountId) {
    // Honest state, not a fake action: nothing is clickable here (yet — the
    // document-level assign flow is G1). Explain the gap on hover instead.
    return (
      <span
        className="badge neutral"
        style={{ fontSize: 11, whiteSpace: 'nowrap' }}
        title="The statement this came from didn't reveal an account number the app could match to one of your registered accounts."
      >
        No account detected
      </span>
    );
  }

  return (
    <span
      title={`${accountNickname ?? institutionId ?? 'Account'}${accountLast4 ? ` ··${accountLast4}` : ''} (${ownAccountKind === 'card' ? 'card' : 'bank'})`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '2px 9px 2px 3px',
        borderRadius: 20,
        background: 'var(--bg-0, #fff)',
        border: '1px solid var(--border)',
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--fg-2)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {/* Bank marks are detailed — they need a white well and real pixels to read. */}
      <span style={{
        width: 22, height: 22, borderRadius: '50%',
        background: '#fff',
        border: '1px solid var(--border)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, overflow: 'hidden',
      }}>
        {institutionId
          ? <InstLogo id={institutionId} name={accountNickname ?? institutionId} size={16} />
          : (
            <span style={{
              color: 'var(--indigo-600)', fontWeight: 700, fontSize: 10,
            }}>
              {ownAccountKind === 'card' ? '▣' : '▪'}
            </span>
          )
        }
      </span>
      <span>
        {accountNickname ? `${accountNickname} ` : ''}
        {accountLast4 && (
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--fg-1)' }}>
            ··{accountLast4}
          </span>
        )}
      </span>
    </span>
  );
}

/** Single counterparty line rendered under a transaction row. */
function CounterpartyLine({ raw, flow }: { raw: string; flow: string }) {
  const arrow = flow === 'income' ? '←' : '→';
  return (
    <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
      {arrow} {raw}
    </div>
  );
}

export function GroupRow({ group, spending, focused }: {
  group: UncatGroup; spending: ReturnType<typeof useSpending>; focused?: boolean;
}) {
  // Derive the group's flow so we can filter categories appropriately.
  // The group carries an explicit flow from the DB; fall back to sign-derived.
  const groupFlow = (['income', 'expense', 'transfer', 'investment'] as Flow[]).includes(group.flow as Flow)
    ? (group.flow as Flow)
    : group.total > 0 ? 'income' : 'expense';
  const flowCategories = categoriesForFlow(groupFlow);
  // Prefill only from a real ML suggestion — never from the title-cased
  // signature guess, which pollutes overrides and training data with junk
  // "merchants" like "Mobile Banking Sh Idfb". The guess stays visible as a
  // placeholder hint the user can choose to type.
  const [merchant, setMerchant] = useState(group.localSuggestion?.merchant ?? '');
  const [category, setCategory] = useState(group.localSuggestion?.category ?? group.category ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail[] | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const sug = group.localSuggestion;

  const toggleDetail = async () => {
    if (detailOpen) { setDetailOpen(false); return; }
    setDetailOpen(true);
    if (!detail) {
      try {
        const r = await fetch(`/api/review/uncategorised?signature=${encodeURIComponent(group.signature)}`);
        setDetail(((await r.json()) as { txns: Detail[] }).txns);
      } catch { setDetail([]); }
    }
  };

  const assign = async () => {
    if (!category) return;
    setBusy(true); setError(null);
    try { await spending.assign(group.signature, merchant.trim(), category); }
    catch (e) { setError(e instanceof Error ? e.message : 'Assign failed'); setBusy(false); }
  };

  const accept = async () => {
    if (!sug) return;
    setBusy(true); setError(null);
    try { await spending.acceptSuggestion(sug.id, group.signature, sug.category); }
    catch (e) { setError(e instanceof Error ? e.message : 'Accept failed'); setBusy(false); }
  };

  /**
   * "Mark as transfer" — calls /api/review/assign with category='Transfer',
   * which sets flow='transfer', isInternalTransfer=true, and clears
   * suspectedTransfer so the row is counted per its new flow.
   */
  const markAsTransfer = async () => {
    setBusy(true); setError(null);
    // No merchant: a transfer between own accounts has no merchant, and the
    // signature-derived guess must never be recorded as one.
    try { await spending.assign(group.signature, '', 'Transfer'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Mark as transfer failed'); setBusy(false); }
  };

  /**
   * "It's income" — calls /api/review/assign with category='Income',
   * which sets flow='income' and clears suspectedTransfer so the row is
   * counted as income in all rollups.
   */
  const markAsIncome = async () => {
    setBusy(true); setError(null);
    try { await spending.assign(group.signature, '', 'Income'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Mark as income failed'); setBusy(false); }
  };

  return (
    <div className={`review-item ${focused ? 'focused' : ''}`} style={{ alignItems: 'flex-start' }} data-sig={group.signature}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ttl" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} title={group.sample}>{group.sample}</span>
          <span className="badge neutral">{group.count}×</span>
          <span className="badge neutral"><Money amount={group.total} /></span>
          {/* Account chip — shows institution logo + ··last4 or "Assign account" */}
          <AccountChip group={group} />
        </div>
        <div className="desc" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>{group.firstDate === group.lastDate ? group.firstDate : `${group.firstDate} → ${group.lastDate}`}</span>
          <button className="link" style={{ fontSize: 12.5 }} onClick={toggleDetail}>
            {detailOpen ? 'Hide transactions' : `View ${group.count > 1 ? `all ${group.count} transactions` : 'transaction'}`}
          </button>
        </div>

        {sug && (
          <div style={{ marginTop: 10, padding: '10px 12px', border: '1px solid var(--mint-500)', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge mint">Suggested</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{sug.merchant} → {labelForCategory(normalizeCategory(sug.category))}{sug.subcategory ? ` / ${sug.subcategory}` : ''}</span>
            <span className="muted" style={{ fontSize: 12.5 }}>{Math.round(sug.confidenceScore * 100)}% {sug.confidence}, {sug.evidenceCount} reviewed</span>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={accept}>Accept</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => spending.rejectSuggestion(sug.id).catch((e) => setError(e instanceof Error ? e.message : 'Reject failed'))}>Reject</button>
          </div>
        )}

        {detailOpen && (
          <div style={{ margin: '10px 0 2px', borderLeft: '2px solid var(--border)', paddingLeft: 12, display: 'grid', gap: 8 }}>
            {detail === null && <div className="muted" style={{ fontSize: 12.5 }}>Loading…</div>}
            {detail?.map((t) => (
              <div key={t.id} style={{ fontSize: 12.5, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{t.date}</span>
                  <span style={{ fontWeight: 600 }}>{t.amount > 0 ? '+' : '−'}<Money amount={Math.abs(t.amount)} pos={t.amount > 0} /></span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--fg-2)', overflowWrap: 'anywhere' }}>{t.rawDescription}</div>
                {/* Counterparty line: shown if the group has a counterparty */}
                {group.counterpartyRaw && (
                  <CounterpartyLine raw={group.counterpartyRaw} flow={group.flow} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Suspected-transfer banner */}
        {group.suspectedTransfer && (
          <div style={{
            marginTop: 10, padding: '10px 12px',
            border: '1px solid var(--cau-400, #f59e0b)',
            borderRadius: 8,
            background: 'var(--cau-50, #fffbeb)',
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <span className="badge cau">Suspected transfer</span>
            <span style={{ fontSize: 13, color: 'var(--fg-2)', flex: 1 }}>
              Not counted as income — confirm what this is.
            </span>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={markAsTransfer}>
              Mark as transfer
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={markAsIncome}>
              It&apos;s income
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <input
            className="inp"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder={group.suggestedMerchant ? `Merchant — e.g. ${group.suggestedMerchant}` : 'Merchant (optional)'}
            style={{ flex: '0 0 200px', maxWidth: 220 }}
          />
          <div style={{ flex: '1 1 320px', minWidth: 240 }}>
            <CategoryChipPicker
              categories={flowCategories}
              value={category}
              onPick={setCategory}
              suggested={sug ? normalizeCategory(sug.category) : null}
              priority={spending.triage?.topCategories ?? []}
            />
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy || !category} onClick={assign}>
            {busy ? 'Assigning…' : `Assign ${group.count > 1 ? `all ${group.count}` : ''}`}
          </button>
          {/* Transfer must be reachable on every debit group, not only when the
              classifier already suspected it (see review-ui-conventions skill). */}
          {groupFlow === 'expense' && !group.suspectedTransfer && (
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={markAsTransfer}>
              Mark as transfer
            </button>
          )}
        </div>
        {error && <div style={{ fontSize: 12.5, color: 'var(--red-600)', marginTop: 6 }}>{error}</div>}
      </div>
    </div>
  );
}
