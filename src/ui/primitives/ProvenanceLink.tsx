'use client';
import type { ReactNode } from 'react';
import { useDrawer } from '../contexts/DrawerCtx';
import type { Txn } from '../lib/fixtures';
import { Icon } from './Icon';

interface ProvenanceLinkProps {
  txn: Txn;
  label?: string;
  children?: ReactNode;
}

export function ProvenanceLink({ txn, label = 'Trace', children }: ProvenanceLinkProps) {
  const { openProv } = useDrawer();
  return (
    <button
      className="prov"
      onClick={(e) => {
        e.stopPropagation();
        openProv(txn);
      }}
    >
      <Icon name="git-branch" size={13} />
      {children || label}
    </button>
  );
}
