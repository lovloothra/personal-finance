'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Txn } from '../lib/types';
import { ProvenanceDrawer } from '../primitives/ProvenanceDrawer';

interface DrawerCtxValue {
  openProv: (t: Txn) => void;
}

const DrawerCtx = createContext<DrawerCtxValue>({ openProv: () => {} });

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [txn, setTxn] = useState<Txn | null>(null);
  const openProv = (t: Txn) => setTxn(t);
  const close = () => setTxn(null);
  return (
    <DrawerCtx.Provider value={{ openProv }}>
      {children}
      {txn && <ProvenanceDrawer txn={txn} onClose={close} />}
    </DrawerCtx.Provider>
  );
}

export function useDrawer(): DrawerCtxValue {
  return useContext(DrawerCtx);
}
