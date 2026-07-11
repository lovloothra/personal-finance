'use client';
import { useEffect, useRef, useState } from 'react';
import { useMask } from '../contexts/MaskCtx';
import { useFy } from '../contexts/FyCtx';
import { useDrawer } from '../contexts/DrawerCtx';
import { useShellMeta } from '../contexts/ShellMetaCtx';
import { fys, fySummary, household, type FyKey } from '../lib/fixtures';
import { Icon } from '../primitives/Icon';
import { Money } from '../primitives/Money';
import { SegmentedControl } from '../primitives/SegmentedControl';
import { recentToTxn, type RecentTxnDTO } from '../data/useOverview';

export function Topbar() {
  const { masked, setMasked } = useMask();
  const { fy, setFy, fys: liveFys } = useFy();
  const { openProv } = useDrawer();
  const { profileName } = useShellMeta();
  const keys = (liveFys.length ? liveFys : (Object.keys(fys) as FyKey[]));
  const name = profileName ?? household.name;
  const initials = name.split(/\s+/).map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase();

  const [q, setQ] = useState('');
  const [results, setResults] = useState<RecentTxnDTO[] | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Debounced transaction search against the local DB.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults(null);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as { results: RecentTxnDTO[] };
        setResults(data.results);
        setOpen(true);
      } catch {
        setResults(null);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Close the dropdown when clicking anywhere else.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <header className="topbar">
      <div className="search" ref={boxRef} style={{ position: 'relative' }}>
        <Icon name="search" size={16} />
        <input
          placeholder="Search merchants, categories, ₹ amounts…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results && setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        />
        {open && results && (
          <div
            className="card"
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              zIndex: 60,
              maxHeight: 380,
              overflowY: 'auto',
              boxShadow: 'var(--shadow-lg, 0 12px 32px rgba(16, 24, 40, 0.16))',
            }}
          >
            {results.length === 0 ? (
              <div className="muted" style={{ padding: 14, fontSize: 13 }}>
                No transactions match &ldquo;{q.trim()}&rdquo;.
              </div>
            ) : (
              results.map((r, i) => (
                <div
                  key={r.id}
                  className="txn click"
                  style={{ padding: '9px 14px' }}
                  onClick={() => {
                    setOpen(false);
                    openProv(recentToTxn(r, i));
                  }}
                >
                  <div className="txn-mid" style={{ minWidth: 0 }}>
                    <div className="mer" style={{ fontSize: 13.5 }}>{r.merchant}</div>
                    <div className="cat" style={{ fontSize: 12 }}>
                      {r.cat}
                      {r.sub ? ' · ' + r.sub : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className={`amt ${r.amt > 0 ? 'pos' : ''}`} style={{ fontSize: 13 }}>
                      {r.amt > 0 ? '+' : '−'}
                      <Money amount={Math.abs(r.amt)} pos={r.amt > 0} />
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>{r.date}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <div className="topbar-right">
        <SegmentedControl
          aria-label="Financial year"
          value={fy}
          onChange={(v) => setFy(v as FyKey)}
          options={keys.map((k) => ({ value: k, label: fySummary(k).label }))}
        />
        <button
          className={`icon-btn ${masked ? 'on' : ''}`}
          title={masked ? 'Reveal all amounts' : 'Hide all amounts'}
          onClick={() => setMasked((m) => !m)}
        >
          <Icon name={masked ? 'eye-off' : 'eye'} size={18} />
        </button>
        <div className="ondevice">
          <Icon name="shield-check" size={14} />
          Local only
        </div>
        <div className="avatar" title={name}>
          {initials}
        </div>
      </div>
    </header>
  );
}
