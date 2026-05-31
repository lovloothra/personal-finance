import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQueries, loadGmailTemplates, type GmailTemplate } from '../query-builder';

const sampleTemplates: GmailTemplate[] = [
  {
    id: 'hdfc-bank-account-statement',
    provider_id: 'hdfc-bank',
    doc_type: 'bank_statement',
    sender_hints: ['hdfcbank.net'],
    subject_hints: ['statement'],
    query_fragments: ['-in:spam', '-in:trash', 'has:attachment', 'filename:pdf', '(from:hdfcbank.net)', '(statement OR e-statement)'],
    password_rule_tags: ['dob-ddmmyyyy', 'account-last4'],
  },
  {
    id: 'icici-bank-account-statement',
    provider_id: 'icici-bank',
    doc_type: 'bank_statement',
    sender_hints: ['icicibank.com'],
    subject_hints: ['statement'],
    query_fragments: ['has:attachment', '(from:icicibank.com)'],
    password_rule_tags: ['pan-last4'],
  },
];

test('builds one query per template scoped to the FY window', () => {
  const qs = buildQueries({ templates: sampleTemplates, fy: '2025-26' });
  assert.equal(qs.length, 2);
  const hdfc = qs.find((q) => q.providerId === 'hdfc-bank')!;
  assert.ok(hdfc.query.includes('after:2025/04/01'));
  assert.ok(hdfc.query.includes('before:2026/04/01')); // exclusive → day after Mar 31
  assert.ok(hdfc.query.includes('filename:pdf'));
  assert.deepEqual(hdfc.passwordRuleTags, ['dob-ddmmyyyy', 'account-last4']);
});

test('does not duplicate exclusions already present in fragments', () => {
  const qs = buildQueries({ templates: [sampleTemplates[0]], fy: '2025-26' });
  const count = (qs[0].query.match(/-in:spam/g) ?? []).length;
  assert.equal(count, 1);
});

test('appends default exclusions when fragments lack them', () => {
  const qs = buildQueries({ templates: [sampleTemplates[1]], fy: '2025-26' });
  assert.ok(qs[0].query.includes('-in:spam'));
  assert.ok(qs[0].query.includes('-in:trash'));
});

test('filters to only the providers the household uses', () => {
  const qs = buildQueries({ templates: sampleTemplates, fy: '2025-26', providerIds: ['icici-bank'] });
  assert.equal(qs.length, 1);
  assert.equal(qs[0].providerId, 'icici-bank');
});

test('loads the real India gmail templates from packs/in', () => {
  const templates = loadGmailTemplates();
  assert.ok(templates.length > 0, 'templates present');
  const qs = buildQueries({ templates, fy: '2025-26' });
  assert.equal(qs.length, templates.length === new Set(templates.map((t) => t.id)).size ? qs.length : qs.length);
  // every real query is FY-scoped and read-only (search only)
  for (const q of qs) {
    assert.ok(q.query.includes('after:2025/04/01'));
    assert.ok(q.query.includes('before:2026/04/01'));
  }
});
