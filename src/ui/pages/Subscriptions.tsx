'use client';
import { useEffect, useState } from 'react';
import { viewState } from '../lib/viewState';
import { Icon } from '../primitives/Icon';
import { Money } from '../primitives/Money';
import { MerchantLogo } from '../primitives/MerchantLogo';
import { StatCard } from '../primitives/StatCard';
import { EmptyState } from '../primitives/EmptyState';
import { ErrorState } from '../primitives/ErrorState';
import { Skeleton } from '../primitives/Skeleton';
import { FootMeta, PageHead } from './shared';
import { useDashboard, type SubscriptionsDTO } from '../data/useDashboard';

type Sub = SubscriptionsDTO['subscriptions'][number];
type Status = Sub['status'];

// Keyed lowercase and looked up case-insensitively — the classifier's
// recurrence detector (src/classifier/recurrence.ts) and the profile model
// both emit lowercase cadence strings ('monthly'/'quarterly'/'yearly'), so a
// capitalized-only lookup silently fell back to 12 for every DB-backed row.
const CADENCE_MULT: Record<string, number> = { monthly: 12, quarterly: 4, yearly: 1 };
const cadenceMult = (cadence: string) => CADENCE_MULT[cadence.toLowerCase()] ?? 12;
const annualOf = (s: Sub) => s.annual ?? s.amt * cadenceMult(s.cadence);

/** Tidy the raw display category into a human label. */
const CAT_LABEL: Record<string, string> = { Ott: 'Streaming', Software: 'AI & Software', Music: 'Music', Telecom: 'Telecom', Subscriptions: 'Subscription' };
const catLabel = (c: string) => CAT_LABEL[c] ?? c;

function SubRow({ s, mode, onStatus }: { s: Sub; mode: 'confirmed' | 'likely'; onStatus: (id: string, status: Status) => void }) {
  return (
    <div className="txn" style={{ cursor: 'default' }}>
      <MerchantLogo name={s.name} color={s.color} />
      <div className="txn-mid">
        <div className="mer">{s.name}</div>
        <div className="cat" style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span className="badge neutral" style={{ padding: '1px 7px' }}>{catLabel(s.cat)}</span>
          <span>{s.cadence}</span>
          {s.occurrences > 0 && <span className="muted">· seen {s.occurrences}×</span>}
        </div>
      </div>
      <div style={{ textAlign: 'right', marginRight: 14 }}>
        <div className="amt"><Money amount={s.amt} /></div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 3, display: 'inline-flex', gap: 4 }}>
          {mode === 'confirmed' ? (
            <span>next {s.next}</span>
          ) : (
            <span>≈ <Money amount={annualOf(s)} />/yr</span>
          )}
        </div>
      </div>
      {mode === 'likely' ? (
        <div style={{ display: 'flex', gap: 7 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => onStatus(s.id, 'dismissed')}>Not a sub</button>
          <button className="btn btn-primary btn-sm" onClick={() => onStatus(s.id, 'confirmed')}>Confirm</button>
        </div>
      ) : (
        <button className="btn btn-ghost btn-sm" onClick={() => onStatus(s.id, 'dismissed')} title="Stop tracking">
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  );
}

export function Subscriptions() {
  const { data, loading, error, retry } = useDashboard<SubscriptionsDTO>('subscriptions', 'all');
  const state = viewState(loading, error, data?.hasData);
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [patchError, setPatchError] = useState<string | null>(null);

  // Re-sync the editable local copy whenever a fresh fetch (mount or retry)
  // lands — but never clobber in-flight optimistic edits from setStatus.
  useEffect(() => {
    if (data?.hasData) setSubs(data.subscriptions);
  }, [data]);

  const list = subs ?? (data?.hasData ? data.subscriptions : []);

  const setStatus = async (id: string, status: Status) => {
    const prev = list;
    setSubs(prev.map((x) => (x.id === id ? { ...x, status } : x)));
    setPatchError(null);
    try {
      const res = await fetch('/api/dashboard/subscriptions', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setSubs(prev);
      setPatchError("Couldn't save that change — try again.");
    }
  };

  const confirmed = list.filter((s) => s.status === 'confirmed').sort((a, b) => annualOf(b) - annualOf(a));
  const likely = list.filter((s) => s.status === 'likely').sort((a, b) => annualOf(b) - annualOf(a));

  const annualTotal = confirmed.reduce((a, s) => a + annualOf(s), 0);
  const monthlyEquivalent = Math.round(annualTotal / 12);

  // Soonest upcoming renewal among confirmed subscriptions.
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = confirmed
    .filter((s) => s.nextIso && s.nextIso >= today)
    .sort((a, b) => (a.nextIso! < b.nextIso! ? -1 : 1))[0];

  return (
    <div className="content-wrap fade-in">
      <PageHead
        title="Subscriptions"
        sub={state === 'ready' ? `${confirmed.length} active · ${likely.length} to review` : undefined}
      />

      {state === 'loading' && (
        <>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <Skeleton variant="stat" count={3} />
          </div>
          <Skeleton variant="block" height={240} />
        </>
      )}

      {state === 'error' && <ErrorState message={error ?? undefined} onRetry={retry} />}

      {state === 'empty' && (
        <EmptyState
          icon="repeat"
          title="No recurring charges detected yet."
          body="Subscriptions and other recurring bills show up here after your inbox is imported."
          action={{ label: 'Run an import', href: '/sources' }}
        />
      )}

      {state === 'ready' && (
        <>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <StatCard lbl="Per month" icon="repeat" val={<Money compact amount={monthlyEquivalent} />} sub="Monthly-equivalent of all plans" />
            <StatCard lbl="Per year" icon="calendar" val={<Money compact amount={annualTotal} />} sub={`Across ${confirmed.length} active subscriptions`} />
            <StatCard lbl="Needs review" icon="help-circle" val={String(likely.length)} accent="var(--amber-600)" sub="Likely — confirm or dismiss" />
          </div>

          {patchError && (
            <div className="note warn" style={{ marginBottom: 16 }}>
              <span className="ic"><Icon name="triangle-alert" size={16} /></span>
              <span>{patchError}</span>
            </div>
          )}

          {likely.length > 0 && (
            <div className="card" style={{ marginBottom: 16, borderColor: 'var(--amber-400)' }}>
              <div className="card-head">
                <h3>Likely subscriptions</h3>
                <span className="badge cau">{likely.length} to review</span>
              </div>
              <div className="card-list">
                {likely.map((s) => (
                  <SubRow key={s.id} s={s} mode="likely" onStatus={setStatus} />
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h3>Active subscriptions</h3>
              <span className="muted" style={{ fontSize: 12.5 }}>Sorted by yearly cost</span>
            </div>
            {confirmed.length === 0 ? (
              <EmptyState
                icon="repeat"
                title="No active subscriptions yet"
                body="Confirm the likely ones above, or import more statements to surface recurring charges."
              />
            ) : (
              <div className="card-list">
                {confirmed.map((s) => (
                  <SubRow key={s.id} s={s} mode="confirmed" onStatus={setStatus} />
                ))}
              </div>
            )}
          </div>

          {upcoming && (
            <div className="note info" style={{ marginTop: 16 }}>
              <span className="ic"><Icon name="calendar-clock" size={16} /></span>
              <span>
                Next renewal — <b>{upcoming.name}</b> (<Money amount={upcoming.amt} />) around {upcoming.next}. Reminders stay on this device; we never email or charge you.
              </span>
            </div>
          )}
        </>
      )}

      <FootMeta />
    </div>
  );
}
