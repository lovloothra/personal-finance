'use client';
import { useFy } from '../contexts/FyCtx';
import { fys, household, incomeMonths, txns } from '../lib/fixtures';
import { Icon } from '../primitives/Icon';
import { Money } from '../primitives/Money';
import { StatCard } from '../primitives/StatCard';
import { FootMeta, PageHead, TxnRow } from './shared';

export function Income() {
  const { fy } = useFy();
  const f = fys[fy];
  const months = incomeMonths;
  const maxM = Math.max(...months.map((m) => m.salary + m.other));
  const totalSalary = months.reduce((s, m) => s + m.salary, 0);
  const totalOther = months.reduce((s, m) => s + m.other, 0);
  const salaryTxns = txns.filter((t) => t.flow === 'in');

  return (
    <div className="content-wrap fade-in">
      <PageHead title="Income" sub={`${f.label} · salary credits detected from ${household.employer}`} />
      <div className="grid-3" style={{ marginBottom: 16 }}>
        <StatCard lbl="Total income" icon="wallet" val={<Money amount={f.income} pos />} />
        <StatCard lbl="Salary (employer)" icon="building-2" val={<Money amount={totalSalary} />} sub="12 monthly credits matched" />
        <StatCard lbl="Other income" icon="plus-circle" val={<Money amount={totalOther} />} sub="Bonus, freelance, reimbursements" />
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, margin: 0 }}>Monthly inflow</h3>
          <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--indigo-500)', display: 'inline-block' }} />
              Salary
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--coral-400)', display: 'inline-block' }} />
              Other
            </span>
          </div>
        </div>
        <div className="bars">
          {months.map((m) => (
            <div key={m.m} className="col" title={`₹${(m.salary + m.other).toLocaleString('en-IN')}`}>
              <div style={{ width: '100%', maxWidth: 34, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                {m.other > 0 && (
                  <div style={{ height: (m.other / maxM) * 130, background: 'var(--coral-400)', borderRadius: '6px 6px 0 0' }} />
                )}
                <div
                  style={{
                    height: (m.salary / maxM) * 130,
                    background: 'var(--indigo-500)',
                    borderRadius: m.other > 0 ? 0 : '6px 6px 0 0',
                  }}
                />
              </div>
              <span className="x">{m.m}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Income transactions</h3>
          <span className="badge mint">
            <Icon name="badge-check" size={12} />
            employer-detected
          </span>
        </div>
        <div className="card-list">
          {salaryTxns.map((t) => (
            <TxnRow key={t.id} t={t} />
          ))}
        </div>
      </div>
      <FootMeta />
    </div>
  );
}
