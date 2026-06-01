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

// A flattened credit-card statement: single amount per row, NO running balance.
// Purchases are debits; "Payment received" / refunds are credits.
const CARD_STATEMENT = `
HDFC Bank Infinia Credit Card Statement
Card Number: XXXX XXXX XXXX 7702   Statement Date: 31/03/2026
Date Transaction Description Amount
02/03/2026 AMAZON IN BANGALORE Ref 560123456789012 2,499.00
05/03/2026 SWIGGY ORDER BLR 845.50
11/03/2026 PAYMENT RECEIVED THANK YOU 45000.00 Cr
18/03/2026 MAKEMYTRIP FLIGHT 12,340.00
22/03/2026 AMAZON REFUND 1,200.00 Cr
`;

test('card statement (no balance): purchases debit, payments/refunds credit', () => {
  const st = parseStatement(CARD_STATEMENT, { providerId: 'hdfc-bank-cards', docType: 'card_statement' });
  const byDesc = (q: string) => st.txns.find((t) => t.rawDescription.toUpperCase().includes(q));

  const amazon = byDesc('AMAZON IN')!;
  assert.equal(amazon.amount, -249900); // debit, and the 15-digit ref is NOT read as the amount
  const swiggy = byDesc('SWIGGY')!;
  assert.equal(swiggy.amount, -84550);
  const payment = byDesc('PAYMENT RECEIVED')!;
  assert.equal(payment.amount, 4500000); // credit
  const mmt = byDesc('MAKEMYTRIP')!;
  assert.equal(mmt.amount, -1234000);
  const refund = byDesc('REFUND')!;
  assert.equal(refund.amount, 120000); // credit
});

test('long reference numbers are never parsed as amounts', () => {
  const st = parseStatement(CARD_STATEMENT, { providerId: 'hdfc-bank-cards', docType: 'card_statement' });
  // No transaction should have an absurd amount from a ref/card number.
  for (const t of st.txns) assert.ok(Math.abs(t.amount) < 5_000_000_00, `amount sane: ${t.amount}`);
});

test('mode auto-detects: bank statement still uses balance-delta', () => {
  const st = parseStatement(STATEMENT, { providerId: 'hdfc-bank', docType: 'bank_statement', openingBalance: 5000000 });
  assert.equal(st.txns.length, 4);
  assert.equal(st.txns[0].amount, 18000000); // salary credit via balance delta
});
