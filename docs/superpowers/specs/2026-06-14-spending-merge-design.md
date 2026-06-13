# Spending page merge + categorization rebuild — design

**Date:** 2026-06-14
**Status:** Approved (design); pre-implementation

## Problem

The categorization experience is broken across several seams:

1. **A classified expense can be invisible.** The provenance drawer labels a row "Expense" whenever `flow !== 'in'` (loose), but `expensesRollup` counts a row only if `flow` is exactly `'expense'` *and* it falls in the FY being viewed. A classified rent row (e.g. "Housing · Rent", `profile.home.rent`) shows correctly in the drawer yet never appears on the Expenses page. The FY selector also defaults to `2025-26` even when all data lives in `2024-25`, compounding the "nothing shows up" effect.
2. **The Expenses page is inert.** "Uncategorised" sits at ~82% (₹2.22 Cr) and is expandable but opens nothing (empty `children`). "Loan" expands only into "home EMI". The page reports a problem it gives no way to fix.
3. **The "Transactions" tab has no clear purpose** — it just re-lists expense rows already visible elsewhere.
4. **The Review Queue is a separate island.** Categorizing there does not visibly update the spending view, so the loop between "fix it" and "see it fixed" is invisible.
5. **Triage ergonomics are dated.** Groups sort by count, not value; there's no in-queue search; the category picker is an early-2000s `<select>`.
6. **Logos are inconsistent** across pages.

## Decision

Merge **Expenses + Review Queue** into a single **Spending** page with three segments — **Report**, **Triage**, **Transactions** — backed by one shared, live client data source so categorizing anywhere updates everything immediately. (Chosen over "keep three surfaces" and "review-first/read-only".)

The fun classify interaction is a **chip/pill picker + keyboard triage** (chosen over a ⌘K command palette).

## Scope

