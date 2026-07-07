---
name: running-db-tests-and-scripts
description: Use when writing or running any test or script that touches the encrypted DB, keychain, Gmail, or other server-only modules — including "server-only cannot be imported" errors, keychain prompts/hangs during tests, a single test file failing that passes under npm test, or writing a one-time backfill script.
---

# Running DB Tests and Scripts

## Overview

Every module that touches the DB, keychain, or secrets imports `server-only`, which throws unless Node runs with `--conditions=react-server`. `npm test` already passes it; ad-hoc invocations must too.

## Commands

| Task | Command |
|---|---|
| All tests | `npm test` |
| Single test file | `node --import tsx --conditions=react-server --test <file>` |
| DB/Gmail script | `tsx --conditions=react-server scripts/<name>.ts` |

Pure modules (classifier, parsers) run without the condition, but including it always works — default to including it.

## Test files that touch the DB

Set env vars BEFORE importing `@/db/client` — the connection is a cached per-process singleton:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-mytest-')), 'test.db');
process.env.PF_DB_PASSPHRASE = 'test-passphrase'; // bypasses OS keychain

import { getDb } from '@/db/client'; // AFTER the env lines
```

- `PF_DB_PASSPHRASE` short-circuits the keychain (src/secrets/keychain.ts). Without it, tests hit the real OS keychain and may prompt or hang.
- `mkdtempSync` per test file: node:test can run files concurrently; a shared path corrupts.
- Golden example: `src/ledger/__tests__/rollups.test.ts`.

## One-time backfill scripts (scripts/*.ts)

When a semantic change invalidates existing rows, follow the established pattern (`scripts/normalize-categories.ts`, `scripts/backfill-account-ids.ts`):

1. Header comment: what/why + the exact run command.
2. **Idempotent** — skip already-migrated rows (`WHERE new_field IS NULL`, or compare-before-write) so re-running is a no-op.
3. Reuse live pipeline functions (single source of truth) — never reimplement extraction/normalization inline in the script.
4. Wrap writes in `db.transaction(...)`; print an `updated/total` summary.
5. Rehearse against a throwaway DB first:
   `PF_DB_PATH=/tmp/pf-rehearsal.db tsx --conditions=react-server scripts/<name>.ts`

## Common mistakes

- Importing `@/db/client` before setting `PF_DB_PATH` → the test opens the REAL `data/personal-finance.db`.
- Running a DB test file directly without `--conditions=react-server` → `server-only` throw.
- Opening `data/personal-finance.db` with plain `sqlite3` → "file is not a database" (it's SQLCipher-encrypted).
