import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPasswordCandidates, dobFormats } from '../candidates';
import type { PasswordInputs } from '@/profile/signals';

const inputs: PasswordInputs = {
  dobs: ['1988-07-15'],
  pans: ['ABCDE1234F'],
  mobiles: ['9876543210'],
  names: ['Aditya Iyer'],
  last4s: ['7702', '1234'],
  customerIds: ['12345678'],
};

test('dobFormats expands common Indian date formats', () => {
  const f = dobFormats('1988-07-15');
  assert.ok(f.includes('15071988')); // DDMMYYYY
  assert.ok(f.includes('150788')); // DDMMYY
  assert.ok(f.includes('15-07-1988'));
  assert.ok(f.includes('19880715')); // YYYYMMDD
  assert.ok(f.includes('1507')); // DDMM
});

test('candidates honour password_rule_tags ordering', () => {
  const c = buildPasswordCandidates(inputs, ['dob-ddmmyyyy', 'account-last4']);
  assert.equal(c[0], '15071988'); // DOB rule comes first
  assert.ok(c.includes('7702'));
  assert.ok(c.includes('1234'));
});

test('pan-lower tag produces lower and upper PAN', () => {
  const c = buildPasswordCandidates(inputs, ['pan-lower']);
  assert.ok(c.includes('abcde1234f'));
  assert.ok(c.includes('ABCDE1234F'));
});

test('untagged build includes composite name+dob and pan+dob formats', () => {
  const c = buildPasswordCandidates(inputs);
  assert.ok(c.includes('ADIT1507')); // first4(name)+DDMM
  assert.ok(c.includes('ABCDE1507')); // PAN first5 + DDMM
});

test('candidates are deduplicated', () => {
  const c = buildPasswordCandidates(inputs);
  assert.equal(c.length, new Set(c).size);
});
