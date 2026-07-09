/**
 * Universal Indian statement parser (bank + credit-card).
 *
 * Statement PDFs come in two broad shapes once flattened to text:
 *   - Bank statements: each row carries the transaction amount AND a running
 *     balance. Direction (debit/credit) is read from the SIGN of the balance
 *     delta — the most reliable signal available.
 *   - Card statements: each row carries a single amount and no running balance.
 *     Direction comes from explicit Cr/Dr markers or credit keywords (payment,
 *     refund, reversal, cashback), defaulting to a debit (a purchase).
 *
 * The parser auto-detects which shape a statement is and applies the right
 * strategy, so one parser covers both. It is defensive about what counts as a
 * money value: reference/card/cheque numbers (long bare digit runs) are NOT
 * treated as amounts, which prevents absurd parsed values.
 */
import type { ParseContext, ParsedStatement, ParsedTxn } from '../types';

// DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY at (or near) the start of a row.
const DATE_RE = /\b(\d{2})[/-](\d{2})[/-](\d{2}(?:\d{2})?)\b/;

// A money token is one of:
//   - comma-grouped (1,80,000 or 1,80,000.00)
//   - a decimal number (1234.56)
//   - a short plain integer (≤ 6 digits, e.g. 2400) — longer bare runs are
//     reference/card/cheque numbers, not amounts.
const MONEY_RE = /\b\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?\b|\b\d+\.\d{1,2}\b|\b\d{1,6}\b/g;

// Guard against parse noise: ignore "amounts" beyond ₹2 crore for a single line.
const MAX_PAISE = 200_000_000_00;

// Lines that look like transactions (have a date + number) but are actually
// summaries, balances, page furniture, or account metadata — never real txns.
const NON_TXN_RE =
  /\b(b\/f|c\/f|brought forward|carried forward|opening balance|closing balance|balance forward|market value|financial summary|statement summary|account summary|sub[- ]?total|grand total|\btotal\b|reward point|credit limit|available (credit|balance|limit)|minimum amount due|total amount due|account related|page \d+|statement of account|interest rate|annual percentage)\b/i;

// Tokens marking a credit (inflow) on a card/bank line.
const CREDIT_RE = /\b(cr|credit|refund|reversal|reversed|cashback|received|repayment)\b|\(cr\)|\+\s*$/i;
const DEBIT_RE = /\b(dr|debit)\b|\(dr\)/i;

