# Account-aware, counterparty-resolved transaction model

**Date:** 2026-06-14
**Status:** Approved design, pending implementation plan

## Problem

Transactions like the three identical `MOBILE BANKING DFC bank` credits of
₹5,00,000 cannot be classified meaningfully today. Four root problems:

1. **Which account?** A debit/credit has no link to the specific bank account or
   card it sits in. The `transactions` table carries `institutionId` but no
   account reference; `account`/`last4` exists only as a transient display
   string on `RawTxn`, never persisted.
2. **Source/destination?** There is no counterparty field at all. Nothing stores
   "from X / to Y".
3. **Are categories sufficient for credits?** No. Categories are free-form
   strings with no canonical list — a mix of dotted paths
   (`expenses.travel`), Title Case (`Utilities`, `Transfer`) and lowercase
   (`hotels`, `quick-commerce`). The credit side is thin: only `Salary`,
   `Income`, `Interest`, `Dividend`, `Refund` against ~20 expense categories.
4. **Double-counting.** Money moved between the household's own accounts (e.g.
   ICICI → HDFC) must not be counted as income in one and expense in the other.
   The same ICICI → HDFC move could legitimately be: a HDFC credit-card bill
   payment, a transfer to a third party who banks at HDFC (a real expense), or
   pure money management between own accounts (neither). The current
   `transfers.ts` handles this heuristically by pairing debit↔credit on amount +
   date **gated on an explicit transfer keyword**, so a generic
   `MOBILE BANKING` line (no keyword, no counterparty) slips through and is
   counted as income.

## Existing infrastructure (what we build on)

- Account model already exists: `accounts_bank` and `accounts_card`
  (`src/db/schema.ts`) with `last4`, `institutionId`, `nickname`, `accountType`.
- `transfers.ts` already links debit↔credit pairs (same abs amount, within 4
  days, different statements, transfer signal present) and marks both
  `isInternalTransfer`; plus single-sided CC-payment / "payment received" cases.
  `internal_transfer_links` persists the pairs.
- The classifier is a pure, deterministic 7-layer pipeline; transfer dedupe is
  pipeline stage 8 (`LAYER.TRANSFER_DEDUPE`). All inputs arrive via
  `ClassifyContext` — no I/O inside classifier functions.
- `parsed_documents` knows the `institutionId` and is the natural carrier of
  account identity (a statement is *from* one account).

## Key insight

A statement is **from one account**. Account identity belongs to the *document*,
not the transaction line. If every statement resolves to a specific account,
every transaction it produces inherits that `ownAccountId` for free — fixing #1
robustly and turning #4 into a graph-matching problem between the household's
**own** accounts. The discriminator for "real money leaving the household" vs
"shuffling my own money" is **whether the counterparty is one of my own
accounts/cards or an external party** — the same counterparty data answers #2 and
#4 together.

## Decisions taken

