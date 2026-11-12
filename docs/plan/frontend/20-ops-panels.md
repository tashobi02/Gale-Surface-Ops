# Package 20 — Ops options approval, event log strip and drawer, task progress, Earth link widget

| | |
| --- | --- |
| **Subtasks** | T25.04, T27.04, T31.06, T26.05 |
| **Depends on packages** | 19 |
| **Needs from backend** | N-08, N-19, N-23 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-023, FD-031, FD-054, FD-055, FD-092, FD-095, FD-214 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-11 (event log placement 11 Nov), SCR-14; 04 §E.4; FR-43, FR-44, FR-46, FR-50; prototype `#scr-11-alerting`, `#scr-14-ops-approval-pending-landscape` |

## Files

- `apps/web/src/ui/ops/OptionsPanel.tsx`
- `apps/web/src/ui/ops/EventLog.tsx`
- `apps/web/src/ui/ops/TaskProgress.tsx`
- `apps/web/src/ui/ops/AddTaskPopover.tsx`
- `apps/web/src/ui/ops/EarthLinkWidget.tsx (new)`
- `apps/web/src/ui/screens/scr11OpsConsole.tsx`
- `apps/web/tests/ui/eventLog.test.ts`
- `apps/web/tests/ui/earthLink.test.ts (new)`
- `apps/web/tests/ui/ops.test.ts`
- `docs/tasks/TASK-25…, TASK-27…, TASK-31…, TASK-26 (T26.05 row note), status.md, README.md`

## Steps

1. Options panel: crew from alert (FD-055), APPROVE_OPTION held, preview on map.
2. Event log: bottom strip + drawer, Escape returns focus (FD-092).
3. Tasks: typed args (FD-054), disabled during latched warning (FD-023), max four (FD-031), total FD-214.
4. EarthLinkWidget (T26.05, frontend takes it): light time, next pass, queue, state, provenance per value.

## Named tests (write first)

- `eventLog.test.ts`: `strip opens drawer`, `escape returns focus`
- `earthLink.test.ts`: `values labelled`, `conjunction state`
- `ops.test.ts`: `add task disabled while warning latched`

## Automated check replacing manual acceptance

Enable `ops-no-terminal` approve step.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T25.04, T27.04, T31.06 wip → done
- T26.05 add `done` (note in TASK-26 that frontend built it)

## Done criteria

- Event log visible on SCR-11
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
