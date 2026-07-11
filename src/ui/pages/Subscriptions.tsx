'use client';
import { useEffect, useState } from 'react';
import { Icon } from '../primitives/Icon';
import { Money } from '../primitives/Money';
import { MerchantLogo } from '../primitives/MerchantLogo';
import { StatCard } from '../primitives/StatCard';
import { FootMeta, PageHead } from './shared';
import { useDashboard, type SubscriptionsDTO } from '../data/useDashboard';
import { subscriptions as seed } from '../lib/fixtures';

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

/** Map the demo fixtures into the live DTO shape so pre-import looks identical. */
function seedSubs(): Sub[] {
  return seed.map((s) => ({
    id: s.id,
    name: s.name,
    cat: s.cat,
    amt: s.amt,
    annual: s.amt * cadenceMult(s.cadence),
    cadence: s.cadence,
    next: s.next,
    nextIso: null,
    last: s.last,
    occurrences: 0,
    status: s.status,
    glyph: s.glyph,
    color: s.color,
  }));
}

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
  const { data } = useDashboard<SubscriptionsDTO>('subscriptions', 'all');
  const [subs, setSubs] = useState<Sub[]>(seedSubs);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (data && !initialized) {
      if (data.hasData) setSubs(data.subscriptions);
      setInitialized(true);
    }
  }, [data, initialized]);

  const setStatus = (id: string, status: Status) => {
    setSubs((arr) => arr.map((x) => (x.id === id ? { ...x, status } : x)));
    // Persist (no-op against demo fixtures, which aren't in the DB).
    void fetch('/api/dashboard/subscriptions', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status }),
    }).catch(() => {});
  };

  const confirmed = subs.filter((s) => s.status === 'confirmed').sort((a, b) => annualOf(b) - annualOf(a));
  const likely = subs.filter((s) => s.status === 'likely').sort((a, b) => annualOf(b) - annualOf(a));

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
        sub={`${confirmed.length} active · ${likely.length} to review`}
      />
      <div className="grid-3" style={{ marginBottom: 16 }}>
        <StatCard lbl="Per month" icon="repeat" val={<Money compact amount={monthlyEquivalent} />} sub="Monthly-equivalent of all plans" />
        <StatCard lbl="Per year" icon="calendar" val={<Money compact amount={annualTotal} />} sub={`Across ${confirmed.length} active subscriptions`} />
        <StatCard lbl="Needs review" icon="help-circle" val={String(likely.length)} accent="var(--amber-600)" sub="Likely — confirm or dismiss" />
      </div>

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
          <div className="empty">
            <div className="ic"><Icon name="repeat" size={24} color="var(--fg-3)" /></div>
            <h3 style={{ fontFamily: 'var(--font-display)', margin: '0 0 4px' }}>No active subscriptions yet</h3>
            <p style={{ margin: 0 }}>Confirm the likely ones above, or import more statements to surface recurring charges.</p>
          </div>
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
      <FootMeta />
    </div>
  );
}
