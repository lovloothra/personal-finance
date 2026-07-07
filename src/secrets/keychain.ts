/**
 * OS keychain access for the SQLCipher passphrase.
 *
 * Local-first guarantee: the passphrase that unlocks the encrypted SQLite DB
 * is stored in the operating-system keychain (macOS Keychain, libsecret on
 * Linux, Windows Credential Manager) via keytar. It never touches disk in
 * plaintext, is never written to a config file, and never leaves the machine.
 */
import keytar from 'keytar';
import { randomBytes } from 'node:crypto';

/** Keychain service namespace for this app. */
export const KEYCHAIN_SERVICE = 'personal-finance';

/** Account key under which the DB passphrase is stored. */
export const DB_PASSPHRASE_ACCOUNT = 'db-passphrase';

/**
 * Generate a high-entropy passphrase. 32 random bytes, base64url-encoded.
 * This is used as the SQLCipher key; the user never types it.
 */
export function generatePassphrase(): string {
  return randomBytes(32).toString('base64url');
}

/** Read the DB passphrase from the OS keychain, or null if none stored yet. */
export async function getDbPassphrase(): Promise<string | null> {
  return keytar.getPassword(KEYCHAIN_SERVICE, DB_PASSPHRASE_ACCOUNT);
}

/** Persist the DB passphrase into the OS keychain. */
export async function setDbPassphrase(passphrase: string): Promise<void> {
  await keytar.setPassword(KEYCHAIN_SERVICE, DB_PASSPHRASE_ACCOUNT, passphrase);
}

/** Remove the DB passphrase from the OS keychain (used by the wipe flow). */
export async function deleteDbPassphrase(): Promise<boolean> {
  return keytar.deletePassword(KEYCHAIN_SERVICE, DB_PASSPHRASE_ACCOUNT);
}

/**
 * Return the existing passphrase, generating and storing one on first run.
 * This is the single entry point the DB client uses to unlock the database.
 */
export async function ensureDbPassphrase(): Promise<string> {
  if (process.env.PF_DB_PASSPHRASE) return process.env.PF_DB_PASSPHRASE;
  const existing = await getDbPassphrase();
  if (existing) return existing;
  const fresh = generatePassphrase();
  await setDbPassphrase(fresh);
  return fresh;
}
