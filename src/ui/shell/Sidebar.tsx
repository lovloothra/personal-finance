'use client';
import { Icon } from '../primitives/Icon';

export type WorkbenchPage =
  | 'overview'
  | 'income'
  | 'expenses'
  | 'investments'
  | 'liabilities'
  | 'subscriptions'
  | 'tax'
  | 'review'
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

const MAIN: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
  { id: 'income', label: 'Income', icon: 'arrow-down-to-line' },
  { id: 'expenses', label: 'Expenses', icon: 'arrow-up-from-line' },
  { id: 'investments', label: 'Investments', icon: 'trending-up' },
  { id: 'liabilities', label: 'Liabilities', icon: 'landmark' },
  { id: 'subscriptions', label: 'Subscriptions', icon: 'repeat', count: 10 },
  { id: 'tax', label: 'Tax', icon: 'receipt-indian-rupee' },
];

const EVIDENCE: NavItem[] = [
  { id: 'review', label: 'Review queue', icon: 'inbox', count: 23, alert: true },
  { id: 'sources', label: 'Sources', icon: 'mail-search' },
  { id: 'profile', label: 'Profile', icon: 'user-round' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

interface SidebarProps {
  page: WorkbenchPage;
  setPage: (p: WorkbenchPage) => void;
}

export function Sidebar({ page, setPage }: SidebarProps) {
  const renderItem = (it: NavItem) => (
    <button
      key={it.id}
      className={`sb-item ${page === it.id ? 'active' : ''}`}
      onClick={() => setPage(it.id)}
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
            <i style={{ width: '94%' }} />
          </div>
          <div className="row" style={{ fontSize: 11.5, justifyContent: 'space-between' }}>
            <span>Source coverage</span>
            <span style={{ fontWeight: 700, color: 'var(--fg-1)' }}>94%</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
