# Goal Backlog

Self-contained project briefs, runnable as `/goal` prompts by any agent.
Each has a measurable baseline and acceptance criteria — run the referenced
eval BEFORE starting (record the baseline) and AFTER finishing (prove movement).
Read `docs/DECISIONS.md` first; goals must not violate the product principles.
Status: `[ ]` open · `[~]` in progress · `[x]` done (date).

---

## [x] G1 — Every transaction references a correct bank/card account (2026-07-09)

**Objective:** 100% of transactions carry a verified `ownAccountId`/`ownAccountKind`.
**Outcome:** `[accounts]` 100.0% (2835/2835), with a new orphaned-id metric at 0.
The true baseline was 0%, not 59.2% — the old metric counted ids orphaned by
profile re-seeds (each save minted fresh account ids). Shipped: deep-header +
standalone-masked-card extraction (scoped to the pre-table header region so
txn narrations can never match — the 74693e3 lesson, negative-tested); card
statements detected from document text and resolved against `-cards` issuer
accounts; institution-unique fallback with recorded `own_account_source`
provenance (never fires for zero-txn docs); document-level assign-account
flow in triage (`AssignAccountPanel` + `/api/review/assign-account`, stamps
the document plus its transactions as `user_assigned`); profile re-seeds now
upsert accounts by natural key; repair backfill re-stamped both populations.
Unregistered accounts stub + review item — never a silent NULL. 18
zero-transaction docs (demat/TDS/T&C/summary mailers) stay honestly
unassigned, resolvable via the assign flow. See DECISIONS.md #10.

## [ ] G2 — Zero duplicate transactions, ever

**Objective:** The same real-world transaction can never appear twice, regardless of statement overlap.
**Current state:** Dedup is **batch-local only** (`src/ingest/pipeline.ts` ~line 266: `date|amount|signature` within one run). A later ingest run processing a new attachment that overlaps an already-ingested period will insert duplicates.
**Baseline:** `npm run eval:ledger` → `[duplicates]` line.
**Work:** Extend the dedup key check against already-stored transactions (same key + `ownAccountId`); decide the edge policy for genuinely identical same-day txns (two ₹100 coffees → keep both when balance chain proves distinct, else review item — never silent-drop real spending); add a one-time cleanup script for existing dupes (idempotent, backfill pattern); regression test with two overlapping statement fixtures ingested in **separate** runs.
**Accept when:** `[duplicates]` shows 0 groups after cleanup, and the overlapping-statement regression test passes.
**Start with:** running-db-tests-and-scripts skill; `src/ingest/pipeline.ts`.

## [ ] G3 — Every transaction categorised with the best available guess

