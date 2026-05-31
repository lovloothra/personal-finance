/**
 * CLI: load India pack seeds into the encrypted local DB.
 *
 *   npm run db:load-packs
 *
 * Opens the SQLCipher DB via the keychain passphrase (generating one on first
 * run), applies migrations, then upserts institutions + merchant aliases from
 * packs/in/*.json. Idempotent. Run on first boot and after `refresh:packs:in`.
 */
import { getDb } from '@/db/client';
import { loadPacksIntoDb } from '@/packs/loader';

async function main(): Promise<void> {
  const db = await getDb();
  const counts = loadPacksIntoDb(db);
  console.log(
    `Loaded ${counts.institutions} institutions and ${counts.aliases} merchant aliases from packs/in.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[load-packs] failed:', err);
    process.exit(1);
  });
