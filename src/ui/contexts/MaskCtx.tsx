'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';

interface MaskCtxValue {
  masked: boolean;
  setMasked: (next: boolean | ((prev: boolean) => boolean)) => void;
}

const MaskCtx = createContext<MaskCtxValue>({ masked: true, setMasked: () => {} });

export function MaskProvider({ children }: { children: ReactNode }) {
  const [masked, setMaskedState] = useState(true);
  const setMasked: MaskCtxValue['setMasked'] = (next) => {
    setMaskedState((prev) => (typeof next === 'function' ? (next as (p: boolean) => boolean)(prev) : next));
  };
  return <MaskCtx.Provider value={{ masked, setMasked }}>{children}</MaskCtx.Provider>;
}

export function useMask(): MaskCtxValue {
  return useContext(MaskCtx);
}
