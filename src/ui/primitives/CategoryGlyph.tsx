'use client';
import { Icon } from './Icon';

/** Category → lucide icon + brand tint. Falls back to a coloured initial. */
const MAP: Record<string, { icon: string; color: string }> = {
  'food delivery': { icon: 'utensils', color: '#FF8A6B' },
  'quick commerce': { icon: 'bike', color: '#15A877' },
  groceries: { icon: 'shopping-basket', color: '#15A877' },
  dining: { icon: 'utensils-crossed', color: '#FF8A6B' },
  travel: { icon: 'plane', color: '#3B82F6' },
  transport: { icon: 'car', color: '#3B82F6' },
  shopping: { icon: 'shopping-bag', color: '#A855F7' },
  utilities: { icon: 'zap', color: '#F59E0B' },
  housing: { icon: 'house', color: '#6354E6' },
  loan: { icon: 'landmark', color: '#FF8A6B' },
  insurance: { icon: 'shield-check', color: '#15A877' },
  investment: { icon: 'trending-up', color: '#15A877' },
  health: { icon: 'heart-pulse', color: '#EF4444' },
  fitness: { icon: 'dumbbell', color: '#15A877' },
  education: { icon: 'graduation-cap', color: '#3B82F6' },
  entertainment: { icon: 'clapperboard', color: '#A855F7' },
  ott: { icon: 'tv', color: '#A855F7' },
  subscriptions: { icon: 'repeat', color: '#6354E6' },
  software: { icon: 'code', color: '#6354E6' },
  salary: { icon: 'wallet', color: '#15A877' },
  income: { icon: 'arrow-down-to-line', color: '#15A877' },
  refund: { icon: 'rotate-ccw', color: '#15A877' },
  transfer: { icon: 'arrow-left-right', color: '#94A3B8' },
  'credit card payment': { icon: 'credit-card', color: '#94A3B8' },
  cash: { icon: 'banknote', color: '#15A877' },
  household: { icon: 'house-plug', color: '#6354E6' },
  'fees & charges': { icon: 'receipt', color: '#EF4444' },
  'gifts & donations': { icon: 'gift', color: '#FF8A6B' },
  'personal care': { icon: 'sparkles', color: '#A855F7' },
  uncategorised: { icon: 'circle-help', color: '#94A3B8' },
};

export function CategoryGlyph({ name, size = 34 }: { name: string; size?: number }) {
  const hit = MAP[name.toLowerCase().trim()];
  const color = hit?.color ?? 'var(--indigo-600)';
  return (
    <span
      aria-hidden
      style={{
        width: size, height: size, borderRadius: Math.max(8, size / 3.5),
        background: color + '1f', color, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      {hit ? <Icon name={hit.icon} size={size * 0.5} /> : (name || '?').charAt(0).toUpperCase()}
    </span>
  );
}
