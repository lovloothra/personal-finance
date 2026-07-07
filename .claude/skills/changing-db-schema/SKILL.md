---
name: changing-db-schema
description: Use when adding or changing tables/columns in src/db/schema.ts, generating or repairing Drizzle migrations, or when migrations fail to apply, drizzle-kit generate produces an unexpected diff, or the migration chain/journal looks broken.
---

# Changing the DB Schema

## Overview

Schema source of truth is `src/db/schema.ts`. Migrations are generated SQL in `src/db/migrations/`, applied automatically by `getDb()` (src/db/client.ts) on next process start. The DB is SQLCipher-encrypted — plain `sqlite3` cannot open it.

## Workflow

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` — creates `NNNN_<name>.sql`, `meta/NNNN_snapshot.json`, and a `meta/_journal.json` entry.
3. Read the generated SQL — drizzle-kit sometimes rebuilds whole tables for small changes.
4. Rehearse on an ephemeral DB before the real one applies it:
   ```sh
   PF_DB_PATH=/tmp/pf-migrate-test.db PF_DB_PASSPHRASE=test PF_DB_STRICT_MIGRATE=1 \
     node --import tsx --conditions=react-server --test src/ledger/__tests__/rollups.test.ts
   ```
   (any DB-touching test forces a fresh migrate run)
5. Restart the dev server to apply to the real DB.

## Column conventions (match existing schema)

| Kind | Convention |
|---|---|
| Primary key | `text`, app-generated UUID or slug |
| Money | integer **paise**, signed — never float |
| Timestamps | epoch milliseconds, `integer` |
| Booleans | `integer({ mode: 'boolean' })` |
| Structured blobs | `text({ mode: 'json' })` with `$type<>()` |

## The stale-snapshot trap (broke this repo once — commit bdcc358)

`drizzle-kit generate` diffs schema.ts against the **latest meta snapshot**, not the DB. If you regenerate after hand-editing a migration, deleting one, or with snapshot drift, the new migration is diffed against the wrong baseline and the chain breaks (duplicate columns / missing tables at migrate time).

- Never hand-edit generated SQL or snapshots.
- To redo a migration: delete its `.sql` AND its `meta/*_snapshot.json` AND its `_journal.json` entry, then regenerate. All three or none.
- One `db:generate` per schema change; don't stack unapplied schema edits.

## Common mistakes

- **Silent failure**: by default migrate errors are only console warnings and the app continues. Set `PF_DB_STRICT_MIGRATE=1` to make them fatal when testing a migration.
- Editing schema.ts and forgetting `db:generate` — the DB silently drifts from the schema.
- Adding a NOT NULL column without a default to a populated table — SQLite rejects it; add a default or ship a backfill script (see the running-db-tests-and-scripts skill).
