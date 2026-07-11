'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { FyKey } from '../lib/types';

/**
 * FY selection deliberately lives in context, not the URL: the workbench
 * layout (and these providers) persist across soft navigations, so the choice
 * survives page switches exactly like before the route conversion. Putting it
 * in the URL would force every internal <Link> to propagate ?fy= for zero
 * server benefit (all data fetching is client-side against /api/dashboard/*).
 * Mask state must never be URL-addressable — masked-by-default on a fresh
 * load is a feature.
 */
interface FyCtxValue { fy: FyKey; setFy: (next: FyKey) => void; fys: FyKey[]; }
const FyCtx = createContext<FyCtxValue>({ fy: '2025-26', setFy: () => {}, fys: [] });

export function FyProvider({ children }: { children: ReactNode }) {
  const [fy, setFy] = useState<FyKey>('2025-26');
  const [fys, setFys] = useState<FyKey[]>([]);
  // Once the user picks an FY, stop auto-switching. A ref (not state) so the
  // mount effect can read the latest value without re-running on every change.
  const pinnedRef = useRef(false);

  useEffect(() => {
    let active = true;
    fetch('/api/dashboard/fys')
      .then((r) => r.json())
      .then((d: { fys: string[]; latest: string | null }) => {
        if (!active) return;
        setFys(d.fys);
        if (!pinnedRef.current && d.latest) setFy(d.latest);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const choose = (next: FyKey) => { pinnedRef.current = true; setFy(next); };
  return <FyCtx.Provider value={{ fy, setFy: choose, fys }}>{children}</FyCtx.Provider>;
}

export function useFy(): FyCtxValue { return useContext(FyCtx); }
