/**
 * Classifier types.
 *
 * The classifier is a deterministic, pure pipeline: given a raw transaction and
 * a classification context (user overrides, profile signals, provider/merchant
 * packs, recurrence index), it returns a single typed result whose shape maps
 * 1:1 to the ProvenanceDrawer in the UI (flow / category / subcategory /
 * confidence / reason / signal / layer / reviewRequired).
 *
 * No I/O, no network, no Date.now() — everything needed is passed in, so the
 * same input always yields the same output and golden tests stay stable.
 */

export type Confidence = 'high' | 'med' | 'low';
export type Flow = 'income' | 'expense' | 'transfer' | 'investment';

/** Classifier layer numbers. 1–7 are the named classification layers; 8 and 9
 * are post-classification pipeline stages (transfer dedupe, project isolation)
 * that can re-stamp a result for display, mirroring the design fixtures. */
export const LAYER = {
  USER_OVERRIDE: 1,
  PROFILE: 2,
  PROVIDER: 3,
  MERCHANT_ALIAS: 4,
  KEYWORD: 5,
  RECURRENCE: 6,
  FALLBACK: 7,
  TRANSFER_DEDUPE: 8,
  PROJECT_ISOLATION: 9,
} as const;

/** A raw transaction as produced by a provider parser, before classification. */
export interface RawTxn {
  id: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Signed amount in paise. Negative = debit/outflow, positive = credit/inflow. */
  amount: number;
  currency: string;
  /** Raw bank/card description line. */
  rawDescription: string;
  /** Optional merchant string if the parser already extracted one. */
  merchant?: string;
  /** Institution this txn was parsed from (pack id), if known. */
  institutionId?: string;
  /** Account/card label for display (e.g. "HDFC ··7702"). */
  account?: string;
  /** Payment method hint (upi | card | netbanking | ...). */
  method?: string;
  /** Counterparty string extracted by the parser (VPA/beneficiary), null when none. */
  counterpartyRaw?: string | null;
}

/** The classification verdict for one transaction. */
export interface Classification {
  flow: Flow;
  category: string;
  subcategory: string | null;
  /** Canonical merchant/payee name for display, when known. */
  merchant?: string | null;
  confidence: Confidence;
  /** Human-readable explanation rendered verbatim in the drawer. */
  reason: string;
  /** Machine signal key (e.g. "profile.employer", "pack.merchants.cabs"). */
  signal: string | null;
  /** Which layer produced this verdict. */
  layer: number;
  reviewRequired: boolean;
  /** Set when the txn is an internal transfer (CC payment / account move). */
  isInternalTransfer?: boolean;
  /** Set when recurrence detection fired. */
  isRecurring?: boolean;
  /** One-time project id when project isolation matched. */
  projectId?: string | null;
  /** Tax section when a profile/keyword rule tagged it (80C | 80D | ...). */
  taxSection?: string | null;
}

// ---------------------------------------------------------------------------
// Context inputs (all the knowledge the classifier needs, passed in)
// ---------------------------------------------------------------------------

export interface UserOverride {
  /** Normalized description signature this override matches. */
  matchSignature: string;
  flow?: Flow;
  category?: string;
  subcategory?: string | null;
  merchant?: string;
  taxSection?: string | null;
  note?: string;
}

/** Employer salary signal from the profile. */
export interface EmployerSignal {
  name: string;
  /** Aliases / sender fragments that appear in salary credit descriptions. */
  aliases: string[];
  /** Typical monthly net salary in paise, for ±tolerance cadence matching. */
  monthlyAmount?: number;
}

export interface RentSignal {
  landlordName?: string;
  monthlyRent: number; // paise
}

export interface HouseHelpSignal {
  name: string;
  role: string;
  monthlyAmount?: number; // paise
  upiHandle?: string;
}

export interface LoanSignal {
  institutionId?: string;
  kind: string; // home | auto | personal | education
  emiAmount?: number; // paise
}

export interface CardSignal {
  institutionId?: string;
  last4?: string;
  label?: string; // e.g. "HDFC ··7702"
}

export interface BrokerSignal {
  institutionId: string;
  name: string;
  /** Marks contributions as 80C/80CCD evidence (e.g. ELSS, NPS). */
  taxSection?: string | null;
}

export interface InsurerSignal {
  institutionId?: string;
  name: string;
  kind: string; // term | health | vehicle
  taxSection?: string | null; // 80D for health, 80C for life
}

export interface OneTimeProject {
  id: string;
  name: string;
  startDate: string; // ISO
  endDate: string; // ISO
  /** Categories/merchants that count toward this project. */
  categoryHints?: string[];
}

export interface ProfileSignals {
  employer?: EmployerSignal;
  rent?: RentSignal;
  houseHelp?: HouseHelpSignal[];
  loans?: LoanSignal[];
  cards?: CardSignal[];
  brokers?: BrokerSignal[];
  insurers?: InsurerSignal[];
  projects?: OneTimeProject[];
}

/** A merchant alias row (from packs or user). */
export interface MerchantAlias {
  /** Lowercased pattern matched as a substring of the raw description. */
  pattern: string;
  canonicalMerchant: string;
  category: string | null;
  subcategory: string | null;
  source: string; // pack:in | user
  confidence: Confidence;
}

/** A provider/institution rule (layer 3). */
export interface ProviderRule {
  institutionId: string;
  displayName: string;
  /** Lowercased fragments to match in the description. */
  patterns: string[];
  category: string;
  subcategory?: string | null;
  flow?: Flow;
}

/** A generic keyword rule (layer 5). */
export interface KeywordRule {
  /** Lowercased keyword/phrase to find in the description. */
  keyword: string;
  category: string;
  subcategory?: string | null;
  flow?: Flow;
  confidence?: Confidence;
}

/** Precomputed recurrence info for a normalized merchant signature. */
export interface RecurrenceHit {
  cadence: 'monthly' | 'quarterly' | 'yearly';
  occurrences: number;
}

export interface ClassifyContext {
  overrides: UserOverride[];
  profile: ProfileSignals;
  providerRules: ProviderRule[];
  merchantAliases: MerchantAlias[];
  keywordRules: KeywordRule[];
  /** Map of normalized description signature → recurrence hit. */
  recurrence: Map<string, RecurrenceHit>;
}
