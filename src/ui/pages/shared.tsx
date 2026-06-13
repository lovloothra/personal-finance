'use client';
import type { ReactNode } from 'react';
import { useFy } from '../contexts/FyCtx';
import { useDrawer } from '../contexts/DrawerCtx';
import { useShellMeta } from '../contexts/ShellMetaCtx';
import { fySummary, type Txn } from '../lib/fixtures';
import { Glyph } from '../primitives/Glyph';
import { Icon } from '../primitives/Icon';
import { Money } from '../primitives/Money';
import { ConfidenceBadge } from '../primitives/ConfidenceBadge';

export function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
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
    <div className="txn click" onClick={() => open(t)}>
      <Glyph ch={t.glyph} color={t.color} />
      <div className="txn-mid">
        <div className="mer">{t.merchant}</div>
        <div className="cat">
          <span>
            {t.cat}
            {t.sub ? ' · ' + t.sub : ''}
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
          <Money amount={t.amt} pos={t.flow === 'in'} />
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
          {t.date}
        </div>
      </div>
    </div>
  );
}

export function FootMeta() {
  const { fy } = useFy();
  const { sources } = useShellMeta();
  const f = fySummary(fy);
  const coverage = sources ? sources.coverage : f.coverage;
  const runDate = sources ? sources.lastRunDate : f.runDate;
  const messages = sources ? sources.messagesScanned : f.messages;
  return (
    <div className="foot-meta">
      <span className="it">
        <Icon name="hard-drive" size={14} color="var(--mint-600)" />
        Stored on this device
      </span>
      {coverage != null && (
        <span className="it">
          <Icon name="mail-check" size={14} />
          {coverage}% source coverage
        </span>
      )}
      {runDate && (
        <span className="it">
          <Icon name="clock" size={14} />
          Last import {runDate}
        </span>
      )}
      <span className="it">
        <Icon name="database" size={14} />
        {messages.toLocaleString('en-IN')} messages scanned
      </span>
    </div>
  );
}
