/**
 * High-precision credit-card bill-payment signals shared by classification
 * and the ledger-wide transfer linker. Pure and deterministic.
 */

/**
 * CRED card bills paid through BillDesk appear on bank statements as:
 * BIL/ONL/<ref>/BILL DESK/CRED_<bank-code><ref>/MKS-<ref>
 *
 * The expression deliberately requires the full rail shape. Bare BillDesk or
 * CRED mentions also occur in ordinary spending and must not become transfers.
 */
const CRED_BILLDESK_CC_PAYMENT_RE =
  /\bbil\s*\/\s*onl\s*\/\s*\d+\s*\/\s*bill\s+desk\s*\/\s*cred_[a-z0-9]+\s*\/\s*mks-\d+\b/i;

export function isCredBillDeskCcPayment(description: string): boolean {
  return CRED_BILLDESK_CC_PAYMENT_RE.test(description);
}
