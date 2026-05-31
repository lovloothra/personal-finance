/**
 * OCR fallback via tesseract.js for scanned (image-only) statement PDFs.
 *
 * tesseract.js recognises raster images. We expose `recognizeImage` for a
 * single page image and `ocrConfidenceOk` to decide whether the result is
 * trustworthy or should be spot-checked in the review queue. Rasterising PDF
 * pages to images needs a canvas backend; when one isn't available the caller
 * should route the document to review rather than guessing.
 */
import 'server-only';

export interface OcrResult {
  text: string;
  /** 0..100 mean confidence reported by tesseract. */
  confidence: number;
}

/** Below this mean confidence we flag the page for manual spot-check. */
export const OCR_REVIEW_THRESHOLD = 80;

export function ocrConfidenceOk(confidence: number): boolean {
  return confidence >= OCR_REVIEW_THRESHOLD;
}

/** Recognise text in a single page image (PNG/JPEG buffer or path). */
export async function recognizeImage(image: Buffer | string, lang = 'eng'): Promise<OcrResult> {
  const { recognize } = await import('tesseract.js');
  const { data } = await recognize(image, lang);
  return { text: (data.text ?? '').trim(), confidence: data.confidence ?? 0 };
}
