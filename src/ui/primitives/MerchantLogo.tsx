'use client';
import { useState } from 'react';

/**
 * Brand logo for a merchant, with a tinted-initial fallback. Logos live in
 * public/assets/merchants/<slug>.svg. We only render an <img> for slugs we know
 * exist (no 404 flashes); everything else shows the coloured initial, so the
 * line item still reads cleanly.
 */
const KNOWN = new Set([
  'airtel', 'amazon', 'anthropic', 'apple', 'blinkit', 'github', 'google-gemini',
  'jio', 'jiohotstar', 'netflix', 'openai', 'paytm', 'perplexity', 'phonepe',
  'prime-video', 'spotify', 'swiggy', 'uber', 'youtube', 'zee5', 'zepto', 'zomato',
]);

// Display names / aliases that don't slugify straight to a file.
const ALIASES: Record<string, string> = {
  'chatgpt': 'openai',
  'claude': 'anthropic',
  'hotstar': 'jiohotstar',
  'disney+ hotstar': 'jiohotstar',
  'amazon prime': 'prime-video',
  'prime video': 'prime-video',
  'apple music': 'apple',
  'apple tv+': 'apple',
  'apple tv plus': 'apple',
  'youtube premium': 'youtube',
  'youtube music': 'youtube',
  'github copilot': 'github',
  'google gemini': 'google-gemini',
  'jio fiber': 'jio',
  'jiofiber': 'jio',
};

function resolveSlug(name: string): string | null {
  const n = name.toLowerCase().trim();
  if (ALIASES[n]) return ALIASES[n];
  const slug = n.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (KNOWN.has(slug)) return slug;
  // Containment — "Airtel Gurgaon", "OpenAI *ChatGPT" still resolve.
  for (const k of KNOWN) if (n.includes(k.replace(/-/g, ' ')) || n.includes(k)) return k;
  return null;
}

export function MerchantLogo({ name, color, size = 38 }: { name: string; color?: string; size?: number }) {
  const slug = resolveSlug(name);
  const [failed, setFailed] = useState(false);

  if (slug && !failed) {
    return (
      <span
        style={{
          width: size, height: size, borderRadius: Math.max(8, size / 3.5),
          background: '#fff', border: '1px solid var(--border)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, overflow: 'hidden',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/assets/merchants/${slug}.svg`}
          alt=""
          width={size * 0.62}
          height={size * 0.62}
          style={{ objectFit: 'contain' }}
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      style={{
        width: size, height: size, borderRadius: Math.max(8, size / 3.5),
        background: color ?? 'var(--indigo-50)', color: color ? '#fff' : 'var(--indigo-600)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: size * 0.4, flexShrink: 0,
      }}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  );
}
