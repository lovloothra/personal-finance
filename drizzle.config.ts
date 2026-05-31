import type { Config } from 'drizzle-kit';

/**
 * Drizzle Kit config. We point migrations output at src/db/migrations and the
 * schema at src/db/schema.ts. The DB itself is SQLCipher-encrypted and unlocked
 * at runtime via the OS keychain, so drizzle-kit only generates SQL; it does
 * not open the encrypted DB directly.
 */
export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
} satisfies Config;
