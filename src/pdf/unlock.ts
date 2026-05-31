/**
 * Locked-PDF unlocking via the qpdf system binary.
 *
 * qpdf is detected at runtime; if it is absent we return a clear status so the
 * caller can route the document to the review queue with an install hint rather
 * than crashing. We try profile-derived password candidates in order and write
 * a decrypted copy on the first success. Read-only w.r.t. the network.
 */
import 'server-only';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export type UnlockStatus = 'not_encrypted' | 'unlocked' | 'failed' | 'qpdf_missing';

export interface UnlockResult {
  status: UnlockStatus;
  password?: string;
  outPath?: string;
  triedCandidates?: number;
}

let qpdfChecked: boolean | null = null;

/** True if the qpdf binary is available on PATH. Cached per process. */
export function qpdfAvailable(): boolean {
  if (qpdfChecked != null) return qpdfChecked;
  const r = spawnSync('qpdf', ['--version'], { encoding: 'utf8' });
  qpdfChecked = r.status === 0;
  return qpdfChecked;
}

export const QPDF_INSTALL_HINT =
  'qpdf is required to unlock password-protected PDFs. Install it: macOS `brew install qpdf`, ' +
  'Debian/Ubuntu `sudo apt install qpdf`, Windows `winget install qpdf`.';

/** Whether a PDF is encrypted (qpdf --is-encrypted: exit 0 = encrypted). */
export function isEncrypted(path: string): boolean {
  if (!qpdfAvailable()) return false;
  const r = spawnSync('qpdf', ['--is-encrypted', path]);
  return r.status === 0;
}

/**
 * Attempt to decrypt `path` into `outPath` using the ordered candidate list.
 * Returns the matching password on success.
 */
export function tryUnlock(path: string, candidates: string[], outPath: string): UnlockResult {
  if (!qpdfAvailable()) return { status: 'qpdf_missing' };
  if (!existsSync(path)) return { status: 'failed', triedCandidates: 0 };
  if (!isEncrypted(path)) return { status: 'not_encrypted' };

  let tried = 0;
  for (const password of candidates) {
    tried++;
    const r = spawnSync('qpdf', [`--password=${password}`, '--decrypt', path, outPath], { encoding: 'utf8' });
    // qpdf exit 0 = success, 2 = error (wrong password / other). 3 = warnings (still ok).
    if (r.status === 0 || r.status === 3) {
      return { status: 'unlocked', password, outPath, triedCandidates: tried };
    }
  }
  return { status: 'failed', triedCandidates: tried };
}
