# Package 34 — Live fallbacks as degradation paths

| | |
| --- | --- |
| **Subtasks** | T24.12, T25.09, T27.07, T31.09 |
| **Depends on packages** | 18, 19, 20, 26 |
| **Needs from backend** | — (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-193 ([decisions](decisions.md)) |
| **Spec and mockup** | 06 §D.4; FD-193 |

## Files

- `apps/web/src/ui/screens/scr12EvaTablet.tsx (HUD-only branch on map failure)`
- `apps/web/src/ui/ops/ClockControl.tsx (keys already; fallback = keys-only bar)`
- `apps/web/src/ui/screens/scr17PostEvaReport.tsx (log table when /api/report fails)`
- `apps/web/src/ui/ops/AddTaskPopover.tsx (view-only when ADD_STOP_TASK is FORBIDDEN/unsupported)`
- `apps/web/tests/ui/fallbacksLive.test.ts (new)`
- `docs/tasks/TASK-24…, 25…, 27…, 31…, status.md, README.md`

## Steps

1. Each fallback triggers on its real condition and logs which path is active in `?debug=1`.

## Named tests (write first)

- `fallbacksLive.test.ts`: one test per trigger

## Automated check replacing manual acceptance

Harness `print` SCR-17 with /api/report blocked.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T24.12, T25.09, T27.07, T31.09 add `done`

## Done criteria

- Primary paths unchanged
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
