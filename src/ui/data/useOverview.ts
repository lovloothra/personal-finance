'use client';
import { useEffect, useState } from 'react';
import type { Txn } from '../lib/fixtures';

/** Client mirror of the server OverviewRollup (server module is server-only). */
export interface RecentTxnDTO {
  id: string;
  date: string;
  merchant: string;
  cat: string;
  sub: string | null;
  amt: number;
  flow: string;
  conf: string | null;
  layer: number | null;
  reason: string | null;
  signal: string | null;
  reviewRequired: boolean;
  taxSection?: string | null;
  source: { from: string | null; subject: string | null };
}
export interface OverviewDTO {
  fy: string;
  hasData: boolean;
  name: string | null;
  income: number;
  expenses: number;
  invested: number;
  taxesPaid: number;
  net: number;
  savingsRate: number;
  prevSavingsRate: number;
  coverage: number | null;
  txnCount: number;
  topCategories: { name: string; amount: number; color: string }[];
  topMerchants: { name: string; amount: number; color: string; glyph: string }[];
  recent: RecentTxnDTO[];
}

const PALETTE = ['#6354E6', '#FF8A6B', '#15A877', '#3B82F6', '#F59E0B', '#A855F7'];

/** Fetch the DB-backed overview for an FY. `hasData` is false on a fresh DB. */
export function useOverview(fy: string): { data: OverviewDTO | null; loading: boolean } {
  const [data, setData] = useState<OverviewDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/dashboard/overview?fy=${encodeURIComponent(fy)}`)
      .then((r) => r.json())
      .then((d: OverviewDTO) => {
        if (active) setData(d);
      })
      .catch(() => active && setData(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [fy]);

  return { data, loading };
}

/** Format an ISO date as "12 Apr 2026" to match the workbench rows. */
function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Map a DB recent transaction into the workbench Txn shape (drawer-ready). */
export function recentToTxn(r: RecentTxnDTO, i: number): Txn {
  const isIn = r.amt > 0;
  return {
    id: r.id,
    date: fmtDate(r.date),
    merchant: r.merchant,
    cat: r.cat,
    sub: r.sub ?? '',
    amt: Math.abs(r.amt),
    flow: isIn ? 'in' : 'out',
    conf: (r.conf as Txn['conf']) ?? 'low',
    acct: '',
    method: '',
    layer: r.layer ?? 7,
    reason: r.reason ?? '',
    signal: r.signal,
    glyph: (r.merchant || '?').charAt(0).toUpperCase(),
    color: PALETTE[i % PALETTE.length],
    ledgerFlow: r.flow as Txn['ledgerFlow'],
    transfer: r.flow === 'transfer',
    review: r.reviewRequired,
    taxSection: r.taxSection ?? undefined,
    source: {
      type: 'email',
      from: r.source.from ?? '',
      subject: r.source.subject ?? '',
      date: fmtDate(r.date),
      body: '',
    },
  };
}
