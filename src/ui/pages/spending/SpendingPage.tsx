'use client';
import { useState } from 'react';
import { useFy } from '../../contexts/FyCtx';
import { useSpending } from '../../data/useSpending';
import { FootMeta, PageHead } from '../shared';
import { ReportView } from './ReportView';
import { TriageView } from './TriageView';
import { TransactionsView } from './TransactionsView';
import { fyLabel } from '../../lib/format';
import { Money } from '../../primitives/Money';
import { Tabs } from '../../primitives/Tabs';
import { ErrorState } from '../../primitives/ErrorState';

type Seg = 'report' | 'triage' | 'transactions';

export function SpendingPage() {
  const { fy } = useFy();
  const spending = useSpending(fy);
  const [seg, setSeg] = useState<Seg>('report');
  const f = fyLabel(fy);
  const triageCount = spending.triage?.totalTransactions ?? 0;

  return (
    <div className="content-wrap fade-in">
      <PageHead
        title="Spending"
        sub={spending.report ? <>{f.label} · <Money amount={spending.report.total} /></> : f.label}
      />
      {/* Full-page error only when nothing loaded at all — a transient failure
          (e.g. one search refresh) keeps the tabs and stale data visible. */}
      {spending.error && !spending.report && !spending.triage ? (
        <ErrorState message={spending.error} onRetry={spending.retry} />
      ) : (
        <>
          <Tabs
            aria-label="Spending view"
            active={seg}
            onChange={(id) => setSeg(id as Seg)}
            tabs={[
              { id: 'report', label: 'By category' },
              { id: 'triage', label: `Triage${triageCount > 0 ? ` (${triageCount})` : ''}` },
              { id: 'transactions', label: 'Transactions' },
            ]}
          />
          {seg === 'report' && <ReportView spending={spending} />}
          {seg === 'triage' && <TriageView spending={spending} />}
          {seg === 'transactions' && <TransactionsView fy={fy} />}
        </>
      )}
      <FootMeta />
    </div>
  );
}
