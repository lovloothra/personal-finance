# personal-finance

> Local-first Gmail-backed personal finance workbench.

`personal-finance` is a free, open-source workbench for rebuilding a household
ledger from financial evidence you already receive in Gmail. It runs on your
machine, uses your own read-only Google OAuth client, downloads statements and
receipts locally, and turns them into categorized expenses, income,
subscriptions, investments, liabilities, India tax-regime comparisons, and
source provenance.

This is not a SaaS app, account aggregator, or hosted finance product. The
database, attachments, profile, OAuth client, and tokens stay on your device.

## Screenshots

Amounts are hidden with the app's built-in mask.

![Overview dashboard with amounts masked](public/assets/readme/overview-masked.png)

![Review queue with classification items](public/assets/readme/review-queue-masked.png)

![Sources and provenance view](public/assets/readme/sources-provenance-masked.png)

## Quick Start

Requirements: Node.js 20 or newer, npm, and a Google account whose Gmail
contains the statements and receipts you want to import. `qpdf` is optional for
unusual password-protected PDFs.

```sh
npm install
npm run db:load-packs
npm run dev
```

Open <http://127.0.0.1:3000>. A fresh install routes to `/onboarding`, where the
app walks you through setup:

1. Enter essentials: name, PAN, date of birth, employer, primary bank, and
   credit card issuer.
2. Create a Google Cloud Desktop OAuth client, enable the Gmail API, and paste
   the downloaded client JSON into the app.
3. Connect Gmail with the `gmail.readonly` scope. The app can read matching
   messages, but cannot send, delete, or modify mail.
4. Review the financial-year import estimate. Downloads over the 1 GB consent
   threshold require explicit approval.
5. Import statements and receipts. Attachments are stored under `attachments/`,
   parsed, classified, and indexed locally.

After onboarding, the workbench opens the overview dashboard with provenance
links back to imported evidence.

## Local Data Privacy

- Gmail access is read-only through your own Desktop OAuth client.
- SQLite is encrypted with SQLCipher and stored under `data/`.
- OAuth tokens are sealed before they are written to the encrypted database.
- Downloaded files live under `attachments/`; generated exports belong under
  `exports/`.
- Profile and OAuth client files live under `secrets/`.
- `data/`, `attachments/`, `exports/`, and `secrets/` are gitignored.
- There is no telemetry, hosted backend, or external enrichment API.
- Sensitive values are masked in the UI by default.

## Model-Based Classification

Classification starts with deterministic rules, then uses the local model only
where it can safely improve weak results.

- The deterministic classifier runs first across provider rules, merchant
  aliases, profile signals, recurrence, internal-transfer detection, and project
  isolation.
- Local ML is eligible only for fallback, low-confidence, or review-required
  transactions. Strong deterministic matches remain deterministic.
- Transfers, tax evidence, project-isolated rows, and internal-transfer
  de-duplication are intentionally kept out of model auto-classification.
- The embedding model is bundled locally at
  `models/classification/all-MiniLM-L6-v2` and runs through ONNX Runtime. No
  transaction text is sent to an external model service.
- User review actions create feedback examples with MiniLM embeddings. Those
  examples train a local softmax classifier head stored in the encrypted local
  database.
- Strong predictions can be accepted as `local_ml` layer-10 classifications.
  Weaker predictions are stored as review suggestions so the user can accept,
  reject, or override them.
- If the model bundle or runtime is unavailable, the app falls back to the
  deterministic classifier and review queue.

The result is a conservative loop: deterministic rules handle known cases,
review feedback teaches the local model, and provenance still records why each
classification happened.

## Advanced CLI

The guided browser onboarding flow is the recommended path for new users. These
scripts are useful for repeatable local setup, debugging, pack maintenance, and
developer workflows.

- `npm run dev` - start the local web server on `127.0.0.1:3000`
- `npm run build` - create a production build
- `npm start` - serve the production build on `127.0.0.1:3000`
- `npm run lint` - run ESLint
- `npm test` - run pack, classifier, parser, tax, Gmail query, PDF, profile,
  local intelligence, assistant, and FY tests
