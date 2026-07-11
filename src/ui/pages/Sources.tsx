'use client';
import { useCallback, useEffect, useState } from 'react';
import { useFy } from '../contexts/FyCtx';
import { fyLabel } from '../lib/format';
import { viewState } from '../lib/viewState';
import { Icon } from '../primitives/Icon';
import { StatCard } from '../primitives/StatCard';
import { EmptyState } from '../primitives/EmptyState';
import { ErrorState } from '../primitives/ErrorState';
import { Skeleton } from '../primitives/Skeleton';
import { FootMeta, PageHead } from './shared';
import { useDashboard, type ReviewDTO, type SourcesDTO } from '../data/useDashboard';
import { useShellMeta } from '../contexts/ShellMetaCtx';
import { ImportRunner } from '../shared/ImportRunner';

export function Sources() {
  const { fy } = useFy();
  const f = fyLabel(fy);
  const { data, loading, error, retry } = useDashboard<SourcesDTO>('sources', fy);
  const state = viewState(loading, error, data?.hasData);
  const [importOpen, setImportOpen] = useState(false);

  // Unlock state
  const [reviewItems, setReviewItems] = useState<ReviewDTO['items']>([]);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const { refresh: refreshShellMeta } = useShellMeta();

  const loadReview = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/review');
      const data: ReviewDTO = await res.json();
      setReviewItems(data.hasData ? data.items : []);
    } catch {
      /* keep empty */
    }
  }, []);

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  const lockedCount = reviewItems.filter((i) => i.kind === 'locked_pdf').length;

  const submitPassword = async () => {
    if (!password.trim()) return;
    setUnlocking(true);
    setFlash(null);
    try {
      const res = await fetch('/api/review/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Unlock failed');
      setFlash(
        data.unlocked > 0
          ? `Unlocked ${data.unlocked} statement${data.unlocked === 1 ? '' : 's'} — ${data.transactions} transactions imported.`
          : `That password didn't match any locked statements. ${data.stillLocked} still locked.`,
      );
      setPassword('');
      setUnlockOpen(false);
      await loadReview();
      void refreshShellMeta();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Unlock failed');
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="content-wrap fade-in">
      <PageHead title="Sources" sub={`${f.label} · every Gmail query we ran, and what came back`}>
        <button className="btn btn-primary" onClick={() => setImportOpen(true)}>
          <Icon name="refresh-cw" size={15} />
          Run new import
        </button>
      </PageHead>

      {importOpen && <ReimportPanel fy={fy} onClose={() => setImportOpen(false)} />}

      {/* Locked-PDF unlock card */}
      {lockedCount > 0 && (
        <div className="card card-pad" style={{ marginBottom: 16, borderColor: 'var(--amber-400)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--amber-50)', color: 'var(--amber-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="lock-keyhole" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{lockedCount} statement{lockedCount === 1 ? '' : 's'} still locked</div>
              <div className="muted" style={{ fontSize: 12.5 }}>Enter the document password and we&apos;ll try it on every locked statement, on-device.</div>
            </div>
            {!unlockOpen ? (
              <button className="btn btn-primary btn-sm" onClick={() => setUnlockOpen(true)}>Add password</button>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  className="inp"
                  type="password"
                  autoFocus
                  placeholder="Statement password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitPassword()}
                  style={{ width: 200 }}
                />
                <button className="btn btn-primary btn-sm" disabled={unlocking || !password.trim()} onClick={submitPassword}>
                  {unlocking ? 'Trying…' : 'Unlock'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setUnlockOpen(false); setPassword(''); }}>Cancel</button>
              </div>
            )}
          </div>
          {flash && <div className="muted" style={{ fontSize: 13, marginTop: 10, color: 'var(--fg-1)' }}>{flash}</div>}
        </div>
      )}

      {/* When the last statement clears, the amber card collapses — keep the
          success message visible in its own banner. */}
      {flash && lockedCount === 0 && (
        <div className="card card-pad" style={{ marginBottom: 16, borderColor: 'var(--mint-500)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="check-check" size={16} color="var(--mint-600)" />
            <span style={{ fontSize: 13.5 }}>{flash}</span>
          </div>
        </div>
      )}

      {state === 'loading' && (
        <>
          <div className="grid-3 stat-grid">
            <Skeleton variant="stat" count={3} />
          </div>
          <Skeleton variant="block" height={220} />
        </>
      )}

      {state === 'error' && <ErrorState message={error ?? undefined} onRetry={retry} />}

      {state === 'empty' && (
        <EmptyState
          icon="mail-search"
          title="No imports yet"
          body="Run your first Gmail import to pull statements and receipts into your ledger."
          action={{ label: 'Run new import', onClick: () => setImportOpen(true) }}
        />
      )}

      {state === 'ready' && data && (
        <>
          <div className="grid-3 stat-grid">
            <StatCard lbl="Messages scanned" icon="mail" val={data.messagesScanned.toLocaleString('en-IN')} />
            <StatCard
              lbl="Source coverage"
              icon="target"
              val={data.coverage != null ? `${data.coverage}%` : '—'}
              accent="var(--mint-600)"
              sub="of your money explained"
            />
            <StatCard lbl="Last run" icon="clock" val="latest" sub={data.lastRunDate ?? '—'} />
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <h3>Import runs</h3>
              <span className="muted" style={{ fontSize: 12.5 }}>
                read-only · localhost
              </span>
            </div>
            <div className="card-list">
              {data.runs.length === 0 && <div className="muted" style={{ padding: 16 }}>No imports yet.</div>}
              {data.runs.map((r, i) => (
                <div key={i} className="run">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="q">{r.q}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                      {r.date}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }} className="tnum">
                      {r.msgs.toLocaleString('en-IN')} msgs
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.bytes}
                    </div>
                  </div>
                  <span
                    className="st"
                    style={{
                      color: r.status === 'ok' ? 'var(--mint-600)' : 'var(--amber-600)',
                      flexShrink: 0,
                      width: 90,
                      justifyContent: 'flex-end',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Icon name={r.status === 'ok' ? 'check-circle' : 'alert-triangle'} size={15} />
                    {r.status === 'ok' ? 'Complete' : 'Partial'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="note privacy">
        <span className="ic">
          <Icon name="shield-check" size={16} />
        </span>
        <span>
          Every query is <b>read-only</b> and runs against Google&apos;s API directly from this machine. Attachments are written to a
          gitignored local folder. No third party ever sees your inbox.
        </span>
      </div>
      <FootMeta />
    </div>
  );
}

function ReimportPanel({ fy, onClose }: { fy: string; onClose: () => void }) {
  return (
    <div className="card card-pad fade-in" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 17 }}>Re-import Gmail evidence</h3>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Queries are rebuilt from your latest saved profile.</div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close import runner"><Icon name="x" size={18} /></button>
      </div>
      <ImportRunner fy={fy} estimateCopy="Estimating with latest profile..." />
    </div>
  );
}
