'use client';
import { useFy } from '../contexts/FyCtx';
import { fys, insurance, liabilities } from '../lib/fixtures';
import { Glyph } from '../primitives/Glyph';
import { Money } from '../primitives/Money';
import { StatCard } from '../primitives/StatCard';
import { FootMeta, PageHead } from './shared';

export function Liabilities() {
  const { fy } = useFy();
  const totalOut = liabilities.reduce((s, l) => s + l.outstanding, 0);
  const totalEmi = liabilities.reduce((s, l) => s + l.emi, 0);
  const totalInsurance = insurance.reduce((s, i) => s + i.premium, 0);

  return (
    <div className="content-wrap fade-in">
      <PageHead title="Liabilities" sub={`${fys[fy].label} · loans, EMIs and insurance detected from statements`} />
      <div className="grid-3" style={{ marginBottom: 16 }}>
        <StatCard lbl="Total outstanding" icon="landmark" val={<Money amount={totalOut} />} />
        <StatCard lbl="Monthly EMIs" icon="calendar-clock" val={<Money amount={totalEmi} />} sub="Across 2 active loans" />
        <StatCard lbl="Insurance / year" icon="shield" val={<Money amount={totalInsurance} />} sub="3 policies" />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Loans &amp; EMIs</h3>
        </div>
        <div className="card-list">
          {liabilities.map((l) => (
            <div key={l.name} className="txn" style={{ cursor: 'default' }}>
              <Glyph ch={l.glyph} color={l.color} />
              <div className="txn-mid">
                <div className="mer">
                  {l.name}
                  {l.taxSection && (
                    <span className="badge brand" style={{ padding: '1px 7px', marginLeft: 8 }}>
                      {l.taxSection}
                    </span>
                  )}
                </div>
                <div className="cat">
                  {l.kind} · {l.detail}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="amt">
                  {l.outstanding > 0 ? <Money amount={l.outstanding} /> : <span className="badge mint">Cleared</span>}
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                  {l.outstanding > 0 ? 'outstanding' : 'no balance'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Insurance premiums</h3>
          <span className="badge brand">tax-relevant</span>
        </div>
        <div className="card-list">
          {insurance.map((i) => (
            <div key={i.name} className="txn" style={{ cursor: 'default' }}>
              <Glyph ch={i.glyph} color={i.color} />
              <div className="txn-mid">
                <div className="mer">{i.name}</div>
                <div className="cat">
                  Annual premium ·{' '}
                  <span className="badge brand" style={{ padding: '1px 7px' }}>
                    {i.section}
                  </span>
                </div>
              </div>
              <div className="amt">
                <Money amount={i.premium} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <FootMeta />
    </div>
  );
}
