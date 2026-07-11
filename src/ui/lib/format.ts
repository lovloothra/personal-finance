export const inr = (n: number): string =>
  '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');

export const inr2 = (n: number): string =>
  '₹' +
  Math.abs(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Compact Indian notation for headline stats: ₹1.53 Cr / ₹14.75 L. Crore-wide
 * grouped strings overflow stat cards; use this for card values and keep the
 * exact figure in a tooltip (Money does this via its `compact` prop).
 * Absolute value — the sign is rendered separately by Money.
 */
export const inrCompact = (n: number): string => {
  const abs = Math.abs(Math.round(n));
  const scaled = (v: number, unit: string): string => {
    const s = (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
    return `₹${s} ${unit}`;
  };
  if (abs >= 1_00_00_000) return scaled(abs / 1_00_00_000, 'Cr');
  if (abs >= 1_00_000) return scaled(abs / 1_00_000, 'L');
  return inr(abs);
};

/** Format an ISO date ("2026-04-12") as "12 Apr 2026". Non-date input is
 * returned unchanged (e.g. an already-formatted string, or garbage). */
export function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** De-underscore and sentence-case an enum-ish option value for display,
 * e.g. "non_metro" -> "Non metro". Used for <select> option labels. */
export function labelForOption(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
