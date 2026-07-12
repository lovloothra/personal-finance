'use client';
import { classifierLayers } from '../lib/classifierLayers';
import type { Txn } from '../lib/types';
import { ConfidenceBadge } from './ConfidenceBadge';
import { Dialog, useDialogClose } from './Dialog';
import { Icon } from './Icon';
import { Money } from './Money';
import { labelForCategory } from '@/classifier/taxonomy';

interface ProvenanceDrawerProps {
  txn: Txn;
  onClose: () => void;
}

export function ProvenanceDrawer({ txn, onClose }: ProvenanceDrawerProps) {
  return (
    <Dialog open onClose={onClose} label={txn.merchant}>
      <ProvenanceDrawerBody txn={txn} />
    </Dialog>
  );
}

function ProvenanceDrawerBody({ txn }: { txn: Txn }) {
  const close = useDialogClose();
  const hitLayer = txn.layer;
  const src = txn.source;

  return (
    <>
        <div className="drawer-head">
          <div>
            <h3>{txn.merchant}</h3>
            <p>
              {[txn.date, txn.acct, txn.method].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button className="drawer-x" onClick={close} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="drawer-body">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
            <div className="doc-amt">
              {txn.flow === 'in' ? '+' : '−'}
              <Money amount={txn.amt} precise />
            </div>
            <ConfidenceBadge level={txn.conf} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0 22px' }}>
            <span className="badge brand">
              {txn.ledgerFlow
                ? txn.ledgerFlow.charAt(0).toUpperCase() + txn.ledgerFlow.slice(1)
                : txn.flow === 'in' ? 'Income' : 'Expense'}
            </span>
            <span className="badge neutral">
              {labelForCategory(txn.cat)}
              {txn.sub ? ' · ' + labelForCategory(txn.sub) : ''}
            </span>
            {txn.transfer && <span className="badge mint">Internal transfer · de-duped</span>}
            {txn.recurring && <span className="badge coral">Recurring</span>}
            {txn.project && <span className="badge cau">Project: {txn.project}</span>}
            {txn.taxSection && <span className="badge mint">Tax: {txn.taxSection}</span>}
            {txn.review && <span className="badge red">In review queue</span>}
          </div>

          <div className="card-head" style={{ padding: '0 0 10px' }}>
            <h3 style={{ fontSize: 13.5 }}>How this was classified</h3>
          </div>
          <div className="reason-box" style={{ marginBottom: 10 }}>
            {classifierLayers.map((l) => {
              const hit = l.n === hitLayer;
              const skipped = l.n < hitLayer;
              return (
                <div key={l.n} className={`step ${hit ? 'hit' : ''} ${skipped ? 'skip' : ''}`}>
                  <span className="n">{hit ? '✓' : l.n}</span>
                  <div>
                    <div style={{ fontWeight: hit ? 700 : 500 }}>
                      {l.name}
                      {skipped ? ' — no match' : ''}
                      {hit ? ' — matched' : ''}
                    </div>
                    {hit && (
                      <div style={{ color: 'var(--fg-2)', marginTop: 3, lineHeight: 1.5 }}>{txn.reason}</div>
                    )}
                    {!hit && !skipped && l.n > hitLayer && (
                      <div className="muted" style={{ fontSize: 12 }}>{l.desc}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {txn.signal && (
            <div className="kv" style={{ borderTop: 0, paddingTop: 0, marginBottom: 22 }}>
              <span className="k">Profile signal used</span>
              <span className="v t-mono" style={{ color: 'var(--brand)' }}>
                {txn.signal}
              </span>
          </div>
        )}
        {txn.classificationSource && (
          <div className="kv" style={{ borderTop: 0, paddingTop: 0, marginBottom: 22 }}>
            <span className="k">Classification source</span>
            <span className="v t-mono" style={{ color: 'var(--brand)' }}>
              {txn.classificationSource}
              {txn.acceptedPredictionId ? ` · ${txn.acceptedPredictionId}` : ''}
            </span>
          </div>
        )}

        <div className="card-head" style={{ padding: '6px 0 10px' }}>
            <h3 style={{ fontSize: 13.5 }}>Source evidence</h3>
          </div>
          {src && src.type === 'email' && (src.from || src.subject) && (
            <div className="doc">
              <div className="doc-bar">
                <svg className="gm" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="4" width="20" height="16" rx="3" fill="#fff" stroke="#E5E3EF" />
                  <path d="M3 6l9 7 9-7" stroke="#EA4335" strokeWidth="1.6" fill="none" />
                </svg>
                <span>From your inbox · read-only</span>
                <span className="muted" style={{ marginLeft: 'auto' }}>{src.date}</span>
              </div>
              <div className="doc-meta">
                <div className="from">{src.from}</div>
                <div className="subj">{src.subject}</div>
              </div>
              <div className="doc-body">
                {src.body || <span className="muted">The original message isn&apos;t stored — evidence is re-read from your inbox at import time.</span>}
              </div>
            </div>
          )}
          {src && src.type === 'pdf' && (
            <div className="pdf">
              <div className="thumb">
                <Icon name="file-text" size={22} />
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{src.subject}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{src.body}</div>
              </div>
            </div>
          )}
          <div className="note privacy" style={{ marginTop: 18 }}>
            <span className="ic">
              <Icon name="hard-drive" size={16} />
            </span>
            <span>This evidence lives on your device only. We re-read it from your inbox at import time — it&apos;s never uploaded.</span>
          </div>
        </div>
    </>
  );
}
