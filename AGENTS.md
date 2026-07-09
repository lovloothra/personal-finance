<!-- headroom:rtk-instructions -->
# RTK (Rust Token Killer) - Token-Optimized Commands

When running shell commands, **always prefix with `rtk`**. This reduces context
usage by 60-90% with zero behavior change. If rtk has no filter for a command,
it passes through unchanged — so it is always safe to use.

## Key Commands
```bash
# Git (59-80% savings)
rtk git status          rtk git diff            rtk git log

# Files & Search (60-75% savings)
rtk ls <path>           rtk read <file>         rtk grep <pattern>
rtk find <pattern>      rtk diff <file>

# Test (90-99% savings) — shows failures only
rtk pytest tests/       rtk cargo test          rtk test <cmd>

# Build & Lint (80-90% savings) — shows errors only
rtk tsc                 rtk lint                rtk cargo build
rtk prettier --check    rtk mypy                rtk ruff check

# Analysis (70-90% savings)
rtk err <cmd>           rtk log <file>          rtk json <file>
rtk summary <cmd>       rtk deps                rtk env

# GitHub (26-87% savings)
rtk gh pr view <n>      rtk gh run list         rtk gh issue list

# Infrastructure (85% savings)
rtk docker ps           rtk kubectl get         rtk docker logs <c>

# Package managers (70-90% savings)
rtk pip list            rtk pnpm install        rtk npm run <script>
```

## Rules
- In command chains, prefix each segment: `rtk git add . && rtk git commit -m "msg"`
- For debugging, use raw command without rtk prefix
- `rtk proxy <cmd>` runs command without filtering but tracks usage
<!-- /headroom:rtk-instructions -->

# Project Skills (all agents: Claude Code, Codex, Cursor, etc.)

Detailed workflow guides live in `.claude/skills/<name>/SKILL.md`. They follow the
agentskills.io SKILL.md format (YAML frontmatter with `name` + `description`).
Claude Code auto-discovers them. **If your agent does not auto-discover skills,
read the matching file below BEFORE starting that kind of work** — each one
documents a real failure this repo already hit once. `docs/METHODS.md` is the
judgment layer above all of them: signal → required move, with the real case
behind each rule. Read it once per session; apply it always.

| Before you… | Read |
|---|---|
| Change `src/db/schema.ts` or touch Drizzle migrations | `.claude/skills/changing-db-schema/SKILL.md` |
| Run/write any test or script touching the DB, keychain, or Gmail | `.claude/skills/running-db-tests-and-scripts/SKILL.md` |
| Add/fix a statement parser | `.claude/skills/adding-a-parser/SKILL.md` |
| Change classification rules, taxonomy, or transfer detection | `.claude/skills/changing-the-classifier/SKILL.md` |
| Investigate a wrongly categorized transaction | `.claude/skills/debugging-misclassifications/SKILL.md` |
| Touch `src/intelligence/` (local MiniLM classifier) | `.claude/skills/local-ml-guardrails/SKILL.md` |
| Edit `packs/in/*.json` institution/merchant data | `.claude/skills/updating-institution-packs/SKILL.md` |
| Claim any change works / need a safe dev server | `.claude/skills/verifying-changes/SKILL.md` |
| Touch backups, keychain, wipe/reset, or machine migration | `.claude/skills/backup-and-recovery/SKILL.md` |
| Change the triage/review UI, category picker, or assign flow | `.claude/skills/review-ui-conventions/SKILL.md` |

Architecture, commands, and conventions are documented in `CLAUDE.md` at the repo
root — it is a plain markdown file; read it at the start of a session regardless
of which agent you are. Process detail for parallel work lives in
`docs/AGENT_COORDINATION.md`. Before proposing any architectural or
product-direction change, read `docs/DECISIONS.md` — it records the load-bearing
decisions and the product principles behind them; conflicts with it need
explicit owner sign-off.

## Multi-agent handoff — required shape

This is the canonical handoff contract (AGENT_COORDINATION.md defers to it).
Every handoff — PR body, session summary, or plan doc — from any agent
(Fable, Opus, Sonnet, Codex, or a human) states:

1. Goal/task ID or name.
2. Docs and skills read — **when touching a governed area, name the
   `.claude/skills/*` file you followed**; that makes skill-vs-practice drift
   visible without adding bureaucracy.
3. Branch or worktree used.
4. Files touched.
5. Tests/evals run, with command names and outcomes (evidence, not assertions).
6. Known risks and unresolved decisions.
7. **Overlapping local changes you intentionally avoided** — uncommitted work,
   parallel worktrees, or files another session owns that you saw and left
   alone (or deliberately included, with attribution).

Quality scorecards live in `evals/` (`npm run eval:classifier`, `npm run
eval:ledger` — see `evals/README.md`). The project backlog is `docs/GOALS.md`:
self-contained briefs with baselines and acceptance criteria tied to eval
metrics. When picking up a goal, record the baseline metric first, mark the
entry `[~]`, and mark it `[x]` with the date when its acceptance criteria pass.

## Common errors → fix

| Symptom | Cause / fix |
|---|---|
| `Error: server-only cannot be imported...` | Run with `--conditions=react-server` (see running-db-tests-and-scripts skill) |
| `file is not a database` from sqlite3 | DB is SQLCipher-encrypted; go through `getDb()` (`src/db/client.ts`) |
| Test hangs or shows a keychain prompt | Set `PF_DB_PASSPHRASE` before importing `@/db/client` |
| App throws at boot after a schema change | Migrate failures are strict by default; fix the migration (changing-db-schema skill) — `PF_DB_STRICT_MIGRATE=0` relaxes for bootstrap only |
| `drizzle-kit generate` produces a weird diff | Stale meta snapshot — see changing-db-schema skill; do NOT hand-edit SQL |
| Page shows data although the DB is empty | Demo fixtures (`src/ui/lib/fixtures.ts`) render in the pre-import state |
| Mutating API call rejected in manual testing | Loopback-origin guard (`src/server/api.ts`); send a localhost `Origin` header |
| New classifier rule never fires | Shadowed by a higher-priority layer — see debugging-misclassifications skill |
| `getDb()` throws right after restoring a backup | Keychain passphrase doesn't match the file — see backup-and-recovery skill |
| `FOREIGN KEY constraint failed` deleting transactions | Six tables FK-reference `transactions.id` with no ON DELETE — use `clearDocumentOutput` (`src/ingest/clear-output.ts`), never a bare delete |

## Non-negotiable invariants (summary — skills have the details)

- Money is **signed integer paise** (₹1 = 100 paise). Never floats. Negative = debit.
- Modules touching DB/keychain/secrets import `server-only`: run them with
  `--conditions=react-server` (npm test already does; ad-hoc `node`/`tsx` must too).
- In DB tests, set `PF_DB_PATH` (ephemeral tmp dir) and `PF_DB_PASSPHRASE`
  **before** importing `@/db/client`, or you will open the real encrypted DB.
- `src/classifier/` is pure: no DB, no I/O, no `Date.now()` — inputs only via `ClassifyContext`.
- Never hand-edit generated migrations or Drizzle meta snapshots.
- Never rename a pack provider `id` — it is a foreign key everywhere.
- The DB file is SQLCipher-encrypted; plain `sqlite3` cannot open it.
- `data/`, `attachments/`, `exports/`, `secrets/` are gitignored — never commit them.
