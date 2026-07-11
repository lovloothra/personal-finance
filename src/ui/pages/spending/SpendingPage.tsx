'use client';
import { useState } from 'react';
import { useFy } from '../../contexts/FyCtx';
import { useSpending } from '../../data/useSpending';
import { FootMeta, PageHead } from '../shared';
import { ReportView } from './ReportView';
import { TriageView } from './TriageView';
import { TransactionsView } from './TransactionsView';
import { fySummary } from '../../lib/fixtures';
import { Money } from '../../primitives/Money';
import { Tabs } from '../../primitives/Tabs';

type Seg = 'report' | 'triage' | 'transactions';

export function SpendingPage() {
  const { fy } = useFy();
  const spending = useSpending(fy);
  const [seg, setSeg] = useState<Seg>('report');
  const total = spending.report?.total ?? fySummary(fy).expenses;
  const triageCount = spending.triage?.totalTransactions ?? 0;

  return (
    <div className="content-wrap fade-in">
      <PageHead
        title="Spending"
        sub={<>{fySummary(fy).label} · <Money amount={total} /></>}
      />
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
      <FootMeta />
    </div>
  );
}
