/**
 * PDF text extraction via pdf.js (legacy Node build).
 *
 * Returns the concatenated text plus per-page text and a heuristic flag for
 * whether the document looks scanned (very little extractable text relative to
 * page count) and should fall back to OCR.
 */
import 'server-only';
import { readFile } from 'node:fs/promises';

export interface ExtractResult {
  text: string;
  pages: string[];
  pageCount: number;
  /** Heuristic: likely a scanned image PDF with no embedded text. */
  likelyScanned: boolean;
  /** True if a password candidate was needed to open the document. */
  decrypted: boolean;
}

/** Thrown when a PDF is encrypted and none of the candidate passwords worked. */
export class LockedPdfError extends Error {
  constructor(public triedCandidates: number) {
    super('PDF is password-protected and no candidate password matched.');
    this.name = 'LockedPdfError';
  }
}

/** Minimum average characters per page before we suspect a scanned document. */
const SCANNED_CHARS_PER_PAGE = 40;

interface PdfTextItem {
  str: string;
  transform: number[]; // [a, b, c, d, x, y]
}

/**
 * Rebuild line structure from positioned text items. pdf.js flattens layout, so
 * we group items by their y-coordinate (rows) and order each row left-to-right,
 * preserving the row breaks the statement parsers rely on.
 */
function reconstructLines(items: unknown[]): string {
  const text = items.filter((it): it is PdfTextItem => typeof it === 'object' && it != null && 'str' in it && 'transform' in it);
  const rows = new Map<number, { x: number; str: string }[]>();
  for (const it of text) {
    if (!it.str) continue;
    const y = Math.round(it.transform[5]); // group by vertical position
    const x = it.transform[4];
    const arr = rows.get(y) ?? [];
    arr.push({ x, str: it.str });
    rows.set(y, arr);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0]) // top of page (higher y) first
    .map(([, parts]) =>
      parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}

function isPasswordException(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { name?: string }).name === 'PasswordException');
}

/**
 * Extract text from a PDF. If the document is encrypted, pdf.js decrypts it
 * IN PURE JS using the supplied profile-derived password candidates (tried in
 * order) — no external `qpdf` binary required for standard password security.
 * Throws {@link LockedPdfError} when it is encrypted and no candidate works.
 */
export async function extractText(path: string, opts: { passwords?: string[] } = {}): Promise<ExtractResult> {
  // Import the legacy ESM build lazily so the heavy module only loads on demand.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const buf = await readFile(path);
  const candidates = opts.passwords ?? [];
  // Attempt with no password first, then each candidate. pdf.js detaches the
  // input buffer, so hand it a fresh copy on every attempt.
  const attempts: (string | undefined)[] = [undefined, ...candidates];

  let needsPassword = false;
  for (const password of attempts) {
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf), password, useSystemFonts: true });
    try {
      const doc = await loadingTask.promise;
      const pages: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        pages.push(reconstructLines(content.items));
      }
      try {
        await loadingTask.destroy();
      } catch {
        /* non-fatal cleanup */
      }
      const text = pages.join('\n\n');
      const avgPerPage = doc.numPages ? text.length / doc.numPages : 0;
      return {
        text,
        pages,
        pageCount: doc.numPages,
        likelyScanned: avgPerPage < SCANNED_CHARS_PER_PAGE,
        decrypted: password !== undefined,
      };
    } catch (err) {
      void loadingTask.destroy().catch(() => {});
      if (isPasswordException(err)) {
        needsPassword = true;
        continue; // wrong/needed password → try the next candidate
      }
      throw err; // a real parse error, not an encryption issue
    }
  }

  // Every attempt hit a password wall.
  if (needsPassword) throw new LockedPdfError(candidates.length);
  throw new Error('Failed to open PDF.');
}
