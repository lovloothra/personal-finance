'use client';
import { useFy } from '../contexts/FyCtx';
import { fys, investments } from '../lib/fixtures';
import { inr } from '../lib/format';
import { Glyph } from '../primitives/Glyph';
import { Icon } from '../primitives/Icon';
import { Money } from '../primitives/Money';
import { StatCard } from '../primitives/StatCard';
import { FootMeta, PageHead } from './shared';

export function Investments() {
  const { fy } = useFy();
  const totInvested = investments.reduce((s, i) => s + i.invested, 0);
  const totValue = investments.reduce((s, i) => s + i.value, 0);
  const gain = totValue - totInvested;
  const gainPct = ((gain / totInvested) * 100).toFixed(1);

  return (
    <div className="content-wrap fade-in">
      <PageHead title="Investments" sub={`${fys[fy].label} · reconstructed from broker & platform emails`} />
      <div className="grid-3" style={{ marginBottom: 16 }}>
        <StatCard lbl="Invested" icon="banknote" val={<Money amount={totInvested} />} sub="Contributions detected" />
        <StatCard lbl="Current value" icon="trending-up" val={<Money amount={totValue} pos />} accent="var(--mint-600)" />
        <StatCard lbl="Unrealised gain" icon="sparkles" val={<Money amount={gain} pos />} delta={`+${gainPct}%`} dir="up" />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>By platform</h3>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Where evidence allows current value
          </span>
        </div>
        <div style={{ padding: '0 6px 8px' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Asset class</th>
                <th className="r">Invested</th>
                <th className="r">Value</th>
                <th className="r">Gain</th>
              </tr>
            </thead>
            <tbody>
              {investments.map((i) => {
                const g = i.value - i.invested;
                return (
                  <tr key={i.platform}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Glyph ch={i.glyph} color={i.color} size={32} />
                        <b>{i.platform}</b>
                      </div>
                    </td>
                    <td className="muted">{i.kind}</td>
                    <td className="r">
                      <Money amount={i.invested} />
                    </td>
                    <td className="r figure">
                      <Money amount={i.value} />
                    </td>
                    <td className="r">
                      <span className="delta up">+{inr(g)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="note info">
        <span className="ic">
          <Icon name="info" size={16} />
        </span>
        <span>
          Values shown are the latest figures found in your platform statements. We don&apos;t fetch live prices — nothing leaves this
          device, so quotes can lag your broker app.
        </span>
      </div>
      <FootMeta />
    </div>
  );
}
