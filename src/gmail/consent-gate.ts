/**
 * Download consent gate.
 *
 * Before downloading attachments we run a cheap metadata pass to estimate total
 * bytes. If the estimate exceeds a threshold (default 1 GB) the caller must get
 * explicit user consent before proceeding — we never silently pull gigabytes
 * off someone's machine's network.
 */

export const DEFAULT_CONSENT_THRESHOLD_BYTES = 1_000_000_000; // 1 GB

export interface ConsentDecision {
  required: boolean;
  bytesEstimated: number;
  thresholdBytes: number;
  humanEstimate: string;
}

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

export function evaluateConsent(
  bytesEstimated: number,
  thresholdBytes = DEFAULT_CONSENT_THRESHOLD_BYTES,
): ConsentDecision {
  return {
    required: bytesEstimated > thresholdBytes,
    bytesEstimated,
    thresholdBytes,
    humanEstimate: humanBytes(bytesEstimated),
  };
}
