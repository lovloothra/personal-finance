# personal-finance

> Local-first Gmail-backed personal finance workbench.

A free, open-source, local-first personal finance and financial-evidence workbench for power users. Clone the repo, run it
locally, connect Gmail with read-only OAuth, define your financial profile, and the app builds a household ledger,
categorised expenses, subscriptions, investments, liabilities, and tax-regime comparisons — all on your machine.

This is **not** a SaaS app, **not** an account aggregator, and **not** a hosted finance app. Nothing leaves your laptop.

## Run

```sh
npm install
npm run dev
```

Then open <http://127.0.0.1:3000>.

## Scripts

- `npm run dev` — Next.js dev server on `127.0.0.1:3000`
- `npm run build` — production build
- `npm start` — production server
- `npm test` — run the Node test suite (pack validators + classifier/tax/query golden tests)
- `npm run validate:packs` — validate India pack JSON against `schemas/pack-in.schema.json`
- `npm run refresh:packs:in` — refresh India institution seeds from upstream sources
- `npm run db:generate` — generate Drizzle SQL migrations from the schema
- `npm run db:load-packs` — load India pack seeds into the encrypted local DB
- `npm run profile:seed` — load `secrets/profile.local.json` into the encrypted DB
- `npm run gmail:auth` — authorize read-only Gmail via your Desktop OAuth client
- `npm run gmail:fetch -- --fy=2025-26 [--all] [--yes]` — fetch + download statements for a financial year
- `npm run ingest` — process downloaded attachments into classified transactions (unlock→extract→parse→classify→store)

## Connect your data (local, read-only)

1. **Load the institution packs:** `npm run db:load-packs`
2. **Create your profile:** copy `secrets/profile.example.json` → `secrets/profile.local.json`, fill in your
   details (names, DOB, PAN, banks/cards/brokers with their pack `institutionId`s), then `npm run profile:seed`.
   The profile drives salary/rent/EMI detection, Gmail query scoping, and locked-PDF password candidates.
3. **Add your Google OAuth client:** create a *Desktop app* OAuth client in Google Cloud Console, enable the
   Gmail API, add yourself as a test user, download the JSON to `secrets/google-oauth-client.json`, then
   `npm run gmail:auth`. Only the `gmail.readonly` scope is requested; tokens are sealed in the encrypted DB.
4. **Fetch a year:** `npm run gmail:fetch -- --fy=2025-26`. A metadata pass estimates size; downloads over 1 GB
   require `--yes`. Attachments land in the gitignored `./attachments` with SHA-256 dedupe.
5. **(Optional) install qpdf** to unlock password-protected statements: `brew install qpdf`
   (macOS) / `sudo apt install qpdf` (Debian/Ubuntu).

The whole flow above is also available as a **guided in-app wizard** — just run `npm run dev` and open the app;
a fresh install is routed to onboarding (Welcome → Essentials with institution pickers → Connect Gmail → live
import → Done), after which the workbench shows your real numbers.

## Privacy guarantees

- Gmail is accessed **read-only**.
- No telemetry, no hosted backend, no external enrichment API.
- All downloaded attachments, the SQLite database, OAuth tokens, exports, and the editable profile are gitignored.
- Sensitive values are masked in the UI by default.

## Repo layout

- `app/` — Next.js App Router pages and route handlers
- `src/ui/` — shell, primitives, page components (workbench UI)
- `src/styles/` — design tokens and workbench CSS (ported from the design handoff)
- `src/db/` — Drizzle schema + SQLCipher-encrypted connection (keychain-unlocked) + migrations
- `src/secrets/` — OS-keychain passphrase storage + libsodium row-level token wrapping
- `src/packs/` — country-pack loader (packs → `institutions` + `merchant_aliases`)
- `src/classifier/` — deterministic 7-layer transaction classifier (pure, golden-tested)
- `src/tax/` — India FY 2025-26 / 2026-27 regime comparison, deductions, slabs (golden-tested)
- `src/gmail/` — read-only Gmail OAuth, query builder, fetcher, consent gate
- `src/pdf/` — password candidates, qpdf unlock, pdf.js text extraction, tesseract OCR
- `src/parsers/` — provider-dispatched statement parsers (balance-delta debit/credit inference)
- `src/profile/` — profile seed schema, DB loader, and classifier/query/password signal adapters
- `src/ingest/` — orchestration: attachments → unlock → extract → parse → classify → stored transactions
- `src/ledger/` — financial-year date utilities and FY rollups (DB → dashboard shapes)
- `src/server/` + `app/api/` — onboarding/import/dashboard route handlers (Node runtime, loopback-only)
- `packs/in/` — India institution seeds (banks, credit cards, brokers, insurers, lenders, merchants)
- `schemas/`, `tools/`, `scripts/`, `tests/` — pack schema, validator, refresh/load scripts, and tests

## Status

v0.4 — clone → guided onboarding → real numbers works end to end on the local machine:

- **Done:** encrypted SQLite (SQLCipher) + keychain unlock + Drizzle schema/migrations; pack loader
  (218 institutions, 121 merchant aliases); deterministic 7-layer classifier; India tax module
  (both regimes, 87A + marginal relief, surcharge, cess); read-only Gmail OAuth + query builder +
  fetcher (SHA-256 dedupe, consent gate); PDF pipeline (password candidates, qpdf unlock, pdf.js
  extraction, OCR); provider statement parsers; **guided in-app onboarding wizard** (profile +
  institution pickers + OAuth + live SSE import); **ingest orchestration** (attachments → classified
  transactions); **FY rollups wired into the Overview dashboard** (real income/expenses/savings/
  categories/merchants with provenance).
- **Next:** wire the remaining dashboard pages (Income, Expenses, Investments, Liabilities,
  Subscriptions, Tax, Review, Sources) to DB selectors; the Settings danger zone (passphrase rotation,
  encrypted backup, full wipe); OCR rasterisation backend for scanned statements.

See `/Users/lovloothra/.claude/plans/` for the approved implementation plan.
