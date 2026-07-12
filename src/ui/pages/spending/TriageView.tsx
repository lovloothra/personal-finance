'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { useSpending } from '../../data/useSpending';
import { Icon } from '../../primitives/Icon';
import { GroupRow, type FocusedRowActions } from './GroupRow';
import { triageKeyAction } from './triageKeys';
import { Money } from '../../primitives/Money';
import type { SuspectedDuplicate } from '../../data/useSpending';

function DuplicateReviewRow({ pair, spending }: {
  pair: SuspectedDuplicate;
  spending: ReturnType<typeof useSpending>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolve = async (action: 'remove' | 'keep') => {
    setBusy(true);
    setError(null);
    try {
      await spending.resolveDuplicate(pair.id, action);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Duplicate review failed');
      setBusy(false);
    }
  };
  const source = (side: SuspectedDuplicate['keeper']) => side.subject || side.from || side.documentId || 'Statement';

  return (
    <div className="review-item" data-duplicate-id={pair.id} style={{ display: 'block' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="badge cau">Possible duplicate</span>
        <strong><Money amount={Math.abs(pair.amount)} /></strong>
        <span className="muted" style={{ fontSize: 12.5 }}>{pair.candidate.date}</span>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
        Same date, amount, and account across two statements; one narration adds trailing tokens.
      </div>
      {[['Keep', pair.keeper], ['Candidate', pair.candidate]].map(([label, side]) => {
        const txn = side as SuspectedDuplicate['keeper'];
        return (
          <div key={txn.transactionId} style={{ marginTop: 8, minWidth: 0 }}>
            <span className="badge neutral">{label as string}</span>{' '}
            <span className="muted" style={{ fontSize: 12 }}>{source(txn)}</span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, overflowWrap: 'anywhere', marginTop: 3 }}>
              {txn.rawDescription}
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void resolve('remove')}>
          Remove duplicate
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void resolve('keep')}>
          Keep both
        </button>
      </div>
      {error && <div style={{ color: 'var(--red-600)', fontSize: 12.5, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

export function TriageView({ spending }: { spending: ReturnType<typeof useSpending> }) {
  const { triage, loading, search, clearedThisSession } = spending;
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Whichever row is currently focused registers its actions here so the
  // keyboard reducer below can invoke them without prop-drilling dispatch
  // functions through every row.
  const actionsRef = useRef<FocusedRowActions | null>(null);
  // Stable identity across renders — otherwise every TriageView re-render
  // (e.g. each search keystroke) would force the focused row's registration
  // effect to tear down and re-run for no functional reason.
  const registerActions = useCallback((a: FocusedRowActions | null) => { actionsRef.current = a; }, []);
  // Stable reference unless `triage` itself changes — a bare `?? []` fallback
  // would otherwise mint a new array (and re-trigger the scroll effect below)
  // on every render.
  const groups = useMemo(() => triage?.groups ?? [], [triage]);
  const duplicates = useMemo(() => triage?.suspectedDuplicates ?? [], [triage]);

  useEffect(() => {
    const t = setTimeout(() => search(q), 200);
    return () => clearTimeout(t);
  }, [q, search]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || target?.isContentEditable === true;
      const action = triageKeyAction(e.key, { groupCount: groups.length, focusIndex: focus, inInput });
      if (!action) return; // includes every key while inInput — native behavior (e.g. Escape) is untouched
      e.preventDefault();
      switch (action.type) {
        case 'focusNext':
          setFocus((f) => Math.min(f + 1, groups.length - 1));
          break;
        case 'focusPrev':
          setFocus((f) => Math.max(f - 1, 0));
          break;
        case 'focusSearch':
          searchRef.current?.focus();
          break;
        case 'pick':
          actionsRef.current?.pickRanked(action.n);
          break;
        case 'assign':
          actionsRef.current?.assign();
          break;
        case 'transfer':
          actionsRef.current?.markTransfer();
          break;
        case 'undo':
          // No-op when nothing is undoable; failures land in the hook's error.
          void spending.undoLast().catch(() => {});
          break;
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [groups.length, focus, spending]);

  // Keep the focused row on-screen as j/k move focus (or the list reflows
  // after an assign clears a row out from under the cursor).
  useEffect(() => {
    const container = listRef.current;
    const sig = groups[focus]?.signature;
    if (!container || !sig) return;
    const el = container.querySelector<HTMLElement>(`[data-sig="${CSS.escape(sig)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [focus, groups]);

  return (
    <div className="card">
      <div className="card-head" style={{ gap: 12 }}>
        <div>
          <h3>Triage</h3>
          {triage && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              {triage.totalGroups} group{triage.totalGroups === 1 ? '' : 's'} · {triage.totalTransactions} transaction{triage.totalTransactions === 1 ? '' : 's'} to classify
              {triage.totalSuspectedDuplicates > 0 ? ` · ${triage.totalSuspectedDuplicates} possible duplicate${triage.totalSuspectedDuplicates === 1 ? '' : 's'}` : ''}
              {clearedThisSession > 0 ? ` · ${clearedThisSession} cleared this session` : ''}
              {spending.lastOpId && <> · <span className="kbd">u</span> undoes the last assign</>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <Icon name="search" size={15} color="var(--fg-3)" />
          <input ref={searchRef} className="inp" placeholder="Search descriptions (e.g. a name)…  /" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        </div>
      </div>
      <div ref={listRef} className="card-list" style={{ maxHeight: 620, overflowY: 'auto' }}>
        {loading && <div className="muted" style={{ padding: 16 }}>Loading…</div>}
        {!loading && groups.length === 0 && duplicates.length === 0 && (
          <div className="muted" style={{ padding: 16 }}>
            {/* triage.hasData means "pending rows exist", so it can't tell a
                cleared queue from a never-imported ledger — report.hasData can. */}
            {q ? 'No matches.' : spending.report?.hasData ? 'Everything is categorised. 🎉' : 'Nothing to review yet — run an import first.'}
          </div>
        )}
        {!loading && spending.error && groups.length > 0 && (
          <div className="muted" style={{ padding: '8px 16px' }}>Couldn&apos;t refresh — showing the last loaded list.</div>
        )}
        {duplicates.map((pair) => (
          <DuplicateReviewRow key={pair.id} pair={pair} spending={spending} />
        ))}
        {groups.map((g, i) => (
          <GroupRow
            key={g.signature}
            group={g}
            spending={spending}
            focused={i === focus}
            registerActions={registerActions}
          />
        ))}
      </div>
    </div>
  );
}
