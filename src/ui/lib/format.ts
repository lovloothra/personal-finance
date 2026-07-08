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
