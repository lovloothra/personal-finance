---
name: local-ml-guardrails
description: Use when touching src/intelligence/ (local MiniLM classifier), changing auto-accept thresholds or the category allowlist, when ML predictions don't fire or don't auto-accept, when upgrading the embedding model, or when classificationSource='local_ml' transactions look wrong.
---

# Local ML Guardrails

## Overview

Layer 10 is a local softmax head over MiniLM embeddings (onnxruntime, `models/classification/`), trained on the user's own review feedback. It may replace a WEAK deterministic verdict at ingest — behind gates that must never be weakened casually, because a bad auto-accept silently corrupts the ledger.

## Decision flow (`decideClassification` in src/intelligence/local-model.ts)

eligibility gate → state ready + head trained → compatible examples exist → embed txn text → softmax predict → flow compatibility → auto-accept **or** downgrade to a suggestion. Any gate failing ⇒ the deterministic verdict stands untouched.

## Invariants — do not weaken without explicit user sign-off

| Invariant | Where |
|---|---|
| ML only runs on weak verdicts: `reviewRequired`, `confidence 'low'`, or fallback layer | `isLocalPredictionEligible` |
| ML never outranks layers 1–4 (override/profile/provider/alias), transfer dedupe, tax-tagged, or project-isolated verdicts | `isLocalPredictionEligible` |
| ML never predicts `transfer`; credits → income only; debits → expense/investment only | `isPredictionFlowCompatible` |
| Auto-accept requires ALL of: evidence ≥ 2, score ≥ 0.9, margin ≥ 0.65, category in `CATEGORY_ALLOWLIST`, flow compatible | `canAutoAccept` |
| Anything below the bar becomes `reviewStatus 'suggested'` — surfaced to the user, never silently applied | `decideClassification` |
| `decideClassification` is pure (state passed in, no DB) — persistence happens in the ingest pipeline via `recordLocalDecision` | src/intelligence/store.ts |

## Training data lifecycle

- Feedback sources: review assignment, user override, suggestion accept (`app/api/review/assign`, `app/api/review/suggestions/[id]/accept`) → `classificationFeedback` + `localModelExamples` tables → `trainSoftmaxHead` → `localClassifierHeads`.
- Examples carry `embeddingModelId`. **Upgrading the embedding model invalidates all stored embeddings** — the compat filter (`isExampleCompatible`) silently drops mismatched examples, so the model degrades to "never fires" until embeddings are regenerated. Plan a re-embed backfill with any model upgrade.
- Cross-institution leakage is blocked: examples with a different `institutionId` than the txn are excluded.

## Debugging

- **Prediction never fires**: check the eligibility gate FIRST — a strong deterministic verdict (layers 1–4, high confidence) correctly suppresses ML. Then: head trained? compatible examples ≥ 1? embedding runtime available?
- **Fires but won't auto-accept**: check which of the five `canAutoAccept` gates failed; `classificationPredictions` stores full provenance (margin, evidenceCount, distribution, nearest examples).
- **Wrong auto-accept**: correct via the review UI (creates counter-feedback), then check whether thresholds or the allowlist admitted a category that needs more evidence.

## Testing

`src/intelligence/__tests__/` — `local-model.test.ts` is pure; `store.test.ts` needs the ephemeral-DB env setup (see running-db-tests-and-scripts skill). The real-ONNX embedding test is opt-in: `PF_RUN_MODEL_TESTS=1 npm test` (skipped by default so the suite stays fast).
