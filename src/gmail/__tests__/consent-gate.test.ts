import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConsent, humanBytes, DEFAULT_CONSENT_THRESHOLD_BYTES } from '../consent-gate';

test('humanBytes formats across units', () => {
  assert.equal(humanBytes(512), '512 B');
  assert.equal(humanBytes(1536), '1.5 KB');
  assert.equal(humanBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(humanBytes(2.5 * 1024 ** 3), '2.5 GB');
});

test('consent is required only above the threshold', () => {
  const under = evaluateConsent(500_000_000);
  assert.equal(under.required, false);
  const over = evaluateConsent(2_000_000_000);
  assert.equal(over.required, true);
  assert.equal(over.thresholdBytes, DEFAULT_CONSENT_THRESHOLD_BYTES);
});

test('threshold boundary is exclusive', () => {
  assert.equal(evaluateConsent(DEFAULT_CONSENT_THRESHOLD_BYTES).required, false);
  assert.equal(evaluateConsent(DEFAULT_CONSENT_THRESHOLD_BYTES + 1).required, true);
});