- `npm run validate:packs` - validate India pack JSON against
  `schemas/pack-in.schema.json`
- `npm run profile:seed` - load `secrets/profile.local.json` into the encrypted
  database
- `npm run gmail:auth` - authorize read-only Gmail from the CLI using
  `secrets/google-oauth-client.json`
- `npm run gmail:fetch -- --fy=2025-26 [--all] [--yes]` - fetch matching Gmail
  messages and attachments for a financial year
- `npm run ingest` - process downloaded attachments into parsed documents,
  classified transactions, local model suggestions, and review items

Advanced users can maintain `secrets/profile.local.json` directly. Its shape is
defined in `src/profile/types.ts`; the same profile feeds Gmail query scoping,
PDF password candidates, salary/rent/EMI detection, tax evidence, and
classification context.

Optional local assistant endpoints can synthesize typed ledger answers with a
localhost Ollama model. The deterministic typed-tool answer remains available
when Ollama is not running or the configured model is missing.

## Current Capabilities

- Encrypted local SQLite storage with Drizzle schema migrations.
- India-focused institution packs for banks, credit card issuers, brokers,
  insurers, lenders, merchants, and Gmail templates.
- Guided browser onboarding for profile essentials, OAuth client capture, Gmail
  authorization, import estimates, and live import progress.
- Read-only Gmail query building, metadata estimation, 1 GB consent gate,
  attachment download, and SHA-256 de-duplication.
- PDF handling for password-protected statements with profile-derived password
  candidates, pdf.js text extraction, OCR support, and optional `qpdf` fallback.
- Provider-dispatched statement parsing and an ingest pipeline that stores
  parsed documents, transactions, review items, and local model suggestions.
- Deterministic classification plus local MiniLM-based suggestions learned from
  user feedback.
- India financial-year utilities for FY 2025-26 / 2026-27 income-tax comparison
  logic.
- Workbench pages for overview, income, expenses, investments, liabilities,
  subscriptions, tax, review queue, sources, profile, and settings.
- Universal statement parsing for running-balance bank layouts and
  single-amount card layouts, with summary/balance-forward rows ignored.
- Idempotent re-ingestion with deterministic per-attachment document ids.
- Cross-statement de-duplication for identical transactions in overlapping
  statements.
- Internal-transfer detection for debit-credit pairs and credit-card bill
  payments, excluding both legs from income/expense rollups.
- Optional local assistant APIs backed by typed ledger tools and localhost
  Ollama synthesis.

## Repo Layout

- `app/` - web pages and route handlers
- `app/api/` - local API routes for setup, OAuth, Gmail import, profile,
  dashboard data, review actions, and assistant queries
- `src/ui/` - shell, onboarding, primitives, page components, contexts, and UI
  data hooks
- `src/styles/` - design tokens and workbench CSS
- `src/db/` - Drizzle schema, SQLCipher connection, and migrations
- `src/secrets/` - OS-keychain passphrase storage and libsodium token wrapping
- `src/packs/` - country-pack loader, institutions, and merchant aliases
- `src/classifier/` - deterministic transaction classification pipeline
- `src/intelligence/` - local MiniLM embedding runtime, softmax classifier head,
  feedback examples, predictions, and suggestions
- `src/assistant/` - typed ledger query selection and optional Ollama synthesis
- `src/tax/` - India tax regimes, deductions, and comparison logic
- `src/gmail/` - read-only Gmail OAuth, query builder, fetcher, and consent gate
- `src/pdf/` - password candidates, unlock support, text extraction, and OCR
- `src/parsers/` - provider-dispatched statement parsers
- `src/profile/` - profile seed schema, database persistence, and signal
  adapters
- `src/ingest/` - orchestration from downloaded attachments to classified
  transactions
- `src/ledger/` - financial-year helpers and dashboard rollups
- `src/server/` - shared server helpers for setup, imports, JSON responses, and
  SSE
- `models/classification/` - bundled local classifier embedding model assets
- `packs/in/` - India pack seed data
- `schemas/` - JSON schemas for pack validation
- `tools/`, `scripts/`, `tests/` - validation tools, operational scripts, and
  automated tests
