'use client';
import { useState, type CSSProperties } from 'react';
import { useMask } from '../contexts/MaskCtx';
import { inr, inr2, inrCompact } from '../lib/format';

interface MoneyProps {
  amount: number;
  sign?: boolean;
  pos?: boolean;
  className?: string;
  size?: number | string;
  /** Abbreviate to ₹X.XX Cr / ₹X.XX L (stat cards); exact value moves to the tooltip. */
  compact?: boolean;
  /** Render with 2 decimal places (inr2) instead of the rounded integer form. Ignored if `compact` is set. */
  precise?: boolean;
  /**
   * Per-value click/keyboard reveal. Set false when this Money renders INSIDE
   * an interactive row (`.rowbtn` transaction/search/accordion rows) — a
   * focusable control nested in a <button> violates the button content model
   * and confuses assistive tech. In that context the accessible reveal paths
   * are the topbar mask toggle and the provenance drawer the row opens.
   */
  interactive?: boolean;
}

export function Money({ amount, sign = false, pos = false, className = '', size, compact = false, precise = false, interactive = true }: MoneyProps) {
  const { masked } = useMask();
  const [revealed, setRevealed] = useState(false);
  const show = !masked || revealed;
  const cls = pos ? 'pos' : 'neg';
  const text = compact ? inrCompact(amount) : precise ? inr2(amount) : inr(amount);
  const display = sign ? (pos ? '+' : '−') + text : text;
  const style: CSSProperties | undefined = size ? { fontSize: size } : undefined;
  const canReveal = masked && interactive;
  const title = canReveal
    ? (revealed ? 'Click to hide' : 'Click to reveal')
    : masked
      ? 'Hidden — use the eye toggle in the top bar to reveal'
      : compact && text !== inr(amount) ? inr(amount) : undefined;

  return (
    <span
      className={`money ${cls} ${show ? '' : 'locked'} ${className}`.trim()}
      style={style}
      onClick={
        canReveal
          ? (e) => {
              e.stopPropagation();
              setRevealed((r) => !r);
            }
          : undefined
      }
      onKeyDown={
        canReveal
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                if (e.key === ' ') e.preventDefault();
                e.stopPropagation();
                setRevealed((r) => !r);
              }
            }
          : undefined
      }
      title={title}
      role={canReveal ? 'button' : undefined}
      tabIndex={canReveal ? 0 : undefined}
      aria-pressed={canReveal ? revealed : undefined}
      aria-label={canReveal ? (revealed ? 'Hide amount' : 'Reveal amount') : undefined}
    >
      {show ? (
        display
      ) : (
        <span className="dots">{sign ? (pos ? '+' : '−') : ''}₹•••,•••</span>
      )}
    </span>
  );
}
