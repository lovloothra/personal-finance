'use client';
import type { Confidence } from '../lib/types';

const MAP: Record<Confidence, [string, string]> = {
  high: ['conf-high', 'High'],
  med: ['conf-med', 'Medium'],
  low: ['conf-low', 'Low'],
};

interface ConfidenceBadgeProps {
  level: Confidence;
  showLabel?: boolean;
}

export function ConfidenceBadge({ level, showLabel = true }: ConfidenceBadgeProps) {
  const [cls, lbl] = MAP[level] ?? MAP.med;
  return (
    <span className={`conf ${cls}`} title={`Classification confidence: ${lbl.toLowerCase()}`}>
      <span className="dot" />
      {showLabel ? lbl : ''}
    </span>
  );
}
