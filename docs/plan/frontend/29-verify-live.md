# Package 29 — Automated verification of the live subtasks

| | |
| --- | --- |
| **Subtasks** | T24.11, T25.08, T27.06, T31.08 |
| **Depends on packages** | 17–27 |
| **Needs from backend** | N-10, N-19, N-21, N-27 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-190, FD-197 ([decisions](decisions.md)) |
| **Spec and mockup** | TASK-24, 25, 27, 31 Acceptance |

## Files

- `apps/web/e2e/checks/*.spec.ts (remove fixme only)`
- `docs/ops/verification-log.md (append)`
- `docs/tasks/status.md, README.md`

## Steps

1. Enable `ops-no-terminal`, `task-latency`, `replay`, `print` SCR-17, `targets`, `hud-glance`, `link-lost` on the device projects (FD-197); log results.

## Named tests (write first)

- The harness checks

## Automated check replacing manual acceptance

This package is the replacement (FD-190).

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T24.11, T25.08, T27.06, T31.08 add `done`

## Done criteria

- Zero `fixme` among live checks
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
