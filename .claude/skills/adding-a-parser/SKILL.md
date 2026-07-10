---
name: adding-a-parser
description: Use when adding support for a new bank or card statement format, fixing wrong dates/amounts/balance/counterparty/account-last4 extraction from statement text, or when a provider's statements fall through to the generic bank parser with unparsed lines.
---

# Adding or Fixing a Statement Parser

## Overview

Parsers turn extracted statement TEXT into a `ParsedStatement` (`src/parsers/types.ts`). They are pure functions: text in, struct out — no DB access and no classification (that's the classifier's job).

## Dispatch

`src/parsers/registry.ts` resolves in order: `${providerId}:${docType}` → `*:${docType}` → generic fallback. `providerId` is the pack id slug (e.g. `hdfc-bank`); `docType` is e.g. `bank_statement`, `card_statement`.

New-parser checklist:
1. Create `src/parsers/in/<provider>.ts` exporting a `Parser` function.
2. `registerParser('<provider-id>:<doc-type>', parseX)` in `registry.ts`.
3. Tests in `src/parsers/__tests__/` using realistic statement text fragments (redact any personal data).

## Non-negotiable semantics

- **Amounts are SIGNED integer paise**: negative = debit/outflow, positive = credit/inflow. A ₹1,234.56 debit is `-123456`.
- Dates are ISO `YYYY-MM-DD`, and must be REAL calendar dates — validate by
  round-tripping through `Date.UTC` and comparing components. Range checks
  alone let 31/02 through, and V8 **rolls impossible ISO dates over**
  (`new Date('2025-02-31')` → Mar 3) instead of rejecting them, silently
  filing the txn under the wrong month/FY. `fyForDate` throws as the backstop.
- Lines you can't interpret go into `unparsedLines` — never silently drop them; the UI surfaces them for review.
- `accountLast4` comes from the statement HEADER only. A doc-wide last-4 regex once matched transaction-line account numbers and mis-stamped documents (fixed in commit 74693e3) — scope the regex to the header region and keep a negative test proving txn lines don't match.
- `counterpartyRaw` is the per-line VPA / beneficiary / "to X" string, `null` when absent — extract, don't guess.

## Before writing a bespoke parser

Try `parseGenericBank` (`src/parsers/in/generic-bank.ts`) first — it handles the common Indian balance-delta statement shape. HDFC, ICICI, Axis, SBI, and Kotak intentionally ride the generic parser. Write a bespoke one only when the generic parser demonstrably misparses that provider's format.

## Testing

- Feed multi-line fixture strings; assert both `txns` AND `unparsedLines`.
- Add negative tests for every regex (text that must NOT match).
- Run: `node --import tsx --conditions=react-server --test src/parsers/__tests__/<file>.test.ts`
- Reference example: `src/parsers/__tests__/generic-bank.test.ts`.
