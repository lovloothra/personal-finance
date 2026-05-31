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
- `npm test` — run the Node test suite (pack validators + golden fixtures)
- `npm run validate:packs` — validate India pack JSON against `schemas/pack-in.schema.json`
- `npm run refresh:packs:in` — refresh India institution seeds from upstream sources

## Privacy guarantees

- Gmail is accessed **read-only**.
- No telemetry, no hosted backend, no external enrichment API.
- All downloaded attachments, the SQLite database, OAuth tokens, exports, and the editable profile are gitignored.
- Sensitive values are masked in the UI by default.

## Repo layout

- `app/` — Next.js App Router pages and route handlers
- `src/ui/` — shell, primitives, page components (workbench UI)
- `src/styles/` — design tokens and workbench CSS (ported from the design handoff)
- `packs/in/` — India institution seeds (banks, credit cards, brokers, insurers, lenders, merchants)
- `schemas/`, `tools/`, `scripts/`, `tests/` — pack schema, validator, refresh script, and tests

## Status

v0.1 — the workbench UI runs against fixture data while the local DB, Gmail ingestion, PDF pipeline,
classifier, and tax module land iteratively. See `/Users/lovloothra/.claude/plans/` for the approved implementation plan.
