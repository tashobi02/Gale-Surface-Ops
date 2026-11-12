# Package 25 — Planner stop-task library, drafts, publish payload, SCR-04 editor

| | |
| --- | --- |
| **Subtasks** | T32.26, T32.27, T32.28 |
| **Depends on packages** | 09, 12, 13 |
| **Needs from backend** | N-07, N-08 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-036, FD-089, FD-171 ([decisions](decisions.md)) |
| **Spec and mockup** | 01 FR-54; 03 SCR-04, SCR-06; FD-089 |

## Files

- `apps/web/tests/state/stopTaskDraft.test.ts (new)`
- `apps/web/tests/ui/stopTaskEditor.test.ts (new)`
- `apps/web/src/state/stopTaskDraft.ts (new)`
- `apps/web/src/ui/briefing/publishPlan.ts`
- `apps/web/src/ui/plan/StopTaskEditor.tsx (new)`
- `apps/web/src/ui/screens/scr04PlanPanel.tsx`
- `apps/web/src/ui/screens/scr06PoiDetail.tsx (suggested tasks list)`
- `apps/web/src/state/planStore.ts (header TODO removed only)`
- `docs/tasks/TASK-32…, status.md, README.md`

## Steps

1. Tests first (T32.26).
2. stopTaskDraft applies library entries via addStopTask after addWaypoint (FD-089).
3. Editor: 1–4, 60 chars, inline errors, `assumed` authored text; publish sends drafts beside plan.

## Named tests (write first)

- `stopTaskDraft.test.ts`, `stopTaskEditor.test.ts`: one test per T32.26 step

## Automated check replacing manual acceptance

Enable `plan-rules` task cases.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T32.26, T32.27, T32.28 add `done`

## Done criteria

- plan_hash unchanged by task edits (test)
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
