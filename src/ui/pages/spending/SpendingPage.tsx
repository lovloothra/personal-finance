'use client';
import { useState } from 'react';
import { useFy } from '../../contexts/FyCtx';
import { useSpending } from '../../data/useSpending';
import { FootMeta, PageHead } from '../shared';
import { ReportView } from './ReportView';
import { TriageView } from './TriageView';
import { TransactionsView } from './TransactionsView';
import { fySummary } from '../../lib/fixtures';
import { useMask } from '../../contexts/MaskCtx';
import { inr } from '../../lib/format';

type Seg = 'report' | 'triage' | 'transactions';

export function SpendingPage() {
  const { fy } = useFy();
  const { masked } = useMask();
  const spending = useSpending(fy);
  const [seg, setSeg] = useState<Seg>('report');
  const total = spending.report?.total ?? fySummary(fy).expenses;
  const triageCount = spending.triage?.totalTransactions ?? 0;

  return (
    <div className="content-wrap fade-in">
      <PageHead
        title="Spending"
        sub={`${fySummary(fy).label} · ${masked ? '₹•••,•••' : inr(total)}`}
      />
      <div className="tabs">
        <button className={seg === 'report' ? 'on' : ''} onClick={() => setSeg('report')}>By category</button>
        <button className={seg === 'triage' ? 'on' : ''} onClick={() => setSeg('triage')}>
          Triage{triageCount > 0 ? ` (${triageCount})` : ''}
        </button>
        <button className={seg === 'transactions' ? 'on' : ''} onClick={() => setSeg('transactions')}>Transactions</button>
      </div>
      {seg === 'report' && <ReportView spending={spending} />}
      {seg === 'triage' && <TriageView spending={spending} />}
      {seg === 'transactions' && <TransactionsView fy={fy} />}
      <FootMeta />
    </div>
  );
}
