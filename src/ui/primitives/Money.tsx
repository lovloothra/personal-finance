'use client';
import { useState, type CSSProperties } from 'react';
import { useMask } from '../contexts/MaskCtx';
import { inr } from '../lib/format';

interface MoneyProps {
  amount: number;
  sign?: boolean;
  pos?: boolean;
  className?: string;
  size?: number | string;
}

export function Money({ amount, sign = false, pos = false, className = '', size }: MoneyProps) {
  const { masked } = useMask();
  const [revealed, setRevealed] = useState(false);
  const show = !masked || revealed;
  const cls = pos ? 'pos' : 'neg';
  const text = inr(amount);
  const display = sign ? (pos ? '+' : '−') + text : text;
  const style: CSSProperties | undefined = size ? { fontSize: size } : undefined;
  const title = masked ? (revealed ? 'Click to hide' : 'Click to reveal') : undefined;

  return (
    <span
      className={`money ${cls} ${show ? '' : 'locked'} ${className}`.trim()}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        if (masked) setRevealed((r) => !r);
      }}
      title={title}
    >
      {show ? (
        display
      ) : (
        <span className="dots">{sign ? (pos ? '+' : '−') : ''}₹•••,•••</span>
      )}
    </span>
  );
}
