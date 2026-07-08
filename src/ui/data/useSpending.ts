'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExpensesDTO } from './useDashboard';

export interface UncatGroup {
  signature: string;
  sample: string;
  suggestedMerchant: string;
  count: number;
  total: number;
  flow: string;
  category: string | null;
  firstDate: string;
  lastDate: string;
  // Account-aware fields added in feat/account-aware-transactions
  ownAccountId?: string | null;
  ownAccountKind?: 'bank' | 'card' | null;
  accountNickname?: string | null;
  accountLast4?: string | null;
  institutionId?: string | null;
  counterpartyRaw?: string | null;
  counterpartyKind?: 'own_account' | 'known_own' | 'external' | 'unknown' | null;
  suspectedTransfer?: boolean;
  localSuggestion?: {
    id: string; merchant: string; category: string; subcategory: string | null;
    confidence: string; confidenceScore: number; reason: string; evidenceCount: number;
  } | null;
}
export interface UncatDTO {
  hasData: boolean; totalTransactions: number; totalGroups: number;
  groups: UncatGroup[];
  /** User's most-assigned category keys, ranked — feeds the picker shortlist. */
  topCategories?: string[];
}

export function useSpending(fy: string) {
  const [report, setReport] = useState<ExpensesDTO | null>(null);
  const [triage, setTriage] = useState<UncatDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [highlight, setHighlight] = useState<string | null>(null); // category name to flash
  const queryRef = useRef('');

  const refreshReport = useCallback(async () => {
    const r = await fetch(`/api/dashboard/expenses?fy=${encodeURIComponent(fy)}`);
    setReport((await r.json()) as ExpensesDTO);
  }, [fy]);

  const loadTriage = useCallback(async (q = queryRef.current) => {
    queryRef.current = q;
    const url = q ? `/api/review/uncategorised?q=${encodeURIComponent(q)}` : '/api/review/uncategorised';
    const r = await fetch(url);
    setTriage((await r.json()) as UncatDTO);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([refreshReport(), loadTriage('')]).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [refreshReport, loadTriage]);

  const search = useCallback((q: string) => loadTriage(q), [loadTriage]);

  /** Remove a cleared group locally, re-tally the report, flash its category. */
  const settle = useCallback((sig: string, category: string, removed: number, alsoTaught = 0) => {
    setTriage((u) => u ? {
      ...u,
      groups: u.groups.filter((g) => g.signature !== sig),
      totalGroups: u.totalGroups - 1,
      totalTransactions: u.totalTransactions - removed - alsoTaught,
    } : u);
    setHighlight(category);
    setTimeout(() => setHighlight((h) => (h === category ? null : h)), 1400);
    void refreshReport();
  }, [refreshReport]);

  const assign = useCallback(async (sig: string, merchant: string, category: string) => {
    const res = await fetch('/api/review/assign', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signature: sig, merchant, category }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Assign failed');
    settle(sig, category, data.updated as number, (data.aliasApplied as number) ?? 0);
    if (data.aliasApplied > 0) void loadTriage(); // learned rule reshuffles others
    return data as { updated: number; aliasToken: string | null; aliasApplied: number };
  }, [settle, loadTriage]);

  const acceptSuggestion = useCallback(async (id: string, sig: string, category: string) => {
    const res = await fetch(`/api/review/suggestions/${encodeURIComponent(id)}/accept`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Accept failed');
    settle(sig, category, 1);
  }, [settle]);

  const rejectSuggestion = useCallback(async (id: string) => {
    const res = await fetch(`/api/review/suggestions/${encodeURIComponent(id)}/reject`, { method: 'POST' });
    if (!res.ok) throw new Error('Reject failed');
    setTriage((u) => u ? {
      ...u,
      groups: u.groups.map((g) => g.localSuggestion?.id === id ? { ...g, localSuggestion: null } : g),
    } : u);
  }, []);

  return { report, triage, loading, highlight, assign, acceptSuggestion, rejectSuggestion, search, refreshReport, loadTriage };
}
