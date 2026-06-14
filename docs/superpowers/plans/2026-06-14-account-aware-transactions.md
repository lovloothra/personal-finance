# Account-aware Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every transaction carry its own account identity and a resolved counterparty so internal money movement is never counted as income/expense, with a canonical flow-keyed category taxonomy.

**Architecture:** Account identity is established at the *document* level (a statement is from one account) and inherited by its transactions. A `counterparties` registry of own/known entities lets the transfer engine decide deterministically whether money left the household. Unresolved large round-number credits are quarantined as `suspectedTransfer` rather than counted as income. All new logic is pure/deterministic and tested with `node:test`.

**Tech Stack:** Next.js (App Router), Drizzle ORM over SQLCipher SQLite (`better-sqlite3-multiple-ciphers`), TypeScript, Node built-in test runner, `tsx`. Money is integer paise.

**Conventions (from CLAUDE.md):** Money is signed integer paise (₹1 = 100 paise). Booleans use `integer({ mode: 'boolean' })`. JSON blobs use `text({ mode: 'json' }).$type<>()`. Ids are app-generated. After schema edits run `npm run db:generate`, then restart to apply. Run a single test with `node --import tsx --test <file>`. Scripts that touch the DB use `tsx --conditions=react-server`.

---

## File Structure

**New files:**
- `src/ingest/account-reconcile.ts` — resolve a parsed document to an own account (`accounts_bank`/`accounts_card`) by `(institutionId + last4)`; create stub; flag no-last4.
- `src/ingest/__tests__/account-reconcile.test.ts`
- `src/classifier/counterparties.ts` — own-entity registry types + `resolveCounterparty()` (pure).
- `src/classifier/__tests__/counterparties.test.ts`
- `src/classifier/taxonomy.ts` — canonical flow-keyed taxonomy + `normalizeCategory()` + `categoriesForFlow()`.
- `src/classifier/__tests__/taxonomy.test.ts`

**Modified files:**
- `src/db/schema.ts` — new columns on `transactions` + `parsed_documents`; new `counterparties` table.
- `src/parsers/types.ts` — `ParsedStatement.accountLast4`, `ParsedTxn.counterpartyRaw`.
- `src/parsers/in/generic-bank.ts` — extract header last4 + per-line counterparty.
- `src/parsers/in/__tests__/generic-bank.test.ts` — new extraction tests.
- `src/classifier/transfers.ts` — own-entity single-sided, relaxed own↔own pairing, round-number `suspectedTransfer`.
- `src/classifier/__tests__/transfers.test.ts` — new transfer cases.
- `src/ingest/pipeline.ts` — reconcile account per doc; resolve counterparty; persist new fields; honor `suspectedTransfer`.
- `src/ingest/reclassify.ts` — mirror the pipeline persist changes.
- `src/ledger/rollups.ts` — exclude `suspectedTransfer` from income.
- `src/ui/pages/spending/TriageView.tsx` — account chip, counterparty line, suspected-transfer banner, flow-filtered category picker.

---

## Phase 1 — Data model

### Task 1: Schema columns + counterparties table

**Files:**
- Modify: `src/db/schema.ts`
- Create (generated): `src/db/migrations/*` via `npm run db:generate`

- [ ] **Step 1: Add columns to `transactions`**

In `src/db/schema.ts`, inside the `transactions` table object (after the existing `taxSection` line, before `fyKey`), add:

```ts
    ownAccountId: text('own_account_id'),
    ownAccountKind: text('own_account_kind').$type<'bank' | 'card'>(),
    counterpartyRaw: text('counterparty_raw'),
    counterpartyId: text('counterparty_id'),
    counterpartyKind: text('counterparty_kind').$type<'own_account' | 'known_own' | 'external' | 'unknown'>(),
    suspectedTransfer: integer('suspected_transfer', { mode: 'boolean' }).default(false),
```

- [ ] **Step 2: Add columns to `parsed_documents`**

In the `parsedDocuments` table object (after `status`), add:

```ts
  accountLast4: text('account_last4'),
  ownAccountId: text('own_account_id'),
  ownAccountKind: text('own_account_kind').$type<'bank' | 'card'>(),
```

- [ ] **Step 3: Add the `counterparties` table**

Add after the `internalTransferLinks` table:

```ts
export const counterparties = sqliteTable('counterparties', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  kind: text('kind').$type<'own_account' | 'card_bill' | 'family' | 'broker' | 'other_own'>().notNull(),
  matchers: text('matchers', { mode: 'json' }).$type<{
    vpaFragments?: string[];
    nameTokens?: string[];
    last4?: string[];
    institutionId?: string;
  }>(),
  linkedOwnAccountId: text('linked_own_account_id'),
  linkedOwnAccountKind: text('linked_own_account_kind').$type<'bank' | 'card'>(),
  isOwnMoney: integer('is_own_money', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`
Expected: a new SQL file under `src/db/migrations/` containing `ALTER TABLE transactions ADD ...`, `ALTER TABLE parsed_documents ADD ...`, and `CREATE TABLE counterparties ...`. No errors.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors from schema.ts).

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/migrations
git commit -m "feat(schema): account identity + counterparty fields + counterparties registry"
```

---

## Phase 2 — Parser extraction

### Task 2: Extend parser types

**Files:**
- Modify: `src/parsers/types.ts`

- [ ] **Step 1: Add fields**

In `ParsedTxn` add after `balance?`:

```ts
  /** Counterparty string extracted from the line (VPA / beneficiary / "to X"), null when none. */
  counterpartyRaw?: string | null;
```

In `ParsedStatement` add after `periodEnd?`:

```ts
  /** Last 4 of the account/card this statement belongs to, from the header. */
  accountLast4?: string;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/parsers/types.ts
