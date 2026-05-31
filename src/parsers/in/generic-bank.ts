/**
 * Generic Indian bank-statement parser.
 *
 * Bank PDFs use multi-column layouts (Date | Narration | Withdrawal | Deposit |
 * Balance) that collapse when extracted to plain text, losing the column that
 * tells debit from credit. Instead of guessing columns, we use the most
 * reliable signal available: the running balance. Each row carries the txn
 * amount and the post-transaction balance; the SIGN of (balance − prevBalance)
 * tells us debit vs credit deterministically.
 *
 * Pure: text in, ParsedStatement out.
 */
import type { ParseContext, ParsedStatement, ParsedTxn } from '../types';

// DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY at the start of a row.
const DATE_RE = /\b(\d{2})[/-](\d{2})[/-](\d{2}(?:\d{2})?)\b/;
// Indian-grouped money: 1,80,000.00 / 1234.56 / 12,345. The grouped form needs
// at least one comma (+), so a plain number like 180000.00 matches the second
// alternative in full instead of being chopped to its first 3 digits.
const MONEY_RE = /\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?/g;

/** Parse an Indian-formatted amount string to paise. */
export function amountToPaise(s: string): number {
  const n = Number(s.replace(/,/g, ''));
  return Math.round(n * 100);
}

function isoDate(dd: string, mm: string, yy: string): string {
  const year = yy.length === 2 ? Number(yy) + 2000 : Number(yy);
  return `${year}-${mm}-${dd}`;
}

/** Split flattened text into candidate transaction rows, each starting at a date. */
export function splitRows(text: string): string[] {
  const normalized = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ');
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);

  // Re-stitch wrapped narration lines onto the preceding dated row.
  const rows: string[] = [];
  for (const line of lines) {
    if (DATE_RE.test(line.slice(0, 12))) rows.push(line);
    else if (rows.length) rows[rows.length - 1] += ' ' + line;
  }
  return rows;
}

export function parseGenericBank(text: string, ctx: ParseContext): ParsedStatement {
  const rows = splitRows(text);
  const txns: ParsedTxn[] = [];
  const unparsedLines: string[] = [];

  let prevBalance = ctx.openingBalance ?? null;

  for (const row of rows) {
    const dateMatch = DATE_RE.exec(row);
    const monies = row.match(MONEY_RE) ?? [];
    // Need a date and at least two money tokens (amount + balance).
    if (!dateMatch || monies.length < 2) {
      unparsedLines.push(row);
      continue;
    }

    const [, dd, mm, yy] = dateMatch;
    const date = isoDate(dd, mm, yy);

    // The last money token is the running balance; the one before is the amount.
    const balance = amountToPaise(monies[monies.length - 1]);
    const magnitude = amountToPaise(monies[monies.length - 2]);

    // Direction from balance delta when we have a previous balance; otherwise
    // fall back to explicit Cr/Dr markers, defaulting to debit.
    let signed: number;
    if (prevBalance != null) {
      signed = balance >= prevBalance ? magnitude : -magnitude;
    } else if (/\bcr\b|credit/i.test(row)) {
      signed = magnitude;
    } else {
      signed = -magnitude;
    }
    prevBalance = balance;

    // Description: strip the leading date and trailing money tokens.
    const description = row
      .replace(DATE_RE, '')
      .replace(new RegExp(`${monies[monies.length - 2]}\\s+${monies[monies.length - 1]}\\s*$`), '')
      .replace(/\b(dr|cr)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    txns.push({ date, amount: signed, currency: 'INR', rawDescription: description, balance });
  }

  return { providerId: ctx.providerId, docType: ctx.docType, txns, unparsedLines };
}
