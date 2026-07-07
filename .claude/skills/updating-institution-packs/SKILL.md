---
name: updating-institution-packs
description: Use when adding banks, brokers, insurers, lenders, credit cards, or merchants to packs/in/*.json, changing merchant alias categories, or when npm run validate:packs or db:load-packs fails or pack-loader golden tests break.
---

# Updating Institution Packs

## Overview

`packs/in/` JSON files seed India institution + merchant data. Flow: edit JSON → `npm run validate:packs` → `npm test` (golden tests) → `npm run db:load-packs` to (re)seed the DB.

## Files

- **Providers**: `banks.json`, `brokers.json`, `credit-cards.json`, `insurers.json`, `investment-platforms.json`, `lenders.json` — validated against `schemas/pack-in.schema.json`.
- **Merchants**: `packs/in/merchants/<vertical>.json` (cabs, food, ott, quick-commerce, …).
- `gmail-templates.json` — sender/query patterns for the Gmail fetcher.

## Provider entry shape

- `id`: kebab-case slug. **Stable forever** — it is the FK everywhere (parser registry keys, profile signals, DB rows). Never rename an existing id.
- `display_name`, `legal_name`, `category`, `type`.
- `aliases`: include the short forms that actually appear in statement/email text (e.g. `"BOB"` for Bank of Baroda).
- `sources[]`: official URL + `retrieved_at`.
- `confidence`: `high | med | low`; `status`: `active`.

## Merchant aliases

The loader lowercases patterns and expects the dotted flow-keyed taxonomy — e.g. category `expenses.transport`, subcategory `cabs`. Golden tests in `tests/pack-loader.test.ts` assert normalization (lowercased patterns, `source: 'pack:in'`, unique ids) — run them after edits.

## Rules

- `validate:packs` BEFORE `db:load-packs` — the loader is more lenient than the schema, so invalid data can slip into the DB.
- `db:load-packs` upserts and is idempotent — safe to re-run after any pack edit.
- Adding a new merchant vertical file? `tools/validate-pack-in.mjs` keeps a `requiredMerchantFiles` list — add the new file there so validation covers it.
- `npm run refresh:packs:in` regenerates provider seeds from registry snapshots; prefer editing seeds via that path for bulk registry updates.