// Account/card number in a header line: a masked or full run whose last group
// is 4 digits. Matches "XXXXXX7702", "4321 5678 9012 1234", "A/c No 0011...7702".
const ACCOUNT_HEADER_RE =
  /\b(?:a\/?c|acc(?:oun)?t|card)\s*(?:no\.?|number|#)?\s*[:-]?\s*((?:[xX*\d][xX*\d \-]{2,})\d{4})\b/i;

// A UPI VPA: handle@bank (letters/digits/._- before @, letters after).
const VPA_RE = /\b([a-z0-9._-]{2,}@[a-z]{2,})\b/i;
// NEFT/IMPS/RTGS beneficiary: "<RAIL> <DR|CR>-<IFSC/REF>-<NAME>-<REF>". The
// name is the word group sitting between the hyphen-delimited code segments.
const BENEFICIARY_RE = /\b(?:neft|imps|rtgs)\b[^-]*-[^-]+-([A-Z][A-Z .]{2,}?)-/i;

function extractCounterparty(desc: string): string | null {
  const vpa = VPA_RE.exec(desc);
  if (vpa) return vpa[1];
  const ben = BENEFICIARY_RE.exec(desc);
  if (ben) return ben[1].trim();
  return null;
}

// A statement is a card statement when its opening lines say so. Kept tight
// (phrase match in the first 8 lines) so a passing "credit card" mention in
// terms text or a bank statement's body never flips the type.
const CARD_STATEMENT_HEADER_RE = /credit card statement|statement for .{0,40}credit card/i;

/** True when the text's opening lines identify it as a credit-card statement. */
export function isCardStatementText(text: string): boolean {
  return CARD_STATEMENT_HEADER_RE.test(text.split('\n').slice(0, 8).join(' '));
}

/**
 * The header region: lines above the transaction table (first line that leads
 * with a date AND carries a money token), capped at 80 lines. Account/card
 * numbers always sit above the table in every observed layout; scoping the
 * scan this way is what keeps txn narrations ("NEFT-xxxxxxxx1234-…") from ever
 * being read as the statement's own account (the commit-74693e3 lesson).
 */
function headerRegion(text: string): string[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  for (const line of lines.slice(0, 80)) {
    const lead = DATE_RE.exec(line.trim().slice(0, 12));
    if (lead && validDateMatch(lead) && MONEY_TOKEN_RE.test(line)) break;
    out.push(line);
  }
  return out;
}

/**
 * A standalone masked card/account number on its own line ("4375XXXXXXXX9012"
 * — the ICICI card layout prints it with no label). The mask requirement is
 * the safety anchor: bare all-digit runs (references, phone numbers, the
 * columnar summary's account row) never qualify.
 */
function maskedNumberLine(line: string): string | undefined {
  const t = line.trim();
  if (!/^[\dxX* -]+$/.test(t)) return undefined;
  const compact = t.replace(/[ -]/g, '');
  const maskCount = (compact.match(/[xX*]/g) ?? []).length;
  if (maskCount < 4 || compact.length < 12 || compact.length > 19) return undefined;
  const m = /(\d{4})$/.exec(compact);
  return m ? m[1] : undefined;
}

export function extractAccountLast4(text: string): string | undefined {
  for (const line of headerRegion(text)) {
    const m = ACCOUNT_HEADER_RE.exec(line);
    if (m) {
      const digits = m[1].replace(/\D/g, '');
      if (digits.length >= 4) return digits.slice(-4);
    }
    const masked = maskedNumberLine(line);
    if (masked) return masked;
  }
  return undefined;
}

/** Parse an Indian-formatted amount string to paise. */
export function amountToPaise(s: string): number {
  const n = Number(s.replace(/,/g, ''));
  return Math.round(n * 100);
}

/** ISO date for a DD/MM/YY(YY) match, or null when the parts aren't a real
 * calendar date (e.g. a ref fragment like 99/99/99 that matched the pattern). */
function isoDate(dd: string, mm: string, yy: string): string | null {
  const day = Number(dd);
  const month = Number(mm);
  const year = yy.length === 2 ? Number(yy) + 2000 : Number(yy);
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > 2099) return null;
  // Round-trip through Date: 31/02/2025 passes the range checks above but is
  // not a real date — stored as-is it became fyKey "NaN-NaN" and the txn
  // vanished from every FY view.
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${mm}-${dd}`;
}

function validDateMatch(m: RegExpExecArray): boolean {
  return isoDate(m[1], m[2], m[3]) !== null;
}

/**
 * Statements sometimes land two transactions on one extracted line ("01/03 EMI
 * debit 28,590.00 1,20,000.00 10/03 UPI/INDmoney 5,000.00 …"). A row is split
 * at an interior date ONLY when real money tokens already appeared before it —
 * a txn-date followed immediately by a value-date column has no amount between
 * the two dates, so it stays one row.
 */
function splitMergedTxns(row: string): string[] {
  const out: string[] = [];
  const re = new RegExp(DATE_RE.source, 'g');
  const lead = re.exec(row);
  let start = 0;
  let cursor = lead ? lead.index + lead[0].length : 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(row)) !== null) {
    if (!validDateMatch(m)) continue;
    // Amounts carry a decimal or Indian comma grouping; bare integers are refs.
    const between = row.slice(cursor, m.index);
    const hasAmount = /\d[\d,]*\.\d{1,2}\b|\b\d{1,3}(?:,\d{2,3})+\b/.test(between);
    if (hasAmount) {
      out.push(row.slice(start, m.index).trim());
      start = m.index;
    }
    cursor = m.index + m[0].length;
  }
  out.push(row.slice(start).trim());
  return out.filter(Boolean);
}

// A narration orphan: a standalone payment-rail line ("UPI/INDmoney/…",
// "IMPS/…") that some layouts (e.g. ICICI) print BETWEEN dated rows. It
// belongs to the FOLLOWING transaction, not the previous one.
const NARRATION_RE = /^(upi|imps|neft|rtgs|ach|nach|enach|ecs|bil|cms|atm|pos|vps|inft?)[/ ]/i;
const MONEY_TOKEN_RE = /\d[\d,]*\.\d{1,2}\b|\b\d{1,3}(?:,\d{2,3})+\b/;
// A row that already ends in its amount/balance columns is complete — extra
// text after it cannot be its own wrapped description.
const ROW_COMPLETE_RE = /(?:\d[\d,]*\.\d{1,2}|\d{1,3}(?:,\d{2,3})+)\s*(?:\(?(?:cr|dr)\)?)?\s*$/i;

/** Split flattened text into candidate transaction rows, each starting at a date. */
export function splitRows(text: string): string[] {
  const normalized = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ');
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);
  const rows: string[] = [];
  let narration: string[] = [];
  // Whether the last row already ended in its amount/balance columns. Junk
  // fragments appended afterwards ("be2/") don't make a complete row
  // incomplete, so the flag is sticky once true.
  let lastRowComplete = false;
  for (const line of lines) {
    const lead = DATE_RE.exec(line.slice(0, 12));
    if (lead && validDateMatch(lead)) {
      // A buffered narration line describes THIS transaction.
      rows.push(narration.length ? `${line} ${narration.join(' ')}` : line);
      narration = [];
      lastRowComplete = ROW_COMPLETE_RE.test(line);
    } else if (rows.length) {
      if (!MONEY_TOKEN_RE.test(line) && NARRATION_RE.test(line) && lastRowComplete) {
        narration.push(line);
      } else {
        rows[rows.length - 1] = `${rows[rows.length - 1]} ${line}`;
        lastRowComplete = lastRowComplete || ROW_COMPLETE_RE.test(line);
      }
    }
  }
  if (narration.length && rows.length) rows[rows.length - 1] += ' ' + narration.join(' ');
  return rows.flatMap(splitMergedTxns);
}

/** Money tokens in a row AFTER its leading date is removed. Prefers tokens that
 * carry a decimal or comma (real amounts) over bare integers (often ref nos). */
function moneyTokens(rowAfterDate: string): { all: string[]; preferred: string[] } {
  const all = rowAfterDate.match(MONEY_RE) ?? [];
  const decimalLike = all.filter((t) => t.includes('.') || t.includes(','));
  return { all, preferred: decimalLike.length ? decimalLike : all };
}

export function parseGenericBank(text: string, ctx: ParseContext): ParsedStatement {
  const rows = splitRows(text);
  const txns: ParsedTxn[] = [];
  const unparsedLines: string[] = [];

  // Pre-scan to decide balance vs no-balance layout.
  interface Row {
    raw: string;
    date: string;
    toks: string[];
  }
  const dated: Row[] = [];
  for (const raw of rows) {
    const dm = DATE_RE.exec(raw);
    const date = dm ? isoDate(dm[1], dm[2], dm[3]) : null;
    if (!dm || !date) {
      unparsedLines.push(raw);
      continue;
    }
    // Skip summary / balance / page-furniture lines that merely look like txns.
    if (NON_TXN_RE.test(raw)) {
      unparsedLines.push(raw);
      continue;
    }
    const afterDate = raw.replace(DATE_RE, ' ');
    const { preferred } = moneyTokens(afterDate);
    if (preferred.length === 0) {
      unparsedLines.push(raw);
      continue;
    }
    dated.push({ raw, date, toks: preferred });
  }

  // Balance mode if a clear majority of rows have ≥2 money values (amount + balance).
  const multi = dated.filter((r) => r.toks.length >= 2).length;
  const balanceMode = dated.length > 0 && multi / dated.length >= 0.6;

  let prevBalance: number | null = ctx.openingBalance ?? null;
  const seen = new Set<string>(); // dedupe identical rows within a statement

  for (const r of dated) {
    let magnitude: number;
    let balance: number | undefined;
    let signed: number;

    if (balanceMode && r.toks.length >= 2) {
      balance = amountToPaise(r.toks[r.toks.length - 1]);
      magnitude = amountToPaise(r.toks[r.toks.length - 2]);
      if (prevBalance != null) {
        signed = balance >= prevBalance ? magnitude : -magnitude;
      } else {
        signed = CREDIT_RE.test(r.raw) && !DEBIT_RE.test(r.raw) ? magnitude : -magnitude;
      }
      prevBalance = balance;
    } else {
      // No-balance (card) layout: amount is the trailing money token.
      magnitude = amountToPaise(r.toks[r.toks.length - 1]);
      signed = CREDIT_RE.test(r.raw) && !DEBIT_RE.test(r.raw) ? magnitude : -magnitude;
    }

    if (!Number.isFinite(magnitude) || Math.abs(signed) > MAX_PAISE || magnitude === 0) {
      unparsedLines.push(r.raw);
      continue;
    }

    // Description: drop date, the money tokens we consumed, and Dr/Cr markers.
    let description = r.raw.replace(DATE_RE, ' ');
    for (const t of r.toks) description = description.replace(t, ' ');
    description = description
      // Strip Dr/Cr markers, but not honorifics like "Dr. Reddy" (dot follows).
      .replace(/\((?:dr|cr)\)/gi, ' ')
      .replace(/(^|\s)(?:dr|cr)(?=\s|$)/gi, ' ')
      .replace(/[|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Drop duplicate rows (same date + amount + description signature) that
    // repeat across statement sections (e.g. summary + detail).
    const sig = `${r.date}|${signed}|${description.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40)}`;
    if (seen.has(sig)) {
      unparsedLines.push(r.raw);
      continue;
    }
    seen.add(sig);

    txns.push({ date: r.date, amount: signed, currency: 'INR', rawDescription: description, balance, counterpartyRaw: extractCounterparty(r.raw) });
  }

  return {
    providerId: ctx.providerId,
    // Statements arrive typed by their Gmail provider (bank docs default to
    // bank_statement), but issuers send card statements from the same address —
    // trust the document's own header over the assumed type.
    docType: isCardStatementText(text) ? 'card_statement' : ctx.docType,
    accountLast4: extractAccountLast4(text),
    txns,
    unparsedLines,
  };
}
