'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Txn } from '../lib/types';
import { displayMerchant, fmtDate } from '../lib/format';
import { labelForCategory } from '@/classifier/taxonomy';

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
  net: number;
  savingsRate: number;
  prevSavingsRate: number;
  coverage: number | null;
  txnCount: number;
  topCategories: { name: string; amount: number; color: string }[];
  topMerchants: { name: string; amount: number; color: string; glyph: string }[];
  recent: RecentTxnDTO[];
}

export interface OverviewResult {
  data: OverviewDTO | null;
  loading: boolean;
  /** Human-readable fetch failure; null on success. Failure must never look like "no data yet". */
  error: string | null;
  retry: () => void;
}

const PALETTE = ['#6354E6', '#FF8A6B', '#15A877', '#3B82F6', '#F59E0B', '#A855F7'];

/** Fetch the DB-backed overview for an FY. `hasData` is false on a fresh DB. */
export function useOverview(fy: string): OverviewResult {
  const [data, setData] = useState<OverviewDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard/overview?fy=${encodeURIComponent(fy)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: OverviewDTO) => {
        if (active) setData(d);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setData(null);
        setError(e instanceof Error ? e.message : 'Request failed');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [fy, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, retry };
}

/** Map a DB recent transaction into the workbench Txn shape (drawer-ready). */
export function recentToTxn(r: RecentTxnDTO, i: number): Txn {
  const isIn = r.amt > 0;
  return {
    id: r.id,
    date: fmtDate(r.date),
    // The rollup falls back merchant → category key when a txn has no
    // merchant; keys are storage, not copy, so label key-shaped values while
    // leaving real merchant names untouched.
    merchant: displayMerchant(r.merchant || r.cat, labelForCategory),
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
