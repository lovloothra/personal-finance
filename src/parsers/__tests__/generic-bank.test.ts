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

// Two transactions extracted onto ONE physical line (PDF reflow) must split
// into separate rows instead of merging descriptions.
test('two transactions merged on one line are split apart', () => {
  const merged = `
ICICI Bank Statement Period: 01/03/2026 to 31/03/2026
10/03/2026 BIL/Home Loan XX05856 EMI 1,27,000.00 3,50,000.00 12/03/2026 UPI/INDmoney/indmoneymf1@ici/INDMoney 5,000.00 3,45,000.00
`;
  const st = parseStatement(merged, { providerId: 'icici-bank', docType: 'bank_statement', openingBalance: 47700000 });
  assert.equal(st.txns.length, 2);
  const [emi, sip] = st.txns;
  assert.equal(emi.date, '2026-03-10');
  assert.equal(emi.amount, -12700000);
  assert.doesNotMatch(emi.rawDescription, /INDmoney/i);
  assert.equal(sip.date, '2026-03-12');
  assert.equal(sip.amount, -500000);
  assert.match(sip.rawDescription, /INDmoney/i);
  assert.doesNotMatch(sip.rawDescription, /Home Loan/i);
});

// A txn-date followed by a value-date column has no amount between the two
// dates and must NOT be split into two bogus rows.
test('txn-date + value-date columns stay one row', () => {
  const valueDated = `
Axis Bank Statement
05/03/2026 06/03/2026 NEFT CR ACME TECH SALARY MAR 2,50,000.00 4,00,000.00
07/03/2026 07/03/2026 UPI RENT PAYMENT 55,000.00 3,45,000.00
`;
  const st = parseStatement(valueDated, { providerId: 'axis-bank', docType: 'bank_statement', openingBalance: 15000000 });
  assert.equal(st.txns.length, 2);
  assert.equal(st.txns[0].amount, 25000000);
  assert.equal(st.txns[1].amount, -5500000);
});

// Date-shaped noise (e.g. ref fragments like 99/99/99) is not a transaction.
test('invalid calendar dates are rejected', () => {
  const noisy = `
HDFC Statement
01/07/2025 NEFT CR SALARY 1,80,000.00 2,30,000.00
99/99/99 NOT A DATE 1,111.00 9,999.00
15/13/2025 BAD MONTH 2,222.00 8,888.00
`;
  const st = parseStatement(noisy, { providerId: 'hdfc-bank', docType: 'bank_statement', openingBalance: 5000000 });
  assert.equal(st.txns.length, 1);
  assert.equal(st.txns[0].date, '2025-07-01');
});

// ICICI-style layout: each transaction's UPI narration sits on its own line
// BETWEEN dated rows and belongs to the FOLLOWING transaction. The EMI row
// must not absorb the next row's "UPI/INDmoney" narration.
test('orphan narration lines attach to the following transaction', () => {
  const icici = `
DATE MODE PARTICULARS DEPOSITS WITHDRAWALS BALANCE
03-02-2026 CMS TRANSACTION CMS/TATA CONSULTANCY/Tata Consultancy 171.00 2,13,784.46
05-02-2026 BIL/Home Loan XX05856 EMI Lov Loot 1,30,817.00 82,967.46
UPI/INDmoney/indmoneymf1@ic/INDMoney M/ICICI
05-02-2026 Bank/109131401837/ICI0be493f665844496a25a869a01c85 10,000.00 72,967.46
be2/
UPI/CRED/cred.utility@a/payment on/AXIS
05-02-2026 BANK/640222044251/ACDd100d7d34ad04180ab635f81e9d 1,006.00 71,961.46
`;
  const st = parseStatement(icici, { providerId: 'icici-bank', docType: 'bank_statement', openingBalance: 21361346 });
  assert.equal(st.txns.length, 4);

  const emi = st.txns.find((t) => /Home Loan/i.test(t.rawDescription))!;
  assert.equal(emi.amount, -13081700);
  assert.doesNotMatch(emi.rawDescription, /INDmoney/i); // narration not absorbed

  const sip = st.txns.find((t) => /INDmoney/i.test(t.rawDescription))!;
  assert.equal(sip.amount, -1000000); // the ₹10,000 SIP owns its narration

  const cred = st.txns.find((t) => /cred\.utility/i.test(t.rawDescription))!;
  assert.equal(cred.amount, -100600);
});

