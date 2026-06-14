'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFy } from '../contexts/FyCtx';
import { fySummary, runs } from '../lib/fixtures';
import { Icon } from '../primitives/Icon';
import { StatCard } from '../primitives/StatCard';
import { FootMeta, PageHead } from './shared';
import { useDashboard, type ReviewDTO, type SourcesDTO } from '../data/useDashboard';
import { useShellMeta } from '../contexts/ShellMetaCtx';

export function Sources() {
  const { fy } = useFy();
  const f = fySummary(fy);
  const { data } = useDashboard<SourcesDTO>('sources', fy);
  const [importOpen, setImportOpen] = useState(false);
  const live = data?.hasData ? data : null;

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

  const runList = live ? live.runs : runs;
  const messages = live ? live.messagesScanned : f.messages;
  const coverage = live ? live.coverage : f.coverage;
  const lastRun = live ? live.lastRunDate ?? '—' : f.runDate;

  return (
    <div className="content-wrap fade-in">
      <PageHead title="Sources" sub="Every Gmail query we ran, and what came back">
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
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--amber-50, #fff7ed)', color: 'var(--amber-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <StatCard lbl="Messages scanned" icon="mail" val={messages.toLocaleString('en-IN')} />
        <StatCard
          lbl="Source coverage"
          icon="target"
          val={coverage != null ? `${coverage}%` : '—'}
          accent="var(--mint-600)"
          sub="of your money explained"
        />
        <StatCard lbl="Last run" icon="clock" val={live ? 'latest' : '2 mins'} sub={lastRun} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Import runs</h3>
          <span className="muted" style={{ fontSize: 12.5 }}>
            read-only · localhost
          </span>
        </div>
        <div className="card-list">
          {runList.map((r, i) => (
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
  const [phase, setPhase] = useState<'idle' | 'consent' | 'running' | 'done'>('idle');
  const [pct, setPct] = useState(0);
  const [lines, setLines] = useState<{ text: string; kind: string }[]>([]);
  const [consent, setConsent] = useState<{ human: string; messageCount: number } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const totalRef = useRef(0);

  const log = (text: string, kind = '') => setLines((p) => [...p, { text, kind }]);

  const run = useCallback((yes: boolean) => {
    setPhase('running');
    setLines([]);
    setPct(0);
    const es = new EventSource(`/api/gmail/import?fy=${encodeURIComponent(fy)}${yes ? '&yes=1' : ''}`);
    esRef.current = es;
    es.onmessage = (ev) => {
      const e = JSON.parse(ev.data) as { phase: string; message?: string; messageCount?: number; attachmentCount?: number };
      switch (e.phase) {
        case 'estimate':
          if (e.messageCount) totalRef.current = e.messageCount;
          log(e.message ?? 'Estimating with latest profile...', 'dim');
          break;
        case 'consent_required':
          es.close();
          setConsent({ human: e.message?.replace(/^.*about /, '') ?? 'over 1 GB', messageCount: e.messageCount ?? 0 });
          setPhase('consent');
          break;
        case 'fetch':
          if (e.messageCount && totalRef.current) setPct(Math.min(99, Math.round((e.messageCount / totalRef.current) * 100)));
          log(e.message ?? `Fetched ${e.messageCount ?? 0} messages`);
          break;
        case 'attachment':
          log(e.message ?? 'attachment', 'ok');
          break;
        case 'done':
          es.close();
          setPct(100);
          log(e.message ?? 'Import complete', 'ok');
          setPhase('done');
          break;
        case 'error':
          es.close();
          setPhase('done');
          log(`Error: ${e.message}`, 'warn');
          break;
      }
    };
    es.onerror = () => es.close();
  }, [fy]);

  useEffect(() => {
    run(false);
    return () => esRef.current?.close();
  }, [run]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 9999;
  }, [lines]);

  return (
    <div className="card card-pad fade-in" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 17 }}>Re-import Gmail evidence</h3>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Queries are rebuilt from your latest saved profile.</div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close import runner"><Icon name="x" size={18} /></button>
      </div>
      {phase === 'consent' && consent ? (
        <>
          <div className="note warn" style={{ marginBottom: 14 }}>
            <span className="ic"><Icon name="hard-drive-download" size={16} /></span>
            <span>This import will download about {consent.human} locally.</span>
          </div>
          <button className="btn btn-primary" onClick={() => run(true)}>Download & continue</button>
        </>
      ) : (
        <>
          <div className="imp-bar"><i style={{ width: pct + '%' }} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 14 }}>
            <span className="muted">{phase === 'done' ? 'Done' : 'Working locally'}</span>
            <span className="fig">{pct}%</span>
          </div>
          <div className="imp-log" ref={logRef}>
            {lines.map((l, i) => <div key={i} className={l.kind}>{l.kind === 'ok' ? 'ok ' : l.kind === 'warn' ? 'err ' : '> '}{l.text}</div>)}
            {phase === 'running' && <div className="dim">...</div>}
          </div>
        </>
      )}
    </div>
  );
}
