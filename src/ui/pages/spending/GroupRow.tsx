'use client';
import { useState } from 'react';
import type { useSpending, UncatGroup } from '../../data/useSpending';
import { Money } from '../../primitives/Money';
import { CategoryChipPicker } from '../../primitives/CategoryChipPicker';

interface Detail { id: string; date: string; amount: number; rawDescription: string | null; from: string | null; subject: string | null; }

export function GroupRow({ group, categories, spending, focused }: {
  group: UncatGroup; categories: string[]; spending: ReturnType<typeof useSpending>; focused?: boolean;
}) {
  const [merchant, setMerchant] = useState(group.localSuggestion?.merchant ?? group.suggestedMerchant);
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
    if (!merchant.trim() || !category) return;
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

  return (
    <div className={`review-item ${focused ? 'focused' : ''}`} style={{ alignItems: 'flex-start' }} data-sig={group.signature}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ttl" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} title={group.sample}>{group.sample}</span>
          <span className="badge neutral">{group.count}×</span>
          <span className="badge neutral"><Money amount={group.total} /></span>
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
            <span style={{ fontSize: 13, fontWeight: 600 }}>{sug.merchant} → {sug.category}{sug.subcategory ? ` / ${sug.subcategory}` : ''}</span>
            <span className="muted" style={{ fontSize: 12.5 }}>{Math.round(sug.confidenceScore * 100)}% {sug.confidence}, {sug.evidenceCount} reviewed</span>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={accept}>Accept</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => spending.rejectSuggestion(sug.id)}>Reject</button>
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
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <input className="inp" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Merchant" style={{ flex: '0 0 200px', maxWidth: 220 }} />
          <div style={{ flex: '1 1 320px', minWidth: 240 }}>
            <CategoryChipPicker categories={categories} value={category} onPick={setCategory} suggested={sug?.category ?? null} />
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy || !merchant.trim() || !category} onClick={assign}>
            {busy ? 'Assigning…' : `Assign ${group.count > 1 ? `all ${group.count}` : ''}`}
          </button>
        </div>
        {error && <div style={{ fontSize: 12.5, color: 'var(--red-600)', marginTop: 6 }}>{error}</div>}
      </div>
    </div>
  );
}
