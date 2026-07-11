'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../primitives/Icon';
import { ErrorState } from '../primitives/ErrorState';
import { PageHead } from './shared';

interface SetupStatusDTO {
  hasOAuthClient: boolean;
  hasProfile: boolean;
  hasGmailAuth: boolean;
  hasData: boolean;
  gmailEmail: string | null;
  ready: boolean;
}

function Block({
  icon,
  title,
  desc,
  children,
}: {
  icon: string;
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <div className="card card-pad" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 11,
          background: 'var(--bg-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--fg-2)',
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={20} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5 }}>{title}</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          {desc}
        </div>
      </div>
      {children}
    </div>
  );
}

export function Settings() {
  const [status, setStatus] = useState<SetupStatusDTO | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusNonce, setStatusNonce] = useState(0);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/setup/status')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: SetupStatusDTO) => {
        if (!active) return;
        setStatus(d);
        setStatusError(null);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setStatus(null);
        setStatusError(e instanceof Error ? e.message : 'Failed to load connection status');
      });
    return () => {
      active = false;
    };
  }, [statusNonce]);
  const retryStatus = () => setStatusNonce((n) => n + 1);

  const exportBackup = async () => {
    setBackupBusy(true);
    setBackupMsg(null);
    try {
      const res = await fetch('/api/settings/backup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Backup failed');
      const mb = (data.bytes / (1024 * 1024)).toFixed(1);
      setBackupMsg(`Saved ${data.file} (${mb} MB), encrypted with your existing passphrase.`);
    } catch (e) {
      setBackupMsg(e instanceof Error ? e.message : 'Backup failed');
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <div className="content-wrap fade-in">
      <PageHead title="Settings" sub="Keys, backups and your connection — all under your control" />
      <div className="stack">
        <div className="sb-section" style={{ padding: '0 0 2px' }}>
          Security
        </div>
        <Block
          icon="key-round"
          title="Passphrase"
          desc="Unlocks your encrypted database. Stored in your OS keychain, never on disk in plaintext."
        >
          <span className="badge mint">
            <Icon name="check" size={12} />
            In keychain
          </span>
        </Block>
        <Block
          icon="download"
          title="Encrypted backup"
          desc={backupMsg ?? 'Export your whole database as a single encrypted file you can store anywhere safe.'}
        >
          <button className="btn btn-secondary" disabled={backupBusy} onClick={exportBackup}>
            {backupBusy ? 'Exporting…' : 'Export backup'}
          </button>
        </Block>

        <div className="sb-section" style={{ padding: '12px 0 2px' }}>
          Connection
        </div>
        {statusError ? (
          <ErrorState message={statusError} onRetry={retryStatus} />
        ) : (
          <>
            <Block
              icon="mail-check"
              title="Gmail — read-only"
              desc={
                status === null
                  ? 'Checking your connection…'
                  : status.hasGmailAuth
                    ? `Connected${status.gmailEmail ? ` as ${status.gmailEmail}` : ''} via your own Desktop OAuth client.`
                    : 'Not connected yet. Run onboarding to authorize read-only Gmail access.'
              }
            >
              {status?.hasGmailAuth ? (
                <span className="badge mint">
                  <Icon name="check" size={12} />
                  Connected
                </span>
              ) : (
                <a className="btn btn-secondary" href="/onboarding">
                  Connect
                </a>
              )}
            </Block>
            <Block
              icon="cog"
              title="OAuth client"
              desc={
                status === null
                  ? 'Checking…'
                  : status.hasOAuthClient
                    ? 'Using your own Google Cloud Desktop client from secrets/google-oauth-client.json.'
                    : 'No OAuth client found. Add one through onboarding to enable Gmail import.'
              }
            >
              <a className="btn btn-secondary" href="/onboarding">
                {status?.hasOAuthClient ? 'Reconfigure' : 'Configure'}
              </a>
            </Block>
          </>
        )}

        <div className="sb-section" style={{ padding: '12px 0 2px', color: 'var(--red-500)' }}>
          Danger zone
        </div>
        <div
          className="card card-pad"
          style={{ display: 'flex', gap: 16, alignItems: 'center', borderColor: 'var(--red-100)' }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              background: 'var(--red-50)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--red-500)',
              flexShrink: 0,
            }}
          >
            <Icon name="trash-2" size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>Wipe everything</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
              Everything lives in this folder: delete <code>data/</code>, <code>attachments/</code>, <code>exports/</code> and{' '}
              <code>secrets/</code>, then remove the &ldquo;personal-finance&rdquo; entry from your OS keychain. No in-app shortcut —
              deleting your ledger should be deliberate.
            </div>
          </div>
        </div>
      </div>
      <div className="note privacy" style={{ marginTop: 16 }}>
        <span className="ic">
          <Icon name="hard-drive" size={16} />
        </span>
        <span>There&apos;s no account to delete and no server to call — wiping is just removing files from your own machine.</span>
      </div>
    </div>
  );
}
