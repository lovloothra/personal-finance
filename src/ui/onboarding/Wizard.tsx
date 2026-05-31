'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/ui/primitives/Icon';
import { InstitutionPicker } from './InstitutionPicker';

type Step = 0 | 1 | 2 | 3 | 4;
const FY = '2025-26';

function Stepper({ step }: { step: number }) {
  return (
    <div className="onb-steps">
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className={i <= step ? 'on' : ''} />
      ))}
    </div>
  );
}

export function Wizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [gmailError, setGmailError] = useState<string | null>(null);

  // On return from the Google redirect, jump to the Gmail step.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmail = params.get('gmail');
    if (gmail === 'connected') {
      setStep(2);
    } else if (gmail === 'error') {
      setStep(2);
      setGmailError(params.get('reason') ?? 'Authorization failed.');
    }
    if (gmail) window.history.replaceState({}, '', '/onboarding');
  }, []);

  const next = () => setStep((s) => Math.min(s + 1, 4) as Step);

  return (
    <div className="onb">
      <div className="onb-card fade-in" key={step}>
        {step === 0 && <Welcome onNext={next} />}
        {step === 1 && <Essentials onNext={next} onBack={() => setStep(0)} />}
        {step === 2 && <GmailConnect onNext={next} onBack={() => setStep(1)} initialError={gmailError} />}
        {step === 3 && <ImportRun onNext={next} />}
        {step === 4 && <Done onFinish={() => router.push('/')} />}
        {step < 4 && <Stepper step={step} />}
      </div>
    </div>
  );
}

// --- Step 0 ----------------------------------------------------------------

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <>
      <div className="onb-logo">
        <Icon name="wallet" size={26} />
      </div>
      <h2>See where your money actually goes.</h2>
      <p className="lead">
        Connect your inbox read-only and we rebuild your finances — income, expenses, investments, subscriptions and
        tax — entirely on this device. Nothing is uploaded.
      </p>
      <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={onNext}>
        Get started
      </button>
      <div className="onb-note">
        <Icon name="hard-drive" size={14} />
        Local-first · read-only Gmail · no account, no cloud
      </div>
    </>
  );
}

// --- Step 1: Essentials ----------------------------------------------------

interface Hints {
  fullName: string;
  pan: string;
  dob: string;
  employer: string;
  bankLabel: string;
  bankLast4: string;
  cardLabel: string;
  cardLast4: string;
}
const EXAMPLE: Hints = {
  fullName: 'e.g. Lov Loothra',
  pan: 'e.g. ABCDE1234F',
  dob: '',
  employer: 'e.g. Nexora Systems',
  bankLabel: 'e.g. HDFC Bank',
  bankLast4: 'e.g. 4821',
  cardLabel: 'e.g. HDFC Bank Cards',
  cardLast4: 'e.g. 7702',
};

