'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ReviewDTO, SourcesDTO, SubscriptionsDTO } from '../data/useDashboard';

export type ShellStatus = 'loading' | 'ready' | 'error';

export interface ReviewMeta {
  total: number;
  locked: number;
  uncategorised: number;
  lowConfidence: number;
}

export interface SourcesMeta {
  coverage: number | null;
  lastRunDate: string | null;
  messagesScanned: number;
}

interface ShellMeta {
  /** 'loading' only before the first refresh settles. Once 'ready' or
   * 'error', the fields below are never ambiguous with "still fetching" —
   * null means the corresponding API confirmed there's no data yet. */
  status: ShellStatus;
  /** Live review-queue summary, or null before any import. */
  review: ReviewMeta | null;
  /** Live count of active (non-dismissed) detected subscriptions, or null before any import. */
  subsCount: number | null;
  /** Live Gmail-run metadata, or null before any import. */
  sources: SourcesMeta | null;
  /** Full name from the saved profile, or null if none saved yet. */
  profileName: string | null;
  /** Re-fetch all shell metadata (after unlock/assign/import actions). */
  refresh: () => Promise<void>;
}

const Ctx = createContext<ShellMeta>({
  status: 'loading', review: null, subsCount: null, sources: null, profileName: null, refresh: async () => {},
});

export function ShellMetaProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ShellStatus>('loading');
  const [review, setReview] = useState<ReviewMeta | null>(null);
  const [subsCount, setSubsCount] = useState<number | null>(null);
  const [sources, setSources] = useState<SourcesMeta | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const get = async <T,>(path: string): Promise<T> => {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      return (await res.json()) as T;
    };
    const [rev, subs, src, setup] = await Promise.allSettled([
      get<ReviewDTO>('/api/dashboard/review'),
      get<SubscriptionsDTO>('/api/dashboard/subscriptions'),
      get<SourcesDTO>('/api/dashboard/sources'),
      get<{ profileName: string | null }>('/api/setup/status'),
    ]);

    if (setup.status === 'fulfilled' && setup.value.profileName) setProfileName(setup.value.profileName);

    if (rev.status === 'fulfilled') {
      const r = rev.value;
      setReview(r.hasData ? {
        total: r.total,
        locked: r.items.filter((i) => i.kind === 'locked_pdf').reduce((n, i) => n + (i.count ?? 1), 0),
        uncategorised: r.items.filter((i) => i.kind === 'uncategorised').reduce((n, i) => n + (i.count ?? 1), 0),
        lowConfidence: r.items.filter((i) => i.kind === 'low_confidence').reduce((n, i) => n + (i.count ?? 1), 0),
      } : null);
    }
    if (subs.status === 'fulfilled') {
      const s = subs.value;
      setSubsCount(s.hasData ? s.subscriptions.filter((x) => x.status !== 'dismissed').length : null);
    }
    if (src.status === 'fulfilled') {
      const s = src.value;
      setSources(s.hasData ? { coverage: s.coverage, lastRunDate: s.lastRunDate, messagesScanned: s.messagesScanned } : null);
    }

    setStatus([rev, subs, src, setup].some((r) => r.status === 'rejected') ? 'error' : 'ready');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ status, review, subsCount, sources, profileName, refresh }}>{children}</Ctx.Provider>;
}

export function useShellMeta(): ShellMeta {
  return useContext(Ctx);
}
