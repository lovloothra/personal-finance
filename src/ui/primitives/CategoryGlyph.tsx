'use client';
import { Icon } from './Icon';

/** Category → lucide icon + brand tint. Falls back to a coloured initial. */
const MAP: Record<string, { icon: string; color: string }> = {
  'food delivery': { icon: 'utensils', color: 'var(--coral-400)' },
  'quick commerce': { icon: 'bike', color: 'var(--mint-500)' },
  groceries: { icon: 'shopping-basket', color: 'var(--mint-500)' },
  dining: { icon: 'utensils-crossed', color: 'var(--coral-400)' },
  travel: { icon: 'plane', color: 'var(--glyph-blue)' },
  transport: { icon: 'car', color: 'var(--glyph-blue)' },
  shopping: { icon: 'shopping-bag', color: 'var(--glyph-purple)' },
  utilities: { icon: 'zap', color: 'var(--glyph-amber)' },
  housing: { icon: 'house', color: 'var(--indigo-500)' },
  loan: { icon: 'landmark', color: 'var(--coral-400)' },
  insurance: { icon: 'shield-check', color: 'var(--mint-500)' },
  investment: { icon: 'trending-up', color: 'var(--mint-500)' },
  health: { icon: 'heart-pulse', color: 'var(--glyph-red)' },
  fitness: { icon: 'dumbbell', color: 'var(--mint-500)' },
  education: { icon: 'graduation-cap', color: 'var(--glyph-blue)' },
  entertainment: { icon: 'clapperboard', color: 'var(--glyph-purple)' },
  ott: { icon: 'tv', color: 'var(--glyph-purple)' },
  subscriptions: { icon: 'repeat', color: 'var(--indigo-500)' },
  software: { icon: 'code', color: 'var(--indigo-500)' },
  salary: { icon: 'wallet', color: 'var(--mint-500)' },
  income: { icon: 'arrow-down-to-line', color: 'var(--mint-500)' },
  refund: { icon: 'rotate-ccw', color: 'var(--mint-500)' },
  transfer: { icon: 'arrow-left-right', color: 'var(--glyph-slate)' },
  'credit card payment': { icon: 'credit-card', color: 'var(--glyph-slate)' },
  cash: { icon: 'banknote', color: 'var(--mint-500)' },
  household: { icon: 'house-plug', color: 'var(--indigo-500)' },
  'fees & charges': { icon: 'receipt', color: 'var(--glyph-red)' },
  'gifts & donations': { icon: 'gift', color: 'var(--coral-400)' },
  'personal care': { icon: 'sparkles', color: 'var(--glyph-purple)' },
  uncategorised: { icon: 'circle-help', color: 'var(--glyph-slate)' },
};

export function CategoryGlyph({ name, size = 34 }: { name: string; size?: number }) {
  const hit = MAP[name.toLowerCase().trim()];
  const color = hit?.color ?? 'var(--indigo-600)';
  return (
    <span
      aria-hidden
      style={{
        width: size, height: size, borderRadius: Math.max(8, size / 3.5),
        // color-mix, not `color + '1f'` — the tokens above are var() refs now,
        // not raw hex, so string-concatenating a hex alpha suffix onto them
        // would produce invalid CSS (this was already silently broken for the
        // `--indigo-600` fallback below, which was always a var() reference).
        // 12.16% matches the previous "#RRGGBB1f" hex-alpha tint exactly.
        background: `color-mix(in srgb, ${color} 12.16%, transparent)`,
        color, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      {hit ? <Icon name={hit.icon} size={size * 0.5} /> : (name || '?').charAt(0).toUpperCase()}
    </span>
  );
}
