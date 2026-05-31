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
}

/** Minimum average characters per page before we suspect a scanned document. */
const SCANNED_CHARS_PER_PAGE = 40;

export async function extractText(path: string): Promise<ExtractResult> {
  // Import the legacy ESM build lazily so the heavy module only loads on demand.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await readFile(path));
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pages.push(text);
  }
  // Release worker/resources; tolerate API differences across pdf.js builds.
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
  };
}
