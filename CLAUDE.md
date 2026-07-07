# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Workflow-specific runbooks live in `.claude/skills/*/SKILL.md` (auto-discovered
by Claude Code; indexed for other agents in `AGENTS.md`). Consult the matching
skill before schema/migration work, DB tests/scripts, parser or classifier
changes, pack edits, local-ML changes, backup/recovery/keychain work, or before
claiming a change verified. `docs/DECISIONS.md` records the load-bearing
architecture and product decisions — read it before proposing structural changes.

## Commands

```sh
npm run dev              # start dev server on 127.0.0.1:3000
npm run build            # production build
npm run lint             # ESLint (flat config, eslint-config-next)
npm test                 # run all tests (Node built-in test runner)
npm run db:generate      # generate Drizzle SQL migrations from schema.ts
npm run db:load-packs    # seed India institution + merchant data into encrypted DB
npm run ingest           # process downloaded attachments → parsed docs → classified transactions
npm run validate:packs   # validate packs/in/*.json against schemas/pack-in.schema.json
```

**Run a single test file** (always include the react-server condition — pure
modules don't need it, but DB-touching tests fail without it, and it never hurts):
```sh
node --import tsx --conditions=react-server --test src/classifier/__tests__/pipeline.test.ts
```

**Scripts that touch the DB or Gmail require the react-server condition:**
```sh
tsx --conditions=react-server scripts/some-script.ts
```

## Architecture

This is a local-first, single-user Next.js app with no hosted backend. All state lives in an encrypted SQLite database at `data/personal-finance.db`.

### Data layer

- **DB**: SQLCipher-encrypted SQLite via `better-sqlite3-multiple-ciphers`. Passphrase is stored in the OS keychain (`src/secrets/keychain.ts`) and set as the very first PRAGMA before any query runs.
- **Schema + ORM**: Drizzle ORM. Schema is the source of truth in `src/db/schema.ts`; migrations live in `src/db/migrations/`. Run `db:generate` after schema changes, then restart the app to apply.
- **Singleton connection**: `src/db/client.ts` caches one connection per process. Use `PF_DB_PATH` to override the DB path (used in tests). Set `PF_DB_STRICT_MIGRATE=1` to make migration failures fatal.
- **Money**: All monetary amounts are stored as **integer paise** (₹1 = 100 paise). Never use floats for money.

### Security model

- `server-only` is imported at the top of every module that touches the DB, keychain, or secrets — enforced by Next.js bundler.
- OAuth tokens are additionally sealed per-row with libsodium (`src/secrets/crypto.ts`) before being written to the encrypted DB.
- `data/`, `attachments/`, `exports/`, `secrets/` are gitignored — never commit these.

### Ingest pipeline

The core flow is: **Gmail fetch → PDF unlock → text extract → parser dispatch → classify → store**.

1. `src/gmail/` — read-only OAuth, query builder, attachment downloader.
2. `src/pdf/` — password candidates derived from profile, `pdf.js` unlock + text extraction, OCR fallback via Tesseract.
3. `src/parsers/` — `registry.ts` dispatches by `${providerId}:${docType}`. Unrecognized providers fall through to `in/generic-bank.ts`. Register new parsers via `registerParser()`.
4. `src/ingest/pipeline.ts` — orchestrates the full flow for all pending attachments; idempotent (only processes `status = 'pending'` rows).

### Classifier

`src/classifier/pipeline.ts` runs 7 layers in strict priority order:
1. User overrides (exact signature match)
2. Profile rules (salary, EMI, rent, insurance, SIP, CC payments)
3. Provider rules (from institution packs)
4. Merchant aliases (pack + user-defined)
5. Keyword rules (low confidence)
6. Recurrence (subscription cadence)
7. Fallback → review queue

The pipeline is **pure and deterministic** — all inputs come through `ClassifyContext`. Never add side effects or DB calls inside classifier functions.

### Institution packs

India institution data lives in `packs/in/`. The pack loader (`src/packs/`) reads these JSON seeds and the DB is populated via `npm run db:load-packs`. Pack schema is validated against `schemas/pack-in.schema.json`.

### UI data flow

- Pages in `app/` are Next.js App Router pages (RSC by default).
- API routes under `app/api/` use shared helpers from `src/server/`.
- Client components and data hooks live in `src/ui/`.
- Pages fall back to demo fixtures when no real data exists (pre-import state).

### Financial year

India FY runs April–March. FY helpers are in `src/ledger/fy.ts`. FY key format: `"2025-26"`. Tax comparison logic (old vs new regime) is in `src/tax/`.

### Profile

`src/profile/` owns the profile seed schema (`src/profile/types.ts`), DB persistence, and signal adapters that feed the classifier context (PDF password candidates, salary/rent/EMI detection, etc.). The profile shape is documented in `secrets/profile.local.json` (gitignored).

## Key conventions

- Text primary keys are app-generated UUIDs or slugs.
- Timestamps are epoch milliseconds stored as `INTEGER`.
- Booleans use `integer({ mode: 'boolean' })`.
- Structured blobs use `text({ mode: 'json' })` with a typed `$type<>()`.
- `Confidence` type: `'high' | 'med' | 'low'`.
- `Flow` type: `'income' | 'expense' | 'transfer' | 'investment'`.

## Testing notes

Tests use the Node.js built-in test runner (`node:test`). Test files are colocated as `__tests__/` subdirectories or placed in the top-level `tests/` folder. Tests that require DB access use `PF_DB_PATH` to point at an ephemeral test DB.
