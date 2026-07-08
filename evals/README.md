# Evals

Quality scorecards, distinct from unit tests: they measure aggregate behavior
and report metrics instead of asserting individual cases.

| Command | What it measures | Needs |
|---|---|---|
| `npm run eval:classifier` | Deterministic pipeline accuracy on the labeled golden set (`fixtures/golden-txns.json`), with per-layer distribution. Gates at `PF_EVAL_MIN_ACCURACY` (default 0.95). | Nothing — pure |
| `npm run eval:ledger` | Data quality of the actual ledger: account attribution %, duplicate groups, uncategorised/review backlog, transfer hygiene, provenance distribution, FY coverage. Report only, never gates. | DB access (keychain, or `PF_DB_PATH` + `PF_DB_PASSPHRASE` for a copy) |

## Conventions

- Golden labels encode **intended** behavior. When the eval disagrees with the
  code, first decide which is wrong; a known code bug keeps its intended label
  so the mismatch stays visible in every run until fixed (this is how the
  since-fixed `insurer-premium` bug — `'emi'` substring-matching "pr**emi**um" —
  was caught and tracked).
- When adding classifier rules, add golden cases for them — including at least
  one *negative* case showing what the rule must NOT capture.
- `docs/GOALS.md` acceptance criteria reference `eval:ledger` metrics; run it
  before and after a goal project to prove movement.
- Keep the eval fixture set free of real personal data: synthetic descriptions
  only, realistic in shape but invented in content.
