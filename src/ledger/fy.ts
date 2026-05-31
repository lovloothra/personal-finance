/**
 * Indian financial-year helpers.
 *
 * The Indian FY runs 1 April → 31 March. FY "2025-26" therefore covers
 * 2025-04-01 .. 2026-03-31. These are pure date utilities used by the Gmail
 * query window, tax computation, and dashboard rollups.
 */

export type FyKey = `${number}-${string}`; // e.g. "2025-26"

export interface FyWindow {
  key: FyKey;
  /** ISO date of the first day (inclusive). */
  start: string;
  /** ISO date of the last day (inclusive). */
  end: string;
  startYear: number;
  endYear: number;
}

/** Build the window for a FY key like "2025-26". */
export function fyWindow(key: FyKey): FyWindow {
  const startYear = Number(key.slice(0, 4));
  if (!Number.isInteger(startYear)) throw new Error(`Invalid FY key: ${key}`);
  const endYear = startYear + 1;
  return {
    key,
    start: `${startYear}-04-01`,
    end: `${endYear}-03-31`,
    startYear,
    endYear,
  };
}

/** The FY key containing a given ISO date (or Date). */
export function fyForDate(date: string | Date): FyKey {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0 = Jan
  // Jan–Mar belong to the FY that started the previous calendar year.
  const startYear = m < 3 ? y - 1 : y;
  return fyKey(startYear);
}

/** Compose a FY key from its starting calendar year. */
export function fyKey(startYear: number): FyKey {
  const end = (startYear + 1) % 100;
  return `${startYear}-${end.toString().padStart(2, '0')}` as FyKey;
}

/** True when an ISO date falls within the FY window (inclusive). */
export function isInFy(date: string, key: FyKey): boolean {
  const w = fyWindow(key);
  return date >= w.start && date <= w.end;
}

/** Gmail uses YYYY/MM/DD for after:/before:. before: is exclusive, so we add a day. */
export function toGmailDate(iso: string): string {
  return iso.replace(/-/g, '/');
}

/** The day after `iso` in YYYY/MM/DD, for Gmail's exclusive before:. */
export function gmailDayAfter(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
}
