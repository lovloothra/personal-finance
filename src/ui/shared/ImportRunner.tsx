'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../primitives/Icon';

type Phase = 'idle' | 'consent' | 'running' | 'done';

interface SseEvent {
  phase: string;
  message?: string;
  messageCount?: number;
  attachmentCount?: number;
}

export interface ImportRunnerProps {
  fy: string;
  /** Fired once when the run reaches 'done' (NOT on error). */
  onDone?: () => void;
  /** Consent-confirm button label. */
  consentLabel?: string;
  /** Large, full-width primary styling (onboarding); default is the compact workbench styling. */
  large?: boolean;
  /** First log line while estimating. */
  estimateCopy?: string;
}

/**
 * Owns the Gmail import SSE lifecycle: phases, progress %, log lines, and the
 * consent gate for large downloads. No card chrome — callers own their framing.
 */
export function ImportRunner({
  fy,
  onDone,
  consentLabel = 'Download & continue',
  large = false,
  estimateCopy = 'Estimating…',
}: ImportRunnerProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [pct, setPct] = useState(0);
  const [lines, setLines] = useState<{ text: string; kind: string }[]>([]);
  const [consent, setConsent] = useState<{ human: string; messageCount: number } | null>(null);
  const [errored, setErrored] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const totalRef = useRef(0);

  const log = (text: string, kind = '') => setLines((p) => [...p, { text, kind }]);

  const run = useCallback((yes: boolean) => {
    setPhase('running');
    setLines([]);
    setPct(0);
    setErrored(false);
    const es = new EventSource(`/api/gmail/import?fy=${encodeURIComponent(fy)}${yes ? '&yes=1' : ''}`);
    esRef.current = es;
    es.onmessage = (ev) => {
      const e = JSON.parse(ev.data) as SseEvent;
      switch (e.phase) {
        case 'estimate':
          if (e.messageCount) totalRef.current = e.messageCount;
          log(e.message ?? estimateCopy, 'dim');
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
          onDone?.();
          break;
        case 'error':
          // End the run here rather than leaving phase stuck on 'running' —
          // the log line makes the failure visible, but without this the
          // "..." spinner line would run forever.
          es.close();
          setErrored(true);
          setPhase('done');
          log(`Error: ${e.message}`, 'warn');
          break;
        default:
          // Ingest phases (parse/classify/review) and any future ones — without
          // this the log froze at "processing…" for the whole ingest stage.
          if (e.message) log(e.message, 'dim');
          break;
      }
    };
    es.onerror = () => es.close();
  }, [fy, estimateCopy, onDone]);

  useEffect(() => {
    run(false);
    return () => esRef.current?.close();
  }, [run]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 9999;
  }, [lines]);

  if (phase === 'consent' && consent) {
    return (
      <>
        <div className="note warn" style={{ marginBottom: 14 }}>
          <span className="ic"><Icon name="hard-drive-download" size={large ? 18 : 16} /></span>
          <span>This import will download about {consent.human} locally.</span>
        </div>
        <button
          className={large ? 'btn btn-primary btn-lg' : 'btn btn-primary'}
          style={large ? { width: '100%' } : undefined}
          onClick={() => run(true)}
        >
          {consentLabel}
        </button>
      </>
    );
  }

  return (
    <>
      <div className="imp-bar"><i style={{ width: pct + '%' }} /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 14 }}>
        <span className="muted">{phase === 'done' ? (errored ? 'Stopped' : 'Done') : 'Working locally'}</span>
        <span className="fig">{pct}%</span>
      </div>
      <div className="imp-log" ref={logRef}>
        {lines.map((l, i) => <div key={i} className={l.kind}>{l.kind === 'ok' ? 'ok ' : l.kind === 'warn' ? 'err ' : '> '}{l.text}</div>)}
        {phase === 'running' && <div className="dim">...</div>}
      </div>
    </>
  );
}
