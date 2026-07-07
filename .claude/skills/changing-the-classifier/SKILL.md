---
name: changing-the-classifier
description: Use when transactions are miscategorized, when adding or changing classification rules, transfer detection, taxonomy categories, or counterparty resolution, or when a new rule doesn't fire or fires at the wrong priority.
---

# Changing the Classifier

## Overview

`src/classifier/pipeline.ts` runs 7 layers in strict priority order; the first match wins. Layers 8–9 (transfer dedupe, project isolation) re-stamp verdicts afterwards. The verdict shape maps 1:1 to the ProvenanceDrawer in the UI — always fill an honest human-readable `reason` and machine `signal`.

## Iron rule: purity

No DB calls, no I/O, no `Date.now()` anywhere inside `src/classifier/`. Every input arrives through `ClassifyContext` (built in `src/ingest/context.ts`). Need new data in a rule? Extend `ClassifyContext` and the context builder — never fetch inside a layer. This keeps the pipeline deterministic and golden tests stable.

## Where changes go

| Change | File |
|---|---|
| Layer rule logic | `profile-rules.ts` / `provider-rules.ts` / `merchant-aliases.ts` / `keyword-rules.ts` / `recurrence.ts` |
| Transfer detection / suspected transfers | `transfers.ts` |
| Counterparty resolution | `counterparties.ts` |
| Category names | `taxonomy.ts` (canonical flow-keyed taxonomy; use `normalizeCategory`) |
| Description normalization / signatures | `normalize.ts` — careful: user-override signatures depend on it |

## Priority gotchas

- A new rule that never fires is usually **shadowed by an earlier layer** — check the order in `pipeline.ts` before debugging your rule.
- Changing `signature()` in `normalize.ts` invalidates existing user overrides and recurrence-index keys. Treat it as a breaking change requiring a backfill.
- Category strings must be canonical: run new/edited category output through `normalizeCategory`. Downstream matching (ledger rollups) is case-insensitive as a guard, but storage should be canonical.

## After semantic changes: backfill

The classifier only runs at ingest — changing categories or flags leaves existing DB rows stale. Ship a one-time idempotent script (pattern: `scripts/normalize-categories.ts`); see the running-db-tests-and-scripts skill. The reclassification path lives in `src/ingest/reclassify.ts`.

## Testing

Tests are colocated in `src/classifier/__tests__/` and are pure — no DB env needed:

```sh
node --import tsx --test src/classifier/__tests__/<file>.test.ts
```

Build a full `ClassifyContext` literal per test. Add a guard test for every bug fixed, named after the guard (existing examples: `profile-emi-guard.test.ts`, `recurrence-guards.test.ts`).
