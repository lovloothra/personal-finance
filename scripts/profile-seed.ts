/**
 * CLI: load secrets/profile.local.json into the encrypted DB.
 *
 *   npm run profile:seed
 */
import { getDb } from '@/db/client';
import { loadProfileSeed } from '@/profile/signals';
import { persistProfile } from '@/profile/seed';

async function main(): Promise<void> {
  const seed = loadProfileSeed();
  const db = await getDb();
  const counts = persistProfile(db, seed);
  console.log(`Profile seeded for ${seed.personal.fullName}:`, counts);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[profile:seed] failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
