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
    pages.push(reconstructLines(content.items));
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