**Objective:** No transaction shows "Uncategorised" — low-confidence ones display the most probable category (the one the user would most likely pick) instead.
**⚠ Principle guard (DECISIONS.md #2):** best-guess must be *honest*: keep `confidence: 'low'`, `reviewRequired: true`, and a reason that says it's a guess. Fill the display, never fake the certainty. Rollups may need a "confirmed vs provisional" split.
**Current state:** Layer 7 fallback → Uncategorised + review queue. The local ML already produces a ranked distribution (`localPrediction.provenance.distribution`) even when below auto-accept gates — today that surfaces only as a suggestion, not as the displayed category.
**Baseline:** `npm run eval:ledger` → `[categories]` line.
**Work:** Use the top ML distribution entry (flow-compatible) as the provisional category for fallback verdicts; below-ML-floor cases can fall back to nearest merchant-token match; review UI pre-selects the guess (one-tap confirm — each confirm feeds the training flywheel); measure guess-acceptance rate (how often the user confirms vs changes) as the quality metric.
**Accept when:** uncategorised = 0%, review queue still lists every provisional txn, and guess-acceptance rate is measured and reported (target ≥70% before trusting it further).
**Start with:** local-ml-guardrails + changing-the-classifier skills; `src/intelligence/local-model.ts`, `src/ingest/review-items.ts`.

## [ ] G4 — Passphrase escrow flow (highest-priority gap)

**Objective:** A first-run/settings flow that walks the user through saving the DB passphrase in their password manager, so backups are actually recoverable.
**Why:** Today a dead laptop = every backup unreadable (see backup-and-recovery skill). This is the #1 gap in DECISIONS.md.
**Work:** Settings card + onboarding step: reveal passphrase (from keychain, on explicit click, never logged), confirm-saved checkbox persisted; nag banner on the backup screen until confirmed.
**Accept when:** Fresh onboarding can't be completed without seeing the escrow step; backup endpoint response notes escrow status.
**Start with:** backup-and-recovery skill; `src/secrets/keychain.ts`, `app/api/settings/backup/route.ts`, `app/onboarding`.

## [ ] G5 — Restore + wipe flows, done safely

**Objective:** In-app restore from a snapshot in `exports/`, and a wipe flow that cannot destroy data silently.
**Current state:** No restore route/UI; `deleteDbPassphrase()` exists with no caller.
**Work:** Restore = pick snapshot → integrity-check (open with current key) → swap files with a pre-swap safety copy. Wipe = require typed confirmation + escrow-or-warn BEFORE deleting the keychain entry.
**Accept when:** Round-trip test passes (backup → wipe → restore → identical row counts), and wipe without escrow confirmation is impossible.
**Start with:** backup-and-recovery skill (danger zones section).

## [ ] G6 — Transfer-pair closure & income integrity

**Objective:** Every internal transfer has both legs linked; zero `suspectedTransfer` rows older than 30 days.
**Why:** Unresolved suspected transfers permanently distort income (they're excluded from rollups as a guard, but the truth is unresolved).
**Baseline:** `npm run eval:ledger` → `[transfers]` line.
**Work:** Pair-matching pass across accounts (±1-2 days, opposite signs, equal amounts) for existing rows; review UI flow to confirm/reject suspects in bulk; recurring-counterparty learning (confirmed once → auto-link next month).
**Accept when:** suspected count trends to 0 and stays there across two ingest cycles; income rollup before/after documented.
**Start with:** debugging-misclassifications skill; `src/classifier/transfers.ts`, `internal_transfer_links` table.

## [ ] G7 — Statement completeness & balance-chain verification

**Objective:** Detect missing statement periods and broken running-balance chains per account — catch missing data, not just miscategorised data.
**Why:** All downstream numbers assume complete ingestion; today nothing verifies it.
**Work:** Per account: order txns by date, verify `balance[n-1] + amount[n] ≈ balance[n]` where parsers captured running balance; flag month gaps between earliest and latest statement; surface as a completeness card per FY.
**Accept when:** eval:ledger (extend it) reports a completeness metric per account-FY, and a deliberately deleted month is detected in a test fixture.
**Start with:** adding-a-parser skill (balance semantics); `src/ledger/fy.ts`.

## [ ] G8 — FY tax evidence pack

**Objective:** One command/page per FY: all 80C/80D/80CCD1B/24b-tagged transactions grouped by section with totals, old-vs-new regime comparison, exportable.
**Current state:** `taxSection` is stamped by profile/keyword rules; `src/tax/` has regime comparison; no evidence rollup.
**Work:** Section rollup + gap detection (e.g. ELSS SIP present but no 80D premium found → prompt), export via `exports/`.
**Accept when:** For a seeded FY fixture, the pack lists every tagged txn, totals match manual sums, both regime numbers render.
**Start with:** `src/tax/`, `src/ledger/rollups.ts`, taxSection column.

## [ ] G9 — Local-ML precision loop

**Objective:** Measure (then raise) auto-accept precision: of `classificationSource='local_ml'` transactions, how many did the user later correct?
**Why:** The gates (0.9 score / 0.65 margin / evidence 2) were set by judgment, not data. Guardrails say don't weaken them casually — this builds the data to tune them *knowingly*.
**Work:** Join corrections (`classificationFeedback`) against ML-decided txns; report precision per category; extend `eval:ledger`; build the re-embed backfill tool for embedding-model upgrades (required by local-ml-guardrails skill).
**Accept when:** Precision metric in eval:ledger; documented recommendation (keep/raise/lower gates) with data; re-embed script exists and is idempotent.
**Start with:** local-ml-guardrails skill; `src/intelligence/store.ts`.

## [ ] G11 — Triage UX overhaul: from chip wall to ranked decisions

**Objective:** Make categorising a transaction a 2-second, keyboard-first decision instead of scanning 24 chips.
**Why:** 1,800 items sit in review (G3 baseline); the current per-card taxonomy dump makes triage feel endless, and the forced merchant prefill ("Mobile Banking Sh Idfb") poisons override + ML training data with junk merchants. Fixing this UI is also the engine for G3 and G9 — every faster correction is a training example.
**⚠ Read `.claude/skills/review-ui-conventions/SKILL.md` first** — it maps the components, the invariants (flow stays server-derived; every assign is training data), and the six verified dead-ends.
**Work:** Ranked top-3–5 category shortlist (from ML distribution + amount/counterparty context) with typeahead for the rest; always-available "mark as transfer" on debit groups; merchant field optional and never junk-prefilled; display labels instead of snake_case keys; count-based progress framing in the group header; complete the keyboard flow (`1`–`5` pick, `Enter` assign, `x` transfer, `u` undo).
**Accept when:** A full assign is possible without the mouse; default card shows ≤6 category options; transfer is reachable on every debit group; no assign writes a merchant the user didn't type or explicitly accept; review-queue count drops measurably in one real session (`npm run eval:ledger` before/after).
**Start with:** review-ui-conventions + verifying-changes skills; `src/ui/pages/spending/GroupRow.tsx`, `TriageView.tsx`.

## [ ] G10 — Data-quality dashboard in-app

**Objective:** Surface `eval:ledger` metrics (G1/G2/G3/G6 baselines) as an in-app "data health" card so drift is visible without running a terminal command.
**Work:** API route computing the same metrics (share the logic — extract from `evals/ledger-health.eval.ts` into `src/ledger/health.ts`, eval becomes a thin CLI over it); small dashboard card with per-metric status.
**Accept when:** Card matches eval output exactly on the same DB; metrics logic has one source of truth.
**Start with:** verifying-changes skill (dev-fresh); `app/api/dashboard`.
