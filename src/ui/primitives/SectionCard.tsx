'use client';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { Button } from './Button';

interface SectionCardAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface SectionCardProps {
  title: ReactNode;
  action?: SectionCardAction;
  /** Pad children directly (`.card-pad`) instead of the list-row padding
   * (`.card-list`) that `.catrow`/`.txn` rows already provide their own
   * spacing for. */
  pad?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * `.card` > `.card-head` (h3 + optional link-style action) wrapper, matching
 * the card-head markup used across Overview.tsx ("Where it went", "Recent
 * activity"). Not adopted anywhere yet — later phases migrate hand-rolled
 * `.card`/`.card-head` blocks onto this.
 */
export function SectionCard({ title, action, pad = false, children, className = '' }: SectionCardProps) {
  return (
    <div className={`card ${className}`.trim()}>
      <div className="card-head">
        <h3>{title}</h3>
        {action && (
          <Button variant="link" href={action.href} onClick={action.onClick}>
            {action.label}
            <Icon name="arrow-right" size={13} />
          </Button>
        )}
      </div>
      <div className={pad ? 'card-pad' : 'card-list'}>{children}</div>
    </div>
  );
}
