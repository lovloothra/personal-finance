'use client';
import type { ReactNode } from 'react';
import { Icon } from '../primitives/Icon';
import { PageHead } from './shared';

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
          <button className="btn btn-secondary">Rotate passphrase</button>
        </Block>
        <Block
          icon="download"
          title="Encrypted backup"
          desc="Export your whole database as a single encrypted file you can store anywhere safe."
        >
          <button className="btn btn-secondary">Export backup</button>
        </Block>

        <div className="sb-section" style={{ padding: '12px 0 2px' }}>
          Connection
        </div>
        <Block
          icon="mail-check"
          title="Gmail — read-only"
          desc="Connected as aditya.iyer@gmail.com via your own Desktop OAuth client."
        >
          <span className="badge mint">
            <Icon name="check" size={12} />
            Connected
          </span>
        </Block>
        <Block icon="cog" title="OAuth client" desc="Using your own Google Cloud Desktop client. Bundled fallback is off.">
          <button className="btn btn-secondary">Configure</button>
        </Block>

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
              Deletes the database, all downloaded attachments, and clears your keychain entry. Cannot be undone.
            </div>
          </div>
          <button className="btn btn-secondary" style={{ color: 'var(--red-600)', borderColor: 'var(--red-100)' }}>
            Wipe all data
          </button>
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
