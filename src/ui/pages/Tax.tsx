'use client';
import { useFy } from '../contexts/FyCtx';
import { useDrawer } from '../contexts/DrawerCtx';
import { useMask } from '../contexts/MaskCtx';
import { fyLabel, redactInr } from '../lib/format';
import { viewState } from '../lib/viewState';
import type { Txn } from '../lib/types';
import { Icon } from '../primitives/Icon';
import { Money } from '../primitives/Money';
import { EmptyState } from '../primitives/EmptyState';
import { ErrorState } from '../primitives/ErrorState';
import { Skeleton } from '../primitives/Skeleton';
import { FootMeta, PageHead, TxnRow } from './shared';
import { useDashboard, type TaxDTO } from '../data/useDashboard';
import { recentToTxn } from '../data/useOverview';

interface RegimeView {
  taxable: number;
  tax: number;
  surcharge: number;
  cess: number;
  total: number;
}

function RegimeCard({ which, r, oldWins }: { which: 'old' | 'new'; r: RegimeView; oldWins: boolean }) {
  const win = (which === 'old') === oldWins;
  return (
    <div className={`regime ${win ? 'win' : ''}`}>
      {win && <span className="tag">Lower tax</span>}
      <h4>{which === 'old' ? 'Old regime' : 'New regime'}</h4>
      <div className="sub">{which === 'old' ? 'With deductions & exemptions' : 'Lower slabs, minimal deductions'}</div>
      <div className="big" style={win ? { color: 'var(--mint-700)' } : undefined}>
        <Money amount={r.total} />
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
        total tax payable
      </div>
      <div className="line">
        <span className="k">Taxable income</span>
        <span className="v"><Money amount={r.taxable} /></span>
      </div>
      <div className="line">
        <span className="k">Tax before cess</span>
        <span className="v"><Money amount={r.tax} /></span>
      </div>
      <div className="line">
        <span className="k">Surcharge</span>
        <span className="v"><Money amount={r.surcharge} /></span>
      </div>
      <div className="line">
        <span className="k">Health &amp; edu cess (4%)</span>
        <span className="v"><Money amount={r.cess} /></span>
      </div>
    </div>
  );
}

export function Tax() {
  const { fy } = useFy();
  const { openProv } = useDrawer();
  const { data, loading, error, retry } = useDashboard<TaxDTO>('tax', fy);
  const hasComparison = Boolean(data?.hasData && data.comparison);
  const state = viewState(loading, error, hasComparison);
  const f = fyLabel(fy);

  return (
    <div className="content-wrap fade-in">
      <PageHead
        title="Tax planning"
        sub={state === 'ready' ? `${f.label} · old vs new regime, from detected evidence` : `${f.label} · old vs new regime`}
      />

      {state === 'loading' && (
        <>
          <div className="grid-2e" style={{ marginBottom: 16 }}>
            <Skeleton variant="block" height={220} />
            <Skeleton variant="block" height={220} />
          </div>
          <Skeleton variant="block" height={200} />
        </>
      )}

      {state === 'error' && <ErrorState message={error ?? undefined} onRetry={retry} />}

      {state === 'empty' && (
        <EmptyState
          icon="receipt-indian-rupee"
          title={`Not enough evidence to compare regimes for ${f.label} yet.`}
          body="Import statements for this year so income and deductions can be detected, or switch FY above."
          action={{ label: 'Run an import', href: '/sources' }}
        />
      )}

      {state === 'ready' && data?.comparison && (
        <TaxContent evidence={data.evidence} comparison={data.comparison} openProv={openProv} />
      )}

      <FootMeta />
    </div>
  );
}

function TaxContent({
  evidence,
  comparison,
  openProv,
}: {
  evidence: TaxDTO['evidence'];
  comparison: NonNullable<TaxDTO['comparison']>;
  openProv: (t: Txn) => void;
}) {
  const { masked } = useMask();
  const oldWins = comparison.recommended === 'old';
  const evidenceTxns = evidence.map(recentToTxn);

  return (
    <>
      <div className="note warn" style={{ marginBottom: 20 }}>
        <span className="ic">
          <Icon name="triangle-alert" size={16} />
        </span>
        <span>
          <b>Planning aid, not filing.</b>{' '}
          Figures are computed from evidence found in your inbox — verify with your CA before filing.
          We don&apos;t file or transmit anything.
        </span>
      </div>

      <div className="grid-2e" style={{ marginBottom: 16 }}>
        <RegimeCard which="old" r={comparison.old} oldWins={oldWins} />
        <RegimeCard which="new" r={comparison.new} oldWins={oldWins} />
      </div>

      <div
        className="card card-pad"
        style={{
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          background: 'var(--mint-50)',
          border: '1px solid var(--mint-200)',
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'var(--mint-500)',
            color: 'var(--fg-on-dark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="badge-check" size={22} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)' }}>
            The {comparison.recommended} regime saves you <Money amount={comparison.saving} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--mint-700)', marginTop: 2 }}>
            Given your detected HRA, home-loan interest and 80C/80D deductions this year.
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-head">
            <h3>Detected deductions</h3>
            <span className="muted" style={{ fontSize: 12.5 }}>
              linked to source
            </span>
          </div>
          <div style={{ padding: '0 6px 8px' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>What we found</th>
                  <th className="r">Amount</th>
                  <th className="r">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {comparison.deductions.map((d) => {
                  const match = evidenceTxns.find((x) => x.taxSection === d.section);
                  return (
                    <tr key={d.section}>
                      <td>
                        <span className="badge brand">{d.section}</span>
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {d.label}
                        {d.cap && d.amount >= d.cap && (
                          <span className="badge mint" style={{ marginLeft: 6, padding: '1px 7px' }}>
                            maxed
                          </span>
                        )}
                      </td>
                      <td className="r figure">
                        <Money amount={d.amount} />
                      </td>
                      <td className="r">
                        {match ? (
                          <button className="prov" onClick={() => openProv(match)}>
                            <Icon name="file-text" size={13} />
                            {d.evidence} docs
                          </button>
                        ) : (
                          <span className="muted" style={{ fontSize: 12.5 }}>{d.evidence} docs</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card card-pad">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, margin: '0 0 6px' }}>Optimisation tips</h3>
          {comparison.tips.map((tip, i) => (
            <div key={i} className="tip">
              <span className="ic">
                <Icon name="lightbulb" size={16} />
              </span>
              <div className="body">
                <b>{masked ? redactInr(tip.t) : tip.t}</b> {masked ? redactInr(tip.d) : tip.d}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Evidence trail</h3>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Every deduction traces to a real transaction
          </span>
        </div>
        <div className="card-list">
          {evidenceTxns.map((t) => (
            <TxnRow key={t.id} t={t} />
          ))}
          {evidenceTxns.length === 0 && <div className="muted" style={{ padding: 16 }}>No linked evidence yet.</div>}
        </div>
      </div>
    </>
  );
}