// "Dr"/"Cr" markers are stripped from descriptions, but honorifics survive.
test('Dr. in a merchant name is not stripped as a debit marker', () => {
  const card = `
Card Statement Date: 31/03/2026
02/03/2026 DR. REDDYS PHARMACY BLR 845.50
`;
  const st = parseStatement(card, { providerId: 'hdfc-bank-cards', docType: 'card_statement' });
  assert.equal(st.txns.length, 1);
  assert.match(st.txns[0].rawDescription, /DR\. REDDYS/i);
});

test('extracts masked account last4 from the statement header', () => {
  const text = [
    'HDFC BANK STATEMENT',
    'Account No: XXXXXXXX7702',
    '01/03/2025 UPI/zomato 250.00 9,750.00',
  ].join('\n');
  const out = parseStatement(text, { providerId: 'hdfc-bank', docType: 'bank_statement' });
  assert.equal(out.accountLast4, '7702');
});

test('extracts card last4 written with spaces', () => {
  const text = ['Card Number 4321 5678 9012 1234', '01/03/2025 SWIGGY 500.00'].join('\n');
  const out = parseStatement(text, { providerId: 'hdfc-bank-cards', docType: 'card_statement' });
  assert.equal(out.accountLast4, '1234');
});

test('yields undefined when statement has no account header', () => {
  const text = 'HDFC BANK STATEMENT\n01/03/2025 SWIGGY 500.00';
  const out = parseStatement(text, { providerId: 'in/hdfc-bank', docType: 'bank_statement' });
  assert.equal(out.accountLast4, undefined);
});

test('extracts UPI VPA counterparty from a line', () => {
  const text = '01/03/2025 UPI/john.doe@okhdfc/Payment 250.00 9,750.00';
  const out = parseStatement(text, { providerId: 'in/hdfc-bank', docType: 'bank_statement' });
  assert.equal(out.txns[0].counterpartyRaw, 'john.doe@okhdfc');
});

test('extracts NEFT/IMPS beneficiary name', () => {
  const text = '01/03/2025 NEFT DR-HDFC0001-JANE SMITH-REF123 5,000.00 4,750.00';
  const out = parseStatement(text, { providerId: 'in/hdfc-bank', docType: 'bank_statement' });
  assert.equal(out.txns[0].counterpartyRaw, 'JANE SMITH');
});

test('generic mobile-banking line has null counterparty', () => {
  const text = '02/11/2025 MOBILE BANKING DFC bank 5,00,000.00 15,00,000.00';
  const out = parseStatement(text, { providerId: 'in/hdfc-bank', docType: 'bank_statement' });
  assert.equal(out.txns[0].counterpartyRaw, null);
});

test('extracts numeric-handle VPA counterparty from the raw line', () => {
  const text = '01/03/2025 UPI/12345@ybl/Pay 250.00 9,750.00';
  const out = parseStatement(text, { providerId: 'in/hdfc-bank', docType: 'bank_statement' });
  assert.equal(out.txns[0].counterpartyRaw, '12345@ybl');
});

// --- G1: deep headers, card-statement detection, txn-line guards (74693e3) ---

