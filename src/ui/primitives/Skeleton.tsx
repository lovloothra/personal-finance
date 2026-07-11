'use client';
import type { CSSProperties } from 'react';

export type SkeletonVariant = 'stat' | 'row' | 'block';

interface SkeletonProps {
  variant?: SkeletonVariant;
  count?: number;
  /** Only used for variant='block' — sets the block's height in px (default 48). */
  height?: number;
}

/**
 * Loading placeholder over the existing `.skeleton` sweep animation
 * (workbench.css). The wrapper is `aria-hidden` — the loading state is
 * communicated by the page's own heading/copy, not skeleton noise for
 * assistive tech — and uses `display: contents` so it doesn't insert an
 * extra box into a parent grid/flex layout (e.g. `.grid-3` stat rows).
 */
export function Skeleton({ variant = 'row', count = 1, height }: SkeletonProps) {
  const n = Math.max(1, count);
  return (
    <div aria-hidden="true" style={{ display: 'contents' }}>
      {Array.from({ length: n }, (_, i) => {
        const style: CSSProperties | undefined = variant === 'block' ? { height: height ?? 48 } : undefined;
        const cls = variant === 'block' ? 'skeleton' : `skeleton ${variant}`;
        return <div key={i} className={cls} style={style} />;
      })}
    </div>
  );
}
