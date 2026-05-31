/**
 * Encrypted SQLite connection.
 *
 * Boot sequence:
 *   1. Resolve the SQLCipher passphrase from the OS keychain (generating one
 *      on first run — see src/secrets/keychain.ts).
 *   2. Open ./data/personal-finance.db with the SQLCipher cipher + key set
 *      BEFORE any other statement runs.
 *   3. Run pending migrations from src/db/migrations.
 *
 * The DB file lives under the gitignored ./data directory. Nothing here ever
 * reaches the network. This module is server-only.
 */
import 'server-only';
import Database from 'better-sqlite3-multiple-ciphers';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ensureDbPassphrase } from '@/secrets/keychain';
import * as schema from './schema';

export type DB = BetterSQLite3Database<typeof schema>;

const DEFAULT_DB_PATH = join(process.cwd(), 'data', 'personal-finance.db');
const MIGRATIONS_DIR = join(process.cwd(), 'src', 'db', 'migrations');

let cached: { db: DB; raw: Database.Database } | null = null;

/** Path of the encrypted DB file (override via PF_DB_PATH for tests). */
export function dbPath(): string {
  return process.env.PF_DB_PATH ?? DEFAULT_DB_PATH;
}

/**
 * Open (or return the cached) encrypted DB connection. Idempotent within a
 * process. Throws if the keychain is unavailable or the key is wrong.
 */
export async function getDb(): Promise<DB> {
  if (cached) return cached.db;

  const passphrase = await ensureDbPassphrase();
  const file = dbPath();
  mkdirSync(dirname(file), { recursive: true });

  const raw = new Database(file);
  // SQLCipher key must be set before any other access.
  raw.pragma(`cipher='sqlcipher'`);
  raw.pragma(`key='${passphrase.replace(/'/g, "''")}'`);
  // Sanity check that the key actually decrypts the DB.
  raw.exec('PRAGMA user_version;');
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');

  const db = drizzle(raw, { schema });

  try {
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  } catch (err) {
    // Migrations may not be generated yet during early bootstrap; surface a
    // clear hint rather than a cryptic failure.
    if (process.env.PF_DB_STRICT_MIGRATE === '1') throw err;
    console.warn(
      '[db] migrations not applied (run `npx drizzle-kit generate`):',
      (err as Error).message,
    );
  }

  cached = { db, raw };
  return db;
}

/** Close the connection (used by tests and the wipe flow). */
export function closeDb(): void {
  if (cached) {
    cached.raw.close();
    cached = null;
  }
}
