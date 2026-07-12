'use client';
import { Icon } from './Icon';
import { Button } from './Button';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

/**
 * Shared error-state block for a view that failed to load. Not adopted
 * anywhere yet — Phase D is the consumer that wires this into page-level
 * fetch failures.
 */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="empty" role="alert">
      <div className="ic">
        <Icon name="triangle-alert" size={24} color="var(--fg-3)" />
      </div>
      <h3 style={{ fontFamily: 'var(--font-display)', margin: '0 0 4px' }}>Couldn&apos;t load this view</h3>
      {message && <p style={{ margin: 0 }}>{message}</p>}
      {onRetry && (
        <div style={{ marginTop: 14 }}>
          <Button variant="secondary" size="sm" icon="refresh-cw" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
