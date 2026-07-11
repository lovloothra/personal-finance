'use client';
import { useFy } from '../contexts/FyCtx';
import { fySummary, investments } from '../lib/fixtures';
import { MerchantLogo } from '../primitives/MerchantLogo';
import { Icon } from '../primitives/Icon';
import { Money } from '../primitives/Money';
import { StatCard } from '../primitives/StatCard';
import { FootMeta, PageHead } from './shared';
import { useDashboard, type InvestmentsDTO } from '../data/useDashboard';

export function Investments() {
  const { fy } = useFy();
  const { data } = useDashboard<InvestmentsDTO>('investments', fy);
  const live = data?.hasData ? data : null;

  const rows: { platform: string; kind: string; invested: number; value: number | null; glyph: string; color: string }[] = live
    ? live.platforms
    : investments.map((i) => ({ platform: i.platform, kind: i.kind, invested: i.invested, value: i.value, glyph: i.glyph, color: i.color }));
  const totInvested = rows.reduce((s, i) => s + i.invested, 0);
  const haveValues = rows.length > 0 && rows.every((i) => i.value != null);
  const totValue = haveValues ? rows.reduce((s, i) => s + (i.value ?? 0), 0) : null;
  const gain = totValue != null ? totValue - totInvested : null;
  const gainPct = gain != null && totInvested > 0 ? ((gain / totInvested) * 100).toFixed(1) : null;

  return (
    <div className="content-wrap fade-in">
      <PageHead title="Investments" sub={`${fySummary(fy).label} · reconstructed from broker & platform emails`} />
      <div className="grid-3" style={{ marginBottom: 16 }}>
        <StatCard lbl="Invested" icon="banknote" val={<Money compact amount={totInvested} />} sub="Contributions detected" />
        <StatCard lbl="Current value" icon="trending-up" val={totValue != null ? <Money amount={totValue} pos /> : '—'} accent="var(--mint-600)" sub={totValue == null ? 'No holdings data in statements' : undefined} />
        <StatCard lbl="Unrealised gain" icon="sparkles" val={gain != null ? <Money amount={gain} pos /> : '—'} delta={gainPct != null ? `+${gainPct}%` : undefined} dir="up" />
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
              {rows.map((i) => {
                const g = i.value != null ? i.value - i.invested : null;
                return (
                  <tr key={i.platform}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <MerchantLogo name={i.platform} color={i.color} size={32} />
                        <b>{i.platform}</b>
                      </div>
                    </td>
                    <td className="muted">{i.kind}</td>
                    <td className="r">
                      <Money amount={i.invested} />
                    </td>
                    <td className="r figure">
                      {i.value != null ? <Money amount={i.value} /> : <span className="muted">—</span>}
                    </td>
                    <td className="r">
                      {g != null ? <span className="delta up">+<Money amount={g} pos /></span> : <span className="muted">—</span>}
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
