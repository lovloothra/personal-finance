'use client';
import { icons, type LucideProps } from 'lucide-react';
import type { CSSProperties } from 'react';

type IconName = keyof typeof icons;

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}

// Map a few names that differ between the design's lucide-web glyphs and the
// React package's PascalCase names. lucide-react exposes everything in PascalCase.
function toPascal(name: string): string {
  return name
    .split('-')
    .map((p) => (p.length ? p[0].toUpperCase() + p.slice(1) : p))
    .join('');
}

export function Icon({ name, size = 18, color, strokeWidth = 1.9, style }: IconProps) {
  const key = toPascal(name) as IconName;
  const Cmp = (icons as Record<string, React.ComponentType<LucideProps>>)[key];
  if (!Cmp) {
    return (
      <span
        aria-hidden
        style={{ display: 'inline-block', width: size, height: size, ...style }}
      />
    );
  }
  return (
    <span style={{ display: 'inline-flex', color, lineHeight: 0, ...style }}>
      <Cmp size={size} strokeWidth={strokeWidth} />
    </span>
  );
}
