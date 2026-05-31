'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { FyKey } from '../lib/fixtures';

interface FyCtxValue {
  fy: FyKey;
  setFy: (next: FyKey) => void;
}

const FyCtx = createContext<FyCtxValue>({ fy: '2025-26', setFy: () => {} });

export function FyProvider({ children }: { children: ReactNode }) {
  const [fy, setFy] = useState<FyKey>('2025-26');
  return <FyCtx.Provider value={{ fy, setFy }}>{children}</FyCtx.Provider>;
}

export function useFy(): FyCtxValue {
  return useContext(FyCtx);
}
