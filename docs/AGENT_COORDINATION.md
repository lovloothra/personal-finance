# Agent Coordination

This repo is often worked on by multiple coding agents, including Fable 5,
Opus 4.8, Sonnet 5, and Codex. The default coordination model is
artifact-first, isolated work: every agent should work from the same repo
documents, write durable handoffs, and avoid private assumptions.

## Sources of Truth

- `AGENTS.md` is the entrypoint for every coding agent.
- `CLAUDE.md` is the architecture, commands, and conventions map.
- `docs/DECISIONS.md` is the product constitution. Any structural or product
  direction change that conflicts with it needs explicit owner sign-off.
- `.claude/skills/*/SKILL.md` are required runbooks for risky areas. Read the
  matching skill before touching its area.
- `docs/GOALS.md` is the backlog. Record the required baseline eval before
  marking a goal `[~]`, and preserve the written acceptance criteria.
- `docs/superpowers/specs/` holds approved designs. `docs/superpowers/plans/`
  holds execution handoffs for multi-step or multi-agent work.

## Start-of-Task Checklist

Before changing code or docs, every agent should:

1. Read `AGENTS.md` and `CLAUDE.md`.
2. Run `rtk git status --short` and treat unfamiliar changes as someone else's
   work.
3. Read the relevant `.claude/skills/*/SKILL.md` file for the touched area.
4. Read `docs/DECISIONS.md` before proposing architecture or product-direction
   changes.
5. If picking up a backlog goal, read `docs/GOALS.md`, run the required
   baseline eval, and mark only the chosen goal in progress.

## Handoff Contract

The required handoff shape is defined canonically in `AGENTS.md`
("Multi-agent handoff — required shape") — one list, one place; do not
duplicate it here.

If two agents need to touch the same file or subsystem in parallel, pause and
reconcile through a written spec or plan before editing. In normal parallel
work, keep file ownership scoped and isolated.

**Stacked PRs:** merge the base PR first and let GitHub retarget the stack —
or delete base branches on merge. Merging a stacked PR into a base that
already merged strands the work on a dead branch while GitHub still shows
MERGED (this happened: PR #15 → recovered in #20). Before depending on any
MERGED PR, verify: `git merge-base --is-ancestor <sha> origin/main`.

## Drift Guards

Do not silently change these invariants:

- Money is signed integer paise.
- The app is local-first, single-user, and loopback-only.
- The database is SQLCipher-encrypted and tied to the keychain passphrase
  model.
- `src/classifier/` is pure: no DB, no I/O, no `Date.now()`.
- User-visible numbers need provenance.
- Conservative automation beats silent corruption.
- Pack provider IDs are permanent foreign keys.
- Mutating API tests must preserve the loopback-origin guard.

## Verification Expectations

- Verification claims require actual command evidence and the verifying skill.
- DB, Gmail, and keychain tests must use ephemeral paths/passphrases and
  `--conditions=react-server`.
- UI checks must account for demo fixtures; rendered sample data is not proof
  that DB-backed behavior works.
- Classifier, taxonomy, or transfer work: run focused `node:test`, then
  `npm run eval:classifier`; use `npm run eval:ledger` when ledger quality
  changes.
- Parser or pack work: add or adjust fixture coverage, run relevant parser
  tests, `npm run validate:packs`, and pack-loader tests.
- Schema work: change `src/db/schema.ts`, generate Drizzle migrations, and do
  not hand-edit generated SQL or meta snapshots.
- UI or data-health work: verify against API or DB truth, not only fixture
  rendered pages.
