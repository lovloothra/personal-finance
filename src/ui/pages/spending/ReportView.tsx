'use client';
import type { useSpending } from '../../data/useSpending';

export function ReportView({ spending }: { spending: ReturnType<typeof useSpending> }) {
  void spending;
  return <div className="muted" style={{ padding: 16 }}>Report view — coming up.</div>;
}
