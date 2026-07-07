/**
 * Parser types. A parser turns extracted statement TEXT into raw transactions
 * (no classification — that's the classifier's job). Amounts are signed paise:
 * negative = debit/outflow, positive = credit/inflow, matching RawTxn.
 */

export interface ParsedTxn {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Signed amount in paise. */
  amount: number;
  currency: string;
  rawDescription: string;
  /** Running balance in paise, when the statement provides it. */
  balance?: number;
  /** Counterparty string extracted from the line (VPA / beneficiary / "to X"), null when none. */
  counterpartyRaw?: string | null;
}

export interface ParsedStatement {
  providerId: string;
  docType: string;
  periodStart?: string;
  periodEnd?: string;
  /** Last 4 of the account/card this statement belongs to, from the header. */
  accountLast4?: string;
  txns: ParsedTxn[];
  /** Lines the parser could not interpret — surfaced for review. */
  unparsedLines: string[];
}

export interface ParseContext {
  providerId: string;
  docType: string;
  /** Opening balance in paise, if known from the profile/statement header. */
  openingBalance?: number;
}

export type Parser = (text: string, ctx: ParseContext) => ParsedStatement;
