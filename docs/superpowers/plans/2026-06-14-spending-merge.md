# Spending Page Merge + Categorization Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge Expenses + Review Queue into one live **Spending** page (Report / Triage / Transactions), fix the "classified expense doesn't roll up" seam, and rebuild triage with value-sorted groups, server-side keyword search, model suggestions, logos, and a chip-picker + keyboard flow.

**Architecture:** Backend changes are pure functions over the encrypted SQLite DB, tested with `node:test` + ephemeral `PF_DB_PATH`. The page is a single client shell (`SpendingPage`) with three views fed by one shared `useSpending` hook; classifying anywhere mutates that shared state and re-tallies the report optimistically. New UI primitives (`CategoryGlyph`, `CategoryChipPicker`) are reused by both Triage and Report inline-classify. UI is verified in the running app via the preview tools, not unit tests.

**Tech Stack:** Next.js App Router (RSC + client components), Drizzle ORM over `better-sqlite3-multiple-ciphers`, `lucide-react` icons, Node built-in test runner, `tsx`.

**Spec:** `docs/superpowers/specs/2026-06-14-spending-merge-design.md`

**Conventions reminder:** money is integer **paise** in the DB, whole **rupees** in every DTO. Server modules that touch the DB import `server-only`. Run DB-touching scripts/tests with the `react-server` condition where noted. Commit after every task.

---

## File map

**Create**
- `src/ledger/__tests__/fy-availability.test.ts` — tests for available/latest FY.
- `app/api/dashboard/fys/route.ts` — list FYs that have transactions.
- `app/api/dashboard/transactions/route.ts` — flat all-flows ledger with filters.
- `src/ui/primitives/CategoryGlyph.tsx` — category → icon + color.
- `src/ui/primitives/CategoryChipPicker.tsx` — pill picker replacing `<select>`.
- `src/ui/data/useSpending.ts` — shared client data source for the Spending page.
- `src/ui/pages/spending/SpendingPage.tsx` — shell + segmented control.
- `src/ui/pages/spending/ReportView.tsx`
- `src/ui/pages/spending/TriageView.tsx`
- `src/ui/pages/spending/TransactionsView.tsx`
- `src/ui/pages/spending/GroupRow.tsx` — one triage group (extracted from `Review.tsx`).

**Modify**
- `src/ledger/rollups.ts` — add FY-availability helpers; reconcile flow.
- `app/api/review/uncategorised/route.ts` — value-first sort + `q` search.
- `src/ui/lib/fixtures.ts` — widen `FyKey`; add `fySummary()` fallback.
- `src/ui/contexts/FyCtx.tsx` — arbitrary FY; default to latest-with-data.
- `src/ui/shell/Topbar.tsx` — live FY list.
- `src/ui/shell/Sidebar.tsx` + `src/ui/shell/Workbench.tsx` — rename Expenses→Spending, retire Review nav, route `spending`.
- `src/ui/pages/Sources.tsx` — host the locked-PDF unlock card.
- `src/ui/pages/Profile.tsx` — profile-gap nudge.
- `src/ui/primitives/ProvenanceDrawer.tsx` — show actual stored flow.
- Logo application: `Overview.tsx`, `Subscriptions.tsx`, `Investments.tsx`, `Liabilities.tsx`, `Income.tsx`.
- Guard `fys[fy]` at all 8 sites listed in the spec.

**Delete**
- `src/ui/pages/Expenses.tsx` and `src/ui/pages/Review.tsx` once SpendingPage subsumes them (Task 14).

---

## Phase 1 — Backend & data correctness (TDD)

### Task 1: FY availability helpers + API

**Files:**
- Modify: `src/ledger/rollups.ts`
- Create: `src/ledger/__tests__/fy-availability.test.ts`
- Create: `app/api/dashboard/fys/route.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ledger/__tests__/fy-availability.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-fy-')), 'test.db');

const { getDb } = await import('@/db/client');
const { transactions } = await import('@/db/schema');
const { availableFys, latestFyWithData } = await import('@/ledger/rollups');

const db = await getDb();
const base = {
  institutionId: null, accountId: null, messageId: null, attachmentId: null,
  rawDescription: 'X', merchant: 'X', subcategory: null, confidence: 'high',
  layer: 2, classificationReason: null, profileSignalUsed: null,
  classificationSource: 'deterministic' as const, acceptedPredictionId: null,
  isInternalTransfer: false, isRecurring: false, projectId: null, taxSection: null,
  reviewRequired: false, createdAt: Date.now(), updatedAt: Date.now(),
};
db.insert(transactions).values([
  { id: 't1', txnDate: '2024-06-01', amount: -5400000, flow: 'expense', category: 'Housing', fyKey: '2024-25', ...base },
  { id: 't2', txnDate: '2023-06-01', amount: -100000, flow: 'expense', category: 'Food', fyKey: '2023-24', ...base },
]).run();

test('availableFys returns distinct FY keys, newest first', () => {
  assert.deepEqual(availableFys(db), ['2024-25', '2023-24']);
});

test('latestFyWithData returns the newest non-empty FY', () => {
  assert.equal(latestFyWithData(db), '2024-25');
});

test('latestFyWithData returns null on an empty DB', async () => {
  process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-fy2-')), 'empty.db');
  const mod = await import('@/db/client?empty');
  const edb = await mod.getDb();
  assert.equal(latestFyWithData(edb), null);
});
```

> Note: if `@/db/client?empty` cache-busting does not work in this runner, drop the third test and instead assert `availableFys(db)` is non-empty; an empty-DB unit is covered by the route's fallback.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --conditions=react-server --test src/ledger/__tests__/fy-availability.test.ts`
Expected: FAIL — `availableFys is not a function`.

- [ ] **Step 3: Implement the helpers**

In `src/ledger/rollups.ts`, after `flowSum` (~line 77), add:

