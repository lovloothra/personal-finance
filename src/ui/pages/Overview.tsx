'use client';
import { useFy } from '../contexts/FyCtx';
import { categories, fys, household, txns, type Txn } from '../lib/fixtures';
import { Glyph } from '../primitives/Glyph';
import { Icon } from '../primitives/Icon';
import { Money } from '../primitives/Money';
import { StatCard } from '../primitives/StatCard';
import { FootMeta, PageHead, TxnRow } from './shared';
import type { WorkbenchPage } from '../shell/Sidebar';
import { useOverview, recentToTxn } from '../data/useOverview';

interface OverviewProps {
  setPage: (p: WorkbenchPage) => void;
}

interface CatView {
  name: string;
  amt: number;
  color: string;
  recurring: boolean;
}
interface MerchantView {
  name: string;
  amt: number;
  color: string;
  glyph: string;
}

const FIXTURE_MERCHANTS: MerchantView[] = [
  { name: 'Prestige Property', amt: 660000, color: '#FF8A6B', glyph: 'P' },
  { name: 'Nexora payroll', amt: 4218000, color: '#6354E6', glyph: 'N' },
  { name: 'Zepto', amt: 168200, color: '#15A877', glyph: 'Z' },
  { name: 'Amazon', amt: 98400, color: '#3B82F6', glyph: 'A' },
];

export function Overview({ setPage }: OverviewProps) {
  const { fy } = useFy();
  const { data } = useOverview(fy);
  const live = data?.hasData ? data : null;
  const f = fys[fy];

  // Real DB rollups when an import has produced data, otherwise the demo fixtures.
  const income = live ? live.income : f.income;
  const expenses = live ? live.expenses : f.expenses;
  const net = live ? live.net : f.income - f.expenses;
  const savingsRate = live ? live.savingsRate : f.savingsRate;
  const prevSavingsRate = live ? live.prevSavingsRate : f.prevSavingsRate;

  const topCats: CatView[] = live
    ? live.topCategories.map((c) => ({ name: c.name, amt: c.amount, color: c.color, recurring: true }))
    : [...categories].sort((a, b) => b.amt - a.amt).slice(0, 5).map((c) => ({ name: c.name, amt: c.amt, color: c.color, recurring: c.recurring }));
  const maxCat = topCats.length ? topCats[0].amt : 1;

  const recent: Txn[] = live ? live.recent.map(recentToTxn) : txns.slice(0, 6);
  const merchants: MerchantView[] = live
    ? live.topMerchants.map((m) => ({ name: m.name, amt: m.amount, color: m.color, glyph: m.glyph }))
    : FIXTURE_MERCHANTS;

  return (
    <div className="content-wrap fade-in">
      <PageHead title={`Hello, ${(data?.name ?? household.name).split(' ')[0]}`} sub={`${f.label} · ${f.sub}`}>
        <button className="btn btn-secondary" onClick={() => setPage('sources')}>
          <Icon name="refresh-cw" size={15} />
          Re-run import
        </button>
      </PageHead>

      <div className="grid-4" style={{ marginBottom: 16 }}>
        <StatCard lbl="Income" icon="arrow-down-to-line" val={<Money amount={income} pos />} delta="vs prior FY" dir="up" />
        <StatCard lbl="Expenses" icon="arrow-up-from-line" val={<Money amount={expenses} />} sub="CC payments de-duped" />
        <StatCard lbl="Money kept" icon="piggy-bank" val={<Money amount={net} pos />} accent="var(--mint-600)" />
        <StatCard lbl="Savings rate" icon="percent" val={`${savingsRate}%`} delta={`${savingsRate - prevSavingsRate >= 0 ? '+' : ''}${savingsRate - prevSavingsRate} pts`} dir={savingsRate - prevSavingsRate >= 0 ? 'up' : 'down'} />
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-head">
            <h3>Where it went</h3>
            <button className="link" onClick={() => setPage('expenses')}>
              All expenses
              <Icon name="arrow-right" size={13} />
            </button>
          </div>
          <div className="card-list">
            {topCats.map((c) => (
              <div key={c.name} className="catrow" style={{ cursor: 'default' }}>
                <div className="top">
                  <span className="nm">
                    <span className="swatch" style={{ background: c.color }} />
                    {c.name}
                    {c.recurring ? null : (
                      <span className="badge neutral" style={{ padding: '1px 7px' }}>
                        one-time
                      </span>
                    )}
                  </span>
                  <Money amount={c.amt} />
                </div>
                <div className="track">
                  <i style={{ width: `${(c.amt / maxCat) * 100}%`, background: c.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="card card-pad" style={{ background: 'var(--gradient-mint)', border: 0, color: '#fff' }}>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              You kept
            </div>
            <div className="fig" style={{ fontSize: 34, margin: '8px 0 2px' }}>
              <Money amount={net} className="onmint" />
            </div>
            <div style={{ fontSize: 13, opacity: 0.92 }}>{savingsRate}% of everything you earned this year.</div>
          </div>
          <div className="card card-pad card-hover" style={{ cursor: 'pointer' }} onClick={() => setPage('tax')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--indigo-50)', color: 'var(--indigo-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="receipt-indian-rupee" size={18} />
              </div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, margin: 0 }}>Tax: old regime wins</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--fg-2)', margin: '0 0 6px', lineHeight: 1.5 }}>
              Based on detected evidence, the old regime saves you{' '}
              <b style={{ color: 'var(--mint-700)' }}>₹1,23,760</b> this year given your HRA and home-loan interest.
            </p>
            <span className="link" style={{ color: 'var(--brand)', fontWeight: 600, fontSize: 13 }}>
              Compare regimes →
            </span>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Recent activity</h3>
            <button className="link" onClick={() => setPage('expenses')}>
              See all
              <Icon name="arrow-right" size={13} />
            </button>
          </div>
          <div className="card-list">
            {recent.map((t) => (
              <TxnRow key={t.id} t={t} />
            ))}
          </div>
        </div>
        <div className="stack">
          <div className="card card-pad card-hover" style={{ cursor: 'pointer' }} onClick={() => setPage('review')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, margin: 0 }}>Needs your eye</h3>
              <span className="badge cau">23 items</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--fg-2)', margin: '8px 0 0', lineHeight: 1.5 }}>
              2 locked PDFs, 14 uncategorised merchants, 6 low-confidence and 1 profile gap. Clear them to push coverage past 98%.
            </p>
            <span className="link" style={{ color: 'var(--brand)', fontWeight: 600, fontSize: 13, marginTop: 8, display: 'inline-block' }}>
              Open review queue →
            </span>
          </div>
          <div className="card card-pad">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, margin: '0 0 12px' }}>Top merchants</h3>
            {merchants.map((m) => (
              <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
                <Glyph ch={m.glyph} color={m.color} size={30} />
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</span>
                <span style={{ marginLeft: 'auto' }}>
                  <Money amount={m.amt} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <FootMeta />
    </div>
  );
}
