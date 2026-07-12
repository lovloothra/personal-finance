'use client';
import { useEffect, useState } from 'react';
import { useDrawer } from '../../contexts/DrawerCtx';
import { recentToTxn, type RecentTxnDTO } from '../../data/useOverview';
import { TxnRow } from '../shared';

interface LedgerRow {
  id: string; date: string; merchant: string; cat: string | null; sub: string | null;
  amt: number; flow: string | null; conf: string | null; from: string | null; subject: string | null;
}
const FLOWS = ['all', 'expense', 'income', 'investment', 'transfer'] as const;

function toDTO(r: LedgerRow): RecentTxnDTO {
  return {
    id: r.id, date: r.date, merchant: r.merchant, cat: r.cat ?? 'Uncategorised', sub: r.sub,
    amt: r.amt, flow: r.flow ?? 'expense', conf: r.conf, layer: null, reason: null, signal: null,
    reviewRequired: false, source: { from: r.from, subject: r.subject },
  };
}

export function TransactionsView({ fy }: { fy: string }) {
  const drawer = useDrawer();
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [flow, setFlow] = useState<typeof FLOWS[number]>('all');
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ fy });
      if (flow !== 'all') p.set('flow', flow);
      if (q) p.set('q', q);
      setError(null);
      fetch(`/api/dashboard/transactions?${p}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d) => setRows(d.rows ?? []))
        .catch(() => {
          setRows([]);
          setError("Couldn't load transactions.");
        });
    }, 200);
    return () => clearTimeout(t);
  }, [fy, flow, q]);

  return (
    <div className="card">
      <div className="card-head" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div className="chips">
          {FLOWS.map((f) => <button key={f} className={`chip ${flow === f ? 'on' : ''}`} onClick={() => setFlow(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}
        </div>
        <input className="inp" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220, marginLeft: 'auto' }} />
      </div>
      <div className="card-list">
        {error && <div className="muted" style={{ padding: 16, color: 'var(--red-600)' }}>{error}</div>}
        {!error && rows.map((r, i) => <TxnRow key={r.id} t={recentToTxn(toDTO(r), i)} onOpen={drawer.openProv} />)}
        {!error && rows.length === 0 && <div className="muted" style={{ padding: 16 }}>No transactions match.</div>}
      </div>
    </div>
  );
}