test('extracts account last4 from a label deep in the header (HDFC savings layout)', () => {
  const filler = Array.from({ length: 24 }, (_, i) => `Header filler line ${i + 1}`);
  const text = [
    'HDFC BANK LTD',
    ...filler,
    'Customer ID : 12345678',
    'Account Branch : 42',
    'Account Number : 50100234569563',
    'STATEMENT SUMMARY',
    '01/03/2025 UPI-zomato 250.00 9,750.00',
  ].join('\n');
  const out = parseStatement(text, { providerId: 'hdfc-bank', docType: 'bank_statement' });
  assert.equal(out.accountLast4, '9563');
  assert.equal(out.docType, 'bank_statement');
});

test('extracts account last4 from the ICICI savings summary block past line 20', () => {
  const filler = Array.from({ length: 30 }, (_, i) => `Summary line ${i + 1}`);
  const text = [
    'ICICI BANK STATEMENT',
    ...filler,
    'ACCOUNT TYPE ACCOUNT BALANCE (I) NOMINATION',
    'Savings A/c XXXXXXXX2840 1,23,456.00 REGISTERED',
    'Statement of Transactions in Savings Account XXXXXXXX2840 in INR for the period May 01, 2025 - May 31, 2025',
    '01/05/2025 UPI/swiggy/food 250.00 1,23,206.00',
  ].join('\n');
  const out = parseStatement(text, { providerId: 'icici-bank', docType: 'bank_statement' });
  assert.equal(out.accountLast4, '2840');
});

test('never reads last4 from transaction rows or narration lines (74693e3 guard)', () => {
  const text = [
    'HDFC BANK LTD',
    'Statement of account',
    '01/03/2025 NEFT-MB-XXXXXXXX2840-TRANSFER 5,000.00 45,000.00',
    'NEFT-MB-XXXXXXXX2840-JOHN DOE',
    '02/03/2025 UPI-A/C XXXX9999 payment 250.00 44,750.00',
  ].join('\n');
  const out = parseStatement(text, { providerId: 'hdfc-bank', docType: 'bank_statement' });
  assert.equal(out.accountLast4, undefined);
});

test('a bare digit run below an "Account No" column header is not the account (columnar summary)', () => {
  const text = [
    'Bank Account Balance',
    'Account No Account Type Balance as on',
    'May 31, 2025',
    '915010012345678 1,23,456.00',
    'Savings',
  ].join('\n');
  const out = parseStatement(text, { providerId: 'icici-bank', docType: 'bank_statement' });
  assert.equal(out.accountLast4, undefined);
});

test('detects a credit-card statement and reads the standalone masked card number', () => {
  const text = [
    'CREDIT CARD STATEMENT June 2025',
    'Statement summary and rewards',
    'Some marketing text',
    '4375XXXXXXXX9012',
    '01/05/2025 AMAZON RETAIL 1,234.00',
  ].join('\n');
  const out = parseStatement(text, { providerId: 'icici-bank', docType: 'bank_statement' });
  assert.equal(out.accountLast4, '9012');
  assert.equal(out.docType, 'card_statement');
});

test('a standalone unmasked digit run is never treated as the account number', () => {
  const text = [
    'ICICI BANK STATEMENT',
    '4375123412349012',
    '01/05/2025 SWIGGY 250.00 1,000.00',
  ].join('\n');
  const out = parseStatement(text, { providerId: 'icici-bank', docType: 'bank_statement' });
  assert.equal(out.accountLast4, undefined);
});

test('a credit-card mention deep in the body does not flip the doc type', () => {
  const filler = Array.from({ length: 10 }, (_, i) => `Terms line ${i + 1}`);
  const text = [
    'HDFC BANK STATEMENT',
    ...filler,
    'See the credit card statement terms at the branch.',
    'Account No: XXXXXXXX7702',
    '01/03/2025 UPI/zomato 250.00 9,750.00',
  ].join('\n');
  const out = parseStatement(text, { providerId: 'hdfc-bank', docType: 'bank_statement' });
  assert.equal(out.docType, 'bank_statement');
  assert.equal(out.accountLast4, '7702');
});
