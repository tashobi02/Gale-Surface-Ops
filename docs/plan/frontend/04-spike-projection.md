# Package 04 — Spike page every level, scale-bar check, ADR-003 outcome

| | |
| --- | --- |
| **Subtasks** | T02.03, T02.04, T02.05 |
| **Depends on packages** | 01 |
| **Needs from backend** | N-13 (README text only) (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-097, FD-100–FD-105 ([decisions](decisions.md)) |
| **Spec and mockup** | 02 §B, §C.1, §C.4; C9 v1.1 `docs/contracts/tile-grid.md`; FR-01 |

## Files

- `apps/web/spike/spike.ts`
- `apps/web/spike/index.html`
- `docs/decisions/ADR-003-openlayers-mars-projection.md`
- `docs/ops/verification-log.md (append)`
- `apps/web/tests/fixtures/README.md`
- `docs/tasks/TASK-02_projection-spike.md`
- `docs/tasks/status.md, README.md`

## Steps

1. Run the `tiles-all-levels` check on F4 (T03.36 ships all five levels, FD-104); fix the spike if any level fails.
2. Run `scale-bar`: resolution check on F4; with `E2E_SITE=gale_boxwork` the 2 % crater check from `docs/ops/feasibility/dem-quality.md` (FD-105). If the real bundle is absent, T02.04 stays wip naming T03.19.
3. Write the ADR-003 Outcome section from the check outputs (go: tiled XYZ in the Mars projection); D-03 Accepted.
4. fixtures/README.md: replace C9 `TODO(verify)` with a link to C9 v1.1; mark the radiation/marstime/F6 items as pipeline-owned (N-13, FD-097).

## Named tests (write first)

- Harness `tiles-all-levels`, `scale-bar`

## Automated check replacing manual acceptance

`tiles-all-levels` and `scale-bar` replace the devtools run and the manual 2 % measurement.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T02.03 wip → done
- T02.04 add `done` (evidence: `scale-bar` output in verification-log; requires the real bundle)
- T02.05 add `done` (evidence: ADR-003 Outcome)

## Done criteria

- Both checks green; ADR-003 Outcome written; TASK-02 Spec questions carry Decided lines (FD-100–FD-105)
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
