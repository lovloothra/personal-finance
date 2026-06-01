'use client';
import { useEffect, useState } from 'react';
import { subscriptions as seed, type Subscription } from '../lib/fixtures';
import { Glyph } from '../primitives/Glyph';
import { Icon } from '../primitives/Icon';
import { Money } from '../primitives/Money';
import { StatCard } from '../primitives/StatCard';
import { FootMeta, PageHead } from './shared';
import { useDashboard, type SubscriptionsDTO } from '../data/useDashboard';

interface SubRowProps {
  s: Subscription;
  likelyMode?: boolean;
  setStatus: (id: string, status: Subscription['status']) => void;
}

function SubRow({ s, likelyMode, setStatus }: SubRowProps) {
  return (
    <div className="txn" style={{ cursor: 'default' }}>
      <Glyph ch={s.glyph} color={s.color} />
      <div className="txn-mid">
        <div className="mer">{s.name}</div>
        <div className="cat">
          {s.cat} · {s.cadence} · {s.last}
        </div>
      </div>
      <div style={{ textAlign: 'right', marginRight: 14 }}>
        <div className="amt">
          <Money amount={s.amt} />
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
          next {s.next}
        </div>
      </div>
      {likelyMode ? (
        <div style={{ display: 'flex', gap: 7 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setStatus(s.id, 'dismissed')}>
            Dismiss
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setStatus(s.id, 'confirmed')}>
            Confirm
          </button>
        </div>
      ) : (
        <button className="btn btn-ghost btn-sm" onClick={() => setStatus(s.id, 'dismissed')} title="Stop tracking">
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  );
}

export function Subscriptions() {
  const { data } = useDashboard<SubscriptionsDTO>('subscriptions', 'all');
  const [subs, setSubs] = useState<Subscription[]>(seed);
  const [initialized, setInitialized] = useState(false);

  // Seed from the DB once it loads; keep demo fixtures until the first import.
  useEffect(() => {
    if (data && !initialized) {
      if (data.hasData) setSubs(data.subscriptions as Subscription[]);
      setInitialized(true);
    }
  }, [data, initialized]);

  const setStatus = (id: string, status: Subscription['status']) =>
    setSubs((arr) => arr.map((x) => (x.id === id ? { ...x, status } : x)));

  const confirmed = subs.filter((s) => s.status === 'confirmed');
  const likely = subs.filter((s) => s.status === 'likely');
  const monthlyTotal = confirmed.filter((s) => s.cadence === 'Monthly').reduce((a, s) => a + s.amt, 0);
  const yearlyFromMonthly =
    monthlyTotal * 12 + confirmed.filter((s) => s.cadence === 'Yearly').reduce((a, s) => a + s.amt, 0);

  return (
    <div className="content-wrap fade-in">
      <PageHead
        title="Subscriptions"
        sub={`${subs.filter((s) => s.status !== 'dismissed').length} recurring charges found in your inbox`}
      />
      <div className="grid-3" style={{ marginBottom: 16 }}>
        <StatCard
          lbl="Per month"
          icon="repeat"
          val={<Money amount={monthlyTotal} />}
          sub={`${confirmed.filter((s) => s.cadence === 'Monthly').length} monthly subscriptions`}
        />
        <StatCard lbl="Per year" icon="calendar" val={<Money amount={yearlyFromMonthly} />} sub="Annualised commitment" />
        <StatCard
          lbl="Needs review"
          icon="help-circle"
          val={String(likely.length)}
          accent="var(--amber-600)"
          sub="Likely — confirm or dismiss"
        />
      </div>

      {likely.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--amber-400)' }}>
          <div className="card-head">
            <h3>Likely subscriptions</h3>
            <span className="badge cau">{likely.length} to review</span>
          </div>
          <div className="card-list">
            {likely.map((s) => (
              <SubRow key={s.id} s={s} likelyMode setStatus={setStatus} />
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3>Confirmed</h3>
          <button className="link">
            <Icon name="bell" size={13} />
            Renewal reminders on
          </button>
        </div>
        <div className="card-list">
          {confirmed.map((s) => (
            <SubRow key={s.id} s={s} setStatus={setStatus} />
          ))}
        </div>
      </div>
      <div className="note info" style={{ marginTop: 16 }}>
        <span className="ic">
          <Icon name="calendar-clock" size={16} />
        </span>
        <span>
          Heads up — your Netflix Premium (₹649) renews in 6 days. We spotted three trials converting to paid plans this month.
        </span>
      </div>
      <FootMeta />
    </div>
  );
}
