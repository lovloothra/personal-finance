# Working Methods — the judgment layer

Domain knowledge lives in `.claude/skills/`; product law lives in
`docs/DECISIONS.md`. This file records **how work gets done here** — the
moves that separated good sessions from mediocre ones, extracted from this
repo's actual history. Each rule is a trigger you will recognize mid-task,
the required move, and the real case that proves it matters.

These are not aspirations. When you notice the signal, make the move.

## Rules: signal → move

**1. A symptom is reported → diagnose from data/code before prescribing.**
Never fix from a hypothesis you haven't checked. Read the mechanism; probe
the real data read-only; only then propose.
*Case:* "What does Assign account do?" — a read-only DB probe turned a vague
UI complaint into "37 ICICI docs where the account number sits below the
header-scoped regex + 9 docs of an unregistered account," each with a
different correct fix (2026-07, G1).

**2. About to claim something works → show the command output.**
Evidence, not assertions. "Tests pass" means the pass/fail counts are in
your message; "the UI works" means a DB row check or screenshot, not a
belief. If you quoted a number you didn't verify, fix the quote.
*Case:* a PR body originally cited a test count from memory; it was wrong
(152 vs 161) and corrected via `gh pr edit` after actually running the suite.

**3. A green result you didn't earn → test the test.**
An empty finding from a detector/test you never saw fail proves nothing.
Inject a known failure and confirm it gets caught, then trust the green.
*Case:* the UI overflow sweep returned `[]`; only after an injected
known-overflow probe was caught did the clean result count (PR #10).

**4. One bug found → hunt the class.**
A bug is a sample from a distribution. Name the mechanism, then search for
its siblings before closing.
*Case:* `'emi'` substring-matching "premium" at layer 2 (PR #3) → the same
mechanism at layer 5 stamped Pinterest debits as *income* via `'interest'`
plus flow-forcing (PR #5). The second bug was worse than the first.

**5. About to write to real data → backup, rehearse on a copy, apply, measure.**
`VACUUM INTO` snapshot → run against the copy (`PF_DB_PATH`) → compare
before/after aggregates → only then production → confirm production matches
the rehearsal.
*Case:* the retroactive reclassify: rehearsal predicted 43/2,835 changes
with user overrides untouched; production matched exactly.

**6. Shipping a fix → ratchet it.**
Every fix ships with the thing that makes recurrence loud: a guard test
named for the bug, a golden eval case (including a negative), a skill or
error-table note. A fix without a ratchet is a fix on loan.
*Case:* every classifier fix in this repo's history ships a
`*-guard.test.ts` and golden cases; the evals caught the EMI bug on their
first-ever run.

**7. Proposing a change of behavior → tie it to a measurable baseline.**
Record the metric before, define acceptance on the metric, measure after.
No goal is done because it feels done.
*Case:* every G-goal in `docs/GOALS.md` cites an `eval:ledger` line;
"income integrity" became "36 debits flipped from income" — a number.

**8. Choosing where to fix → check the altitude.**
Does this belong in the shared mechanism or the call site? A special case
layered on shared infrastructure is a bandaid; equally, don't generalize a
mechanism for one caller. Accounts belong to documents, not txn groups;
word-boundary matching belongs in `normalize.ts`, not inline regex.

**9. Rendering anything to the user → it must be honest.**
No fake affordances (a label styled as a button that does nothing), no
fake certainty (a guess displayed as a verdict), no silent precision loss
(compact numbers keep the exact figure in the tooltip). Suggest, never
silently apply. This is DECISIONS.md principle 1 applied at pixel level.
*Case:* "Assign account" (dead label) → "No account detected" + tooltip
(PR #9); `₹1.07 Cr` with `₹1,07,21,886` on hover (PR #10).

**10. Parallel work exists → protect it.**
Attribute others' uncommitted work when you must ship it; never clobber it
silently; when your diagnosis changes, *push the correction to the session
acting on the stale version*. Declare overlaps in your handoff (AGENTS.md
shape, field 7).
*Case:* the account-attribution session received a mid-flight correction
when the owner revealed card/bank registration facts that invalidated its
prompt.

**11. The user corrects a premise → re-verify everything downstream of it.**
A corrected fact is a thread; pull it. The correction is often smaller than
what it exposes.
*Case:* "2663/1567 are credit cards, not bank accounts" → re-probing found
1,677 transactions pointing at account ids that no longer existed — a
re-seed defect nobody had asked about, bigger than the original question.

**12. Writing a list/contract/config that exists elsewhere → one canonical copy.**
Duplicated lists drift. Pick the home (usually the entry point), make the
other location defer explicitly.
*Case:* the multi-agent handoff shape (PR #11) — an agent re-derived an
existing contract because it lived one hop from the entry point; the fix
was centralizing, not another document.

**13. An audit/plan/finding arrives from another session → date it, then verify against current main.**
In a multi-agent repo, other sessions' artifacts age fast. Check what commit
it was written against (test counts and line numbers betray staleness), then
re-verify its load-bearing claims before executing any of it.
*Case:* the 24-finding pre-ship audit (2026-07) cited "148/149 tests" — a
tree several merged PRs old. Three of its findings were already fixed and one
half-fixed; executing it blind would have re-done merged work and mislabeled
current behavior. The verified re-plan dropped/downgraded those and kept the
rest, all of which reproduced.

**14. A PR shows MERGED → verify the commits actually reach main before depending on them.**
A stacked PR merged into its base branch AFTER that base merged to main lands
on a dead branch — GitHub still shows MERGED.
`git merge-base --is-ancestor <sha> origin/main` is the ten-second check.
For stacked PRs: merge bases first (GitHub retargets), or delete base
branches on merge.
*Case:* PR #15 (dedup) "merged" but none of it reached main; discovered only
because the cleanup script was missing at run time, recovered by cherry-pick
(PR #20).

## What does not transfer through prose — and what to do instead

Be honest about the limits of this file:

- **Disposition can't be read into existence.** An agent skims docs under
  time pressure. That is why this repo prefers *forcing functions* over
  prose: evals that gate, required handoff fields, ML auto-accept
  thresholds, error tables keyed to exact error strings. When you find a
  new failure mode, reach for a forcing function first and a paragraph
  second.
- **Repos teach by example.** Future agents imitate the local convention
  they see: PR bodies with evidence, commits citing incidents, tests named
  after bugs. Keep the trail exemplary — every sloppy artifact you merge
  teaches the next agent to be sloppy.
- **The owner is the constant.** Agents rotate; the person holding the
  standard doesn't. If an agent's handoff lacks evidence, or a "done" lacks
  a metric, sending it back once teaches more than any document.
