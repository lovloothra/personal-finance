# personal-finance

> Local-first Gmail-backed personal finance workbench.

`personal-finance` is a free, open-source workbench for rebuilding a household ledger from financial evidence you
already receive in Gmail. It runs on your machine, uses your own read-only Google OAuth client, downloads statements
and receipts locally, and turns them into categorized expenses, income, subscriptions, investments, liabilities, and
India tax-regime comparisons with source provenance.

This is not a SaaS app, not an account aggregator, and not a hosted finance product. The database, attachments,
profile, OAuth client, and tokens stay on your device.

## Quick Start

Requirements: Node.js 20 or newer, npm, and a Google account whose Gmail contains the statements or receipts you want
to import. `qpdf` is optional but recommended for password-protected PDFs.

```sh
npm install
npm run db:load-packs
npm run dev
```

Open <http://127.0.0.1:3000>. A fresh install is routed to `/onboarding`, where the app walks you through setup:

1. Enter the essentials: name, PAN, date of birth, employer, primary bank, and credit card issuer.
2. Create a Google Cloud Desktop OAuth client, enable the Gmail API, and paste the downloaded client JSON into the app.
3. Connect Gmail with the `gmail.readonly` scope. The app can read matching messages but cannot send, delete, or modify mail.
4. Review the FY import estimate. Downloads over the 1 GB consent threshold require explicit approval.
5. Import statements and receipts. Attachments are stored under `attachments/`, parsed, classified, and indexed locally.

After onboarding, the workbench opens with the overview dashboard and provenance links back to the imported evidence.

## Local Data And Privacy

- Gmail access is read-only through your own Desktop OAuth client.
- The SQLite database is encrypted with SQLCipher and stored under `data/`.
- OAuth tokens are additionally sealed before they are written to the encrypted database.
- Downloaded files live under `attachments/`; generated exports belong under `exports/`.
- Profile and OAuth client files live under `secrets/`.
- `data/`, `attachments/`, `exports/`, and `secrets/` are gitignored.
- There is no telemetry, hosted backend, or external enrichment API.
- Sensitive values are masked in the UI by default.

## Advanced CLI

The guided onboarding flow is the recommended path for new users. These scripts are useful for repeatable local setup,
debugging, pack maintenance, and developer workflows.

- `npm run dev` - start the local web server on `127.0.0.1:3000`
- `npm run build` - create a production build
- `npm start` - serve the production build on `127.0.0.1:3000`
- `npm run lint` - run the configured lint command
- `npm test` - run pack validator, pack loader, classifier, parser, tax, Gmail query, PDF, profile, and FY tests
- `npm run validate:packs` - validate India pack JSON against `schemas/pack-in.schema.json`
- `npm run refresh:packs:in` - refresh India institution seeds from upstream sources
- `npm run db:generate` - generate Drizzle SQL migrations from `src/db/schema.ts`
- `npm run db:load-packs` - load India institution and merchant seeds into the encrypted local database
- `npm run profile:seed` - load `secrets/profile.local.json` into the encrypted database
- `npm run gmail:auth` - authorize read-only Gmail from the CLI using `secrets/google-oauth-client.json`
- `npm run gmail:fetch -- --fy=2025-26 [--all] [--yes]` - fetch matching Gmail messages and attachments for a financial year
- `npm run ingest` - process downloaded attachments into parsed documents, classified transactions, and review items

Advanced users can maintain `secrets/profile.local.json` directly. Its shape is defined in `src/profile/types.ts`; the
same profile feeds Gmail query scoping, PDF password candidates, salary/rent/EMI detection, and classifier context.

## Current Capabilities

- Encrypted local SQLite storage with Drizzle schema and migrations.
- India-focused institution packs for banks, credit card issuers, brokers, insurers, lenders, merchants, and Gmail templates.
- Guided browser onboarding for profile essentials, OAuth client capture, Gmail authorization, import estimates, and live import progress.
- Read-only Gmail query building, metadata estimation, 1 GB consent gate, attachment download, and SHA-256 dedupe.
- PDF handling that decrypts password-protected statements in pure JavaScript via pdf.js using profile-derived password candidates (no external binary required); optional `qpdf` fallback for exotic encryption; text extraction with layout-aware line reconstruction, and OCR support.
- Provider-dispatched statement parsing and an ingest pipeline that stores parsed documents, transactions, and review items.
- Deterministic transaction classification using provider rules, merchant aliases, profile signals, recurrence, internal-transfer detection, and project isolation.
- India financial-year utilities and FY 2025-26 / 2026-27 income-tax comparison logic.
- Workbench UI for overview, income, expenses, investments, liabilities, subscriptions, tax, review queue, sources, profile, and settings.
- Every workbench page (Overview, Income, Expenses, Tax, Investments, Liabilities, Subscriptions, Sources, Review queue, Profile) is DB-backed, using your real data when available and falling back to demo fixtures before the first import.
- The Profile page shows your actual profile section-by-section with live completion %, empty fields surfaced as hints to complete (never placeholder data), and edits that persist to the encrypted seed + database.
- Subscription detection: recurring debits (excluding rent/EMI/insurance/investment) are materialised into the Subscriptions page with cadence and next-charge estimates.
- Review queue surfaces locked statements, uncategorised transactions, and low-confidence classifications, with an inline password entry that retries every locked statement on-device and re-ingests.
- Universal statement parser handles both running-balance (bank) and single-amount (card) layouts, ignores reference/card numbers and summary/balance-forward lines, and de-duplicates repeated rows.
- Re-ingestion is idempotent (deterministic per-attachment document ids), so reprocessing after adding a password never duplicates transactions.
- Cross-statement de-duplication: identical transactions appearing in overlapping statements (e.g. a monthly and an annual statement) are counted once.
- Internal-transfer detection links debit↔credit pairs across accounts (same amount, close dates, different statements, with a transfer/own-name signal) plus credit-card bill payments, and excludes both legs from income/expense rollups to avoid double-counting.

## Repo Layout

- `app/` - web pages and route handlers
- `app/api/` - local API routes for setup, OAuth, Gmail import, institutions, profile, and dashboard data
- `src/ui/` - shell, onboarding, primitives, page components, contexts, and UI data hooks
- `src/styles/` - design tokens and workbench CSS
- `src/db/` - Drizzle schema, SQLCipher connection, and migrations
- `src/secrets/` - OS-keychain passphrase storage and libsodium token wrapping
- `src/packs/` - country-pack loader for institutions and merchant aliases
- `src/classifier/` - deterministic transaction classification pipeline
- `src/tax/` - India tax regimes, deductions, and comparison logic
- `src/gmail/` - read-only Gmail OAuth, query builder, fetcher, and consent gate
- `src/pdf/` - password candidates, unlock support, text extraction, and OCR
- `src/parsers/` - provider-dispatched statement parsers
- `src/profile/` - profile seed schema, database persistence, and signal adapters
- `src/ingest/` - orchestration from downloaded attachments to classified transactions
- `src/ledger/` - financial-year helpers and dashboard rollups
- `src/server/` - shared server helpers for setup, imports, JSON responses, and SSE
- `packs/in/` - India pack seed data
- `schemas/` - JSON schemas for pack validation
- `tools/`, `scripts/`, `tests/` - validation tools, operational scripts, and automated tests
