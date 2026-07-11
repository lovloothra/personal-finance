'use client';
import { useFy } from '../contexts/FyCtx';
import { fyLabel } from '../lib/format';
import { viewState } from '../lib/viewState';
import { Money } from '../primitives/Money';
import { StatCard } from '../primitives/StatCard';
import { EmptyState } from '../primitives/EmptyState';
import { ErrorState } from '../primitives/ErrorState';
import { Skeleton } from '../primitives/Skeleton';
import { Icon } from '../primitives/Icon';
import { FootMeta, PageHead, TxnRow } from './shared';
import { useDashboard, type IncomeDTO } from '../data/useDashboard';
import { recentToTxn } from '../data/useOverview';

export function Income() {
  const { fy } = useFy();
  const { data, loading, error, retry } = useDashboard<IncomeDTO>('income', fy);
  const state = viewState(loading, error, data?.hasData);
  const f = fyLabel(fy);

  return (
    <div className="content-wrap fade-in">
      <PageHead
        title="Income"
        sub={state === 'ready' && data?.employer ? `${f.label} · salary credits detected from ${data.employer}` : f.label}
      />

      {state === 'loading' && (
        <>
          <div className="grid-3 stat-grid">
            <Skeleton variant="stat" count={3} />
          </div>
          <Skeleton variant="block" height={280} />
        </>
      )}

      {state === 'error' && <ErrorState message={error ?? undefined} onRetry={retry} />}

      {state === 'empty' && (
        <EmptyState
          icon="arrow-down-to-line"
          title={`No income detected for ${f.label} yet`}
          body="Salary credits and other inflows show up here after your inbox is imported."
          action={{ label: 'Run an import', href: '/sources' }}
        />
      )}

      {state === 'ready' && data && (
        <IncomeContent data={data} />
      )}
      <FootMeta />
    </div>
  );
}

function IncomeContent({ data }: { data: IncomeDTO }) {
  const months = data.months;
  const maxM = Math.max(1, ...months.map((m) => m.salary + m.other));
  const salaryTxns = data.txns.map(recentToTxn);

  return (
    <>
      <div className="grid-3 stat-grid">
        <StatCard lbl="Total income" icon="wallet" val={<Money compact amount={data.total} pos />} />
        <StatCard lbl="Salary (employer)" icon="building-2" val={<Money compact amount={data.salaryTotal} />} sub="monthly credits matched" />
        <StatCard lbl="Other income" icon="plus-circle" val={<Money compact amount={data.otherTotal} />} sub="Bonus, freelance, reimbursements" />
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
            <div key={m.m} className="col">
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
    </>
  );
}
