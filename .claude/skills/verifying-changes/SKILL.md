---
name: verifying-changes
description: Use before claiming any change works, when deciding how to test a change end-to-end, when needing a dev server that won't touch the real encrypted DB, when a page shows data despite an empty DB, or when a mutating API call is rejected during manual testing.
---

# Verifying Changes

## Overview

Prove it, don't assert it. Pick the cheapest rung that actually exercises the change, and never point verification at the user's real data.

## The ladder

1. **`npm run lint` + `npm test`** — always. Tests are fast (<1s for the full suite).
2. **`npm run build`** — required when touching `app/`, `src/ui/`, or anything importing `server-only`. The build is what catches server-only modules leaking into client components; dev mode can miss it.
3. **Dev server against a SCRATCH DB** — for UI/API/onboarding flows, use the `dev-fresh` launch config (`.claude/launch.json`): port 3001, `PF_DB_PATH=tmp/fresh-onboarding-test.db`, scratch profile via `PF_PROFILE_PATH`, no real OAuth client. Safe to exercise setup/import flows destructively.
4. **`dev` config (port 3000)** — runs against the REAL encrypted DB and profile. Read-only checks only; never drive imports, wipes, or settings mutations here.

## Gotchas that fake a pass

- **Demo fixtures**: with an empty DB, pages render sample data from `src/ui/lib/fixtures.ts` (pre-import state). Seeing populated dashboards does NOT mean your ingest/API change worked — confirm the data came from the DB (e.g. hit the API route directly or insert a known row).
- **Loopback guard**: mutating API routes verify the request originates from the loopback app (`src/server/api.ts`). If a manual `curl` mutation is rejected, send an `Origin: http://127.0.0.1:3001` header — don't weaken the guard.
- **Migration failures are strict by default** (boot throws); `PF_DB_STRICT_MIGRATE=0` exists only for early bootstrap.

## What cannot be driven locally

Gmail OAuth and live fetch need real credentials and a browser consent flow. Verify ingest-side changes through unit tests and text fixtures (parser/classifier layers are pure — see their skills), not by attempting a live Gmail round trip.

## Per-area map

| Change touches | Minimum verification |
|---|---|
| Parsers / classifier / ledger (pure) | Colocated unit tests through the public entry (`classify()`, `parseStatement()`) |
| DB schema / migrations | Ephemeral-DB test (migrate failures throw by default; see changing-db-schema skill) |
| API routes | `dev-fresh` server + curl or the UI, then check the response AND the DB row |
| UI components | `dev-fresh` server; confirm real-data path, not just fixtures |
| Packs | `npm run validate:packs` + golden tests (`tests/pack-loader.test.ts`) |
