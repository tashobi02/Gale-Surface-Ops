# Package 30 — Usability: automated heuristic run replacing sessions

| | |
| --- | --- |
| **Subtasks** | T15.01, T15.02, T15.03 |
| **Depends on packages** | 28, 29 |
| **Needs from backend** | — (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-156–FD-158 ([decisions](decisions.md)) |
| **Spec and mockup** | 04 §F.1; mockup Usability test script UT-1…UT-9; 01 §B |

## Files

- `docs/ops/usability-script.md`
- `apps/web/e2e/checks/usability.spec.ts (new)`
- `docs/ops/verification-log.md (append)`
- `docs/tasks/TASK-15_usability-test.md`
- `docs/tasks/status.md, README.md`

## Steps

1. Rewrite the script as the automated protocol (FD-156–FD-158): scripted 5-min briefing (ends at SCR-08 OK), UT-1 hud-glance, UT-2 summon ≤ 2 taps + hold with 56 px targets, UT-3 danger crew card visible + approve reachable in ≤ 2 actions, UT-4 grayscale, UT-5/6 geometry+rotation, UT-7 status line not live, UT-8 task row spacing and ≤ 15 s scripted, UT-9 fullmap.
2. Failures become `follow-up:` subtasks via one coord note (T15.03).

## Named tests (write first)

- `usability.spec.ts`: one test per UT row + `briefing in five minutes`

## Automated check replacing manual acceptance

This package is the replacement.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T15.01 wip → done
- T15.02, T15.03 add `done`

## Done criteria

- All UT tests green or each failure filed as follow-up
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
