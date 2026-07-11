'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '../primitives/Icon';
import { useShellMeta } from '../contexts/ShellMetaCtx';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  count?: number;
  alert?: boolean;
}

export function Sidebar() {
  const pathname = usePathname();
  const { status, review, subsCount, sources } = useShellMeta();
  const ready = status === 'ready';
  const reviewCount = ready ? review?.total ?? 0 : 0;
  const subs = ready ? subsCount ?? 0 : 0;
  const coverage = ready ? sources?.coverage ?? null : null;

  const MAIN: NavItem[] = [
    { href: '/', label: 'Overview', icon: 'layout-dashboard' },
    { href: '/income', label: 'Income', icon: 'arrow-down-to-line' },
    { href: '/spending', label: 'Spending', icon: 'arrow-up-from-line', count: reviewCount > 0 ? reviewCount : undefined, alert: reviewCount > 0 },
    { href: '/investments', label: 'Investments', icon: 'trending-up' },
    { href: '/liabilities', label: 'Liabilities', icon: 'landmark' },
    { href: '/subscriptions', label: 'Subscriptions', icon: 'repeat', count: subs > 0 ? subs : undefined },
    { href: '/tax', label: 'Tax', icon: 'receipt-indian-rupee' },
  ];

  const EVIDENCE: NavItem[] = [
    { href: '/sources', label: 'Sources', icon: 'mail-search' },
    { href: '/profile', label: 'Profile', icon: 'user-round' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
  ];

  const renderItem = (it: NavItem) => {
    const active = it.href === '/' ? pathname === '/' : pathname === it.href || pathname.startsWith(`${it.href}/`);
    return (
      <Link
        key={it.href}
        href={it.href}
        className={`sb-item ${active ? 'active' : ''}`}
        aria-current={active ? 'page' : undefined}
        title={it.label}
      >
        <Icon name={it.icon} size={18} />
        <span>{it.label}</span>
        {it.count != null && (
          <span className={`sb-count ${it.alert ? 'alert' : ''}`}>{it.count}</span>
        )}
      </Link>
    );
  };

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
