import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatement } from '../registry';
import { amountToPaise, splitRows } from '../in/generic-bank';

// A flattened HDFC-style statement (columns collapsed, as pdf.js would yield).
const STATEMENT = `
HDFC BANK LTD - Statement of Account
Account No: XXXXXX1234   Period: 01/07/2025 to 31/07/2025
Date Narration Withdrawal Deposit Balance
01/07/2025 NEFT CR NEXORA SYSTEMS PVT LTD SALARY JUL 180000.00 230000.00
05/07/2025 UPI RENT PAYMENT R VENKATESH 55000.00 175000.00
10/07/2025 ATM CASH WITHDRAWAL BLR 10000.00 165000.00
15/07/2025 INTEREST CREDIT 1200.00 166200.00
`;

test('amountToPaise parses Indian-grouped amounts', () => {
  assert.equal(amountToPaise('1,80,000.00'), 18000000);
  assert.equal(amountToPaise('55000.00'), 5500000);
  assert.equal(amountToPaise('1200'), 120000);
});

test('splitRows keeps only date-anchored rows', () => {
  const rows = splitRows(STATEMENT);
  assert.equal(rows.length, 4);
  assert.ok(rows[0].startsWith('01/07/2025'));
});

test('balance-delta infers debit vs credit signs', () => {
  const st = parseStatement(STATEMENT, {
    providerId: 'hdfc-bank',
    docType: 'bank_statement',
    openingBalance: 5000000, // ₹50,000
  });
  assert.equal(st.txns.length, 4);

  const [salary, rent, atm, interest] = st.txns;
  assert.equal(salary.amount, 18000000); // credit (+)
  assert.equal(salary.date, '2025-07-01');
  assert.match(salary.rawDescription, /NEXORA SYSTEMS/);

  assert.equal(rent.amount, -5500000); // debit (−)
  assert.match(rent.rawDescription, /RENT PAYMENT/);

  assert.equal(atm.amount, -1000000); // debit (−)
  assert.equal(interest.amount, 120000); // credit (+)

  // running balances captured
  assert.equal(salary.balance, 23000000);
  assert.equal(interest.balance, 16620000);
});

test('non-transaction header lines land in unparsedLines', () => {
  const st = parseStatement(STATEMENT, { providerId: 'hdfc-bank', docType: 'bank_statement', openingBalance: 5000000 });
  assert.ok(st.unparsedLines.length === 0 || st.unparsedLines.every((l) => !/^\d{2}[/-]/.test(l)));
});

test('registry falls back to generic for unknown providers', () => {
  const st = parseStatement(STATEMENT, { providerId: 'some-unknown-bank', docType: 'bank_statement', openingBalance: 5000000 });
  assert.equal(st.txns.length, 4);
});
