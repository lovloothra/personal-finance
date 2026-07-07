---
name: debugging-misclassifications
description: Use when a specific transaction has the wrong category, flow, merchant, or transfer flag, when income looks inflated, when a rule change didn't affect existing transactions, or when deciding at which layer a classification fix belongs.
---

# Debugging Misclassifications

## Overview

Never guess at fixes — every transaction records its provenance. Diagnose which layer produced the verdict, fix at the right layer, then handle the stale rows.

## Step 1: Read the provenance

The `transactions` row stores `layer` (which classifier layer matched), `classificationSource` (`deterministic` | `local_ml`), `profileSignalUsed`, and `suspectedTransfer`. The UI's ProvenanceDrawer shows the same plus the human-readable `reason`.

## Step 2: Fix at the layer that fired (or should have)

| Provenance says | Fix |
|---|---|
| `classificationSource = 'local_ml'` (layer 10) | Wrong ML auto-accept — see the local-ml-guardrails skill; correct it via the review UI so it becomes training feedback |
| Layer 1 (user override) | The user set this rule — change the override itself, never code around it |
| Layer 2 (profile) | `src/classifier/profile-rules.ts` or the profile seed signals |
| Layer 3 (provider) | Provider rules from packs — check the pack entry first |
| Layer 4 (merchant alias) | `packs/in/merchants/*.json` or user aliases |
| Layer 5 (keyword) | `src/classifier/keyword-rules.ts` — low confidence by design |
| Layer 6 (recurrence) | `src/classifier/recurrence.ts` |
| Layer 7 (fallback) but a rule SHOULD have matched | The intended rule didn't fire — check its pattern and whether an earlier layer shadows it |
| Wrong `flow = 'transfer'` / wrong `suspectedTransfer` | `src/classifier/transfers.ts` (own-account pairing, round-number credit quarantine) |

Precedence trap: fixing a lower layer does nothing while a higher layer still matches. Verify with a unit test through `classify()` in `src/classifier/pipeline.ts`, not through the individual rule function.

## Rule-vs-teach decision

- **Merchant-specific one-off** (this UPI handle is my gym): correct it in the review UI — it becomes a user override AND local-ML training data. Don't hardcode.
- **Structural pattern** (all statements of provider X, a whole merchant vertical): code/pack rule at the appropriate layer.

## Step 3: Existing rows are stale

The classifier runs only at ingest. After any semantic fix:
- Reclassify path: `src/ingest/reclassify.ts`.
- Or a one-time idempotent backfill (pattern: `scripts/normalize-categories.ts`) — see the running-db-tests-and-scripts skill.
- Income totals wrong is often not a category bug: check `suspectedTransfer` — rollups exclude suspected transfers from income (`src/ledger/rollups.ts`).

## Step 4: Lock it in

Add a colocated guard test named after the bug (existing convention: `profile-emi-guard.test.ts`, `recurrence-guards.test.ts`). Every past classifier fix in this repo shipped with one.
