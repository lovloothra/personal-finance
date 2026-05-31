/**
 * Gmail OAuth — read-only, user-owned Desktop client.
 *
 * The user creates their own Google Cloud "Desktop app" OAuth client and drops
 * the downloaded JSON at secrets/google-oauth-client.json (gitignored). We only
 * ever request the gmail.readonly scope. Tokens are libsodium-sealed under the
 * keychain passphrase and stored in the encrypted DB (gmail_auth table), so a
 * token is useless without both the SQLCipher key and the passphrase.
 *
 * This module is server-only and performs network I/O against Google's token
 * endpoint only — never any third-party host.
 */
import 'server-only';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { google } from 'googleapis';
import type { OAuth2Client, Credentials } from 'google-auth-library';
import { eq } from 'drizzle-orm';
import { getDb, type DB } from '@/db/client';
import { gmailAuth } from '@/db/schema';
import { ensureDbPassphrase } from '@/secrets/keychain';
import { sealSecret, openSecret } from '@/secrets/crypto';

/** The single scope this app ever requests. Read-only, no send/modify. */
export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

const AUTH_ROW_ID = 'default';

export interface DesktopClientCreds {
  clientId: string;
  clientSecret: string;
}

function clientCredsPath(): string {
  return process.env.PF_GOOGLE_CLIENT_PATH ?? join(process.cwd(), 'secrets', 'google-oauth-client.json');
}

/**
 * Load the user's Desktop OAuth client. Accepts Google's downloaded format
 * ({ installed: { client_id, client_secret, ... } }) or a flat
 * { client_id, client_secret } JSON.
 */
export function loadClientCredentials(path = clientCredsPath()): DesktopClientCreds {
  if (!existsSync(path)) {
    throw new Error(
      `Google OAuth client not found at ${path}.\n` +
        'Create a "Desktop app" OAuth client in Google Cloud Console, enable the Gmail API, ' +
        'add yourself as a test user, download the JSON, and save it there.',
    );
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>;
  const node = raw.installed ?? raw.web ?? raw;
  const clientId = node.client_id ?? node.clientId;
  const clientSecret = node.client_secret ?? node.clientSecret;
  if (!clientId || !clientSecret) {
    throw new Error(`OAuth client JSON at ${path} is missing client_id/client_secret.`);
  }
  return { clientId, clientSecret };
}

/** Create an OAuth2 client bound to a (loopback) redirect URI. */
export function createOAuthClient(redirectUri: string, creds = loadClientCredentials()): OAuth2Client {
  return new google.auth.OAuth2(creds.clientId, creds.clientSecret, redirectUri);
}

/** Build the consent URL. Forces offline + consent so we receive a refresh token. */
export function authUrl(client: OAuth2Client): string {
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GMAIL_SCOPES,
  });
}

// --- Token persistence (sealed in the encrypted DB) ------------------------

export async function saveToken(db: DB, tokens: Credentials, email?: string): Promise<void> {
  const passphrase = await ensureDbPassphrase();
  const wrapped = await sealSecret(JSON.stringify(tokens), passphrase);
  const ts = Date.now();
  db
    .insert(gmailAuth)
    .values({ id: AUTH_ROW_ID, wrappedToken: wrapped, email, scope: GMAIL_SCOPES.join(' '), updatedAt: ts })
    .onConflictDoUpdate({
      target: gmailAuth.id,
      set: { wrappedToken: wrapped, email, scope: GMAIL_SCOPES.join(' '), updatedAt: ts },
    })
    .run();
}

export async function loadToken(db: DB): Promise<Credentials | null> {
  const row = db.select().from(gmailAuth).where(eq(gmailAuth.id, AUTH_ROW_ID)).get();
  if (!row) return null;
  const passphrase = await ensureDbPassphrase();
  return JSON.parse(await openSecret(row.wrappedToken, passphrase)) as Credentials;
}

export async function isAuthorized(db?: DB): Promise<boolean> {
  const database = db ?? (await getDb());
  return (await loadToken(database)) != null;
}

/**
 * Return an authorized OAuth2 client with credentials loaded and auto-refresh
 * wired to persist refreshed tokens. Throws if the user has not authorized yet.
 * `redirectUri` is only used to construct the client; refresh does not need it.
 */
export async function getAuthedClient(db?: DB, redirectUri = 'http://127.0.0.1:0'): Promise<OAuth2Client> {
  const database = db ?? (await getDb());
  const tokens = await loadToken(database);
  if (!tokens) throw new Error('Gmail is not authorized yet. Run `npm run gmail:auth` first.');

  const client = createOAuthClient(redirectUri);
  client.setCredentials(tokens);
  // Persist refreshed access/refresh tokens transparently.
  client.on('tokens', (fresh) => {
    const merged = { ...tokens, ...fresh };
    void saveToken(database, merged);
  });
  return client;
}

/** Exchange an authorization code for tokens and persist them. */
export async function exchangeCode(
  db: DB,
  client: OAuth2Client,
  code: string,
): Promise<{ email?: string }> {
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  // Best-effort fetch of the authorized email for display.
  let email: string | undefined;
  try {
    const gmail = google.gmail({ version: 'v1', auth: client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    email = profile.data.emailAddress ?? undefined;
  } catch {
    // non-fatal
  }
  await saveToken(db, tokens, email);
  return { email };
}
