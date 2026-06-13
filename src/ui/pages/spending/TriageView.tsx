'use client';
import type { useSpending } from '../../data/useSpending';

export function TriageView({ spending }: { spending: ReturnType<typeof useSpending> }) {
  void spending;
  return <div className="muted" style={{ padding: 16 }}>Triage view — coming up.</div>;
}
