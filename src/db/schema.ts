/**
 * Drizzle schema for the local-first encrypted SQLite database.
 *
 * Conventions:
 * - Text primary keys are app-generated ids (uuid/slug).
 * - Timestamps are epoch milliseconds stored as INTEGER.
 * - Booleans use integer({ mode: 'boolean' }).
 * - Structured blobs use text({ mode: 'json' }) with a typed shape.
 * - Money is stored in integer paise (₹1 = 100) to avoid float drift.
 *
 * Every sensitive identifier (PAN, account last4, names, tokens) lives inside
 * this DB, which is SQLCipher-encrypted at rest. OAuth tokens are additionally
 * wrapped per-row with libsodium (see src/secrets/crypto.ts) before insert.
 */
import { sql } from 'drizzle-orm';
import {
  integer,
  real,
  sqliteTable,
  text,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// Shared column helpers -------------------------------------------------------

const now = sql`(unixepoch() * 1000)`;

const createdAt = () => integer('created_at').notNull().default(now);
const updatedAt = () => integer('updated_at').notNull().default(now);

// Reusable enums (kept as text with a typed union via $type) ------------------

type Confidence = 'high' | 'med' | 'low';
type Flow = 'income' | 'expense' | 'transfer' | 'investment';
type InstitutionSource = 'pack:in' | 'user';
type ClassificationSource = 'deterministic' | 'local_ml';
type FeedbackSource = 'review_assignment' | 'user_override' | 'suggestion_accept';
type PredictionDecision = 'accepted' | 'suggested' | 'stored' | 'rejected';
type SuggestionStatus = 'open' | 'accepted' | 'rejected' | 'edited';

// ---------------------------------------------------------------------------
// Profile (single-household, India-first; sections map to onboarding steps)
// ---------------------------------------------------------------------------

export const profilePersonal = sqliteTable('profile_personal', {
  id: text('id').primaryKey().default('self'),
  fullName: text('full_name'),
  dob: text('dob'), // ISO date
  pan: text('pan'), // sensitive, masked in UI
  city: text('city'),
  residencyStatus: text('residency_status'), // resident | nri | ...
  primaryEmail: text('primary_email'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const profileFamily = sqliteTable('profile_family', {
  id: text('id').primaryKey(),
  relation: text('relation').notNull(), // spouse | child | parent | dependent
  fullName: text('full_name'),
  dob: text('dob'),
  isDependent: integer('is_dependent', { mode: 'boolean' }).default(false),
  hasIncome: integer('has_income', { mode: 'boolean' }).default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const profileHome = sqliteTable('profile_home', {
  id: text('id').primaryKey().default('home'),
  ownership: text('ownership'), // owned | rented | family
  monthlyRent: integer('monthly_rent'), // paise
  cityTier: text('city_tier'), // metro | non_metro
  hasHomeLoan: integer('has_home_loan', { mode: 'boolean' }).default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const profileLifestyle = sqliteTable('profile_lifestyle', {
  id: text('id').primaryKey().default('lifestyle'),
  data: text('data', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const profileHouseHelp = sqliteTable('profile_house_help', {
  id: text('id').primaryKey(),
  role: text('role').notNull(), // maid | cook | driver | nanny | gardener
  monthlyAmount: integer('monthly_amount'), // paise
  paymentMode: text('payment_mode'), // upi | cash | bank
  upiHandle: text('upi_handle'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const profileSubscriptions = sqliteTable('profile_subscriptions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  amount: integer('amount'), // paise
  cadence: text('cadence'), // monthly | quarterly | yearly
  category: text('category'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const profileAnnualExpenses = sqliteTable('profile_annual_expenses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  amount: integer('amount'), // paise
  month: integer('month'), // 1-12 expected month
  category: text('category'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const profileOneTimeProjects = sqliteTable('profile_one_time_projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  budget: integer('budget'), // paise
  startDate: text('start_date'),
  endDate: text('end_date'),
  status: text('status'), // planned | active | done
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Accounts & instruments
// ---------------------------------------------------------------------------

export const institutions = sqliteTable(
  'institutions',
  {
    id: text('id').primaryKey(), // pack id or user-generated
    displayName: text('display_name').notNull(),
    legalName: text('legal_name'),
    category: text('category').notNull(), // bank | credit_card | broker | ...
    type: text('type'),
    aliases: text('aliases', { mode: 'json' }).$type<string[]>().default(sql`'[]'`),
    sources: text('sources', { mode: 'json' }).$type<unknown[]>().default(sql`'[]'`),
    confidence: text('confidence').$type<Confidence>().default('high'),
    status: text('status').default('active'),
    source: text('source').$type<InstitutionSource>().notNull().default('pack:in'),
    packVersion: text('pack_version'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('institutions_category_idx').on(t.category),
    index('institutions_source_idx').on(t.source),
  ],
);

export const accountsBank = sqliteTable('accounts_bank', {
  id: text('id').primaryKey(),
  institutionId: text('institution_id').references(() => institutions.id),
  nickname: text('nickname'),
  last4: text('last4'),
  accountType: text('account_type'), // savings | current | salary
  isPrimary: integer('is_primary', { mode: 'boolean' }).default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const accountsCard = sqliteTable('accounts_card', {
  id: text('id').primaryKey(),
  institutionId: text('institution_id').references(() => institutions.id),
  nickname: text('nickname'),
  last4: text('last4'),
  network: text('network'), // visa | mastercard | amex | rupay
  creditLimit: integer('credit_limit'), // paise
  statementDay: integer('statement_day'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const accountsBroker = sqliteTable('accounts_broker', {
  id: text('id').primaryKey(),
  institutionId: text('institution_id').references(() => institutions.id),
  nickname: text('nickname'),
  clientCode: text('client_code'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const accountsInvestmentPlatform = sqliteTable(
  'accounts_investment_platform',
  {
    id: text('id').primaryKey(),
    institutionId: text('institution_id').references(() => institutions.id),
    nickname: text('nickname'),
    kind: text('kind'), // mutual_fund | nps | pension | gold
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

export const loans = sqliteTable('loans', {
  id: text('id').primaryKey(),
  institutionId: text('institution_id').references(() => institutions.id),
  kind: text('kind'), // home | auto | personal | education
  principal: integer('principal'), // paise
  outstanding: integer('outstanding'), // paise
  emiAmount: integer('emi_amount'), // paise
  emiDay: integer('emi_day'),
  interestRate: real('interest_rate'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const insurancePolicies = sqliteTable('insurance_policies', {
  id: text('id').primaryKey(),
  institutionId: text('institution_id').references(() => institutions.id),
  kind: text('kind'), // term | health | vehicle | endowment | ulip
  policyNumberLast4: text('policy_number_last4'),
  premium: integer('premium'), // paise
  cadence: text('cadence'), // monthly | quarterly | yearly
  sumAssured: integer('sum_assured'), // paise
  renewalMonth: integer('renewal_month'),
  coversSelf: integer('covers_self', { mode: 'boolean' }).default(true),
  coversParents: integer('covers_parents', { mode: 'boolean' }).default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * User-supplied statement passwords, tried alongside the profile-derived
 * candidates when unlocking PDFs. Stored inside the SQLCipher-encrypted DB.
 */
export const documentPasswords = sqliteTable('document_passwords', {
  id: text('id').primaryKey(),
  value: text('value').notNull(),
  label: text('label'),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Gmail ingestion + attachments + parsed documents
// ---------------------------------------------------------------------------

export const gmailRuns = sqliteTable('gmail_runs', {
  id: text('id').primaryKey(),
  startedAt: integer('started_at').notNull().default(now),
  finishedAt: integer('finished_at'),
  status: text('status').notNull().default('running'), // running | done | error | cancelled
  fyKey: text('fy_key'), // e.g. 2025-26
  queryCount: integer('query_count').default(0),
  messageCount: integer('message_count').default(0),
  attachmentCount: integer('attachment_count').default(0),
  bytesEstimated: integer('bytes_estimated').default(0),
  bytesDownloaded: integer('bytes_downloaded').default(0),
  error: text('error'),
});

/**
 * Gmail OAuth token store. A single row holds the libsodium-sealed OAuth token
 * JSON (access + refresh + expiry), wrapped under the keychain passphrase. The
 * sealed blob is useless without both the SQLCipher key and the passphrase.
 */
export const gmailAuth = sqliteTable('gmail_auth', {
  id: text('id').primaryKey().default('default'),
  wrappedToken: text('wrapped_token').notNull(),
  email: text('email'),
  scope: text('scope'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const gmailMessages = sqliteTable(
  'gmail_messages',
  {
    id: text('id').primaryKey(), // gmail message id
    runId: text('run_id').references(() => gmailRuns.id),
    threadId: text('thread_id'),
    fromAddr: text('from_addr'),
    subject: text('subject'),
    internalDate: integer('internal_date'),
    snippet: text('snippet'),
    matchedQuery: text('matched_query'),
    institutionId: text('institution_id').references(() => institutions.id),
    hasAttachments: integer('has_attachments', { mode: 'boolean' }).default(false),
    createdAt: createdAt(),
  },
  (t) => [index('gmail_messages_run_idx').on(t.runId)],
);

export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id').references(() => gmailMessages.id),
    filename: text('filename'),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    sha256: text('sha256').notNull(),
    pathOnDisk: text('path_on_disk'), // under ./attachments, gitignored
    locked: integer('locked', { mode: 'boolean' }).default(false),
    unlockMethod: text('unlock_method'), // none | qpdf_candidate | manual
    ocrUsed: integer('ocr_used', { mode: 'boolean' }).default(false),
    status: text('status').default('pending'), // pending | extracted | failed | review
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('attachments_sha256_idx').on(t.sha256)],
);

export const parsedDocuments = sqliteTable('parsed_documents', {
  id: text('id').primaryKey(),
  attachmentId: text('attachment_id').references(() => attachments.id),
  messageId: text('message_id').references(() => gmailMessages.id),
  parserId: text('parser_id'), // e.g. in/hdfc-bank-statement
  institutionId: text('institution_id').references(() => institutions.id),
  docType: text('doc_type'), // bank_statement | card_statement | broker_note | ...
  periodStart: text('period_start'),
  periodEnd: text('period_end'),
  rawText: text('raw_text'),
  status: text('status').default('parsed'), // parsed | partial | failed
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Transactions + classification
// ---------------------------------------------------------------------------

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id').references(() => parsedDocuments.id),
    messageId: text('message_id').references(() => gmailMessages.id),
    institutionId: text('institution_id').references(() => institutions.id),
    txnDate: text('txn_date').notNull(), // ISO date
    amount: integer('amount').notNull(), // paise, signed (negative = debit)
    currency: text('currency').notNull().default('INR'),
    rawDescription: text('raw_description'),
    merchant: text('merchant'),
    flow: text('flow').$type<Flow>(),
    category: text('category'),
    subcategory: text('subcategory'),
    confidence: text('confidence').$type<Confidence>(),
    classificationReason: text('classification_reason'),
    profileSignalUsed: text('profile_signal_used'),
    layer: integer('layer'), // 1..7 classifier layer that matched
    classificationSource: text('classification_source').$type<ClassificationSource>().notNull().default('deterministic'),
    acceptedPredictionId: text('accepted_prediction_id'),
    reviewRequired: integer('review_required', { mode: 'boolean' }).default(false),
    isInternalTransfer: integer('is_internal_transfer', { mode: 'boolean' }).default(false),
    isRecurring: integer('is_recurring', { mode: 'boolean' }).default(false),
    projectId: text('project_id').references(() => profileOneTimeProjects.id),
    taxSection: text('tax_section'), // 80C | 80D | 80CCD1B | 24b | HRA
    fyKey: text('fy_key'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('transactions_fy_idx').on(t.fyKey),
    index('transactions_flow_idx').on(t.flow),
    index('transactions_category_idx').on(t.category),
    index('transactions_review_idx').on(t.reviewRequired),
    index('transactions_date_idx').on(t.txnDate),
    index('transactions_classification_source_idx').on(t.classificationSource),
  ],
);

export const merchantAliases = sqliteTable(
  'merchant_aliases',
  {
    id: text('id').primaryKey(),
    pattern: text('pattern').notNull(), // matched against raw description
    canonicalMerchant: text('canonical_merchant').notNull(),
    category: text('category'),
    subcategory: text('subcategory'),
    source: text('source').$type<InstitutionSource>().notNull().default('pack:in'),
    confidence: text('confidence').$type<Confidence>().default('high'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('merchant_aliases_pattern_idx').on(t.pattern)],
);

export const userOverrides = sqliteTable(
  'user_overrides',
  {
    id: text('id').primaryKey(),
    // Match either an exact txn or a recurring description signature.
    transactionId: text('transaction_id').references(() => transactions.id),
    matchSignature: text('match_signature'), // normalized description hash
    flow: text('flow').$type<Flow>(),
    category: text('category'),
    subcategory: text('subcategory'),
    merchant: text('merchant'),
    taxSection: text('tax_section'),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('user_overrides_sig_idx').on(t.matchSignature)],
);

export const classificationFeedback = sqliteTable(
  'classification_feedback',
  {
    id: text('id').primaryKey(),
    transactionId: text('transaction_id').references(() => transactions.id),
    matchSignature: text('match_signature').notNull(),
    rawDescription: text('raw_description').notNull(),
    merchant: text('merchant').notNull(),
    category: text('category').notNull(),
    subcategory: text('subcategory'),
    flow: text('flow').$type<Flow>().notNull(),
    amount: integer('amount').notNull(),
    institutionId: text('institution_id').references(() => institutions.id),
    source: text('source').$type<FeedbackSource>().notNull(),
    reviewedAt: integer('reviewed_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('classification_feedback_sig_idx').on(t.matchSignature),
    index('classification_feedback_txn_idx').on(t.transactionId),
    index('classification_feedback_source_idx').on(t.source),
  ],
);

export const classificationPredictions = sqliteTable(
  'classification_predictions',
  {
    id: text('id').primaryKey(),
    transactionId: text('transaction_id').references(() => transactions.id),
    modelVersion: text('model_version').notNull(),
    predictedMerchant: text('predicted_merchant').notNull(),
    category: text('category').notNull(),
    subcategory: text('subcategory'),
    flow: text('flow').$type<Flow>().notNull(),
    confidenceScore: real('confidence_score').notNull(),
    confidence: text('confidence').$type<Confidence>().notNull(),
    reason: text('reason').notNull(),
    provenance: text('provenance', { mode: 'json' }).$type<unknown>().notNull(),
    evidenceIds: text('evidence_ids', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    decision: text('decision').$type<PredictionDecision>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('classification_predictions_txn_idx').on(t.transactionId),
    index('classification_predictions_decision_idx').on(t.decision),
  ],
);

export const localModelExamples = sqliteTable(
  'local_model_examples',
  {
    id: text('id').primaryKey(),
    feedbackId: text('feedback_id').references(() => classificationFeedback.id),
    transactionId: text('transaction_id').references(() => transactions.id),
    signature: text('signature').notNull(),
    rawDescription: text('raw_description').notNull(),
    merchant: text('merchant').notNull(),
    merchantTokens: text('merchant_tokens', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    category: text('category').notNull(),
    subcategory: text('subcategory'),
    flow: text('flow').$type<Flow>().notNull(),
    amount: integer('amount').notNull(),
    amountBucket: text('amount_bucket').notNull(),
    direction: text('direction').$type<'credit' | 'debit'>().notNull(),
    institutionId: text('institution_id').references(() => institutions.id),
    source: text('source').$type<FeedbackSource>().notNull(),
    reviewedAt: integer('reviewed_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('local_model_examples_sig_idx').on(t.signature),
    index('local_model_examples_category_idx').on(t.category),
    index('local_model_examples_feedback_idx').on(t.feedbackId),
  ],
);

export const localModelSuggestions = sqliteTable(
  'local_model_suggestions',
  {
    id: text('id').primaryKey(),
    predictionId: text('prediction_id').references(() => classificationPredictions.id),
    transactionId: text('transaction_id').references(() => transactions.id),
    status: text('status').$type<SuggestionStatus>().notNull().default('open'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('local_model_suggestions_status_idx').on(t.status),
    index('local_model_suggestions_txn_idx').on(t.transactionId),
  ],
);

export const subscriptionsDetected = sqliteTable('subscriptions_detected', {
  id: text('id').primaryKey(),
  merchant: text('merchant').notNull(),
  amount: integer('amount'), // paise (typical)
  cadence: text('cadence'), // monthly | quarterly | yearly
  status: text('status').default('likely'), // likely | confirmed | dismissed
  firstSeen: text('first_seen'),
  lastSeen: text('last_seen'),
  nextChargeEta: text('next_charge_eta'),
  occurrences: integer('occurrences').default(0),
  category: text('category'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const internalTransferLinks = sqliteTable('internal_transfer_links', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // cc_payment | account_transfer
  debitTxnId: text('debit_txn_id').references(() => transactions.id),
  creditTxnId: text('credit_txn_id').references(() => transactions.id),
  confidence: text('confidence').$type<Confidence>().default('high'),
  createdAt: createdAt(),
});

export const taxEvidence = sqliteTable('tax_evidence', {
  id: text('id').primaryKey(),
  fyKey: text('fy_key').notNull(),
  section: text('section').notNull(), // 80C | 80D | 80CCD1B | 24b | HRA
  transactionId: text('transaction_id').references(() => transactions.id),
  amount: integer('amount'), // paise
  note: text('note'),
  createdAt: createdAt(),
});

export const reviewItems = sqliteTable(
  'review_items',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(), // locked_pdf | uncategorised | low_confidence | profile_gap
    refId: text('ref_id'), // points to attachment/txn/profile field as appropriate
    title: text('title'),
    detail: text('detail'),
    severity: text('severity').default('info'), // info | warn | alert
    status: text('status').default('open'), // open | resolved | dismissed
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('review_items_status_idx').on(t.status)],
);
