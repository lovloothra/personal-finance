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
- `src/gmail/` — read-only Gmail query builder (consumes `gmail-templates.json`)
- `src/ledger/` — financial-year date utilities and rollups
- `packs/in/` — India institution seeds (banks, credit cards, brokers, insurers, lenders, merchants)
- `schemas/`, `tools/`, `scripts/`, `tests/` — pack schema, validator, refresh/load scripts, and tests

## Status

v0.2 — the workbench UI runs against fixture data; the local-first core is being built underneath it:

- **Done:** encrypted SQLite (SQLCipher) + keychain unlock + Drizzle schema/migrations; pack loader
  (218 institutions, 121 merchant aliases); deterministic 7-layer classifier; India tax module
  (both regimes, 87A + marginal relief, surcharge, cess); FY utilities; read-only Gmail query builder.
- **Next:** Gmail OAuth + fetcher, PDF unlock/extract/OCR pipeline, India provider parsers, onboarding
  route group, and wiring the dashboard selectors to the DB.

See `/Users/lovloothra/.claude/plans/` for the approved implementation plan.
