'use client';
import { useCallback, useEffect, useState } from 'react';

export type DashboardView = 'income' | 'expenses' | 'tax' | 'investments' | 'liabilities' | 'subscriptions' | 'sources' | 'review';

export interface DashboardResult<T> {
  data: T | null;
  loading: boolean;
  /** Human-readable fetch failure; null on success. Failure must never look like "no data yet". */
  error: string | null;
  retry: () => void;
}

/** Generic fetch hook for a DB-backed dashboard view, keyed by FY. */
export function useDashboard<T>(view: DashboardView, fy: string): DashboardResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard/${view}?fy=${encodeURIComponent(fy)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: T) => active && setData(d))
      .catch((e: unknown) => {
        if (!active) return;
        setData(null);
        setError(e instanceof Error ? e.message : 'Request failed');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [view, fy, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, retry };
}

// --- DTOs (client mirrors of the server-only rollup shapes) ---------------

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
  source: { from: string | null; subject: string | null };
}

export interface IncomeDTO {
  fy: string;
  hasData: boolean;
  total: number;
  salaryTotal: number;
  otherTotal: number;
  employer: string | null;
  months: { m: string; salary: number; other: number }[];
  txns: RecentTxnDTO[];
}

export interface ExpensesDTO {
  fy: string;
  hasData: boolean;
  total: number;
  categories: { name: string; amt: number; color: string; recurring: boolean; project: string | null; children: { name: string; amt: number }[] }[];
  txns: RecentTxnDTO[];
}

export interface TaxRegimeView {
  taxable: number;
  tax: number;
  surcharge: number;
  cess: number;
  total: number;
}
export interface TaxDTO {
  fy: string;
  hasData: boolean;
  comparison: {
    fy: string;
    grossIncome: number;
    deductions: { section: string; label: string; amount: number; cap: number | null; evidence: number }[];
    old: TaxRegimeView;
    new: TaxRegimeView;
    recommended: 'old' | 'new';
    saving: number;
    tips: { t: string; d: string }[];
  } | null;
  evidence: RecentTxnDTO[];
}

export interface InvestmentsDTO {
  fy: string;
  hasData: boolean;
  totalInvested: number;
  platforms: { platform: string; kind: string; invested: number; value: number | null; glyph: string; color: string }[];
}

export interface LiabilitiesDTO {
  fy: string;
  hasData: boolean;
  loans: { name: string; kind: string; detail: string; outstanding: number; emi: number; taxSection?: string; glyph: string; color: string }[];
  insurance: { name: string; premium: number; section: string; glyph: string; color: string }[];
}

export interface SubscriptionsDTO {
  hasData: boolean;
  subscriptions: { id: string; name: string; cat: string; amt: number; annual: number; cadence: string; next: string; nextIso: string | null; last: string; occurrences: number; status: 'confirmed' | 'likely' | 'dismissed'; glyph: string; color: string }[];
}

export interface SourcesDTO {
  hasData: boolean;
  messagesScanned: number;
  coverage: number | null;
  lastRunDate: string | null;
  runs: { date: string; q: string; msgs: number; bytes: string; status: 'ok' | 'warn' }[];
}

export interface ReviewDTO {
  hasData: boolean;
  total: number;
  items: { id: string; kind: 'locked_pdf' | 'uncategorised' | 'low_confidence' | 'missing_profile'; icon: string; title: string; desc: string; action: string; count?: number }[];
}