function Essentials({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  // Inputs stay EMPTY; saved/example values show as placeholders (hints) so the
  // user can just continue. Blank fields are omitted on save and the existing
  // saved value (if any) is preserved server-side.
  const [fullName, setFullName] = useState('');
  const [pan, setPan] = useState('');
  const [dob, setDob] = useState('');
  const [employer, setEmployer] = useState('');
  const [bank, setBank] = useState<{ id: string; last4: string }>({ id: '', last4: '' });
  const [card, setCard] = useState<{ id: string; last4: string }>({ id: '', last4: '' });
  const [hint, setHint] = useState<Hints>(EXAMPLE);
  const [hasSaved, setHasSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((p) => {
        if (p.fullName) setHasSaved(true);
        setHint({
          fullName: p.fullName || EXAMPLE.fullName,
          pan: p.pan || EXAMPLE.pan,
          dob: p.dob || '',
          employer: p.employer || EXAMPLE.employer,
          bankLabel: p.primaryBankLabel || EXAMPLE.bankLabel,
          bankLast4: p.primaryBankLast4 || EXAMPLE.bankLast4,
          cardLabel: p.creditCardLabel || EXAMPLE.cardLabel,
          cardLast4: p.creditCardLast4 || EXAMPLE.cardLast4,
        });
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    const v = (s: string) => (s.trim() ? s.trim() : undefined);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName: v(fullName),
          pan: v(pan),
          dob: v(dob),
          employer: v(employer),
          primaryBankId: bank.id || undefined,
          primaryBankLast4: v(bank.last4),
          creditCardId: card.id || undefined,
          creditCardLast4: v(card.last4),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      onNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Can continue if a name is already saved or the user typed one.
  const canContinue = hasSaved || fullName.trim().length > 0;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="arrow-left" size={18} />
        </button>
        <div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Step 1 of 4</div>
          <h2 style={{ margin: 0, fontSize: 21 }}>The essentials</h2>
        </div>
      </div>
      <p className="lead" style={{ fontSize: 14, marginBottom: 20 }}>
        Just enough to recognise your salary, rent, and statements. {hasSaved ? 'These are already on file — edit any to change, or just continue.' : 'You can fill in the rest later.'}
      </p>

      <div className="field">
        <label>Your name</label>
        <input className="inp" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={hint.fullName} />
      </div>
      <div className="row2">
        <div className="field">
          <label>PAN</label>
          <input className="inp" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder={hint.pan} />
          <div className="hint">Used only to derive statement passwords, on-device.</div>
        </div>
        <div className="field">
          <label>Date of birth{hint.dob ? ` · on file: ${hint.dob}` : ''}</label>
          <input className="inp" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Employer</label>
        <input className="inp" value={employer} onChange={(e) => setEmployer(e.target.value)} placeholder={hint.employer} />
        <div className="hint">Lets us spot your salary credits.</div>
      </div>
      <div className="row2">
        <div className="field">
          <label>Primary bank</label>
          <InstitutionPicker
            category="bank"
            placeholder={hint.bankLabel}
            onSelect={(inst) => setBank((b) => ({ ...b, id: inst?.id ?? '' }))}
          />
        </div>
        <div className="field">
          <label>Bank a/c last 4</label>
          <input className="inp" value={bank.last4} maxLength={4} onChange={(e) => setBank((b) => ({ ...b, last4: e.target.value.replace(/\D/g, '') }))} placeholder={hint.bankLast4} />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label>Credit card issuer</label>
          <InstitutionPicker
            category="credit_card_issuer"
            placeholder={hint.cardLabel}
            onSelect={(inst) => setCard((c) => ({ ...c, id: inst?.id ?? '' }))}
          />
        </div>
        <div className="field">
          <label>Card last 4</label>
          <input className="inp" value={card.last4} maxLength={4} onChange={(e) => setCard((c) => ({ ...c, last4: e.target.value.replace(/\D/g, '') }))} placeholder={hint.cardLast4} />
        </div>
      </div>

      <div className="note privacy" style={{ marginBottom: 16 }}>
        <span className="ic"><Icon name="hard-drive" size={16} /></span>
        <span>Saved to an encrypted database on your disk. Open it without your passphrase and it&apos;s gibberish.</span>
      </div>
      {error && <div className="note warn" style={{ marginBottom: 14 }}><span className="ic"><Icon name="triangle-alert" size={16} /></span><span>{error}</span></div>}
      <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={saving || !canContinue} onClick={save}>
        {saving ? 'Saving…' : 'Save & continue'}
      </button>
    </>
  );
}

// --- Step 2: Gmail connect -------------------------------------------------

interface Estimate {
  messageCount: number;
  humanEstimate: string;
  consentRequired: boolean;
  senders: string[];
}

function GmailConnect({ onNext, onBack, initialError }: { onNext: () => void; onBack: () => void; initialError: string | null }) {
  const [hasClient, setHasClient] = useState<boolean | null>(null);
  const [clientJson, setClientJson] = useState('');
  const [savingClient, setSavingClient] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [phase, setPhase] = useState<'connect' | 'testing' | 'tested'>('connect');
  const [estimate, setEstimate] = useState<Estimate | null>(null);

  const runEstimate = useCallback(async () => {
    setPhase('testing');
    try {
      const res = await fetch(`/api/gmail/estimate?fy=${FY}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Estimate failed');
      setEstimate(data);
      setPhase('tested');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Estimate failed');
      setPhase('connect');
    }
  }, []);

  useEffect(() => {
    fetch('/api/oauth/client')
      .then((r) => r.json())
      .then((d) => setHasClient(Boolean(d.hasClient)))
      .catch(() => setHasClient(false));
  }, []);

  // After returning from the Google redirect the Wizard lands us on step 2 and
  // leaves a sessionStorage hint; run the test query unless the redirect errored.
  useEffect(() => {
    const connected = sessionStorage.getItem('pf_gmail_connected') === '1';
    if (connected) sessionStorage.removeItem('pf_gmail_connected');
    if (connected && !initialError) void runEstimate();
  }, [runEstimate, initialError]);

  const saveClient = async () => {
    setSavingClient(true);
    setError(null);
    try {
      const res = await fetch('/api/oauth/client', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ json: clientJson }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save client');
      setHasClient(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save client');
    } finally {
      setSavingClient(false);
    }
  };

  const connect = async () => {
    setError(null);
    try {
      const res = await fetch(`/api/auth/google/start`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start OAuth');
      sessionStorage.setItem('pf_gmail_connected', '1'); // read after redirect returns
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start OAuth');
    }
  };

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
      <button className="icon-btn" onClick={onBack} aria-label="Back">
        <Icon name="arrow-left" size={18} />
      </button>
      <div>
        <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Step 2 of 4</div>
        <h2 style={{ margin: 0, fontSize: 21 }}>Connect your inbox</h2>
      </div>
    </div>
  );

  if (phase === 'testing') {
    return (
      <>
        {header}
        <div className="onb-card center" style={{ padding: '20px 0', border: 0, boxShadow: 'none' }}>
          <div className="scan-ring" />
          <h2 style={{ fontSize: 19 }}>Running a test query…</h2>
          <p className="lead" style={{ fontSize: 14 }}>Counting matching messages. We&apos;re not downloading anything yet.</p>
        </div>
      </>
    );
  }

  if (phase === 'tested' && estimate) {
    return (
      <>
        {header}
        <div className="check-pop"><Icon name="check" size={38} strokeWidth={2.4} /></div>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 20, marginBottom: 6 }}>
            Found <span style={{ color: 'var(--brand)' }}>{estimate.messageCount.toLocaleString('en-IN')}</span> matching messages
          </h2>
          <p className="lead" style={{ fontSize: 14 }}>Statements, receipts, salary slips and subscription confirmations.</p>
        </div>
        <div className="reason-box" style={{ marginBottom: 20 }}>
          <div className="kv" style={{ borderTop: 0, paddingTop: 0 }}><span className="k">Query window</span><span className="v">FY {FY}</span></div>
          <div className="kv"><span className="k">Estimated download</span><span className="v">≈ {estimate.humanEstimate}</span></div>
          {estimate.senders.length > 0 && (
            <div className="kv"><span className="k">Senders detected</span><span className="v">{estimate.senders.slice(0, 3).join(', ')}{estimate.senders.length > 3 ? ` +${estimate.senders.length - 3} more` : ''}</span></div>
          )}
        </div>
        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={onNext}>Review &amp; import</button>
      </>
    );
  }

  // phase === 'connect'
  return (
    <>
      {header}
      {error && <div className="note warn" style={{ marginBottom: 16 }}><span className="ic"><Icon name="triangle-alert" size={16} /></span><span>{error}</span></div>}

      {hasClient === false ? (
        <>
          <p className="lead" style={{ fontSize: 14, marginBottom: 14 }}>
            One-time setup (~5 min): create your own <b>Desktop</b> OAuth client in Google Cloud so the connection is
            entirely yours. Follow these exactly — the most common slip is choosing the wrong client type.
          </p>
          <ol className="muted onb-steplist" style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 20, margin: '0 0 14px' }}>
            <li style={{ marginBottom: 7 }}>
              Open the <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud Console</a> and
              create a project (any name), then make sure it&apos;s selected in the top bar.
            </li>
            <li style={{ marginBottom: 7 }}>
              Go to <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noreferrer">APIs &amp; Services → Library</a>,
              open <b>Gmail API</b>, and click <b>Enable</b>.
            </li>
            <li style={{ marginBottom: 7 }}>
              Open <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noreferrer">OAuth consent screen</a> →
              choose <b>External</b> → fill app name + your email → on the <b>Test users</b> step, <b>add your own Gmail address</b> → Save.
            </li>
            <li style={{ marginBottom: 7 }}>
              Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Credentials</a> →
              <b> + Create credentials</b> → <b>OAuth client ID</b>.
            </li>
            <li style={{ marginBottom: 7 }}>
              Application type: select <b style={{ color: 'var(--brand)' }}>Desktop app</b> — <u>not</u> &ldquo;Web application&rdquo;.
              Name it anything → <b>Create</b>. (Desktop clients don&apos;t need a redirect URI; the loopback flow is built in.)
            </li>
            <li>
              In the popup, click <b>Download JSON</b>, open the file, and paste its full contents below.
            </li>
          </ol>
          <div className="note warn" style={{ marginBottom: 14 }}>
            <span className="ic"><Icon name="info" size={16} /></span>
            <span>Must be a <b>Desktop app</b> client. A &ldquo;Web application&rdquo; client will be rejected because its redirect URIs can&apos;t use the local loopback flow.</span>
          </div>
          <div className="field">
            <label>Paste the downloaded OAuth client JSON</label>
            <textarea
              className="inp"
              style={{ minHeight: 96, fontFamily: 'var(--mono, monospace)', fontSize: 12 }}
              placeholder='{ "installed": { "client_id": "…", "client_secret": "…", … } }'
              value={clientJson}
              onChange={(e) => setClientJson(e.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={savingClient || !clientJson.trim()} onClick={saveClient}>
            {savingClient ? 'Saving…' : 'Save client & continue'}
          </button>
          <div className="onb-note"><Icon name="lock" size={14} />Stored in a gitignored secrets folder — never committed, never uploaded.</div>
        </>
      ) : (
        <>
          <p className="lead" style={{ fontSize: 14, marginBottom: 20 }}>
            We ask for <b>read-only</b> Gmail access — the bare minimum to find your receipts. We can&apos;t send, delete, or change anything.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <button className="gbtn" onClick={connect} disabled={hasClient === null}>
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" /><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" /><path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 4.75 12 4.75Z" /></svg>
              Connect Gmail (read-only)
            </button>
          </div>
          <div className="reason-box">
            <div className="step"><span className="n"><Icon name="check" size={11} /></span><div><b>gmail.readonly</b> scope only</div></div>
            <div className="step"><span className="n"><Icon name="check" size={11} /></span><div>Your own Desktop OAuth client — token encrypted on disk</div></div>
            <div className="step"><span className="n"><Icon name="check" size={11} /></span><div>Revoke anytime from your Google account</div></div>
          </div>
        </>
      )}
    </>
  );
}

// --- Step 3: Import (real SSE) ---------------------------------------------

function ImportRun({ onNext }: { onNext: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'consent' | 'running' | 'done'>('idle');
  const [pct, setPct] = useState(0);
  const [lines, setLines] = useState<{ text: string; kind: string }[]>([]);
  const [consent, setConsent] = useState<{ human: string; messageCount: number } | null>(null);
  const [result, setResult] = useState<{ messageCount: number; attachmentCount: number } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const totalRef = useRef(0);

  const log = (text: string, kind = '') => setLines((p) => [...p, { text, kind }]);

  const run = useCallback((yes: boolean) => {
    setPhase('running');
    setLines([]);
    setPct(0);
    const es = new EventSource(`/api/gmail/import?fy=${FY}${yes ? '&yes=1' : ''}`);
    esRef.current = es;
    es.onmessage = (ev) => {
      const e = JSON.parse(ev.data) as { phase: string; message?: string; messageCount?: number; attachmentCount?: number; bytes?: number };
      switch (e.phase) {
        case 'estimate':
          if (e.messageCount) totalRef.current = e.messageCount;
          log(e.message ?? 'Estimating…', 'dim');
          break;
        case 'consent_required':
          es.close();
          setConsent({ human: e.message?.replace(/^.*about /, '') ?? 'over 1 GB', messageCount: e.messageCount ?? 0 });
          setPhase('consent');
          break;
        case 'fetch':
          if (e.messageCount && totalRef.current) setPct(Math.min(99, Math.round((e.messageCount / totalRef.current) * 100)));
          log(`Fetched ${e.messageCount ?? 0} messages · ${e.attachmentCount ?? 0} attachments`);
          break;
        case 'attachment':
          log(`↓ ${e.message ?? 'attachment'}`, 'ok');
          break;
        case 'done':
          es.close();
          setPct(100);
          setResult({ messageCount: e.messageCount ?? 0, attachmentCount: e.attachmentCount ?? 0 });
          log(e.message ?? 'Import complete', 'ok');
          setPhase('done');
          break;
        case 'error':
          es.close();
          log(`Error: ${e.message}`, 'warn');
          break;
      }
    };
    es.onerror = () => {
      es.close();
    };
  }, []);

  // Kick off automatically; the server emits consent_required if it's > 1 GB.
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
        <div style={{ marginBottom: 16 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Step 3 of 4</div>
          <h2 style={{ margin: '2px 0 0', fontSize: 21 }}>One quick check</h2>
        </div>
        <div className="note warn" style={{ marginBottom: 18 }}>
          <span className="ic"><Icon name="hard-drive-download" size={18} /></span>
          <div>
            <b>This import will download about {consent.human}</b> of attachments to <span className="t-mono" style={{ fontSize: 12 }}>./attachments</span> on this device. That&apos;s over our 1 GB threshold, so we&apos;re asking first.
          </div>
        </div>
        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => run(true)}>
          Download &amp; import {consent.human}
        </button>
        <div className="onb-note"><Icon name="folder" size={14} />Stored in a gitignored folder — never committed, never synced.</div>
      </>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Step 3 of 4</div>
        <h2 style={{ margin: '2px 0 0', fontSize: 21 }}>{phase === 'done' ? 'Import complete' : 'Importing your inbox…'}</h2>
      </div>
      <div className="imp-bar"><i style={{ width: pct + '%' }} /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 14 }}>
        <span className="muted">{phase === 'done' ? 'Done' : 'Working — this runs entirely on your machine'}</span>
        <span className="fig">{pct}%</span>
      </div>
      <div className="imp-log" ref={logRef}>
        {lines.map((l, i) => (
          <div key={i} className={l.kind}>{l.kind === 'ok' ? '✓ ' : l.kind === 'warn' ? '✗ ' : '› '}{l.text}</div>
        ))}
        {phase === 'running' && <div className="dim">▍</div>}
      </div>
      {phase === 'done' && (
        <button className="btn btn-primary btn-lg fade-in" style={{ width: '100%', marginTop: 18 }} onClick={onNext}>
          See your dashboard
        </button>
      )}
    </>
  );
}

// --- Step 4: Done ----------------------------------------------------------

function Done({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="onb-card center" style={{ padding: 0, border: 0, boxShadow: 'none' }}>
      <div className="check-pop"><Icon name="sparkles" size={34} /></div>
      <h2>You&apos;re all set.</h2>
      <p className="lead">
        Your statements are downloaded and indexed on this device. Open the workbench to see income, expenses,
        investments, subscriptions and tax evidence — with full provenance for every number.
      </p>
      <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={onFinish}>
        Open the workbench
      </button>
      <div className="onb-note"><Icon name="shield-check" size={14} />Stored locally · 0 bytes uploaded</div>
    </div>
  );
}
