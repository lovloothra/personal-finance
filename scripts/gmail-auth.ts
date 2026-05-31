/**
 * CLI: authorize Gmail (read-only) via the loopback OAuth flow.
 *
 *   npm run gmail:auth
 *
 * Spins a temporary localhost server, opens the Google consent screen, captures
 * the authorization code on the loopback redirect, exchanges it for tokens, and
 * stores them libsodium-sealed in the encrypted DB. Requires the user's Desktop
 * OAuth client at secrets/google-oauth-client.json.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { AddressInfo } from 'node:net';
import { getDb } from '@/db/client';
import { authUrl, createOAuthClient, exchangeCode, loadClientCredentials } from '@/gmail/oauth';

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
  } catch {
    /* user can copy the URL manually */
  }
}

async function main(): Promise<void> {
  // Fail fast with a clear message before opening a server/browser.
  const creds = loadClientCredentials();
  const db = await getDb();

  await new Promise<void>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://127.0.0.1`);
        const code = url.searchParams.get('code');
        const err = url.searchParams.get('error');
        if (err) {
          res.writeHead(400, { 'content-type': 'text/plain' });
          res.end(`Authorization failed: ${err}`);
          server.close();
          return reject(new Error(err));
        }
        if (!code) {
          res.writeHead(204);
          res.end();
          return;
        }
        const port = (server.address() as AddressInfo).port;
        const client = createOAuthClient(`http://127.0.0.1:${port}`, creds);
        const { email } = await exchangeCode(db, client, code);
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(
          '<html><body style="font-family:system-ui;padding:40px"><h2>✅ Gmail connected</h2>' +
            `<p>${email ?? 'Your account'} is now linked (read-only). You can close this tab and return to the terminal.</p></body></html>`,
        );
        server.close();
        console.log(`\n✅ Authorized${email ? ` as ${email}` : ''}. Tokens sealed in the encrypted DB.`);
        resolve();
      } catch (e) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('Internal error during token exchange. Check the terminal.');
        server.close();
        reject(e);
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      const client = createOAuthClient(`http://127.0.0.1:${port}`, creds);
      const url = authUrl(client);
      console.log('\nOpen this URL to authorize read-only Gmail access:\n');
      console.log(url + '\n');
      openBrowser(url);
      console.log('Waiting for the browser redirect…');
    });
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[gmail:auth] failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
