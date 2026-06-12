'use client';
import { useState } from 'react';

/**
 * Institution logo with graceful fallback. Logos live in
 * public/assets/institutions/<id>.svg; card-issuer ids reuse their parent
 * bank's mark. When no asset exists the institution's initial renders in a
 * tinted glyph, so unknown institutions still look intentional.
 */
const LOGO_ALIASES: Record<string, string> = {
  'sbi-card': 'state-bank-of-india',
  'american-express-india-cards': 'american-express',
  'hsbc-india-cards': 'hsbc',
  'standard-chartered-india-cards': 'standard-chartered',
};

function logoId(id: string): string {
  return LOGO_ALIASES[id] ?? id.replace(/-cards$/, '');
}

export function InstLogo({ id, name, size = 24 }: { id: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(6, size / 4),
          background: 'var(--indigo-50)',
          color: 'var(--indigo-600)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: size * 0.45,
          flexShrink: 0,
        }}
      >
        {(name || '?').charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/assets/institutions/${logoId(id)}.svg`}
      alt=""
      width={size}
      height={size}
      style={{ objectFit: 'contain', flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  );
}
