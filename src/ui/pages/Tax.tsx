'use client';
import { useFy } from '../contexts/FyCtx';
import { useDrawer } from '../contexts/DrawerCtx';
import { tax as taxFixture, txns } from '../lib/fixtures';
import { inr } from '../lib/format';
import { Icon } from '../primitives/Icon';
import { Money } from '../primitives/Money';
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
        <span className="v">{inr(r.taxable)}</span>
      </div>
      <div className="line">
        <span className="k">Tax before cess</span>
        <span className="v">{inr(r.tax)}</span>
      </div>
      <div className="line">
        <span className="k">Surcharge</span>
        <span className="v">{inr(r.surcharge)}</span>
      </div>
      <div className="line">
        <span className="k">Health &amp; edu cess (4%)</span>
        <span className="v">{inr(r.cess)}</span>
      </div>
    </div>
  );
}

export function Tax() {
  const { fy } = useFy();
  const { openProv } = useDrawer();
  const { data } = useDashboard<TaxDTO>('tax', fy);
  const live = data?.hasData && data.comparison ? data.comparison : null;
  const taxData = live ?? taxFixture;
  const oldWins = taxData.old.total < taxData.new.total;
  const delta = Math.abs(taxData.old.total - taxData.new.total);
  const evidenceTxns = live ? data!.evidence.map(recentToTxn) : txns.filter((x) => x.taxSection);

  return (
    <div className="content-wrap fade-in">
      <PageHead title="Tax planning" sub={`${taxData.fy} · old vs new regime, from detected evidence`} />

      <div className="note warn" style={{ marginBottom: 20 }}>
        <span className="ic">
          <Icon name="triangle-alert" size={16} />
        </span>
        <span>
          <b>Planning aid, not filing.</b> Figures are computed from evidence found in your inbox — verify with your CA before filing.
          We don&apos;t file or transmit anything.
        </span>
      </div>

      <div className="grid-2e" style={{ marginBottom: 16 }}>
        <RegimeCard which="old" r={taxData.old} oldWins={oldWins} />
        <RegimeCard which="new" r={taxData.new} oldWins={oldWins} />
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
            color: '#fff',
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
            The {oldWins ? 'old' : 'new'} regime saves you {inr(delta)}
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
                {taxData.deductions.map((d) => (
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
                      <button
                        className="prov"
                        onClick={() =>
                          openProv(evidenceTxns.find((x) => x.taxSection === d.section) || evidenceTxns[0] || txns.find((x) => x.taxSection)!)
                        }
                      >
                        <Icon name="file-text" size={13} />
                        {d.evidence} docs
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card card-pad">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, margin: '0 0 6px' }}>Optimisation tips</h3>
          {taxData.tips.map((tip, i) => (
            <div key={i} className="tip">
              <span className="ic">
                <Icon name="lightbulb" size={16} />
              </span>
              <div className="body">
                <b>{tip.t}</b> {tip.d}
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
        </div>
      </div>
      <FootMeta />
    </div>
  );
}
