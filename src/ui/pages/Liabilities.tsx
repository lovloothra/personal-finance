'use client';
import { useFy } from '../contexts/FyCtx';
import { fyLabel } from '../lib/format';
import { viewState } from '../lib/viewState';
import { MerchantLogo } from '../primitives/MerchantLogo';
import { Money } from '../primitives/Money';
import { StatCard } from '../primitives/StatCard';
import { EmptyState } from '../primitives/EmptyState';
import { ErrorState } from '../primitives/ErrorState';
import { Skeleton } from '../primitives/Skeleton';
import { FootMeta, PageHead } from './shared';
import { useDashboard, type LiabilitiesDTO } from '../data/useDashboard';

export function Liabilities() {
  const { fy } = useFy();
  const { data, loading, error, retry } = useDashboard<LiabilitiesDTO>('liabilities', fy);
  const state = viewState(loading, error, data?.hasData);
  const f = fyLabel(fy);

  return (
    <div className="content-wrap fade-in">
      <PageHead title="Liabilities" sub={`${f.label} · loans, EMIs and insurance detected from statements`} />

      {state === 'loading' && (
        <>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <Skeleton variant="stat" count={3} />
          </div>
          <Skeleton variant="block" height={280} />
        </>
      )}

      {state === 'error' && <ErrorState message={error ?? undefined} onRetry={retry} />}

      {state === 'empty' && (
        <EmptyState
          icon="landmark"
          title="No loans or premiums detected."
          body="Home, auto or personal loans and insurance premiums show up here after your inbox is imported."
          action={{ label: 'Run an import', href: '/sources' }}
        />
      )}

      {state === 'ready' && data && <LiabilitiesContent data={data} />}

      <FootMeta />
    </div>
  );
}

function LiabilitiesContent({ data }: { data: LiabilitiesDTO }) {
  const loans = data.loans;
  const insuranceList = data.insurance;
  const totalOut = loans.reduce((s, l) => s + l.outstanding, 0);
  const totalEmi = loans.reduce((s, l) => s + l.emi, 0);
  const totalInsurance = insuranceList.reduce((s, i) => s + i.premium, 0);

  return (
    <>
      <div className="grid-3" style={{ marginBottom: 16 }}>
        <StatCard lbl="Total outstanding" icon="landmark" val={totalOut > 0 ? <Money amount={totalOut} /> : '—'} sub={totalOut > 0 ? undefined : 'Not in statements'} />
        <StatCard lbl="Monthly EMIs" icon="calendar-clock" val={<Money compact amount={totalEmi} />} sub={`Across ${loans.length} active loan${loans.length === 1 ? '' : 's'}`} />
        <StatCard lbl="Insurance / year" icon="shield" val={<Money compact amount={totalInsurance} />} sub={`${insuranceList.length} ${insuranceList.length === 1 ? 'policy' : 'policies'}`} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Loans &amp; EMIs</h3>
        </div>
        <div className="card-list">
          {loans.map((l) => (
            <div key={l.name} className="txn" style={{ cursor: 'default' }}>
              <MerchantLogo name={l.name} color={l.color} size={38} />
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
                  {l.outstanding > 0 ? <Money amount={l.outstanding} /> : <Money amount={l.emi} />}
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                  {l.outstanding > 0 ? 'outstanding' : 'EMI / month'}
                </div>
              </div>
            </div>
          ))}
          {loans.length === 0 && <div className="muted" style={{ padding: 16 }}>No loans detected.</div>}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Insurance premiums</h3>
          <span className="badge brand">tax-relevant</span>
        </div>
        <div className="card-list">
          {insuranceList.map((i) => (
            <div key={i.name} className="txn" style={{ cursor: 'default' }}>
              <MerchantLogo name={i.name} color={i.color} size={38} />
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
          {insuranceList.length === 0 && <div className="muted" style={{ padding: 16 }}>No insurance premiums detected.</div>}
        </div>
      </div>
    </>
  );
}