git commit -m "feat(parsers): account last4 + per-line counterparty on parser types"
```

### Task 3: Extract statement-header account last4

**Files:**
- Modify: `src/parsers/in/generic-bank.ts`
- Test: `src/parsers/in/__tests__/generic-bank.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/parsers/in/__tests__/generic-bank.test.ts`:

```ts
test('extracts masked account last4 from the statement header', () => {
  const text = [
    'HDFC BANK STATEMENT',
    'Account No: XXXXXXXX7702',
    '01/03/2025 UPI/zomato 250.00 9,750.00',
  ].join('\n');
  const out = parse(text, { providerId: 'in/hdfc-bank', docType: 'bank_statement' });
  assert.equal(out.accountLast4, '7702');
});

test('extracts card last4 written with spaces', () => {
  const text = ['Card Number 4321 5678 9012 1234', '01/03/2025 SWIGGY 500.00'].join('\n');
  const out = parse(text, { providerId: 'in/hdfc-card', docType: 'card_statement' });
  assert.equal(out.accountLast4, '1234');
});
```

(Use the same `parse` import the existing tests in this file use; if the file imports the parser under another name, match it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/parsers/in/__tests__/generic-bank.test.ts`
Expected: FAIL — `out.accountLast4` is `undefined`.

- [ ] **Step 3: Implement header extraction**

In `src/parsers/in/generic-bank.ts`, add this helper near the top-level regexes:

```ts
// Account/card number in a header line: a masked or full run whose last group
// is 4 digits. Matches "XXXXXX7702", "4321 5678 9012 1234", "A/c No 0011...7702".
const ACCOUNT_HEADER_RE =
  /\b(?:a\/?c|acc(?:oun)?t|card)\s*(?:no\.?|number|#)?\s*[:\-]?\s*((?:[xX*\d][xX*\d \-]{2,})\d{4})\b/;

function extractAccountLast4(text: string): string | undefined {
  const m = ACCOUNT_HEADER_RE.exec(text);
  if (!m) return undefined;
  const digits = m[1].replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : undefined;
}
```

Then, where the parser builds the returned `ParsedStatement` object, add `accountLast4: extractAccountLast4(text),` to the returned object literal. (Search for the `return {` that produces `txns` / `unparsedLines` and add the field there.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/parsers/in/__tests__/generic-bank.test.ts`
Expected: PASS (all tests in file, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add src/parsers/in/generic-bank.ts src/parsers/in/__tests__/generic-bank.test.ts
git commit -m "feat(parsers): extract account last4 from statement header"
```

### Task 4: Extract per-line counterparty

**Files:**
- Modify: `src/parsers/in/generic-bank.ts`
- Test: `src/parsers/in/__tests__/generic-bank.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('extracts UPI VPA counterparty from a line', () => {
  const text = '01/03/2025 UPI/john.doe@okhdfc/Payment 250.00 9,750.00';
  const out = parse(text, { providerId: 'in/hdfc-bank', docType: 'bank_statement' });
  assert.equal(out.txns[0].counterpartyRaw, 'john.doe@okhdfc');
});

test('extracts NEFT/IMPS beneficiary name', () => {
  const text = '01/03/2025 NEFT DR-HDFC0001-JANE SMITH-REF123 5,000.00 4,750.00';
  const out = parse(text, { providerId: 'in/hdfc-bank', docType: 'bank_statement' });
  assert.equal(out.txns[0].counterpartyRaw, 'JANE SMITH');
});

test('generic mobile-banking line has null counterparty', () => {
  const text = '02/11/2025 MOBILE BANKING DFC bank 5,00,000.00 15,00,000.00';
  const out = parse(text, { providerId: 'in/hdfc-bank', docType: 'bank_statement' });
  assert.equal(out.txns[0].counterpartyRaw, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/parsers/in/__tests__/generic-bank.test.ts`
Expected: FAIL — `counterpartyRaw` is `undefined`.

- [ ] **Step 3: Implement counterparty extraction**

Add to `src/parsers/in/generic-bank.ts`:

```ts
// A UPI VPA: handle@bank (letters/digits/._- before @, letters after).
const VPA_RE = /\b([a-z0-9._-]{2,}@[a-z]{2,})\b/i;
// NEFT/IMPS/RTGS beneficiary: "<RAIL> <DR|CR>-<IFSC/REF>-<NAME>-<REF>". The
// name is the UPPERCASE word group sitting between hyphenated code segments.
const BENEFICIARY_RE = /\b(?:neft|imps|rtgs)\b[^-]*-[^-]+-([A-Z][A-Z .]{2,}?)-/i;

function extractCounterparty(desc: string): string | null {
  const vpa = VPA_RE.exec(desc);
  if (vpa) return vpa[1];
  const ben = BENEFICIARY_RE.exec(desc);
  if (ben) return ben[1].trim();
  return null;
}
```

Then where each `ParsedTxn` is constructed (search for the object with `rawDescription:` and `amount:`), add:

```ts
      counterpartyRaw: extractCounterparty(rawDescription),
```

Use whatever local variable holds the line's description at that point (it may be `desc` or `rawDescription`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/parsers/in/__tests__/generic-bank.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parsers/in/generic-bank.ts src/parsers/in/__tests__/generic-bank.test.ts
git commit -m "feat(parsers): extract per-line counterparty (VPA/beneficiary)"
```

---

## Phase 3 — Account reconciliation

### Task 5: Reconciliation module

**Files:**
- Create: `src/ingest/account-reconcile.ts`
- Test: `src/ingest/__tests__/account-reconcile.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ingest/__tests__/account-reconcile.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOwnAccount } from '../account-reconcile';

const accounts = [
  { id: 'acc_hdfc1', kind: 'bank' as const, institutionId: 'in/hdfc-bank', last4: '7702' },
  { id: 'card_hdfc1', kind: 'card' as const, institutionId: 'in/hdfc-card', last4: '1234' },
];

test('matches an existing account by institution + last4', () => {
  const r = resolveOwnAccount({ institutionId: 'in/hdfc-bank', accountLast4: '7702' }, accounts);
  assert.deepEqual(r, { ownAccountId: 'acc_hdfc1', ownAccountKind: 'bank', stubCreated: false, needsAssignment: false });
});

