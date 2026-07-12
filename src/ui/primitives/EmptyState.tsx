'use client';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { Button } from './Button';

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  body?: ReactNode;
  action?: EmptyStateAction;
}

/**
 * Shared empty-state block, matching the `.empty` markup Subscriptions.tsx
 * hand-rolls today ("No active subscriptions yet"). Not adopted anywhere
 * yet — Phase D is the consumer that migrates existing hand-rolled `.empty`
 * blocks onto this.
 */
export function EmptyState({ icon = 'inbox', title, body, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="ic">
        <Icon name={icon} size={24} color="var(--fg-3)" />
      </div>
      <h3 style={{ fontFamily: 'var(--font-display)', margin: '0 0 4px' }}>{title}</h3>
      {body && <p style={{ margin: 0 }}>{body}</p>}
      {action && (
        <div style={{ marginTop: 14 }}>
          <Button variant="primary" href={action.href} onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
