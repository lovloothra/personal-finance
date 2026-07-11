// The classifier's layer ladder, as rendered in the ProvenanceDrawer trace.
// This is product metadata (which layer decided a classification), not demo
// data. TODO: derive names/descriptions from src/classifier so the drawer
// can never drift from the real pipeline order.

export interface ClassifierLayer {
  n: number;
  name: string;
  desc: string;
}

export const classifierLayers: ClassifierLayer[] = [
  { n: 1, name: 'User overrides', desc: 'Exact rules you set' },
  { n: 2, name: 'Profile rules', desc: 'Salary, EMI, rent, house-help, insurance' },
  { n: 3, name: 'Provider rules', desc: 'Bank / institution patterns' },
  { n: 4, name: 'Merchant aliases', desc: 'Pack + your aliases' },
  { n: 5, name: 'Keyword rules', desc: 'Generic descriptors' },
  { n: 6, name: 'Recurrence', desc: 'Subscription cadence detection' },
  { n: 7, name: 'Fallback', desc: 'Uncategorised → review queue' },
  { n: 8, name: 'Transfer dedupe', desc: 'Internal movement excluded from rollups' },
  { n: 9, name: 'Project isolation', desc: 'One-time project spend separated' },
  { n: 10, name: 'Local memory', desc: 'Reviewed examples on this device' },
];
