---
name: review-ui-conventions
description: Use when changing the triage/review UI, category picker, spending pages, or suggestion surfaces — including making categorisation faster, adding keyboard flows, changing category chips/labels, or touching the merchant field or assign flow.
---

# Review UI Conventions

## Component map

| Piece | File |
|---|---|
| Triage list, search, j/k/'/' keys | `src/ui/pages/spending/TriageView.tsx` |
| Per-group card: chips, merchant field, assign, transfer banner | `src/ui/pages/spending/GroupRow.tsx` |
| Data hook + group shape (`suggestedMerchant`, `localSuggestion`) | `src/ui/data/useSpending.ts` |
| Assign endpoint (derives flow, creates override + ML feedback) | `app/api/review/assign/route.ts` |
| Category keys per flow | `src/classifier/taxonomy.ts` (`categoriesForFlow`) |

## Invariants — do not regress

- **Users never pick flow.** `flowFor()` in the assign route derives it from the amount sign + canonical category; a debit can't be mislabelled income. Keep it server-side.
- **Every assign is training data.** The merchant + category submitted become a user override AND a local-ML feedback example. Junk in the merchant field poisons the flywheel — never force a merchant value for non-merchant transactions (transfers, P2P, bank charges); empty must be acceptable there.
- **`category='Transfer'`** through the assign route sets `flow='transfer'`, `isInternalTransfer=true`, and clears `suspectedTransfer` — the transfer action must remain reachable for EVERY debit group, not only inside the suspected-transfer banner.
- Amounts render mask-aware; taxonomy keys are storage, not copy — display labels are title-cased human strings (`displayCategory` in `src/classifier/merchant-aliases.ts` is the precedent).

## Dead-ends status (originally verified 2026-07; re-baselined 2026-07-11 against main)

FIXED on main — do not re-report: **chip wall** (6-item ranked shortlist: suggested → user-frequency `topCategories` → taxonomy; `SHORTLIST_SIZE` in `CategoryChipPicker.tsx`), **transfer unreachable** (always-available ghost button on debit groups, `GroupRow.tsx`), **merchant junk prefill** (prefills only from `localSuggestion`; `suggestedMerchant` is placeholder-only), **raw snake_case labels** (`labelForCategory` on every chip).

Still open:
1. **Flat altitude**: parents (utilities, transport) and children (electricity, fuel, cabs) sit in one cloud. Prefer parent-first with drill-down, or rank so only relevant children surface.
2. **Per-group suggestion selection** — FIXED: the uncategorised route keeps the group suggestion with the highest `confidenceScore` (tie-break: ascending transaction id) and returns a deterministic `ranked: string[]` shortlist per group via the pure `rankCategories` (`src/review/rank-categories.ts` — suggestion → provenance distribution → user frequency → taxonomy order, flow-filtered, capped at 5).

## Keyboard flow target

`j`/`k` navigate (exists) · `/` search (exists) · `1`–`5` pick ranked suggestion · `Enter` assign · `x` mark transfer · `u` undo last. Every assign path must work without the mouse — triage is a repetition task.

## Overflow prevention (crore-scale money, long merchants)

Indian amounts reach 11+ characters (₹1,07,21,886); merchant names and UPI
descriptors are unbounded. Rules:

- Headline/stat money renders **compact**: `<Money compact …/>` → `₹1.07 Cr`
  via `inrCompact` (`src/ui/lib/format.ts`), exact value auto-moves to the
  tooltip. Tables/rows keep full precision at small sizes.
- Unbounded text in flex rows needs `minWidth: 0` on the flex child plus
  ellipsis or `overflowWrap` (see `.ttl` in GroupRow for the pattern).
- After any layout/typography change, stress-seed the scratch DB (crore
  amounts, 100+ char merchant/descriptor strings) and run the overflow
  detector on every page at desktop AND 768px:

```js
[...document.querySelectorAll('*')].filter(el =>
  getComputedStyle(el).overflowX === 'visible' &&
  el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2)
```

Validate the detector first with an injected known-overflow probe — an empty
result you haven't tested the test for proves nothing. Sub-768px is not a
supported form factor (desktop workbench).

## Verify

`dev-fresh` server (see verifying-changes skill); confirm an assign round-trip updates the DB row AND creates the override/feedback rows, not just the UI state.
