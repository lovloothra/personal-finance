'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ReviewDTO, SourcesDTO, SubscriptionsDTO } from '../data/useDashboard';

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
  /** Live review-queue summary, or null before the first import. */
  review: ReviewMeta | null;
  /** Live count of active (non-dismissed) detected subscriptions, or null. */
  subsCount: number | null;
  /** Live Gmail-run metadata, or null. */
  sources: SourcesMeta | null;
  /** Full name from the saved profile, or null while the demo fixtures show. */
  profileName: string | null;
  /** Re-fetch all shell metadata (after unlock/assign/import actions). */
  refresh: () => Promise<void>;
}

const Ctx = createContext<ShellMeta>({ review: null, subsCount: null, sources: null, profileName: null, refresh: async () => {} });

export function ShellMetaProvider({ children }: { children: ReactNode }) {
  const [review, setReview] = useState<ReviewMeta | null>(null);
  const [subsCount, setSubsCount] = useState<number | null>(null);
  const [sources, setSources] = useState<SourcesMeta | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const get = async <T,>(path: string): Promise<T | null> => {
      try {
        const res = await fetch(path);
        return (await res.json()) as T;
      } catch {
        return null;
      }
    };
    const [rev, subs, src, setup] = await Promise.all([
      get<ReviewDTO>('/api/dashboard/review'),
      get<SubscriptionsDTO>('/api/dashboard/subscriptions'),
      get<SourcesDTO>('/api/dashboard/sources'),
      get<{ profileName: string | null }>('/api/setup/status'),
    ]);
    if (setup?.profileName) setProfileName(setup.profileName);
    // A completed Gmail run is the signal that this is a real install; until
    // then everything stays null and the UI keeps its demo fixtures.
    const liveInstall = src?.hasData ?? false;
    if (liveInstall) {
      setSources({ coverage: src!.coverage, lastRunDate: src!.lastRunDate, messagesScanned: src!.messagesScanned });
      if (rev) {
        setReview({
          total: rev.total,
          locked: rev.items.filter((i) => i.kind === 'locked_pdf').reduce((n, i) => n + (i.count ?? 1), 0),
          uncategorised: rev.items.filter((i) => i.kind === 'uncategorised').reduce((n, i) => n + (i.count ?? 1), 0),
          lowConfidence: rev.items.filter((i) => i.kind === 'low_confidence').reduce((n, i) => n + (i.count ?? 1), 0),
        });
      }
      if (subs) setSubsCount(subs.hasData ? subs.subscriptions.filter((s) => s.status !== 'dismissed').length : 0);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ review, subsCount, sources, profileName, refresh }}>{children}</Ctx.Provider>;
}

export function useShellMeta(): ShellMeta {
  return useContext(Ctx);
}
