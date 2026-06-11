'use client';
import { useState } from 'react';
import { useFy } from '../contexts/FyCtx';
import { useMask } from '../contexts/MaskCtx';
import { categories, fys, txns } from '../lib/fixtures';
import { Icon } from '../primitives/Icon';
import { Money } from '../primitives/Money';
import { FootMeta, PageHead, TxnRow } from './shared';
import { inr } from '../lib/format';
import { useDashboard, type ExpensesDTO } from '../data/useDashboard';
import { recentToTxn } from '../data/useOverview';

type Tab = 'categories' | 'merchants';
type Filter = 'all' | 'recurring' | 'onetime';
interface CatRow {
  id: string;
  name: string;
  amt: number;
  color: string;
  recurring: boolean;
  project?: string | null;
  children: { name: string; amt: number }[];
}

export function Expenses() {
  const { fy } = useFy();
  const { masked } = useMask();
  const { data } = useDashboard<ExpensesDTO>('expenses', fy);
  const live = data?.hasData ? data : null;
  const f = fys[fy];
  const [tab, setTab] = useState<Tab>('categories');
  const [filter, setFilter] = useState<Filter>('all');
  const [openCat, setOpenCat] = useState<string | null>(null);

  const allCats: CatRow[] = live
    ? live.categories.map((c) => ({ id: c.name, name: c.name, amt: c.amt, color: c.color, recurring: c.recurring, project: c.project, children: c.children }))
    : categories.map((c) => ({ id: c.id, name: c.name, amt: c.amt, color: c.color, recurring: c.recurring, project: c.project, children: c.children }));

  let cats = allCats;
  if (filter === 'recurring') cats = cats.filter((c) => c.recurring);
  if (filter === 'onetime') cats = cats.filter((c) => !c.recurring);
  cats = [...cats].sort((a, b) => b.amt - a.amt);
  const maxCat = Math.max(1, ...cats.map((c) => c.amt));
  const totalShown = cats.reduce((s, c) => s + c.amt, 0) || 1;

  const totalExpenses = live ? live.total : f.expenses;
  const expenseTxns = live ? live.txns.map(recentToTxn) : txns.filter((t) => t.flow === 'out');

  return (
    <div className="content-wrap fade-in">
      <PageHead title="Expenses" sub={`${f.label} · ${masked ? '₹•••,•••' : inr(totalExpenses)} across ${allCats.length} categories`} />
      <div className="tabs">
        <button className={tab === 'categories' ? 'on' : ''} onClick={() => setTab('categories')}>
          By category
        </button>
        <button className={tab === 'merchants' ? 'on' : ''} onClick={() => setTab('merchants')}>
          Transactions
        </button>
      </div>

      {tab === 'categories' && (
        <>
          <div className="chips" style={{ marginBottom: 18 }}>
            <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
              All spending
            </button>
            <button className={`chip ${filter === 'recurring' ? 'on' : ''}`} onClick={() => setFilter('recurring')}>
              Recurring
            </button>
            <button className={`chip ${filter === 'onetime' ? 'on' : ''}`} onClick={() => setFilter('onetime')}>
              One-time
            </button>
          </div>
          <div className="card card-pad">
            {cats.map((c) => (
              <div
                key={c.id}
                className={`catrow ${openCat === c.id ? 'open' : ''}`}
                onClick={() => setOpenCat(openCat === c.id ? null : c.id)}
              >
                <div className="top">
                  <span className="nm">
                    <Icon name={openCat === c.id ? 'chevron-down' : 'chevron-right'} size={15} color="var(--fg-3)" />
                    <span className="swatch" style={{ background: c.color }} />
                    {c.name}
                    {!c.recurring && (
                      <span className="badge neutral" style={{ padding: '1px 7px' }}>
                        one-time
                      </span>
                    )}
                    {c.project && (
                      <span className="badge cau" style={{ padding: '1px 7px' }}>
                        {c.project}
                      </span>
                    )}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {Math.round((c.amt / totalShown) * 100)}%
                    </span>
                    <Money amount={c.amt} />
                  </span>
                </div>
                <div className="track">
                  <i style={{ width: `${(c.amt / maxCat) * 100}%`, background: c.color }} />
                </div>
                <div className="sub">
                  {c.children.map((ch) => (
                    <div key={ch.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, color: 'var(--fg-2)' }}>
                      <span>{ch.name}</span>
                      <Money amount={ch.amt} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'merchants' && (
        <div className="card">
          <div className="card-head">
            <h3>{expenseTxns.length} transactions</h3>
            <span className="muted" style={{ fontSize: 12.5 }}>
              Click any row to trace its provenance
            </span>
          </div>
          <div className="card-list">
            {expenseTxns.map((t) => (
              <TxnRow key={t.id} t={t} />
            ))}
          </div>
        </div>
      )}
      <FootMeta />
    </div>
  );
}
