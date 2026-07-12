'use client';
import type { ReactNode } from 'react';
import { useDrawer } from '../contexts/DrawerCtx';
import { useShellMeta } from '../contexts/ShellMetaCtx';
import type { Txn } from '../lib/types';
import { MerchantLogo } from '../primitives/MerchantLogo';
import { Icon } from '../primitives/Icon';
import { Money } from '../primitives/Money';
import { ConfidenceBadge } from '../primitives/ConfidenceBadge';
import { labelForCategory } from '@/classifier/taxonomy';

export function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export function TxnRow({ t, onOpen }: { t: Txn; onOpen?: (t: Txn) => void }) {
  const drawer = useDrawer();
  const open = onOpen ?? drawer.openProv;
  return (
    <button type="button" className="txn click rowbtn" onClick={() => open(t)}>
      <MerchantLogo name={t.merchant} color={t.color} size={38} />
      <div className="txn-mid">
        <div className="mer">{t.merchant}</div>
        <div className="cat">
          <span>
            {labelForCategory(t.cat)}
            {t.sub ? ' · ' + labelForCategory(t.sub) : ''}
          </span>
          <ConfidenceBadge level={t.conf} showLabel={false} />
          {t.transfer && (
            <span className="badge mint" style={{ padding: '1px 7px' }}>
              de-duped
            </span>
          )}
          {t.project && (
            <span className="badge cau" style={{ padding: '1px 7px' }}>
              project
            </span>
          )}
          {t.taxSection && (
            <span className="badge brand" style={{ padding: '1px 7px' }}>
              {t.taxSection}
            </span>
          )}
          {t.review && (
            <span className="badge red" style={{ padding: '1px 7px' }}>
              review
            </span>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className={`amt ${t.flow === 'in' ? 'pos' : ''}`}>
          {t.flow === 'in' ? '+' : '−'}
          <Money amount={t.amt} pos={t.flow === 'in'} interactive={false} />
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
          {t.date}
        </div>
      </div>
    </button>
  );
}

/**
 * Live import facts only — no fictional fallback. Renders nothing until the
 * shell has confirmed there's real Gmail-import data to report.
 */
export function FootMeta() {
  const { sources } = useShellMeta();
  if (!sources) return null;
  const bits = [
    sources.lastRunDate ? `Last import ${sources.lastRunDate}` : null,
    `${sources.messagesScanned.toLocaleString('en-IN')} messages scanned`,
    sources.coverage != null ? `coverage ${sources.coverage}%` : null,
  ].filter((b): b is string => b != null);

  return (
    <div className="foot-meta">
      <span className="it">
        <Icon name="hard-drive" size={14} color="var(--mint-600)" />
        Stored on this device
      </span>
      {bits.length > 0 && (
        <span className="it">
          <Icon name="database" size={14} />
          {bits.join(' · ')}
        </span>
      )}
    </div>
  );
}
