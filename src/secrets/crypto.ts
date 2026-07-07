/**
 * Row-level secret wrapping with libsodium secretbox.
 *
 * The whole DB is already SQLCipher-encrypted at rest. OAuth tokens are the
 * single most sensitive payload, so they get a second envelope: each token is
 * sealed with XSalsa20-Poly1305 (crypto_secretbox) under a subkey derived from
 * the DB passphrase. This means a token row is useless even if extracted from a
 * decrypted DB snapshot without also knowing the passphrase + derivation salt.
 */
import sodium from 'libsodium-wrappers';

let ready = false;
async function ensureSodium(): Promise<typeof sodium> {
  if (!ready) {
    await sodium.ready;
    ready = true;
  }
  return sodium;
}

/** Fixed application context for subkey derivation (8 bytes for kdf). */
const KDF_CONTEXT = 'pf-token';

/**
 * Derive a 32-byte secretbox key from the passphrase.
 * We hash the passphrase to a 32-byte master key, then derive a labelled
 * subkey so the raw passphrase is never used directly as the encryption key.
 */
async function deriveKey(passphrase: string): Promise<Uint8Array> {
  const s = await ensureSodium();
  const master = s.crypto_generichash(
    s.crypto_kdf_KEYBYTES,
    s.from_string(passphrase),
    null,
  );
  return s.crypto_kdf_derive_from_key(
    s.crypto_secretbox_KEYBYTES,
    1,
    KDF_CONTEXT,
    master,
  );
}

/**
 * Encrypt a UTF-8 string. Returns a single base64 string packing
 * nonce || ciphertext, suitable for storing in a TEXT column.
 */
export async function sealSecret(
  plaintext: string,
  passphrase: string,
): Promise<string> {
  const s = await ensureSodium();
  const key = await deriveKey(passphrase);
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const cipher = s.crypto_secretbox_easy(s.from_string(plaintext), nonce, key);
  const packed = new Uint8Array(nonce.length + cipher.length);
  packed.set(nonce, 0);
  packed.set(cipher, nonce.length);
  return s.to_base64(packed, s.base64_variants.ORIGINAL);
}

/** Decrypt a string produced by {@link sealSecret}. Throws on tamper/bad key. */
export async function openSecret(
  sealed: string,
  passphrase: string,
): Promise<string> {
  const s = await ensureSodium();
  const key = await deriveKey(passphrase);
  const packed = s.from_base64(sealed, s.base64_variants.ORIGINAL);
  const nonce = packed.slice(0, s.crypto_secretbox_NONCEBYTES);
  const cipher = packed.slice(s.crypto_secretbox_NONCEBYTES);
  const plain = s.crypto_secretbox_open_easy(cipher, nonce, key);
  return s.to_string(plain);
}