- **Scope:** holistic redesign covering all four problems.
- **Account identity (#1):** parse the account last4 from the statement header in
  the parser, then reconcile against Profile-registered accounts by
  `(institutionId + last4)`; auto-create a stub account when no match; flag the
  doc when the header has no last4.
- **Counterparty (#2, #4):** extract raw counterparty when present AND maintain a
  registry of own accounts & known transfer counterparties. A txn whose
  counterparty resolves to an own-entity is a transfer, never income/expense.
- **Ambiguity policy (#4):** suspect-transfer → review. Large round-number
  credits with no merchant/counterparty are flagged `suspectedTransfer` and held
  out of income until confirmed, rather than counted as income.
- **Account reference shape:** lightweight `ownAccountId` + `ownAccountKind`
  discriminator pair (no unified `accounts` table; avoids a large migration).
- **Round-number heuristic threshold:** credit ≥ ₹1,00,000 **and** an exact
  multiple of ₹10,000, with no resolved merchant and no resolved counterparty.
  (Thresholds live in one config constant so they are easy to tune.)
- **Canonical taxonomy (#3):** in scope for this redesign.

## Design

### A. Data model

`transactions` gains:
- `ownAccountId` (text, nullable) + `ownAccountKind` (`'bank' | 'card'`) — which
  of my accounts this debit/credit sits in. Inherited from the statement.
- `counterpartyRaw` (text, nullable) — counterparty string extracted from the
  line, when present.
- `counterpartyId` (text, nullable, FK → `counterparties.id`).
- `counterpartyKind` (`'own_account' | 'known_own' | 'external' | 'unknown'`).
- `suspectedTransfer` (boolean, default false).

New `counterparties` registry (own-entity model):
- `id` (text pk), `displayName` (text).
- `kind` (`'own_account' | 'card_bill' | 'family' | 'broker' | 'other_own'`).
- `matchers` (json `$type<>()`): VPA fragments, name tokens, last4, institution.
- `linkedOwnAccountId` (text, nullable) — set when `kind = 'own_account'`.
- `linkedOwnAccountKind` (`'bank' | 'card'`, nullable).
- `isOwnMoney` (boolean) — transfers to/from these are never income/expense.

`parsed_documents` gains:
- `accountLast4` (text, nullable).
- `ownAccountId` (text, nullable) + `ownAccountKind` (`'bank' | 'card'`).

Migration: `npm run db:generate` after schema edits, then restart to apply.
Booleans use `integer({ mode: 'boolean' })`; json blobs use
`text({ mode: 'json' }).$type<>()`; ids are app-generated; timestamps are epoch
ms — per existing conventions.

### B. Parser (`src/parsers/in/generic-bank.ts` + statement shapes)

Extract two new things:
1. **Statement-header account last4/number** → `ParsedStatement.accountLast4`.
   Read from the header block in the flattened text (account number / card
   number lines, usually masked, e.g. `XXXXXX7702`).
2. **Per-line counterparty** → `ParsedTxn.counterpartyRaw`: UPI VPA
   (`name@bank`), NEFT/IMPS beneficiary name, "to/from X" fragments. Generic
   lines like `MOBILE BANKING DFC bank` correctly yield `null`.

`ParseContext`/`ParsedStatement`/`ParsedTxn` types in `src/parsers/types.ts`
extend to carry the new fields. Parser stays defensive: never treat a
reference/cheque number as a counterparty or amount.

### C. Account reconciliation (new module, ingest-time)

`src/ingest/` (or `src/profile/` adapter) module that, per parsed document:
- Resolves `(institutionId + accountLast4)` against Profile-registered accounts
  (`accounts_bank` / `accounts_card`).
- Auto-creates a **stub account** when there is no match (institution + last4
  known, nickname blank for the user to fill later).
- Flags the document for manual account assignment when the header had no last4.
- Stamps `parsed_documents.ownAccountId/Kind`, and every transaction from the doc
  inherits `transactions.ownAccountId/Kind`.

Idempotent, consistent with the existing pipeline (`status = 'pending'` rows
only).

### D. Counterparty resolution (new classifier-adjacent stage)

Pure/deterministic stage that matches `counterpartyRaw` against the
`counterparties` registry (passed in via `ClassifyContext`):
- Sets `counterpartyId` and `counterpartyKind`.
- `own_account` / `known_own` when a registry entry with `isOwnMoney` matches;
  `external` when a non-own entry matches; `unknown` when nothing matches or
  `counterpartyRaw` is null.
- No DB calls inside the stage — the registry is loaded into context upstream.

### E. Transfer engine rewrite (`src/classifier/transfers.ts`)

Priority order (precision over recall, deterministic):
1. **Counterparty resolves to an own-entity** (`counterpartyKind` is
   `own_account` / `known_own`, or matches a `card_bill` entry) → internal
   transfer, single-sided OK (the other statement need not be imported). Makes
   the ICICI → HDFC case deterministic.
2. Else **pair own-debit ↔ own-credit**: both txns have an `ownAccountId`, same
   abs amount, within window. **Relax the rail-keyword gate when both legs are
   own accounts** — the change that lets the screenshot's pairs be caught when
   both statements are present.
3. **CC-payment** special case retained (debit paying own card; "payment
   received" credit), including single-sided.
4. **Unresolved large round-number credit** — credit ≥ ₹1,00,000 AND an exact
   multiple of ₹10,000, with no resolved merchant and no resolved counterparty
   → set `suspectedTransfer = true` and `reviewRequired = true`. **Excluded from
   income** until the user confirms.

Counting rule: confirmed internal transfers (`isInternalTransfer`) are excluded
from income/expense/savings. `suspectedTransfer` (unconfirmed) is held out of
income.

### F. Canonical category taxonomy (#3)

A single `src/classifier/taxonomy.ts` (or `src/ledger/taxonomy.ts`) keyed by
`flow`:
- `income`: `salary`, `interest`, `dividend`, `capital_gains`, `rental_income`,
  `reimbursement`, `refund`, `gift`, `other_income`.
- `expense`: existing set, normalized to one casing.
- `transfer`: `self_transfer`, `cc_payment`, `atm_cash`.
- `investment`: existing set.

A one-time mapping migration folds today's free-form strings onto canonical
keys. The triage category picker **filters by the transaction's flow** so credits
offer income categories, not expense ones.

### G. UI (triage card, `src/ui/`)

Separate the three concepts the current card conflates (it uses the bank name as
both merchant and category):
- **Account chip** — institution logo + last4 (#1).
- **Counterparty line** (#2), with a one-click "this is my own account →
  transfer" action that adds the counterparty to the registry for next time.
- **Suspected-transfer banner** on round-number credits with "mark transfer /
  it's income" actions.
- Category picker filtered by flow (per F).

### H. Rollups (the #4 guarantee)

Reports/ledger exclude `isInternalTransfer` from income, expense, and savings
rate. `suspectedTransfer` (unconfirmed) is held out of income so it can never
inflate it. FY rollups (`src/ledger/`) updated accordingly.

## Testing

- Parser: golden tests for header-last4 extraction and per-line counterparty
  extraction across bank and card statement shapes, including the
  `MOBILE BANKING` (null counterparty) case.
- Reconciliation: doc → account resolution (match, stub-create, no-last4 flag).
- Counterparty resolution: registry matching for each `counterpartyKind`.
- Transfer engine: own-entity single-sided; own↔own pairing without keyword;
  CC-payment; round-number `suspectedTransfer` (boundary cases at ₹1,00,000 and
  non-multiples of ₹10,000); ensure non-round / merchant-resolved credits stay
  income.
- Rollups: confirmed transfers and suspected transfers excluded from income;
  savings rate unaffected by internal moves.
- Taxonomy: every legacy free-form string maps to a canonical key; picker
  filters by flow.

Tests use the Node built-in runner with `PF_DB_PATH` ephemeral DBs where DB
access is needed; classifier/transfer/taxonomy tests stay pure.

## Out of scope

- Unified `accounts` table (using discriminator columns instead).
- ML/local-model changes beyond feeding the new fields into existing context.
- Cross-currency handling.
