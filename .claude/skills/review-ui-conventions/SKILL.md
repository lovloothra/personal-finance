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

## Known dead-ends (as of 2026-07, screenshot-verified)

1. **Chip wall**: `GroupRow` renders all 24 `categoriesForFlow('expense')` keys as chips per card. Replace with a ranked shortlist (top 3–5) + typeahead for the rest. Ranking inputs that already exist: `localSuggestion`, the stored ML `provenance.distribution` (`classificationPredictions`), amount bucket, counterparty kind.
2. **Transfer unreachable**: "Mark as transfer" only appears in the suspected-transfer banner (`GroupRow.tsx` ~177). Promote to an always-available secondary action on debit groups.
3. **Merchant junk prefill**: `suggestedMerchant` title-cases the signature ("Mobile Banking Sh Idfb"), and assign is disabled while the field is empty — forcing garbage into overrides + training data. Prefill only from alias/ML merchant; otherwise leave empty and allow assign for non-merchant categories.
4. **Raw snake_case labels**: chips show taxonomy keys (`mobile_internet`). Map to display labels; keep keys in the payload.
5. **Flat altitude**: parents (utilities, transport) and children (electricity, fuel, cabs) sit in one cloud. Prefer parent-first with drill-down, or rank so only relevant children surface.
6. **Header framing**: crore-scale uncategorised sums (which include transfer legs) read as alarm, and the % is ambiguous. Lead with counts and progress ("N left, M done"); de-emphasize sums in the uncategorised group.

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
