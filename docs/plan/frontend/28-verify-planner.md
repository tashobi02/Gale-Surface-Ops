# Package 28 — Automated verification of the planner subtasks

| | |
| --- | --- |
| **Subtasks** | T07.15, T08.11, T09.06, T09.07, T10.03, T11.05, T12.06, T13.09, T13.10 |
| **Depends on packages** | 03–16 |
| **Needs from backend** | N-20, N-26 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-190 ([decisions](decisions.md)) |
| **Spec and mockup** | Each TASK file's Acceptance for the listed subtask |

## Files

- `apps/web/e2e/checks/*.spec.ts (remove fixme only)`
- docs/decisions/ADR-004-least-time-routing.md (outcome from `walking-skeleton`)
- `docs/ops/verification-log.md (append)`
- `docs/tasks/status.md, README.md`

## Steps

1. Enable `toggles`, `plan-rules`, `results-states`, `walking-skeleton`, `poi-conditions`, `print`, `plan-hash`, `provenance`, `axe`, `keyboard-path`; fix product bugs they find in a follow-up commit per owning package's files.
2. Run on F4 and `E2E_SITE=gale_boxwork`; append one verification-log entry per subtask with the JSON result path and commit.

## Named tests (write first)

- The harness checks themselves

## Automated check replacing manual acceptance

This package is the replacement (FD-190).

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T07.15, T08.11, T09.06, T09.07, T10.03, T11.05, T12.06, T13.09, T13.10 add `done` (each only when its check is green on the real site; else `wip` naming N-20/N-26)

## Done criteria

- Zero `fixme` among planner checks
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
