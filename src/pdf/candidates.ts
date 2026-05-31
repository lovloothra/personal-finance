/**
 * Password-candidate generation for locked statement PDFs.
 *
 * Indian banks/cards protect statement PDFs with passwords derived from
 * customer data — DOB, PAN, account/card last-4, customer id, mobile. The pack
 * tags each template with the rules a given provider uses (password_rule_tags),
 * so we can generate a *small, ordered* candidate list from the profile rather
 * than brute-forcing. Pure and deterministic — no PDF I/O here.
 */
import type { PasswordInputs } from '@/profile/signals';

export type PasswordRuleTag =
  | 'dob-ddmmyyyy'
  | 'pan-lower'
  | 'account-last4'
  | 'card-last4'
  | 'customer-id'
  | 'crn'
  | 'mobile-last4';

/** Expand an ISO DOB into the date formats banks commonly use. */
export function dobFormats(iso: string): string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return [];
  const [, yyyy, mm, dd] = m;
  const yy = yyyy.slice(2);
  return unique([
    `${dd}${mm}${yyyy}`, // DDMMYYYY (most common)
    `${dd}${mm}${yy}`, // DDMMYY
    `${dd}-${mm}-${yyyy}`,
    `${yyyy}${mm}${dd}`, // YYYYMMDD
    `${dd}${mm}`, // DDMM (combined with other tokens)
  ]);
}

function unique(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))];
}

/**
 * Build candidate passwords for one document. If `tags` is provided (from the
 * matched template) we prioritise those rules; we still append a small broad
 * fallback so a mis-tagged template doesn't strand a PDF.
 */
export function buildPasswordCandidates(inputs: PasswordInputs, tags?: PasswordRuleTag[]): string[] {
  const byTag: Record<PasswordRuleTag, () => string[]> = {
    'dob-ddmmyyyy': () => inputs.dobs.flatMap(dobFormats),
    'pan-lower': () => inputs.pans.flatMap((p) => [p.toLowerCase(), p.toUpperCase()]),
    'account-last4': () => inputs.last4s,
    'card-last4': () => inputs.last4s,
    'customer-id': () => inputs.customerIds,
    crn: () => inputs.customerIds,
    'mobile-last4': () => inputs.mobiles.map((m) => m.slice(-4)),
  };

  const ordered: string[] = [];
  const rules: PasswordRuleTag[] = tags && tags.length ? tags : (Object.keys(byTag) as PasswordRuleTag[]);
  for (const tag of rules) {
    if (byTag[tag]) ordered.push(...byTag[tag]());
  }

  // Common composite formats (e.g. SBI cards: first 4 of name + DOB ddmm; some
  // banks: PAN first 5 + DOB ddmm). Added after the primary single-token rules.
  for (const name of inputs.names) {
    const n4 = name.replace(/[^a-zA-Z]/g, '').slice(0, 4);
    for (const dob of inputs.dobs) {
      const f = dobFormats(dob);
      const ddmm = f.find((x) => x.length === 4);
      if (n4 && ddmm) ordered.push(`${n4.toUpperCase()}${ddmm}`, `${n4.toLowerCase()}${ddmm}`);
    }
  }
  for (const pan of inputs.pans) {
    const p5 = pan.slice(0, 5).toUpperCase();
    for (const dob of inputs.dobs) {
      const ddmm = dobFormats(dob).find((x) => x.length === 4);
      if (ddmm) ordered.push(`${p5}${ddmm}`);
    }
  }

  return unique(ordered);
}
