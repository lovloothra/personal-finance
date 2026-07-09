# Load-Bearing Decisions

Written July 2026 as a maintainer handover. This is the **why** behind the
architecture — the decisions that everything else leans on. Any agent or human
proposing a change that conflicts with one of these should treat it as a
product decision requiring the owner's explicit sign-off, not a refactor.

Workflow runbooks live in `.claude/skills/` (indexed in `AGENTS.md`).
Feature plans/specs live in `docs/superpowers/plans` and `docs/superpowers/specs`.

## Product principles

1. **Trust through provenance.** Every number on screen must be traceable to
   its source: each transaction stores which classifier layer decided it, the
   signal, and a human-readable reason, rendered verbatim in the
   ProvenanceDrawer. Never ship a feature that writes a number the user cannot
   trace. This is the product's core differentiator — an opaque "AI finance
   app" is precisely what this is not.
2. **Conservative automation.** A wrong number silently written is far worse
   than an item in the review queue. When confidence is low, suggest — never
   silently apply. The local-ML auto-accept gates (evidence/score/margin/
   allowlist) are this principle as code.
3. **Local-first, single-user, loopback-only.** No hosted backend, no
   telemetry, no cloud sync. Financial data never leaves the machine; Gmail
   access is read-only. Any feature requiring an external service must be
   rejected or redesigned to run locally. "It would be easier with a server"
   is always true and never sufficient.
4. **India-first.** FY runs April–March (`"2025-26"` keys), amounts are paise,
   statement vocabulary is UPI/NEFT/IMPS/RTGS, tax logic is old-vs-new regime.
   Generalizing to other locales is a non-goal until the India experience is
   excellent.

## Technical decisions (decision → why → change only if)

1. **Integer paise for all money.** Floats corrupt financial arithmetic
   invisibly. Change: never.
2. **Deterministic rule layers first; ML only arbitrates weak verdicts.**
   Determinism keeps golden tests stable and explanations honest; the ML layer
   (10) is gated and never outranks user/profile/provider/alias rules. Do NOT
   replace the pipeline with an LLM or opaque model — provenance is the
   product (principle 1). Change only if: explainability is preserved
   per-transaction and the user signs off.
3. **Classifier purity.** All inputs via `ClassifyContext`; no I/O, no
   `Date.now()`. This is what makes the 149-test suite fast and the goldens
   trustworthy. Change: never — extend the context instead.
4. **SQLCipher DB + keychain passphrase; one-secret model.** OAuth tokens are
   sealed under a subkey *derived from the DB passphrase*, so exactly one
   secret needs escrow (see backup-and-recovery skill). Adding a second
   independent secret breaks the recovery story — don't.
5. **`server-only` + react-server condition as an enforced boundary.** The
   bundler, not discipline, keeps DB/keychain code out of the client. Any
   module touching secrets imports `server-only` at the top.
6. **Parser registry with a generic fallback.** Bespoke parsers are written
   only on proven misparse — HDFC/ICICI/Axis/SBI/Kotak deliberately ride the
   generic balance-delta parser. Resist speculative per-bank parsers; each one
   is permanent maintenance.
7. **Packs as versioned JSON seeds; provider `id`s are permanent.** They are
   foreign keys across the DB, profile, and parser registry. Renaming one is
   a data migration, not an edit.
8. **Review queue as the interaction center; feedback is training data.**
   Every user correction becomes a user override AND a local-ML training
   example (the flywheel). New UX should route corrections through this path,
   not around it.
9. **Loopback-origin guard instead of auth.** Single-user app bound to
   127.0.0.1; mutations verify loopback origin as defence-in-depth. Adding
   auth is scope creep; removing the guard is negligence.
10. **Account attribution lives on the DOCUMENT, with recorded provenance.**
    A statement is FROM one account, so `ownAccountId` is decided per
    parsed document (header match → institution-unique fallback → stub →
    manual) and inherited by its transactions; every decision records
    `own_account_source` (`src/ingest/account-reconcile.ts` is the policy).
    The institution-unique fallback never fires for zero-transaction docs
    (demat/TDS/T&C mailers), and account rows are upserted by natural key
    (institutionId + kind + last4) on profile re-seeds — minting fresh ids
    orphaned every attribution once (fixed 2026-07). Change only if:
    provenance stays queryable and re-seeds keep ids stable.

## State of the union (2026-07)

Shipped: full ingest pipeline (Gmail → PDF → parse → classify → store),
7+2-layer classifier, account-aware transactions + counterparty resolution,
suspected-transfer quarantine, canonical flow-keyed taxonomy, local ML v1
(`minilm-softmax-v1`, base model committed in `models/classification/`),
spending triage/report UI, FY-aware rollups, backup snapshot endpoint.

### Known gaps, in priority order

1. **No passphrase escrow prompt.** Backups exist but the passphrase lives
   only in the OS keychain; if the machine dies first, every backup is
   unreadable. The single highest-value next feature is a first-run/settings
   flow that walks the user through escrow (see backup-and-recovery skill).
2. **No restore UI/route** — restore is a documented manual procedure.
3. **Wipe flow unfinished** — `deleteDbPassphrase()` has no caller; a wipe
   that deletes the keychain entry without escrow-or-warn would be
   catastrophic. Build carefully.
4. **Null-provider ingest stub** — documents with unresolved providers are
   flagged for review rather than fully handled (noted in commit 26476d8).
5. **OCR fallback is best-effort** (Tesseract); scanned-statement quality is
   unvalidated at scale. qpdf is an optional external binary for locked PDFs.
6. **Embedding-model upgrades require a re-embed backfill** or the local ML
   silently degrades to never firing (compat filter drops stale embeddings).
7. Lint carries ~14 tolerated `react-hooks` warnings; the real-ONNX embedding
   test is opt-in via `PF_RUN_MODEL_TESTS=1` (skipped by default).
