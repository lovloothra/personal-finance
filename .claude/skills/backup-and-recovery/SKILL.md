---
name: backup-and-recovery
description: Use when the user asks about backups, restoring data, moving to a new machine, a lost or reset keychain, when getDb() throws right after restoring a backup file, or when setting up a fresh clone. Also use BEFORE any change that touches data/, the keychain, or the wipe/reset surface.
---

# Backup and Recovery

## The one-secret model

Everything decryptable reduces to ONE secret: the SQLCipher passphrase, auto-generated on first run (32 random bytes) and stored ONLY in the OS keychain — service `personal-finance`, account `db-passphrase` (`src/secrets/keychain.ts`). The user has never seen or typed it. OAuth-token envelopes use a subkey **derived from the same passphrase** (`src/secrets/crypto.ts`), so escrowing the passphrase covers everything.

**A backup is only real if BOTH exist off-machine:**
1. A DB snapshot — `POST /api/settings/backup` runs `VACUUM INTO exports/personal-finance-backup-<stamp>.db` (consistent, still encrypted, safe to copy anywhere).
2. The escrowed passphrase — without it the snapshot is cryptographically dead weight.

`exports/` is gitignored and local. The snapshot must be copied off the machine to count.

## Escrowing the passphrase (macOS)

Have the USER run this in a private terminal and store the output in their password manager:

```sh
security find-generic-password -s personal-finance -a db-passphrase -w
```

**Agent rule: never run this yourself** — it prints the secret into logs/transcripts. Instruct the user; don't execute.

## Restore on a new machine — ORDER MATTERS

1. Clone repo, `npm install`.
2. Put the escrowed passphrase into the keychain FIRST:
   `security add-generic-password -s personal-finance -a db-passphrase -w '<passphrase>'`
3. Copy the backup snapshot to `data/personal-finance.db`.
4. Start the app.

If you start before step 2, `ensureDbPassphrase()` generates a NEW passphrase; `getDb()` then throws on the old file (the `PRAGMA user_version` key check fails). Fix: delete the wrong keychain entry, add the correct one. Restoring DB + passphrase also restores sealed Gmail tokens — usually no re-auth needed.

There is no restore API route or UI — restore is exactly the manual copy above.

## What lives where

| In git (fresh clone has it) | Local-only (must be carried over) |
|---|---|
| Code, packs, migrations | `data/personal-finance.db` (via backup + passphrase) |
| MiniLM base model (`models/classification/`) | `secrets/profile.local.json`, Google OAuth client JSON |
| Schemas, docs, skills | `attachments/` (re-downloadable from Gmail), `exports/` |

## Total-loss scenario

Lost machine AND no escrowed passphrase = the data is gone **by design**; there is no back door. Recovery is re-onboarding: `db:load-packs` → `profile:seed` → `gmail:auth` → `gmail:fetch` → `ingest` (Gmail still holds the source statements). User overrides, review history, and local-ML training data are NOT recoverable this way — which is why escrow matters.

## Danger zones for agents

- The wipe flow is unfinished: `deleteDbPassphrase()` exists but nothing calls it. If implementing wipe/reset, escrow-or-warn BEFORE deleting the keychain entry.
- Never suggest "just regenerate the passphrase" — that permanently orphans the existing DB and every backup of it.
