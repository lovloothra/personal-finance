// Shared UI-side types. These began life in the demo fixtures file; the
// fixtures are gone but the shapes remain the contract between the data
// hooks, the provenance drawer, and the pages.

export type Confidence = 'high' | 'med' | 'low';
export type FlowDir = 'in' | 'out';
export type FyKey = string; // e.g. '2025-26'

export interface TxnSource {
  type: 'email' | 'pdf';
  from: string;
  subject: string;
  date: string;
  body: string;
}

/** Drawer-ready transaction view: what the ProvenanceDrawer renders. */
export interface Txn {
  id: string;
  date: string;
  merchant: string;
  cat: string;
  sub: string;
  amt: number;
  flow: FlowDir;
  ledgerFlow?: 'income' | 'expense' | 'transfer' | 'investment';
  conf: Confidence;
  acct: string;
  method: string;
  layer: number;
  reason: string;
  signal: string | null;
  classificationSource?: 'deterministic' | 'local_ml';
  acceptedPredictionId?: string | null;
  glyph: string;
  color: string;
  transfer?: boolean;
  recurring?: boolean;
  project?: string;
  taxSection?: string;
  review?: boolean;
  source: TxnSource;
}