### A. Navigation
- Rename sidebar **Expenses → Spending** (`WorkbenchPage` id stays `expenses` to minimize churn, or rename to `spending` — implementer's call, keep consistent). The Spending nav item carries the **triage backlog count + alert dot** previously on Review queue.
- **Remove "Review queue"** from the Evidence nav section.
- Re-home the two non-spending review kinds:
  - **`locked_pdf`** (global "enter one password, try on all locked statements" flow) → **Sources** page. Move the unlock card + `/api/review/unlock` usage there.
  - **`missing_profile`** → a nudge banner on **Profile**.

### B. Spending page shell
- Header: "Spending" + FY + total (FY-scoped where relevant).
- Segmented control: **Report · Triage · Transactions**. The Triage segment shows a live count badge.
- **One shared client data source** — a `useSpending` hook/context holding: the expenses report rollup, the triage groups + categories, and the FY. Exposes an `assign()` mutation.
- **Live refresh:** `assign()` optimistically removes the cleared group from Triage and re-fetches/re-tallies the Report rollup + shell meta (review counts). The category that received money briefly highlights its bar. No full-page reload.

### C. Report mode (fix the inert page)
- Category bars sorted by amount desc (already done) — keep.
- **Uncategorised bar opens for real:** expanding reveals the actual per-transaction groups (from the uncategorised API) with the **view-details affordance** (reuse `toggleDetail` from the current Review queue) and **inline classify** (the chip-picker — a slice of Triage in context).
- Categorized bars expand to subcategory children **+ a "view N transactions" drill-down** using the same view-details affordance.
- **Logo/icon on every category row.**

### D. Triage mode (rebuild)
- **Sort groups by `total` descending** (change API sort from `count desc, total desc` to `total desc, count desc`). High-value backlog first (rent before annual ₹9k noise).
- **Keyword search**, run **server-side over `rawDescription`** (not just the group `sample`) so a name buried in a UPI string (e.g. landlord "Rashmi") surfaces every matching group. Add a `q` param to `/api/review/uncategorised` that filters rows by `lower(rawDescription) like %q%` before grouping.
- **Local-model suggestions** surfaced as a pre-highlighted "magic" pick. Already wired (`localSuggestion` + accept/reject endpoints); verify the accept path and lean on it harder visually (sparkle/glow on the suggested pill).
- **Chip/pill category picker replaces `<select>`:** wrapping category pills, each with icon + brand color; type-to-filter input; suggested + recently-used categories floated to the front; the model's suggested category rendered as a glowing/sparkle pill. Merchant stays an inline-editable text input.
- **Keyboard triage:** `Enter` = accept suggestion / assign current group; `/` = focus search; `j`/`k` = move focus between groups. Superhuman/Linear-style flow.

### E. Transactions mode (give the ledger a purpose)
- The **raw, searchable ledger of all flows** (income/expense/transfer/investment), not just expenses.
- Filters: flow, category, free-text search. Click any row → provenance drawer.

### F. Rent rollup bug + FY default
- Confirm against the DB: the rent row's stored `flow` value and `fyKey`. Fix whatever seam prevents a classified expense from rolling up (e.g. `flow` not persisted as exactly `'expense'`, or category/subcategory mismatch).
- **Reconcile drawer vs rollup:** the drawer should reflect the *actual* stored flow rather than `flow !== 'in'`, so the two views cannot silently disagree again.
- **Default the FY selector to the latest FY that has transactions** (query distinct `fyKey`, pick the most recent non-empty) instead of hardcoded `2025-26`.

### G. Logos everywhere
- Add a small **`CategoryGlyph`** primitive: maps a category name → lucide icon + brand color (complements the merchant-name-based `MerchantLogo`).
- Apply `MerchantLogo` where a real merchant name exists and `CategoryGlyph` for category rows, consistently across: Overview (top merchants/categories), Spending (Report rows, Transactions ledger, Triage groups), Subscriptions, Investments, Liabilities, Income, and the provenance drawer.

## Components & boundaries

- **`useSpending` (new)** — client hook/context. Owns report rollup + triage groups + categories + FY; exposes `assign()`, `search(q)`, `refresh()`. Single source of truth for the page; both modes subscribe.
- **`SpendingPage` (replaces `Expenses`)** — shell + segmented control; renders `ReportView`, `TriageView`, `TransactionsView`.
- **`ReportView`** — category bars; Uncategorised + categorized drill-downs reuse the view-details + chip-picker.
- **`TriageView`** — value-sorted groups, search box, suggestion pills, keyboard handler.
- **`CategoryChipPicker` (new)** — wrapping pills, type-to-filter, suggestion glow, keyboard-selectable. Used by both Triage and Report inline classify.
- **`CategoryGlyph` (new primitive)** — category → icon + color.
- **`TransactionsView`** — flat ledger with filters + search.
- **API:** `/api/review/uncategorised` gains a `q` param + value-first sort. `assign`, `suggestions/accept|reject`, `unlock` unchanged in contract (unlock relocates in UI to Sources). `expensesRollup` / FY-default fix in `src/ledger/rollups.ts` + FY context.

## Data flow

1. `useSpending` loads on mount: report rollup (`/api/dashboard/expenses?fy=`), triage groups (`/api/review/uncategorised`), categories.
2. User classifies in Triage or Report inline → `assign()` POSTs `/api/review/assign` → on success: remove group locally, re-fetch report rollup, refresh shell meta. Report bar for the target category animates.
3. Search in Triage → `useSpending.search(q)` re-fetches `/api/review/uncategorised?q=`.
4. Keyboard events handled at `TriageView`; `Enter` calls the same `assign()` / suggestion-accept.

## Error handling

- Assign failure: keep the group, surface an inline error (as today), restore optimistic state.
- Search/network failure: keep last-good groups, show a non-blocking notice.
- FY-default query failure: fall back to `2025-26`.
- Unlock errors: unchanged behavior, now shown on Sources.

## Testing

- **`rollups` (node:test, `PF_DB_PATH`):** a classified rent-shaped row (`flow='expense'`, `category='Housing'`, `subcategory='Rent'`, known `fyKey`) appears in `expensesRollup` for that FY and contributes to `overviewRollup`. Regression for the invisibility bug.
- **FY default:** with data only in `2024-25`, the default-FY resolver returns `2024-25`.
- **Uncategorised API:** `?q=` filters by `rawDescription`; groups sorted by `total` desc; `?signature=` detail unchanged.
- **Assign:** still clears a whole signature group; learned-rule path still auto-tags.
- Component-level interaction (chip picker, keyboard) verified via the running app (preview), not unit tests.

## Out of scope

- Re-training / changing the local model itself (only surfacing its suggestions).
- New parsers or ingest changes beyond what the rollup fix requires.
- Multi-user / sync.

## Open risks

- Renaming `WorkbenchPage` id `expenses → spending` touches routing/onboarding deep links; keeping the id and only relabeling avoids that. Implementer chooses; be consistent.
- Server-side `rawDescription` search over a large table should stay a simple `LIKE` (local SQLite, single user) — no FTS needed at this scale.
