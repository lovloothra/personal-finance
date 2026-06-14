'use client';
import { Icon } from '../primitives/Icon';
import { useShellMeta } from '../contexts/ShellMetaCtx';
import { review as reviewSeed, subscriptions as subsSeed } from '../lib/fixtures';

export type WorkbenchPage =
  | 'overview'
  | 'income'
  | 'expenses'
  | 'investments'
  | 'liabilities'
  | 'subscriptions'
  | 'tax'
  | 'sources'
  | 'profile'
  | 'settings';

interface NavItem {
  id: WorkbenchPage;
  label: string;
  icon: string;
  count?: number;
  alert?: boolean;
}

// Demo-mode fallbacks, shown until the first real import produces live counts.
const SEED_REVIEW_COUNT = reviewSeed.reduce((n, i) => n + (i.count ?? 1), 0);
const SEED_SUBS_COUNT = subsSeed.filter((s) => s.status !== 'dismissed').length;
const SEED_COVERAGE = 94;

interface SidebarProps {
  page: WorkbenchPage;
  setPage: (p: WorkbenchPage) => void;
}

export function Sidebar({ page, setPage }: SidebarProps) {
  const { review, subsCount, sources } = useShellMeta();
  const reviewCount = review ? review.total : SEED_REVIEW_COUNT;
  const subs = subsCount ?? SEED_SUBS_COUNT;
  const coverage = sources ? sources.coverage : SEED_COVERAGE;

  const MAIN: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    { id: 'income', label: 'Income', icon: 'arrow-down-to-line' },
    { id: 'expenses', label: 'Spending', icon: 'arrow-up-from-line', count: reviewCount > 0 ? reviewCount : undefined, alert: reviewCount > 0 },
    { id: 'investments', label: 'Investments', icon: 'trending-up' },
    { id: 'liabilities', label: 'Liabilities', icon: 'landmark' },
    { id: 'subscriptions', label: 'Subscriptions', icon: 'repeat', count: subs > 0 ? subs : undefined },
    { id: 'tax', label: 'Tax', icon: 'receipt-indian-rupee' },
  ];

  const EVIDENCE: NavItem[] = [
    { id: 'sources', label: 'Sources', icon: 'mail-search' },
    { id: 'profile', label: 'Profile', icon: 'user-round' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];
  const renderItem = (it: NavItem) => (
    <button
      key={it.id}
      className={`sb-item ${page === it.id ? 'active' : ''}`}
      onClick={() => setPage(it.id)}
      title={it.label}
    >
      <Icon name={it.icon} size={18} />
      <span>{it.label}</span>
      {it.count != null && (
        <span className={`sb-count ${it.alert ? 'alert' : ''}`}>{it.count}</span>
      )}
    </button>
  );

  return (
    <nav className="sidebar">
      <div className="sb-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logo-wordmark.svg" alt="personal finance" style={{ height: 26 }} />
      </div>
      <div className="sb-nav">{MAIN.map(renderItem)}</div>
      <div className="sb-section">Evidence</div>
      <div className="sb-nav">{EVIDENCE.map(renderItem)}</div>
      <div className="sb-foot">
        <div className="sb-card">
          <div className="row">
            <Icon name="hard-drive" size={14} color="var(--mint-600)" />
            <b style={{ color: 'var(--fg-1)', fontWeight: 600 }}>Stored on this device</b>
          </div>
          <div className="bar">
            <i style={{ width: `${coverage ?? 0}%` }} />
          </div>
          <div className="row" style={{ fontSize: 11.5, justifyContent: 'space-between' }}>
            <span>Source coverage</span>
            <span style={{ fontWeight: 700, color: 'var(--fg-1)' }}>{coverage != null ? `${coverage}%` : '—'}</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