test('signals a stub when institution+last4 known but no account matches', () => {
  const r = resolveOwnAccount({ institutionId: 'in/hdfc-bank', accountLast4: '9999' }, accounts);
  assert.equal(r.stubCreated, true);
  assert.equal(r.ownAccountKind, 'bank');
  assert.equal(r.needsAssignment, false);
  assert.ok(r.ownAccountId.startsWith('acc_'));
});

test('flags for manual assignment when no last4 in header', () => {
  const r = resolveOwnAccount({ institutionId: 'in/hdfc-bank', accountLast4: undefined }, accounts);
  assert.equal(r.needsAssignment, true);
  assert.equal(r.ownAccountId, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/ingest/__tests__/account-reconcile.test.ts`
Expected: FAIL — cannot find module `../account-reconcile`.

- [ ] **Step 3: Implement the pure resolver**

Create `src/ingest/account-reconcile.ts`:

```ts
/**
 * Resolve a parsed document to one of the household's own accounts.
 *
 * A statement is FROM one account. We match (institutionId + last4) against the
 * registered bank/card accounts. When the header gives a last4 but no account
 * matches, we mint a stub id (the caller persists the stub). When the header has
 * no last4 at all, we cannot decide — the document is flagged for the user to
 * assign manually. Pure: persistence is the caller's job.
 */
import { randomUUID } from 'node:crypto';

export interface OwnAccountRow {
  id: string;
  kind: 'bank' | 'card';
  institutionId: string | null;
  last4: string | null;
}

export interface DocAccountHint {
  institutionId: string | null;
  accountLast4?: string;
  /** card_statement docs resolve against cards; everything else against banks. */
  docType?: string;
}

export interface ResolvedOwnAccount {
  ownAccountId: string | null;
  ownAccountKind: 'bank' | 'card' | null;
  stubCreated: boolean;
  needsAssignment: boolean;
}

export function resolveOwnAccount(hint: DocAccountHint, accounts: OwnAccountRow[]): ResolvedOwnAccount {
  const kind: 'bank' | 'card' = hint.docType === 'card_statement' ? 'card' : 'bank';
  if (!hint.accountLast4) {
    return { ownAccountId: null, ownAccountKind: null, stubCreated: false, needsAssignment: true };
  }
  const match = accounts.find(
    (a) => a.kind === kind && a.institutionId === hint.institutionId && a.last4 === hint.accountLast4,
  );
  if (match) {
    return { ownAccountId: match.id, ownAccountKind: kind, stubCreated: false, needsAssignment: false };
  }
  const prefix = kind === 'card' ? 'card' : 'acc';
  return { ownAccountId: `${prefix}_${randomUUID().slice(0, 8)}`, ownAccountKind: kind, stubCreated: true, needsAssignment: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/ingest/__tests__/account-reconcile.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ingest/account-reconcile.ts src/ingest/__tests__/account-reconcile.test.ts
git commit -m "feat(ingest): pure own-account resolver (match/stub/flag)"
```

### Task 6: Wire reconciliation into the ingest pipeline

**Files:**
- Modify: `src/ingest/pipeline.ts`

- [ ] **Step 1: Load own accounts once and reconcile per document**

In `src/ingest/pipeline.ts`, add imports at the top with the other imports:

```ts
import { accountsBank, accountsCard, counterparties as counterpartiesTable } from '@/db/schema';
import { resolveOwnAccount, type OwnAccountRow } from './account-reconcile';
```

(If `accountsBank`/`accountsCard` are already imported, extend the existing import instead.)

Before the per-document loop that inserts into `parsedDocuments` (around line 184), load the account registry once:

```ts
  const ownAccounts: OwnAccountRow[] = [
    ...db.select({ id: accountsBank.id, institutionId: accountsBank.institutionId, last4: accountsBank.last4 }).from(accountsBank).all().map((a) => ({ ...a, kind: 'bank' as const })),
    ...db.select({ id: accountsCard.id, institutionId: accountsCard.institutionId, last4: accountsCard.last4 }).from(accountsCard).all().map((a) => ({ ...a, kind: 'card' as const })),
  ];
```

- [ ] **Step 2: Resolve and persist the doc's account**

Where the document is inserted into `parsedDocuments` (`.values({...})` near line 187), compute the resolution from the parsed statement and the document's institution, and add the fields. Add before the insert:

```ts
    const docAccount = resolveOwnAccount(
      { institutionId: providerId, accountLast4: parsed.accountLast4, docType: parsed.docType },
      ownAccounts,
    );
    if (docAccount.stubCreated && docAccount.ownAccountId) {
      const stub = { id: docAccount.ownAccountId, institutionId: providerId, last4: parsed.accountLast4 ?? null };
      if (docAccount.ownAccountKind === 'card') db.insert(accountsCard).values(stub).onConflictDoNothing().run();
      else db.insert(accountsBank).values(stub).onConflictDoNothing().run();
      ownAccounts.push({ ...stub, kind: docAccount.ownAccountKind });
    }
```

(Use the variable names already present in that scope: the parsed statement object and the provider id. If the parsed statement is named `parsedStatement` rather than `parsed`, match it.)

Then add to the `parsedDocuments` `.values({...})`:

```ts
        accountLast4: parsed.accountLast4 ?? null,
        ownAccountId: docAccount.ownAccountId,
        ownAccountKind: docAccount.ownAccountKind,
```

- [ ] **Step 3: Carry `ownAccountId`/`ownAccountKind` onto each result row**

Where `results` entries are built for each raw txn (the array mapped at line 259 / consumed at the insert), ensure each entry knows its doc's account. Add `ownAccountId: docAccount.ownAccountId, ownAccountKind: docAccount.ownAccountKind` to the per-txn meta object built in this document's scope (the object that already carries `docId`, `messageId`, `providerId`). Match the existing `meta` shape.

- [ ] **Step 4: Persist on the transaction insert**

In the `tx.insert(transactions).values({...})` block (line 277) and its `onConflictDoUpdate` `set` (line 297), add:

```ts
          ownAccountId: meta.ownAccountId ?? null,
          ownAccountKind: meta.ownAccountKind ?? null,
```

- [ ] **Step 5: Typecheck and run the ingest tests**

Run: `npx tsc --noEmit`
Run: `node --import tsx --test src/ingest/__tests__/*.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ingest/pipeline.ts
git commit -m "feat(ingest): stamp own account on documents and transactions"
```

---

## Phase 4 — Counterparty resolution

### Task 7: Counterparty registry types + pure resolver

**Files:**
- Create: `src/classifier/counterparties.ts`
- Test: `src/classifier/__tests__/counterparties.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/classifier/__tests__/counterparties.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCounterparty, type CounterpartyEntry } from '../counterparties';

const registry: CounterpartyEntry[] = [
  { id: 'cp_self_icici', kind: 'own_account', isOwnMoney: true, matchers: { last4: ['7702'], nameTokens: ['lov loothra'] } },
  { id: 'cp_cred', kind: 'card_bill', isOwnMoney: true, matchers: { vpaFragments: ['cred.club'] } },
  { id: 'cp_landlord', kind: 'family', isOwnMoney: false, matchers: { nameTokens: ['ramesh kumar'] } },
];

test('resolves own account by name token', () => {
  const r = resolveCounterparty('LOV LOOTHRA', registry);
  assert.deepEqual(r, { counterpartyId: 'cp_self_icici', counterpartyKind: 'own_account' });
});

test('resolves card bill VPA as known_own', () => {
  const r = resolveCounterparty('payment@cred.club', registry);
  assert.deepEqual(r, { counterpartyId: 'cp_cred', counterpartyKind: 'known_own' });
});

test('resolves a non-own match as external', () => {
  const r = resolveCounterparty('ramesh kumar', registry);
  assert.deepEqual(r, { counterpartyId: 'cp_landlord', counterpartyKind: 'external' });
});

test('null counterparty is unknown', () => {
  const r = resolveCounterparty(null, registry);
  assert.deepEqual(r, { counterpartyId: null, counterpartyKind: 'unknown' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/classifier/__tests__/counterparties.test.ts`
Expected: FAIL — cannot find module `../counterparties`.

- [ ] **Step 3: Implement the resolver**

Create `src/classifier/counterparties.ts`:

```ts
/**
 * Own-entity counterparty registry + resolver. The registry names the
 * household's own accounts and known transfer counterparties (own banks not
 * imported, family, broker, card-bill VPAs). Resolving a transaction's
 * counterparty against it tells the transfer engine whether money actually left
 * the household. Pure & deterministic — the registry is passed in.
 */
export interface CounterpartyEntry {
  id: string;
  kind: 'own_account' | 'card_bill' | 'family' | 'broker' | 'other_own';
  isOwnMoney: boolean;
  matchers?: {
    vpaFragments?: string[];
    nameTokens?: string[];
    last4?: string[];
    institutionId?: string;
  };
}

export type CounterpartyKind = 'own_account' | 'known_own' | 'external' | 'unknown';

export interface CounterpartyResolution {
  counterpartyId: string | null;
  counterpartyKind: CounterpartyKind;
}

function entryMatches(raw: string, e: CounterpartyEntry): boolean {
  const d = raw.toLowerCase();
  const m = e.matchers ?? {};
  if (m.vpaFragments?.some((f) => d.includes(f.toLowerCase()))) return true;
  if (m.nameTokens?.some((t) => t.length >= 3 && d.includes(t.toLowerCase()))) return true;
  if (m.last4?.some((l) => d.includes(l))) return true;
  return false;
}

export function resolveCounterparty(raw: string | null | undefined, registry: CounterpartyEntry[]): CounterpartyResolution {
  if (!raw) return { counterpartyId: null, counterpartyKind: 'unknown' };
  const hit = registry.find((e) => entryMatches(raw, e));
  if (!hit) return { counterpartyId: null, counterpartyKind: 'unknown' };
  if (!hit.isOwnMoney) return { counterpartyId: hit.id, counterpartyKind: 'external' };
  return { counterpartyId: hit.id, counterpartyKind: hit.kind === 'own_account' ? 'own_account' : 'known_own' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/classifier/__tests__/counterparties.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/classifier/counterparties.ts src/classifier/__tests__/counterparties.test.ts
git commit -m "feat(classifier): own-entity counterparty registry + pure resolver"
```

---

## Phase 5 — Transfer engine rewrite

### Task 8: Own-entity single-sided + relaxed own↔own pairing

**Files:**
- Modify: `src/classifier/transfers.ts`
- Test: `src/classifier/__tests__/transfers.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/classifier/__tests__/transfers.test.ts`:

```ts
test('counterparty resolving to an own account is a single-sided transfer', () => {
  const { transferIds } = linkInternalTransfers([
    { id: 'd1', date: '2025-10-01', amount: -500000_00, rawDescription: 'NEFT to self', counterpartyKind: 'own_account' },
  ]);
  assert.ok(transferIds.has('d1'));
});

test('own debit <-> own credit pair with no keyword is a transfer', () => {
  const { transferIds, links } = linkInternalTransfers([
    { id: 'd1', date: '2025-10-01', amount: -500000_00, rawDescription: 'MOBILE BANKING DFC bank', ownAccountId: 'acc_icici' },
    { id: 'c1', date: '2025-10-02', amount: 500000_00, rawDescription: 'MOBILE BANKING DFC bank', ownAccountId: 'acc_hdfc', documentId: 'doc2' },
  ]);
  assert.ok(transferIds.has('d1') && transferIds.has('c1'));
  assert.equal(links[0].kind, 'account_transfer');
});

test('own credit with no matching own debit is NOT auto-paired', () => {
  const { transferIds } = linkInternalTransfers([
    { id: 'c1', date: '2025-10-01', amount: 500000_00, rawDescription: 'MOBILE BANKING DFC bank', ownAccountId: 'acc_hdfc' },
  ]);
  assert.equal(transferIds.has('c1'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/classifier/__tests__/transfers.test.ts`
Expected: FAIL — `counterpartyKind`/`ownAccountId` not on `LinkTxn`; new cases not handled.

- [ ] **Step 3: Extend `LinkTxn` and the candidate/pairing logic**

In `src/classifier/transfers.ts`, extend `LinkTxn`:

```ts
export interface LinkTxn {
  id: string;
  date: string; // ISO YYYY-MM-DD
  amount: number; // signed paise
  rawDescription: string;
  documentId?: string | null;
  flow?: string;
  /** The own account this txn sits in (from document reconciliation). */
  ownAccountId?: string | null;
  /** Resolved counterparty kind, when known. */
  counterpartyKind?: 'own_account' | 'known_own' | 'external' | 'unknown';
  /** Resolved merchant, used by the suspected-transfer heuristic (Task 9). */
  merchant?: string | null;
}
```

Update `isCandidate` so an own-entity counterparty or an own account counts as a candidate:

```ts
function isCandidate(t: LinkTxn, selfNames: string[]): boolean {
  return (
    t.flow === 'transfer' ||
    t.counterpartyKind === 'own_account' ||
    t.counterpartyKind === 'known_own' ||
    !!t.ownAccountId ||
    TRANSFER_RE.test(t.rawDescription) ||
    selfNameHit(t.rawDescription, selfNames)
  );
}
```

In the pairing loop, relax the keyword requirement when both legs are own accounts. Replace the existing `const match = credits.find(...)` predicate body so a pair is accepted when amounts/dates line up AND **either** an existing transfer signal is present **or** both legs carry an `ownAccountId`:

```ts
    const match = credits.find(
      (c) =>
        !usedCredit.has(c.id) &&
        Math.abs(c.amount) === Math.abs(d.amount) &&
        within(c.date, d.date, windowDays) &&
        !(d.documentId && c.documentId && d.documentId === c.documentId) &&
        (!!d.ownAccountId && !!c.ownAccountId
          ? d.ownAccountId !== c.ownAccountId // both own accounts: relaxed, but not the same account
          : TRANSFER_RE.test(d.rawDescription) || TRANSFER_RE.test(c.rawDescription)),
    );
```

Add a single-sided rule for own-entity counterparties, alongside the existing CC-payment single-sided block:

```ts
  // Own-entity counterparty: a transfer by definition, even single-sided.
  for (const t of [...debits, ...credits]) {
    if (!transferIds.has(t.id) && (t.counterpartyKind === 'own_account' || t.counterpartyKind === 'known_own')) {
      transferIds.add(t.id);
    }
  }
```

Place this loop before the `return` and after the existing single-sided CC blocks.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/classifier/__tests__/transfers.test.ts`
Expected: PASS (including all pre-existing transfer tests — the relaxation only adds matches when both legs are own accounts).

- [ ] **Step 5: Commit**

```bash
git add src/classifier/transfers.ts src/classifier/__tests__/transfers.test.ts
git commit -m "feat(classifier): own-entity + relaxed own-account transfer detection"
```

### Task 9: Round-number suspected-transfer heuristic

**Files:**
- Modify: `src/classifier/transfers.ts`
- Test: `src/classifier/__tests__/transfers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('large round-number credit with no merchant/counterparty is suspected', () => {
  const { suspectedIds } = linkInternalTransfers([
    { id: 'c1', date: '2025-11-02', amount: 500000_00, rawDescription: 'MOBILE BANKING DFC bank' },
  ]);
  assert.ok(suspectedIds.has('c1'));
});

test('round credit that is already a confirmed transfer is not also suspected', () => {
  const { suspectedIds } = linkInternalTransfers([
    { id: 'd1', date: '2025-10-01', amount: -500000_00, rawDescription: 'x', ownAccountId: 'a' },
    { id: 'c1', date: '2025-10-01', amount: 500000_00, rawDescription: 'x', ownAccountId: 'b', documentId: 'd2' },
  ]);
  assert.equal(suspectedIds.has('c1'), false);
});

test('non-round credit is not suspected', () => {
  const { suspectedIds } = linkInternalTransfers([
    { id: 'c1', date: '2025-11-02', amount: 137_50, rawDescription: 'refund' },
  ]);
  assert.equal(suspectedIds.has('c1'), false);
});

test('credit with a resolved merchant is not suspected', () => {
  const { suspectedIds } = linkInternalTransfers([
    { id: 'c1', date: '2025-11-02', amount: 500000_00, rawDescription: 'salary', merchant: 'Acme Corp' },
  ]);
  assert.equal(suspectedIds.has('c1'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/classifier/__tests__/transfers.test.ts`
Expected: FAIL — `suspectedIds` is not on the result.

- [ ] **Step 3: Implement the heuristic and extend the result**

In `src/classifier/transfers.ts`, add constants near the top:

```ts
/** Suspected-transfer thresholds (one tunable place). A credit at/above the
 * minimum that is an exact multiple of the step, with no merchant and no
 * resolved counterparty, is quarantined rather than counted as income. */
const ROUND_TRANSFER_MIN_PAISE = 100_000 * 100; // ₹1,00,000
const ROUND_TRANSFER_STEP_PAISE = 10_000 * 100; // ₹10,000
```

Extend `TransferResult`:

```ts
export interface TransferResult {
  transferIds: Set<string>;
  suspectedIds: Set<string>;
  links: TransferLink[];
}
```

In `linkInternalTransfers`, declare `const suspectedIds = new Set<string>();` next to `transferIds`. Before `return`, add:

```ts
  for (const c of credits.length ? credits : txns.filter((t) => t.amount > 0)) {
    if (transferIds.has(c.id)) continue;
    if (c.merchant) continue;
    if (c.counterpartyKind && c.counterpartyKind !== 'unknown') continue;
    if (c.amount >= ROUND_TRANSFER_MIN_PAISE && c.amount % ROUND_TRANSFER_STEP_PAISE === 0) {
      suspectedIds.add(c.id);
    }
  }
```

Note: `credits` is filtered to candidates only, so iterate over all positive txns for this check — use `txns.filter((t) => t.amount > 0)` directly:

```ts
  for (const c of txns.filter((t) => t.amount > 0)) {
    if (transferIds.has(c.id)) continue;
    if (c.merchant) continue;
    if (c.counterpartyKind && c.counterpartyKind !== 'unknown') continue;
    if (c.amount >= ROUND_TRANSFER_MIN_PAISE && c.amount % ROUND_TRANSFER_STEP_PAISE === 0) {
      suspectedIds.add(c.id);
    }
  }
```

(Use this second form; delete the first.) Update the final `return` to `return { transferIds, suspectedIds, links };`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/classifier/__tests__/transfers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/classifier/transfers.ts src/classifier/__tests__/transfers.test.ts
git commit -m "feat(classifier): quarantine large round-number credits as suspected transfers"
```

### Task 10: Wire counterparty resolution + suspectedTransfer through ingest

**Files:**
- Modify: `src/ingest/pipeline.ts`
- Modify: `src/ingest/reclassify.ts`

- [ ] **Step 1: Load the counterparty registry and resolve per txn (pipeline.ts)**

In `src/ingest/pipeline.ts`, import the resolver:

```ts
import { resolveCounterparty, type CounterpartyEntry } from '@/classifier/counterparties';
```

Load the registry once (near where `ownAccounts` is loaded in Task 6):

```ts
  const cpRegistry: CounterpartyEntry[] = db
    .select()
    .from(counterpartiesTable)
    .all()
    .map((c) => ({ id: c.id, kind: c.kind, isOwnMoney: c.isOwnMoney, matchers: c.matchers ?? undefined }));
```

- [ ] **Step 2: Feed counterparty + own account into `linkInternalTransfers`**

Where `linkInternalTransfers` is called (line 259), enrich each mapped `LinkTxn` and resolve its counterparty. Replace the `.map(...)` argument with:

```ts
    results.map(({ raw, meta, deterministic }) => {
      const cp = resolveCounterparty(raw.counterpartyRaw, cpRegistry);
      // stash resolution back on meta for the insert phase
      meta.counterpartyId = cp.counterpartyId;
      meta.counterpartyKind = cp.counterpartyKind;
      meta.counterpartyRaw = raw.counterpartyRaw ?? null;
      return {
        id: raw.id,
        date: raw.date,
        amount: raw.amount,
        rawDescription: raw.rawDescription,
        documentId: meta.docId,
        flow: deterministic.flow,
        ownAccountId: meta.ownAccountId,
        counterpartyKind: cp.counterpartyKind,
        merchant: deterministic.merchant ?? null,
      };
    }),
```

This requires `raw.counterpartyRaw` to exist on the raw txn — ensure the parser→raw mapping carries `counterpartyRaw` through (the object that builds `RawTxn` from `ParsedTxn`). Add `counterpartyRaw: pt.counterpartyRaw ?? null` there and add `counterpartyRaw?: string | null;` to the `RawTxn` interface in `src/classifier/types.ts`.

- [ ] **Step 3: Persist counterparty + suspectedTransfer on the insert**

In the `tx.insert(transactions).values({...})` and the `onConflictDoUpdate` `set`, add:

```ts
          counterpartyRaw: meta.counterpartyRaw ?? null,
          counterpartyId: meta.counterpartyId ?? null,
          counterpartyKind: meta.counterpartyKind ?? 'unknown',
          suspectedTransfer: transfer.suspectedIds.has(raw.id),
```

And make a suspected transfer go to review without being counted: where `reviewRequired` is set, OR in the suspected flag:

```ts
          reviewRequired: isTransfer ? false : (final.reviewRequired || transfer.suspectedIds.has(raw.id)),
```

- [ ] **Step 4: Mirror in reclassify.ts**

Apply the same three changes (registry load, enriched `linkInternalTransfers` map with counterparty resolution, persisted fields incl. `suspectedTransfer`) in `src/ingest/reclassify.ts` at its `linkInternalTransfers` call (line 78) and its insert/update (line ~110). The structure mirrors pipeline.ts.

- [ ] **Step 5: Typecheck and run ingest tests**

Run: `npx tsc --noEmit`
Run: `node --import tsx --test src/ingest/__tests__/*.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ingest/pipeline.ts src/ingest/reclassify.ts src/classifier/types.ts
git commit -m "feat(ingest): resolve counterparty and persist suspected-transfer flag"
```

---

## Phase 6 — Canonical taxonomy

### Task 11: Taxonomy module + legacy normalization

**Files:**
- Create: `src/classifier/taxonomy.ts`
- Test: `src/classifier/__tests__/taxonomy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/classifier/__tests__/taxonomy.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoriesForFlow, normalizeCategory, TAXONOMY } from '../taxonomy';

test('income flow exposes the new income categories', () => {
  const cats = categoriesForFlow('income');
  assert.ok(cats.includes('salary'));
  assert.ok(cats.includes('interest'));
  assert.ok(cats.includes('dividend'));
  assert.ok(cats.includes('capital_gains'));
});

test('normalizeCategory folds legacy free-form strings to canonical keys', () => {
  assert.equal(normalizeCategory('Salary'), 'salary');
  assert.equal(normalizeCategory('expenses.travel'), 'travel');
  assert.equal(normalizeCategory('Credit card payment'), 'cc_payment');
  assert.equal(normalizeCategory('quick-commerce'), 'quick_commerce');
});

test('unknown legacy string falls back to other for its position', () => {
  assert.equal(normalizeCategory('something we never saw'), 'uncategorised');
});

test('every taxonomy value is unique within its flow', () => {
  for (const flow of Object.keys(TAXONOMY) as (keyof typeof TAXONOMY)[]) {
    const set = new Set(TAXONOMY[flow]);
    assert.equal(set.size, TAXONOMY[flow].length);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/classifier/__tests__/taxonomy.test.ts`
Expected: FAIL — cannot find module `../taxonomy`.

- [ ] **Step 3: Implement the taxonomy**

Create `src/classifier/taxonomy.ts`:

```ts
/**
 * Canonical category taxonomy keyed by flow. Replaces the ad-hoc free-form
 * category strings (mixed casing and dotted paths). `normalizeCategory` folds
 * legacy strings onto canonical keys for the one-time data migration and the UI.
 */
import type { Flow } from './types';

export const TAXONOMY: Record<Flow, string[]> = {
  income: ['salary', 'interest', 'dividend', 'capital_gains', 'rental_income', 'reimbursement', 'refund', 'gift', 'other_income'],
  expense: [
    'housing', 'rent', 'utilities', 'electricity', 'water', 'gas', 'mobile_internet',
    'groceries', 'food_delivery', 'dining', 'quick_commerce', 'transport', 'fuel', 'cabs',
    'travel', 'hotels', 'health', 'pharmacy', 'insurance', 'subscriptions', 'household',
    'charity', 'loan', 'uncategorised',
  ],
  transfer: ['self_transfer', 'cc_payment', 'atm_cash'],
  investment: ['investment'],
};

/** Legacy free-form string -> canonical key. Lowercased lookup. */
const LEGACY_MAP: Record<string, string> = {
  salary: 'salary',
  income: 'other_income',
  interest: 'interest',
  dividend: 'dividend',
  refund: 'refund',
  transfer: 'self_transfer',
  'credit card payment': 'cc_payment',
  'card autopay': 'cc_payment',
  'atm withdrawal': 'atm_cash',
  cash: 'atm_cash',
  rent: 'rent',
  housing: 'housing',
  utilities: 'utilities',
  electricity: 'electricity',
  water: 'water',
  gas: 'gas',
  'mobile/internet': 'mobile_internet',
  transport: 'transport',
  fuel: 'fuel',
  hotels: 'hotels',
  insurance: 'insurance',
  loan: 'loan',
  subscriptions: 'subscriptions',
  household: 'household',
  charity: 'charity',
  investment: 'investment',
  'quick-commerce': 'quick_commerce',
  'expenses.travel': 'travel',
  'expenses.groceries': 'groceries',
  'expenses.transport.cabs': 'cabs',
  'expenses.quick_commerce': 'quick_commerce',
  'expenses.health.pharmacy': 'pharmacy',
  'expenses.food_delivery': 'food_delivery',
};

export function categoriesForFlow(flow: Flow): string[] {
  return TAXONOMY[flow];
}

export function normalizeCategory(legacy: string | null | undefined): string {
  if (!legacy) return 'uncategorised';
  const key = legacy.trim().toLowerCase();
  if (LEGACY_MAP[key]) return LEGACY_MAP[key];
  // already canonical?
  for (const cats of Object.values(TAXONOMY)) if (cats.includes(key)) return key;
  // dotted path: take the leaf and snake-case it
  const leaf = key.split('.').pop()!.replace(/-/g, '_');
  for (const cats of Object.values(TAXONOMY)) if (cats.includes(leaf)) return leaf;
  return 'uncategorised';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/classifier/__tests__/taxonomy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/classifier/taxonomy.ts src/classifier/__tests__/taxonomy.test.ts
git commit -m "feat(classifier): canonical flow-keyed taxonomy + legacy normalization"
```

### Task 12: One-time category normalization migration script

**Files:**
- Create: `scripts/normalize-categories.ts`
- Test: manual run (DB script)

- [ ] **Step 1: Write the script**

Create `scripts/normalize-categories.ts`:

```ts
/**
 * One-time backfill: fold existing free-form transaction categories onto the
 * canonical taxonomy. Idempotent — running twice is a no-op.
 * Run: tsx --conditions=react-server scripts/normalize-categories.ts
 */
import { getDb } from '@/db/client';
import { transactions } from '@/db/schema';
import { normalizeCategory } from '@/classifier/taxonomy';

const db = getDb();
const rows = db.select({ id: transactions.id, category: transactions.category }).from(transactions).all();
let updated = 0;
db.transaction((tx) => {
  for (const r of rows) {
    const canon = normalizeCategory(r.category);
    if (canon !== r.category) {
      tx.update(transactions).set({ category: canon }).where(/* eq(transactions.id, r.id) */ undefined as never).run();
      updated++;
    }
  }
});
console.log(`normalized ${updated}/${rows.length} categories`);
```

Replace the `.where(...)` placeholder with the real predicate: import `eq` from `drizzle-orm` and use `eq(transactions.id, r.id)`. (Shown explicitly so the engineer wires the import: `import { eq } from 'drizzle-orm';`.)

- [ ] **Step 2: Run the script against a test DB**

Run: `PF_DB_PATH=/tmp/pf-normalize-test.db tsx --conditions=react-server scripts/normalize-categories.ts`
Expected: prints `normalized N/M categories` with no error. (Empty DB prints `normalized 0/0`.)

- [ ] **Step 3: Commit**

```bash
git add scripts/normalize-categories.ts
git commit -m "chore(scripts): one-time category normalization backfill"
```

---

## Phase 7 — Rollups

### Task 13: Exclude suspected transfers from income

**Files:**
- Modify: `src/ledger/rollups.ts`
- Test: `src/ledger/__tests__/rollups.test.ts` (create if absent; otherwise extend)

- [ ] **Step 1: Write the failing test**

Add a test that builds an ephemeral DB with one normal income row and one `suspectedTransfer` income row, then asserts the income rollup excludes the suspected one. Use the existing rollups test setup if present; otherwise model it on `src/ingest/__tests__` DB setup (`PF_DB_PATH`). Minimal assertion:

```ts
test('income rollup excludes suspectedTransfer credits', async () => {
  // insert: txn A flow=income amount=+50000_00 suspectedTransfer=false fyKey='2025-26'
  //         txn B flow=income amount=+500000_00 suspectedTransfer=true  fyKey='2025-26'
  const total = totalForFlow('2025-26', 'income'); // whatever the exported fn is named
  assert.equal(total, 50000_00);
});
```

(Match the actual exported rollup function name in `src/ledger/rollups.ts` — e.g. the function backing line 264's income query.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/ledger/__tests__/rollups.test.ts`
Expected: FAIL — suspected credit is included (total too high).

- [ ] **Step 3: Add the filter to income queries**

In `src/ledger/rollups.ts`, every query whose `.where(...)` filters `eq(transactions.flow, 'income')` (e.g. line 74 when `flow==='income'`, line 264) must also exclude suspected transfers. Add `eq(transactions.suspectedTransfer, false)` to those `and(...)` clauses. Example for line 264:

```ts
    .where(and(eq(transactions.fyKey, fy), eq(transactions.flow, 'income'), eq(transactions.isInternalTransfer, false), eq(transactions.suspectedTransfer, false)))
```

Leave expense queries unchanged (suspected transfers are credits).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/ledger/__tests__/rollups.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full ledger + classifier suites**

Run: `node --import tsx --test src/ledger/__tests__/*.test.ts src/classifier/__tests__/*.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ledger/rollups.ts src/ledger/__tests__/rollups.test.ts
git commit -m "feat(ledger): exclude suspected transfers from income rollups"
```

---

## Phase 8 — UI

### Task 14: Account chip + counterparty + suspected-transfer banner in TriageView

**Files:**
- Modify: `src/ui/pages/spending/TriageView.tsx`
- Read first: the API route(s) feeding TriageView under `app/api/review/` or `app/api/dashboard/review/` to learn the row shape returned to the client.

- [ ] **Step 1: Read the current component and its data source**

Read `src/ui/pages/spending/TriageView.tsx` in full and the review API route it fetches from. Identify (a) the transaction row type used in the component, (b) where each grouped card renders the merchant/category/assign controls (the block shown in the screenshot).

- [ ] **Step 2: Surface the new fields through the API**

In the review API route, add `ownAccountId`, `ownAccountKind`, `counterpartyRaw`, `counterpartyKind`, `suspectedTransfer` to the selected columns and the response row type. Join `accounts_bank`/`accounts_card` (by `ownAccountId` + `ownAccountKind`) to also return `{ accountNickname, accountLast4, institutionId }` for the chip.

- [ ] **Step 3: Render the account chip**

In the card header (next to the merchant title), render an account chip: institution logo (reuse the existing logo component used elsewhere — search the codebase for the merchant/category logo component introduced in commit `5927e07`) + `··{accountLast4}`. When `ownAccountId` is null, render a muted "Assign account" affordance.

- [ ] **Step 4: Render counterparty + suspected-transfer banner**

Under each transaction line, when `counterpartyRaw` is present, render it as "→ {counterpartyRaw}" (debit) / "← {counterpartyRaw}" (credit). When `suspectedTransfer` is true on the group, render a banner above the assign row: "Suspected transfer — not counted as income" with two actions: "Mark as transfer" and "It's income". Wire these to the existing override/accept endpoints (the same ones the chip picker already calls) — "Mark as transfer" sets `flow='transfer'`, `isInternalTransfer=true`; "It's income" clears `suspectedTransfer` and keeps `flow='income'`.

- [ ] **Step 5: Verify in the browser**

Start the dev server and confirm: a suspected-transfer group shows the banner; account chip shows logo + last4; counterparty line renders where present. Use the preview tools (preview_start, preview_snapshot, preview_screenshot). Confirm no console errors (preview_console_logs).

- [ ] **Step 6: Commit**

```bash
git add src/ui/pages/spending/TriageView.tsx app/api
git commit -m "feat(ui): account chip, counterparty, suspected-transfer banner in triage"
```

### Task 15: Flow-filtered category picker

**Files:**
- Modify: `src/ui/pages/spending/TriageView.tsx`

- [ ] **Step 1: Use the taxonomy for the picker**

Import `categoriesForFlow` from `@/classifier/taxonomy`. In the "Filter categories…" picker (the control shown in the screenshot), source the options from `categoriesForFlow(group.flow)` instead of a flat/free-form list, so a credit group offers income categories and a debit group offers expense categories.

- [ ] **Step 2: Verify in the browser**

Reload; confirm a credit group's picker lists `salary`, `interest`, `dividend`, … and a debit group lists expense categories. Use preview_snapshot/preview_click to open the picker and preview_screenshot to capture.

- [ ] **Step 3: Commit**

```bash
git add src/ui/pages/spending/TriageView.tsx
git commit -m "feat(ui): flow-filtered category picker from canonical taxonomy"
```

---

## Final verification

### Task 16: Full suite + lint

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean (fix any new findings in touched files).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Final commit (if lint/typecheck required edits)**

```bash
git add -A
git commit -m "chore: lint + typecheck fixes for account-aware transactions"
```

---

## Self-review notes (coverage map)

- Spec §A (data model) → Task 1.
- Spec §B (parser extraction) → Tasks 2–4.
- Spec §C (account reconciliation) → Tasks 5–6.
- Spec §D (counterparty resolution) → Task 7, wired in Task 10.
- Spec §E (transfer engine: own-entity, relaxed pairing, round-number) → Tasks 8–9, wired Task 10.
- Spec §F (canonical taxonomy) → Tasks 11–12, used in UI Task 15.
- Spec §G (UI) → Tasks 14–15.
- Spec §H (rollups guarantee) → Task 13 (income); `isInternalTransfer` exclusion already exists in rollups.ts and is preserved.

Type consistency: `ownAccountId`/`ownAccountKind`, `counterpartyRaw`/`counterpartyId`/`counterpartyKind`, `suspectedTransfer` use identical names across schema, `RawTxn`, `LinkTxn`, `meta`, and inserts. `TransferResult` gains `suspectedIds` (Task 9) and is consumed in Task 10/13. `CounterpartyEntry`/`CounterpartyResolution` names match between Task 7 and Task 10.
