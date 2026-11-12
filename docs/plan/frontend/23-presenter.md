# Package 23 — SCR-19 presenter panel

| | |
| --- | --- |
| **Subtasks** | T32.19, T32.20 |
| **Depends on packages** | 19 (ClockControl), 22 for routing |
| **Needs from backend** | N-18, N-05, N-16 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-034, FD-035, FD-219 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-19; 01 FR-51, FR-52; 04 §A.3; FD-219 (no mockup frame) |

## Files

- `apps/web/tests/ui/presenter.test.ts (new)`
- `apps/web/src/ui/screens/scr19Presenter.tsx (new)`
- `apps/web/src/ui/screens/scr19Presenter.css (new)`
- `docs/tasks/TASK-32…, status.md, README.md`

## Steps

1. Tests first: the seven T32.19 steps.
2. Panel per FD-219: session strip, Next stop (labelled target stop), Start storm, clock, Reset with confirm, last results, QR; pending until COMMAND_RESULT; BUSY shown (FD-035).

## Named tests (write first)

- `presenter.test.ts`: one test per T32.19 step

## Automated check replacing manual acceptance

Enable `brand-orange`, `axe` on `#/presenter`.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T32.19, T32.20 add `done`

## Done criteria

- No status colour class on any presenter control
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