```ts
/** Distinct FY keys that have at least one transaction, newest first. */
export function availableFys(db: DB): string[] {
  return db
    .selectDistinct({ fy: transactions.fyKey })
    .from(transactions)
    .orderBy(desc(transactions.fyKey))
    .all()
    .map((r) => r.fy)
    .filter((fy): fy is string => Boolean(fy));
}

/** The newest FY that has data, or null on a fresh DB. */
export function latestFyWithData(db: DB): string | null {
  return availableFys(db)[0] ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --conditions=react-server --test src/ledger/__tests__/fy-availability.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the API route**

Create `app/api/dashboard/fys/route.ts`:

```ts
import { getDb } from '@/db/client';
import { availableFys, latestFyWithData } from '@/ledger/rollups';
import { json, badRequest } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const db = await getDb();
    const fys = availableFys(db);
    return json({ fys, latest: latestFyWithData(db) });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to list FYs.', 500);
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/ledger/rollups.ts src/ledger/__tests__/fy-availability.test.ts app/api/dashboard/fys/route.ts
git commit -m "feat(rollups): FY availability helpers + /api/dashboard/fys"
```

---

### Task 2: Value-first sort + rawDescription search in uncategorised API

**Files:**
- Modify: `app/api/review/uncategorised/route.ts`
- Create: `app/api/review/__tests__/uncategorised-query.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/api/review/__tests__/uncategorised-query.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PF_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pf-uncat-')), 'test.db');

const { getDb } = await import('@/db/client');
const { transactions } = await import('@/db/schema');
const { GET } = await import('@/../app/api/review/uncategorised/route');

const db = await getDb();
const base = {
  institutionId: null, accountId: null, messageId: null, attachmentId: null,
  merchant: null, subcategory: null, confidence: 'low', layer: 7,
  classificationReason: null, profileSignalUsed: null,
  classificationSource: 'deterministic' as const, acceptedPredictionId: null,
  isInternalTransfer: false, isRecurring: false, projectId: null, taxSection: null,
  reviewRequired: true, category: 'Uncategorised', flow: 'expense',
  fyKey: '2024-25', createdAt: Date.now(), updatedAt: Date.now(),
};
// One big-value group (rent to RASHMI) and one tiny high-count group.
db.insert(transactions).values([
  { id: 'r1', txnDate: '2024-06-01', amount: -5400000, rawDescription: 'UPI/RASHMI/rent', ...base },
  { id: 'r2', txnDate: '2024-07-01', amount: -5400000, rawDescription: 'UPI/RASHMI/rent', ...base },
  { id: 's1', txnDate: '2024-06-02', amount: -9000, rawDescription: 'UPI/NEWSPAPER/sub', ...base },
  { id: 's2', txnDate: '2024-06-03', amount: -9000, rawDescription: 'UPI/NEWSPAPER/sub', ...base },
  { id: 's3', txnDate: '2024-06-04', amount: -9000, rawDescription: 'UPI/NEWSPAPER/sub', ...base },
]).run();

test('groups are sorted by total value descending', async () => {
  const res = await GET(new Request('http://x/api/review/uncategorised'));
  const data = await res.json();
  assert.equal(data.groups[0].sample.includes('RASHMI'), true, 'rent group first');
});

