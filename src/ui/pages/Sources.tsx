'use client';
import { useFy } from '../contexts/FyCtx';
import { fys, runs } from '../lib/fixtures';
import { Icon } from '../primitives/Icon';
import { StatCard } from '../primitives/StatCard';
import { FootMeta, PageHead } from './shared';
import { useDashboard, type SourcesDTO } from '../data/useDashboard';

export function Sources() {
  const { fy } = useFy();
  const f = fys[fy];
  const { data } = useDashboard<SourcesDTO>('sources', fy);
  const live = data?.hasData ? data : null;

  const runList = live ? live.runs : runs;
  const messages = live ? live.messagesScanned : f.messages;
  const coverage = live ? live.coverage : f.coverage;
  const lastRun = live ? live.lastRunDate ?? '—' : f.runDate;

  return (
    <div className="content-wrap fade-in">
      <PageHead title="Sources" sub="Every Gmail query we ran, and what came back">
        <button className="btn btn-primary">
          <Icon name="refresh-cw" size={15} />
          Run new import
        </button>
      </PageHead>

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
