/**
 * Setup-state checks for the boot gate and onboarding wizard.
 *
 * Reports which of the four setup milestones are done so the UI can route a
 * fresh clone into onboarding and a configured install straight to the
 * workbench. All checks read the encrypted DB / gitignored secrets locally.
 */
import 'server-only';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { profilePersonal, gmailAuth, transactions } from '@/db/schema';

export interface SetupStatus {
  hasOAuthClient: boolean;
  hasProfile: boolean;
  hasGmailAuth: boolean;
  hasData: boolean;
  /** True once the essentials + Gmail are connected (workbench is usable). */
  ready: boolean;
}

function clientCredsPath(): string {
  return process.env.PF_GOOGLE_CLIENT_PATH ?? join(process.cwd(), 'secrets', 'google-oauth-client.json');
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const hasOAuthClient = existsSync(clientCredsPath());
  const db = await getDb();

  const count = (table: Parameters<typeof db.select>[0] extends never ? never : any) =>
    (db.select({ n: sql<number>`count(*)` }).from(table).get()?.n ?? 0) as number;

  const hasProfile = count(profilePersonal) > 0;
  const hasGmailAuth = count(gmailAuth) > 0;
  const hasData = count(transactions) > 0;

  return {
    hasOAuthClient,
    hasProfile,
    hasGmailAuth,
    hasData,
    // Workbench is usable once there's a profile and either a Gmail connection
    // or already-imported data (so a populated install never re-runs onboarding).
    ready: hasProfile && (hasGmailAuth || hasData),
  };
}