test('q filters by rawDescription substring (case-insensitive)', async () => {
  const res = await GET(new Request('http://x/api/review/uncategorised?q=rashmi'));
  const data = await res.json();
  assert.equal(data.groups.length, 1);
  assert.equal(data.totalTransactions, 2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --conditions=react-server --test app/api/review/__tests__/uncategorised-query.test.ts`
Expected: FAIL — the `q` test returns all groups; the sort test may fail because today's sort is `count desc` (newspaper group, count 3, would come first).

- [ ] **Step 3: Implement the change**

In `app/api/review/uncategorised/route.ts`:

(a) After reading `detailSig`, read the search term:

```ts
    const q = new URL(req.url).searchParams.get('q')?.trim().toLowerCase() ?? '';
```

(b) Filter rows by `q` against `rawDescription` before grouping. Replace the `rows` assignment's use with a post-filter (keep the SQL select as-is, then):

```ts
    const allRows = db
      .select({ /* unchanged select */ })
      .from(transactions)
      .where(eq(transactions.reviewRequired, true))
      .all();
    const rows = q
      ? allRows.filter((r) => (r.rawDescription ?? '').toLowerCase().includes(q))
      : allRows;
```

(c) Change the sort from count-first to **value-first**:

```ts
    const sorted = [...groups.values()]
      .sort((a, b) => b.total - a.total || b.count - a.count)
      .map((g) => ({ ...g, total: Math.round(g.total / 100) }));
```

(Also use `rows` — the filtered set — for the `categories` accumulation and `totalTransactions`, which it already does.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --conditions=react-server --test app/api/review/__tests__/uncategorised-query.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/review/uncategorised/route.ts app/api/review/__tests__/uncategorised-query.test.ts
git commit -m "feat(review): value-first sort + rawDescription search in uncategorised API"
```

---

### Task 3: Reconcile flow truth — drawer vs rollup

**Investigation first** (the rent bug is data-dependent). Run, with the real DB, a one-off to see how the rent row is actually stored:

```bash
tsx --conditions=react-server -e "import('@/db/client').then(async ({getDb})=>{const {transactions}=await import('@/db/schema');const db=await getDb();const rows=db.select().from(transactions).all().filter(t=>(t.subcategory??'').toLowerCase()==='rent'||(t.category??'')==='Housing');console.log(rows.map(r=>({id:r.id,fy:r.fyKey,flow:r.flow,cat:r.category,sub:r.subcategory,amt:r.amount,review:r.reviewRequired})));})"
```

Two outcomes:
- **Flow not exactly `'expense'`** (e.g. `null`/`'transfer'`) → the rollup correctly excludes it; the real fix is the classifier/assign path that produced it. Note it and, if it's a stale row, a `Re-apply rules` pass fixes it. No code change needed in rollups beyond Step 3 below.
- **Flow is `'expense'` but `fyKey` ≠ the viewed FY** → this is the FY-default problem solved in Task 5; nothing to fix here.

Either way, make the **drawer stop lying** so the two views can't silently disagree.

**Files:**
- Modify: `src/ui/data/useOverview.ts` (`recentToTxn`) and `src/ui/primitives/ProvenanceDrawer.tsx`

- [ ] **Step 1: Carry the real flow into the drawer Txn**

In `src/ui/lib/fixtures.ts`, the `Txn.flow` is `FlowDir` (`'in' | 'out'`). Add an authoritative field rather than overloading it. In `Txn` interface add:

```ts
  ledgerFlow?: 'income' | 'expense' | 'transfer' | 'investment';
```

In `recentToTxn` (`src/ui/data/useOverview.ts`), set it from the DTO:

```ts
    ledgerFlow: r.flow as Txn['ledgerFlow'],
```

- [ ] **Step 2: Use it in the drawer badge**

In `ProvenanceDrawer.tsx`, replace the badge (`txn.flow === 'in' ? 'Income' : 'Expense'`, ~line 63) with a label derived from `ledgerFlow` when present:

```tsx
            <span className="badge brand">
              {txn.ledgerFlow
                ? txn.ledgerFlow.charAt(0).toUpperCase() + txn.ledgerFlow.slice(1)
                : txn.flow === 'in' ? 'Income' : 'Expense'}
            </span>
```

Now a transfer reads "Transfer", an investment "Investment" — matching exactly what the rollup counts.

- [ ] **Step 3: Verify in the app (preview)**

Open a transaction known to be a transfer/investment; the drawer badge must match its category. (Covered in the Task 14 preview pass.)

- [ ] **Step 4: Commit**

```bash
git add src/ui/lib/fixtures.ts src/ui/data/useOverview.ts src/ui/primitives/ProvenanceDrawer.tsx
git commit -m "fix(drawer): show actual ledger flow so it matches the rollups"
```

---

## Phase 2 — Shared client data + FY widening

### Task 4: `useSpending` shared hook

**Files:**
- Create: `src/ui/data/useSpending.ts`

This hook owns the page's data: the expenses report, the triage groups, the categories, and the FY. It exposes `assign`, `acceptSuggestion`, `rejectSuggestion`, `search`, and `refreshReport`.

- [ ] **Step 1: Write the hook**

```ts
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExpensesDTO } from './useDashboard';

export interface UncatGroup {
  signature: string;
  sample: string;
  suggestedMerchant: string;
  count: number;
  total: number;
  flow: string;
  category: string | null;
  firstDate: string;
  lastDate: string;
  localSuggestion?: {
    id: string; merchant: string; category: string; subcategory: string | null;
    confidence: string; confidenceScore: number; reason: string; evidenceCount: number;
  } | null;
}
export interface UncatDTO {
  hasData: boolean; totalTransactions: number; totalGroups: number;
  groups: UncatGroup[]; categories: string[];
}

export function useSpending(fy: string) {
  const [report, setReport] = useState<ExpensesDTO | null>(null);
  const [triage, setTriage] = useState<UncatDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [highlight, setHighlight] = useState<string | null>(null); // category name to flash
  const queryRef = useRef('');

  const refreshReport = useCallback(async () => {
    const r = await fetch(`/api/dashboard/expenses?fy=${encodeURIComponent(fy)}`);
    setReport((await r.json()) as ExpensesDTO);
  }, [fy]);

  const loadTriage = useCallback(async (q = queryRef.current) => {
    queryRef.current = q;
    const url = q ? `/api/review/uncategorised?q=${encodeURIComponent(q)}` : '/api/review/uncategorised';
    const r = await fetch(url);
    setTriage((await r.json()) as UncatDTO);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([refreshReport(), loadTriage('')]).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [refreshReport, loadTriage]);

  const search = useCallback((q: string) => loadTriage(q), [loadTriage]);

  /** Remove a cleared group locally, re-tally the report, flash its category. */
  const settle = useCallback((sig: string, category: string, removed: number, alsoTaught = 0) => {
    setTriage((u) => u ? {
      ...u,
      groups: u.groups.filter((g) => g.signature !== sig),
      totalGroups: u.totalGroups - 1,
      totalTransactions: u.totalTransactions - removed - alsoTaught,
    } : u);
    setHighlight(category);
    setTimeout(() => setHighlight((h) => (h === category ? null : h)), 1400);
    void refreshReport();
  }, [refreshReport]);

  const assign = useCallback(async (sig: string, merchant: string, category: string) => {
    const res = await fetch('/api/review/assign', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signature: sig, merchant, category }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Assign failed');
    settle(sig, category, data.updated as number, (data.aliasApplied as number) ?? 0);
    if (data.aliasApplied > 0) void loadTriage(); // learned rule reshuffles others
    return data as { updated: number; aliasToken: string | null; aliasApplied: number };
  }, [settle, loadTriage]);

  const acceptSuggestion = useCallback(async (id: string, sig: string, category: string) => {
    const res = await fetch(`/api/review/suggestions/${encodeURIComponent(id)}/accept`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Accept failed');
    settle(sig, category, 1);
  }, [settle]);

  const rejectSuggestion = useCallback(async (id: string) => {
    const res = await fetch(`/api/review/suggestions/${encodeURIComponent(id)}/reject`, { method: 'POST' });
    if (!res.ok) throw new Error('Reject failed');
    setTriage((u) => u ? {
      ...u,
      groups: u.groups.map((g) => g.localSuggestion?.id === id ? { ...g, localSuggestion: null } : g),
    } : u);
  }, []);

  return { report, triage, loading, highlight, assign, acceptSuggestion, rejectSuggestion, search, refreshReport, loadTriage };
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build` (or `npx tsc --noEmit` if faster). Expected: no type errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/ui/data/useSpending.ts
git commit -m "feat(spending): shared useSpending hook (report + triage + live settle)"
```

---

### Task 5: Widen FY support + default to latest-with-data

**Files:**
- Modify: `src/ui/lib/fixtures.ts`, `src/ui/contexts/FyCtx.tsx`, `src/ui/shell/Topbar.tsx`
- Modify (guards): `Investments.tsx`, `Sources.tsx`, `shared.tsx`, `Liabilities.tsx`, `Overview.tsx`, `Income.tsx` (and `Expenses.tsx` is being replaced)

- [ ] **Step 1: Widen the type + add a label fallback**

In `src/ui/lib/fixtures.ts`, change:

```ts
export type FyKey = string; // was '2025-26' | '2026-27'
```

Add a fallback accessor below the `fys` definition:

```ts
/** A summary for any FY key — falls back to a synthesized label for live FYs
 *  not present in the demo `fys` map. */
export function fySummary(key: FyKey): FySummary {
  return fys[key] ?? {
    ...fys['2025-26'],
    label: `FY ${key}`,
  };
}
```

- [ ] **Step 2: Replace `fys[fy]` lookups with `fySummary(fy)`**

At each site (`Investments.tsx:30`, `Sources.tsx:12`, `shared.tsx:84`, `Liabilities.tsx:23`, `Overview.tsx:44`, `Income.tsx:15`), import `fySummary` and replace `fys[fy]` / `const f = fys[fy]` with `fySummary(fy)`. Topbar's `fys[k].label` (the demo list) stays, but see Step 4.

- [ ] **Step 3: Default the FY context to latest-with-data**

Rewrite `src/ui/contexts/FyCtx.tsx`:

```tsx
'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { FyKey } from '../lib/fixtures';

interface FyCtxValue { fy: FyKey; setFy: (next: FyKey) => void; fys: FyKey[]; }
const FyCtx = createContext<FyCtxValue>({ fy: '2025-26', setFy: () => {}, fys: [] });

export function FyProvider({ children }: { children: ReactNode }) {
  const [fy, setFy] = useState<FyKey>('2025-26');
  const [fys, setFys] = useState<FyKey[]>([]);
  const [pinned, setPinned] = useState(false); // once the user picks, stop auto-switching

  useEffect(() => {
    let active = true;
    fetch('/api/dashboard/fys')
      .then((r) => r.json())
      .then((d: { fys: string[]; latest: string | null }) => {
        if (!active) return;
        setFys(d.fys);
        if (!pinned && d.latest) setFy(d.latest);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [pinned]);

  const choose = (next: FyKey) => { setPinned(true); setFy(next); };
  return <FyCtx.Provider value={{ fy, setFy: choose, fys }}>{children}</FyCtx.Provider>;
}

export function useFy(): FyCtxValue { return useContext(FyCtx); }
```

- [ ] **Step 4: Make the Topbar selector use live FYs**

In `src/ui/shell/Topbar.tsx`, prefer the live list:

```tsx
  const { fy, setFy, fys: liveFys } = useFy();
  const keys = (liveFys.length ? liveFys : (Object.keys(fys) as FyKey[]));
```

And render labels via `fySummary(k).label` instead of `fys[k].label`.

- [ ] **Step 5: Verify (preview)**

Start the app; the FY selector should list the FYs that have data and open on the newest one. Covered in Task 14.

- [ ] **Step 6: Commit**

```bash
git add src/ui/lib/fixtures.ts src/ui/contexts/FyCtx.tsx src/ui/shell/Topbar.tsx src/ui/pages/Investments.tsx src/ui/pages/Sources.tsx src/ui/pages/shared.tsx src/ui/pages/Liabilities.tsx src/ui/pages/Overview.tsx src/ui/pages/Income.tsx
git commit -m "feat(fy): widen FY keys, list live FYs, default to latest with data"
```

---

## Phase 3 — UI primitives

### Task 6: `CategoryGlyph` primitive

**Files:**
- Create: `src/ui/primitives/CategoryGlyph.tsx`

- [ ] **Step 1: Write it**

```tsx
'use client';
import { Icon } from './Icon';

/** Category → lucide icon + brand tint. Falls back to a coloured initial. */
const MAP: Record<string, { icon: string; color: string }> = {
  'food delivery': { icon: 'utensils', color: '#FF8A6B' },
  'quick commerce': { icon: 'bike', color: '#15A877' },
  groceries: { icon: 'shopping-basket', color: '#15A877' },
  dining: { icon: 'utensils-crossed', color: '#FF8A6B' },
  travel: { icon: 'plane', color: '#3B82F6' },
  transport: { icon: 'car', color: '#3B82F6' },
  shopping: { icon: 'shopping-bag', color: '#A855F7' },
  utilities: { icon: 'zap', color: '#F59E0B' },
  housing: { icon: 'house', color: '#6354E6' },
  loan: { icon: 'landmark', color: '#FF8A6B' },
  insurance: { icon: 'shield-check', color: '#15A877' },
  investment: { icon: 'trending-up', color: '#15A877' },
  health: { icon: 'heart-pulse', color: '#EF4444' },
  fitness: { icon: 'dumbbell', color: '#15A877' },
  education: { icon: 'graduation-cap', color: '#3B82F6' },
  entertainment: { icon: 'clapperboard', color: '#A855F7' },
  ott: { icon: 'tv', color: '#A855F7' },
  subscriptions: { icon: 'repeat', color: '#6354E6' },
  software: { icon: 'code', color: '#6354E6' },
  salary: { icon: 'wallet', color: '#15A877' },
  income: { icon: 'arrow-down-to-line', color: '#15A877' },
  refund: { icon: 'rotate-ccw', color: '#15A877' },
  transfer: { icon: 'arrow-left-right', color: '#94A3B8' },
  'credit card payment': { icon: 'credit-card', color: '#94A3B8' },
  cash: { icon: 'banknote', color: '#15A877' },
  household: { icon: 'house-plug', color: '#6354E6' },
  'fees & charges': { icon: 'receipt', color: '#EF4444' },
  'gifts & donations': { icon: 'gift', color: '#FF8A6B' },
  'personal care': { icon: 'sparkles', color: '#A855F7' },
  uncategorised: { icon: 'circle-help', color: '#94A3B8' },
};

export function CategoryGlyph({ name, size = 34 }: { name: string; size?: number }) {
  const hit = MAP[name.toLowerCase().trim()];
  const color = hit?.color ?? 'var(--indigo-600)';
  return (
    <span
      aria-hidden
      style={{
        width: size, height: size, borderRadius: Math.max(8, size / 3.5),
        background: color + '1f', color, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      {hit ? <Icon name={hit.icon} size={size * 0.5} /> : (name || '?').charAt(0).toUpperCase()}
    </span>
  );
}
```

- [ ] **Step 2: Type-check**: `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/ui/primitives/CategoryGlyph.tsx
git commit -m "feat(ui): CategoryGlyph primitive (category icon + tint)"
```

---

### Task 7: `CategoryChipPicker` (replaces the dropdown)

**Files:**
- Create: `src/ui/primitives/CategoryChipPicker.tsx`

Behavior: a type-to-filter input + wrapping pills. The model's suggested category (if any) renders first with a sparkle glow. The selected pill is highlighted. Calls `onPick(category)`.

- [ ] **Step 1: Write it**

```tsx
'use client';
import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { CategoryGlyph } from './CategoryGlyph';

export function CategoryChipPicker({
  categories, value, onPick, suggested, autoFocus,
}: {
  categories: string[];
  value: string;
  onPick: (category: string) => void;
  suggested?: string | null;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const ordered = useMemo(() => {
    const seen = new Set<string>();
    const front: string[] = [];
    if (suggested && categories.includes(suggested)) { front.push(suggested); seen.add(suggested); }
    const rest = categories.filter((c) => !seen.has(c));
    return [...front, ...rest].filter((c) => c.toLowerCase().includes(q.toLowerCase()));
  }, [categories, suggested, q]);

  return (
    <div className="chip-picker">
      <input
        className="inp"
        placeholder="Filter categories…"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && ordered[0]) { e.preventDefault(); onPick(ordered[0]); } }}
        style={{ width: '100%', marginBottom: 8 }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 168, overflowY: 'auto' }}>
        {ordered.map((c) => {
          const isSug = c === suggested;
          const on = c === value;
          return (
            <button
              key={c}
              type="button"
              className={`cat-pill ${on ? 'on' : ''} ${isSug ? 'sug' : ''}`}
              onClick={() => onPick(c)}
            >
              <CategoryGlyph name={c} size={18} />
              {c}
              {isSug && <Icon name="sparkles" size={12} />}
            </button>
          );
        })}
        {ordered.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>No match.</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add styles**

Append to `app/globals.css`:

```css
.cat-pill { display:inline-flex; align-items:center; gap:6px; padding:5px 10px 5px 6px;
  border:1px solid var(--border); border-radius:999px; background:var(--surface);
  font-size:12.5px; cursor:pointer; transition:border-color .12s, background .12s; }
.cat-pill:hover { border-color:var(--brand); }
.cat-pill.on { border-color:var(--brand); background:var(--indigo-50); color:var(--brand); font-weight:600; }
.cat-pill.sug { border-color:var(--mint-500); box-shadow:0 0 0 3px color-mix(in srgb, var(--mint-500) 18%, transparent); }
```

> If a CSS variable used here (`--surface`, `--indigo-50`, `--mint-500`) is missing, substitute the nearest existing token; check the top of `app/globals.css` for the palette.

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add src/ui/primitives/CategoryChipPicker.tsx app/globals.css
git commit -m "feat(ui): CategoryChipPicker — type-to-filter pills with suggestion glow"
```

---

## Phase 4 — The Spending page

### Task 8: SpendingPage shell + nav rewiring

**Files:**
- Create: `src/ui/pages/spending/SpendingPage.tsx`
- Modify: `src/ui/shell/Workbench.tsx`, `src/ui/shell/Sidebar.tsx`

- [ ] **Step 1: Create the shell** (`src/ui/pages/spending/SpendingPage.tsx`):

```tsx
'use client';
import { useState } from 'react';
import { useFy } from '../../contexts/FyCtx';
import { useSpending } from '../../data/useSpending';
import { FootMeta, PageHead } from '../shared';
import { ReportView } from './ReportView';
import { TriageView } from './TriageView';
import { TransactionsView } from './TransactionsView';
import { fySummary } from '../../lib/fixtures';
import { useMask } from '../../contexts/MaskCtx';
import { inr } from '../../lib/format';

type Seg = 'report' | 'triage' | 'transactions';

export function SpendingPage() {
  const { fy } = useFy();
  const { masked } = useMask();
  const spending = useSpending(fy);
  const [seg, setSeg] = useState<Seg>('report');
  const total = spending.report?.total ?? fySummary(fy).expenses;
  const triageCount = spending.triage?.totalTransactions ?? 0;

  return (
    <div className="content-wrap fade-in">
      <PageHead
        title="Spending"
        sub={`${fySummary(fy).label} · ${masked ? '₹•••,•••' : inr(total)}`}
      />
      <div className="tabs">
        <button className={seg === 'report' ? 'on' : ''} onClick={() => setSeg('report')}>By category</button>
        <button className={seg === 'triage' ? 'on' : ''} onClick={() => setSeg('triage')}>
          Triage{triageCount > 0 ? ` (${triageCount})` : ''}
        </button>
        <button className={seg === 'transactions' ? 'on' : ''} onClick={() => setSeg('transactions')}>Transactions</button>
      </div>
      {seg === 'report' && <ReportView spending={spending} />}
      {seg === 'triage' && <TriageView spending={spending} />}
      {seg === 'transactions' && <TransactionsView fy={fy} />}
      <FootMeta />
    </div>
  );
}
```

- [ ] **Step 2: Rewire Workbench**

In `src/ui/shell/Workbench.tsx`: replace the `Expenses` import with `SpendingPage`, and map `expenses` (keep the route id to avoid touching deep links) to `<SpendingPage />`:

```tsx
import { SpendingPage } from '../pages/spending/SpendingPage';
// ...
    expenses: <SpendingPage />,
```

Remove the `Review` import and its `review:` mapping (Review is being retired). Keep `WorkbenchPage` `review` removed in Task 12.

- [ ] **Step 3: Rename the nav item + move the count**

In `src/ui/shell/Sidebar.tsx`: change the MAIN `expenses` entry to label `'Spending'`, icon stays. Carry the triage count + alert there:

```tsx
    { id: 'expenses', label: 'Spending', icon: 'arrow-up-from-line', count: reviewCount > 0 ? reviewCount : undefined, alert: reviewCount > 0 },
```

(Removal of the EVIDENCE "Review queue" entry happens in Task 12 once its other duties are rehomed.)

- [ ] **Step 4: Verify the shell loads (preview)** — Task 14.

- [ ] **Step 5: Commit**

```bash
git add src/ui/pages/spending/SpendingPage.tsx src/ui/shell/Workbench.tsx src/ui/shell/Sidebar.tsx
git commit -m "feat(spending): page shell + segmented control, route Spending"
```

> ReportView/TriageView/TransactionsView are created in Tasks 9–11; until then, stub them with `export function ReportView(){return null}` etc. so the build passes, or implement 9–11 before running the app.

---

### Task 9: ReportView

**Files:**
- Create: `src/ui/pages/spending/ReportView.tsx`

Renders the category bars (sorted desc, with `CategoryGlyph`), flashes the highlighted category, and makes every category expand into its transactions. The **Uncategorised** row expands into the live triage groups with inline classify.

- [ ] **Step 1: Write it**

```tsx
'use client';
import { useState } from 'react';
import type { useSpending } from '../../data/useSpending';
import { Money } from '../../primitives/Money';
import { Icon } from '../../primitives/Icon';
import { CategoryGlyph } from '../../primitives/CategoryGlyph';
import { GroupRow } from './GroupRow';

export function ReportView({ spending }: { spending: ReturnType<typeof useSpending> }) {
  const { report, triage, highlight } = spending;
  const [open, setOpen] = useState<string | null>(null);
  const cats = report?.categories ?? [];
  const max = Math.max(1, ...cats.map((c) => c.amt));
  const total = cats.reduce((s, c) => s + c.amt, 0) || 1;

  return (
    <div className="card card-pad">
      {cats.map((c) => {
        const isUncat = c.name.toLowerCase() === 'uncategorised';
        const isOpen = open === c.name;
        return (
          <div key={c.name} className={`catrow ${isOpen ? 'open' : ''} ${highlight === c.name ? 'flash' : ''}`}>
            <div className="top" onClick={() => setOpen(isOpen ? null : c.name)} style={{ cursor: 'pointer' }}>
              <span className="nm" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={15} color="var(--fg-3)" />
                <CategoryGlyph name={c.name} size={26} />
                {c.name}
                {!c.recurring && <span className="badge neutral" style={{ padding: '1px 7px' }}>one-time</span>}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="muted" style={{ fontSize: 12 }}>{Math.round((c.amt / total) * 100)}%</span>
                <Money amount={c.amt} />
              </span>
            </div>
            <div className="track"><i style={{ width: `${(c.amt / max) * 100}%`, background: c.color }} /></div>
            {isOpen && (
              <div className="sub" style={{ display: 'block' }}>
                {isUncat
                  ? (triage?.groups.length
                      ? triage.groups.map((g) => <GroupRow key={g.signature} group={g} categories={triage.categories} spending={spending} />)
                      : <div className="muted" style={{ fontSize: 12.5, padding: '6px 0' }}>Nothing left to categorise.</div>)
                  : c.children.map((ch) => (
                      <div key={ch.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, color: 'var(--fg-2)' }}>
                        <span>{ch.name}</span><Money amount={ch.amt} />
                      </div>
                    ))}
              </div>
            )}
          </div>
        );
      })}
      {cats.length === 0 && <div className="muted" style={{ padding: 16 }}>No spending in this period yet.</div>}
    </div>
  );
}
```

- [ ] **Step 2: Flash style** — append to `app/globals.css`:

```css
.catrow.flash { animation: catflash 1.4s ease-out; }
@keyframes catflash { 0% { background: color-mix(in srgb, var(--mint-500) 22%, transparent); } 100% { background: transparent; } }
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/pages/spending/ReportView.tsx app/globals.css
git commit -m "feat(spending): ReportView with glyphs, live flash, real uncategorised drill-down"
```

---

### Task 10: TriageView + GroupRow (chip picker, suggestions, search, keyboard)

**Files:**
- Create: `src/ui/pages/spending/GroupRow.tsx`, `src/ui/pages/spending/TriageView.tsx`

- [ ] **Step 1: GroupRow** (one group; reuses view-details + chip picker; works in both Triage and Report):

```tsx
'use client';
import { useState } from 'react';
import type { useSpending, UncatGroup } from '../../data/useSpending';
import { Money } from '../../primitives/Money';
import { CategoryChipPicker } from '../../primitives/CategoryChipPicker';

interface Detail { id: string; date: string; amount: number; rawDescription: string | null; from: string | null; subject: string | null; }

export function GroupRow({ group, categories, spending, focused }: {
  group: UncatGroup; categories: string[]; spending: ReturnType<typeof useSpending>; focused?: boolean;
}) {
  const [merchant, setMerchant] = useState(group.localSuggestion?.merchant ?? group.suggestedMerchant);
  const [category, setCategory] = useState(group.localSuggestion?.category ?? group.category ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail[] | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const sug = group.localSuggestion;

  const toggleDetail = async () => {
    if (detailOpen) { setDetailOpen(false); return; }
    setDetailOpen(true);
    if (!detail) {
      try {
        const r = await fetch(`/api/review/uncategorised?signature=${encodeURIComponent(group.signature)}`);
        setDetail(((await r.json()) as { txns: Detail[] }).txns);
      } catch { setDetail([]); }
    }
  };

  const assign = async () => {
    if (!merchant.trim() || !category) return;
    setBusy(true); setError(null);
    try { await spending.assign(group.signature, merchant.trim(), category); }
    catch (e) { setError(e instanceof Error ? e.message : 'Assign failed'); setBusy(false); }
  };

  const accept = async () => {
    if (!sug) return;
    setBusy(true); setError(null);
    try { await spending.acceptSuggestion(sug.id, group.signature, sug.category); }
    catch (e) { setError(e instanceof Error ? e.message : 'Accept failed'); setBusy(false); }
  };

  return (
    <div className={`review-item ${focused ? 'focused' : ''}`} style={{ alignItems: 'flex-start' }} data-sig={group.signature}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ttl" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} title={group.sample}>{group.sample}</span>
          <span className="badge neutral">{group.count}×</span>
          <span className="badge neutral"><Money amount={group.total} /></span>
        </div>
        <div className="desc" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>{group.firstDate === group.lastDate ? group.firstDate : `${group.firstDate} → ${group.lastDate}`}</span>
          <button className="link" style={{ fontSize: 12.5 }} onClick={toggleDetail}>
            {detailOpen ? 'Hide transactions' : `View ${group.count > 1 ? `all ${group.count} transactions` : 'transaction'}`}
          </button>
        </div>

        {sug && (
          <div style={{ marginTop: 10, padding: '10px 12px', border: '1px solid var(--mint-500)', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge mint">Suggested</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{sug.merchant} → {sug.category}{sug.subcategory ? ` / ${sug.subcategory}` : ''}</span>
            <span className="muted" style={{ fontSize: 12.5 }}>{Math.round(sug.confidenceScore * 100)}% {sug.confidence}, {sug.evidenceCount} reviewed</span>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={accept}>Accept</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => spending.rejectSuggestion(sug.id)}>Reject</button>
          </div>
        )}

        {detailOpen && (
          <div style={{ margin: '10px 0 2px', borderLeft: '2px solid var(--border)', paddingLeft: 12, display: 'grid', gap: 8 }}>
            {detail === null && <div className="muted" style={{ fontSize: 12.5 }}>Loading…</div>}
            {detail?.map((t) => (
              <div key={t.id} style={{ fontSize: 12.5, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{t.date}</span>
                  <span style={{ fontWeight: 600 }}>{t.amount > 0 ? '+' : '−'}<Money amount={Math.abs(t.amount)} pos={t.amount > 0} /></span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--fg-2)', overflowWrap: 'anywhere' }}>{t.rawDescription}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <input className="inp" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Merchant" style={{ flex: '0 0 200px', maxWidth: 220 }} />
          <div style={{ flex: '1 1 320px', minWidth: 240 }}>
            <CategoryChipPicker categories={categories} value={category} onPick={setCategory} suggested={sug?.category ?? null} />
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy || !merchant.trim() || !category} onClick={assign}>
            {busy ? 'Assigning…' : `Assign ${group.count > 1 ? `all ${group.count}` : ''}`}
          </button>
        </div>
        {error && <div style={{ fontSize: 12.5, color: 'var(--red-600)', marginTop: 6 }}>{error}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TriageView** (search + keyboard `j`/`k`/`Enter`/`/`):

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import type { useSpending } from '../../data/useSpending';
import { Icon } from '../../primitives/Icon';
import { GroupRow } from './GroupRow';

export function TriageView({ spending }: { spending: ReturnType<typeof useSpending> }) {
  const { triage, loading, search } = spending;
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const groups = triage?.groups ?? [];

  useEffect(() => {
    const t = setTimeout(() => search(q), 200);
    return () => clearTimeout(t);
  }, [q, search]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.key !== 'Escape') return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'j') setFocus((f) => Math.min(f + 1, groups.length - 1));
      if (e.key === 'k') setFocus((f) => Math.max(f - 1, 0));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [groups.length]);

  return (
    <div className="card">
      <div className="card-head" style={{ gap: 12 }}>
        <h3>Triage</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <Icon name="search" size={15} color="var(--fg-3)" />
          <input ref={searchRef} className="inp" placeholder="Search descriptions (e.g. a name)…  /" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        </div>
      </div>
      <div className="card-list" style={{ maxHeight: 620, overflowY: 'auto' }}>
        {loading && <div className="muted" style={{ padding: 16 }}>Loading…</div>}
        {!loading && groups.length === 0 && <div className="muted" style={{ padding: 16 }}>{q ? 'No matches.' : 'Everything is categorised. 🎉'}</div>}
        {groups.map((g, i) => (
          <GroupRow key={g.signature} group={g} categories={triage!.categories} spending={spending} focused={i === focus} />
        ))}
      </div>
    </div>
  );
}
```

> `Enter`-to-assign on the focused group: the chip picker's own input already handles Enter→pick; full group-level Enter wiring is optional polish — keep the picker + button as the reliable path.

- [ ] **Step 3: Focused style** — append to `app/globals.css`:

```css
.review-item.focused { box-shadow: inset 3px 0 0 var(--brand); background: var(--indigo-50); }
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/pages/spending/GroupRow.tsx src/ui/pages/spending/TriageView.tsx app/globals.css
git commit -m "feat(spending): TriageView — value sort, search, suggestions, chip picker, keyboard"
```

---

### Task 11: TransactionsView (all-flows ledger)

**Files:**
- Create: `app/api/dashboard/transactions/route.ts`, `src/ui/pages/spending/TransactionsView.tsx`

- [ ] **Step 1: API route** (`app/api/dashboard/transactions/route.ts`) — reuse `recentCols`/`rowToRecent` shape via a small query:

```ts
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { transactions, gmailMessages } from '@/db/schema';
import { json, badRequest } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const fy = url.searchParams.get('fy') ?? '2025-26';
    const flow = url.searchParams.get('flow'); // income|expense|transfer|investment|null
    const q = url.searchParams.get('q')?.trim().toLowerCase() ?? '';
    const db = await getDb();
    const conds = [eq(transactions.fyKey, fy)];
    if (flow) conds.push(eq(transactions.flow, flow));
    if (q) conds.push(sql`(lower(coalesce(${transactions.merchant},'')) like ${'%' + q + '%'}
      or lower(coalesce(${transactions.rawDescription},'')) like ${'%' + q + '%'}
      or lower(coalesce(${transactions.category},'')) like ${'%' + q + '%'})`);
    const rows = db
      .select({
        id: transactions.id, date: transactions.txnDate,
        merchant: sql<string>`coalesce(${transactions.merchant}, ${transactions.subcategory}, ${transactions.category})`,
        cat: transactions.category, sub: transactions.subcategory, amt: transactions.amount,
        flow: transactions.flow, conf: transactions.confidence,
        from: gmailMessages.fromAddr, subject: gmailMessages.subject,
      })
      .from(transactions)
      .leftJoin(gmailMessages, eq(transactions.messageId, gmailMessages.id))
      .where(and(...conds))
      .orderBy(desc(transactions.txnDate))
      .limit(300)
      .all()
      .map((r) => ({ ...r, amt: Math.round((r.amt ?? 0) / 100) }));
    return json({ rows });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Failed to list transactions.', 500);
  }
}
```

- [ ] **Step 2: TransactionsView** — flat list with flow filter + search, click → drawer:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useDrawer } from '../../contexts/DrawerCtx';
import { recentToTxn } from '../../data/useOverview';
import type { RecentTxnDTO } from '../../data/useDashboard';
import { TxnRow } from '../shared';

const FLOWS = ['all', 'expense', 'income', 'investment', 'transfer'] as const;

export function TransactionsView({ fy }: { fy: string }) {
  const drawer = useDrawer();
  const [rows, setRows] = useState<RecentTxnDTO[]>([]);
  const [flow, setFlow] = useState<typeof FLOWS[number]>('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ fy });
      if (flow !== 'all') p.set('flow', flow);
      if (q) p.set('q', q);
      fetch(`/api/dashboard/transactions?${p}`).then((r) => r.json()).then((d) => setRows(d.rows ?? []));
    }, 200);
    return () => clearTimeout(t);
  }, [fy, flow, q]);

  return (
    <div className="card">
      <div className="card-head" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div className="chips">
          {FLOWS.map((f) => <button key={f} className={`chip ${flow === f ? 'on' : ''}`} onClick={() => setFlow(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}
        </div>
        <input className="inp" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220, marginLeft: 'auto' }} />
      </div>
      <div className="card-list">
        {rows.map((r, i) => <TxnRow key={r.id} t={recentToTxn(r, i)} onOpen={drawer.openProv} />)}
        {rows.length === 0 && <div className="muted" style={{ padding: 16 }}>No transactions match.</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/dashboard/transactions/route.ts src/ui/pages/spending/TransactionsView.tsx
git commit -m "feat(spending): TransactionsView — all-flows searchable ledger"
```

---

## Phase 5 — Relocations & logos

### Task 12: Rehome locked-PDF unlock + profile gaps; retire Review nav

**Files:**
- Modify: `src/ui/pages/Sources.tsx`, `src/ui/pages/Profile.tsx`, `src/ui/shell/Sidebar.tsx`, `src/ui/shell/Workbench.tsx`

- [ ] **Step 1: Move the unlock card to Sources**

Lift the locked-statements card + `submitPassword` handler (currently `Review.tsx:397-431` and the `submitPassword`/`unlock` logic at `Review.tsx:349-375`) into `Sources.tsx`. It posts to `/api/review/unlock` (unchanged) and should show only when `reviewRollup` reports `locked_pdf` items — fetch `/api/dashboard/review` in Sources and filter `items.kind === 'locked_pdf'` to get `lockedCount`.

- [ ] **Step 2: Profile-gap nudge**

In `Profile.tsx`, fetch `/api/dashboard/review`, and if any `items.kind === 'missing_profile'`, render a small banner linking the relevant profile fields. (Reuse the existing item `title`/`desc`.)

- [ ] **Step 3: Retire the Review nav + route**

In `Sidebar.tsx` remove the EVIDENCE `review` entry. In `Workbench.tsx` remove `review` from the `pages` map and the `Review` import. In `Sidebar.tsx` `WorkbenchPage` union, remove `'review'`.

- [ ] **Step 4: Verify (preview)** — Task 14.

- [ ] **Step 5: Commit**

```bash
git add src/ui/pages/Sources.tsx src/ui/pages/Profile.tsx src/ui/shell/Sidebar.tsx src/ui/shell/Workbench.tsx
git commit -m "refactor(nav): rehome unlock→Sources, profile gaps→Profile, retire Review queue"
```

---

### Task 13: Logos across remaining pages

**Files:**
- Modify: `Overview.tsx`, `Subscriptions.tsx`, `Investments.tsx`, `Liabilities.tsx`, `Income.tsx`

- [ ] **Step 1: Apply the right primitive per surface**

- **Merchant rows** (Overview top merchants, Subscriptions, Income payers): replace the initial `Glyph`/`glyph` with `<MerchantLogo name={...} color={...} size={...} />`.
- **Category rows / platform tiles** (Overview top categories, Investments, Liabilities): use `<CategoryGlyph name={...} />` where the label is a category, else `MerchantLogo`.

For each file, import the primitive and swap the existing glyph element. Keep sizes consistent with current layout (look at the existing `Glyph` size at each call site).

- [ ] **Step 2: Verify each page (preview)** — Task 14.

- [ ] **Step 3: Commit**

```bash
git add src/ui/pages/Overview.tsx src/ui/pages/Subscriptions.tsx src/ui/pages/Investments.tsx src/ui/pages/Liabilities.tsx src/ui/pages/Income.tsx
git commit -m "feat(ui): consistent merchant/category logos across pages"
```

---

## Phase 6 — Cleanup & verification

### Task 14: Delete dead files, full verify

- [ ] **Step 1: Delete subsumed pages**

```bash
git rm src/ui/pages/Expenses.tsx src/ui/pages/Review.tsx
```

Fix any remaining imports the compiler flags.

- [ ] **Step 2: Lint + types + tests**

```bash
npm run lint
npx tsc --noEmit
npm test
```

Expected: clean lint, no type errors, all tests pass (including the new Task 1 & 2 tests).

- [ ] **Step 3: Preview verification pass**

Start the dev server (`preview_start`) and verify against the spec:
1. Sidebar shows **Spending** with a backlog count; no "Review queue".
2. FY selector lists FYs with data and opens on the newest; switching FYs updates figures.
3. **Spending → By category**: categories carry glyphs; expanding **Uncategorised** shows real groups with inline classify; assigning one makes the group vanish and a category bar **flash**, with the total re-tallying — without a reload.
4. **Triage**: groups ordered **highest value first**; typing a name (e.g. a landlord's) filters to matching groups; model suggestions show with Accept; the **chip picker** (not a dropdown) assigns; `/` focuses search, `j`/`k` move focus.
5. **Transactions**: all flows listed; flow chips + search filter; clicking a row opens provenance with the **correct flow label**.
6. The previously-invisible rent now appears under its category in the correct FY (the core bug).
7. **Sources** hosts the unlock card; **Profile** shows the gap nudge.
8. Logos render on Overview/Subscriptions/Investments/Liabilities/Income.

Capture a screenshot of the Spending page (Report + Triage) as proof.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(spending): remove subsumed Expenses/Review pages; verified end-to-end"
```

---

## Self-review notes (coverage check)

- Spec A (nav) → Tasks 8, 12. Spec B (shell + live source) → Tasks 4, 8. Spec C (report fixes) → Task 9. Spec D (triage rebuild) → Tasks 2, 7, 10. Spec E (transactions) → Task 11. Spec F (rent bug + FY default) → Tasks 1, 3, 5. Spec G (logos) → Tasks 6, 13. All spec sections map to tasks.
- TDD applies to pure backend logic (Tasks 1, 2). Tasks 3–13 are React/integration, verified via the preview pass in Task 14 per the project's testing conventions.
- Type consistency: `UncatGroup`/`UncatDTO` defined once in `useSpending.ts` and imported by GroupRow/Report/Triage; `ReturnType<typeof useSpending>` threaded as the `spending` prop everywhere; `CategoryChipPicker` signature `{ categories, value, onPick, suggested, autoFocus }` matches its single call site.
- Known follow-up (not blocking): group-level `Enter`-to-assign in Triage is left as optional polish; the chip-input Enter + Assign button cover the flow.
