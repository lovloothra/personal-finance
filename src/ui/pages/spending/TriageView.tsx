'use client';
import { useEffect, useRef, useState } from 'react';
import type { useSpending } from '../../data/useSpending';
import { Icon } from '../../primitives/Icon';
import { GroupRow } from './GroupRow';

export function TriageView({ spending }: { spending: ReturnType<typeof useSpending> }) {
  const { triage, loading, search } = spending;
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const groups = triage?.groups ?? [];

  useEffect(() => {
    const t = setTimeout(() => search(q), 200);
    return () => clearTimeout(t);
  }, [q, search]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.key !== 'Escape') return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'j') setFocus((f) => Math.min(f + 1, groups.length - 1));
      if (e.key === 'k') setFocus((f) => Math.max(f - 1, 0));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [groups.length]);

  return (
    <div className="card">
      <div className="card-head" style={{ gap: 12 }}>
        <h3>Triage</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <Icon name="search" size={15} color="var(--fg-3)" />
          <input ref={searchRef} className="inp" placeholder="Search descriptions (e.g. a name)…  /" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        </div>
      </div>
      <div className="card-list" style={{ maxHeight: 620, overflowY: 'auto' }}>
        {loading && <div className="muted" style={{ padding: 16 }}>Loading…</div>}
        {!loading && groups.length === 0 && <div className="muted" style={{ padding: 16 }}>{q ? 'No matches.' : 'Everything is categorised. 🎉'}</div>}
        {groups.map((g, i) => (
          <GroupRow key={g.signature} group={g} spending={spending} focused={i === focus} />
        ))}
      </div>
    </div>
  );
}
