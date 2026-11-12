# Package 17 — SCR-12 EVA tablet: view model, landscape layout, mini-map, actions, stop tasks

| | |
| --- | --- |
| **Subtasks** | T24.02, T24.03, T24.04, T24.05, T31.05, T31.07 |
| **Depends on packages** | 03, 07 |
| **Needs from backend** | N-02, N-03, N-04, N-08 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-010, FD-011, FD-016, FD-017, FD-021, FD-022, FD-024–FD-026, FD-028, FD-029, FD-032, FD-044–FD-048, FD-059, FD-060, FD-096, FD-172, FD-176, FD-203, FD-211, FD-212 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-12; 04 §E.5 (+ package 02 landscape text), §D.2, §D.3, §D.5, §F; mockup EVA orientation spec, Interaction specs; prototype `#scr-12-*-landscape` and `-portrait`, `src/js/f_eva.js`, `o_tasks.js` |

## Files

- `apps/web/src/ui/eva/viewModel.ts`
- `apps/web/src/ui/eva/HoldToConfirm.tsx`
- `apps/web/src/ui/screens/scr12EvaTablet.tsx`
- `apps/web/src/ui/screens/scr12EvaTablet.css (new)`
- `apps/web/src/ui/screens/scr12/StopTaskList.tsx`
- `apps/web/src/ui/screens/scr12/TasksButton.tsx`
- `apps/web/src/ui/screens/scr12/useStopTaskChanges.ts`
- `apps/web/src/ui/eva/MiniMap.tsx (new)`
- `apps/web/src/ui/live/EvaRoute.tsx`
- `apps/web/tests/ui/evaViewModel.test.ts`
- `apps/web/tests/ui/eva.test.ts`
- `apps/web/tests/ui/stopTasks.test.ts`
- `docs/tasks/TASK-24…, TASK-31…, status.md, README.md`

## Steps

1. View model reads N-02/N-03/N-04 (FD-044–FD-048, FD-172); dose mGy one decimal (FD-016).
2. Layout: portrait per 04 §E.5, landscape v2 default (FD-010); status line in idle slot (FD-022); real MiniMap (createMap, route, me, buddy, shadow, vehicle).
3. Actions: SUMMON, ABORT hold-to-confirm, TASK ROVER (opens SCR-15), HUD, CONTRAST with HC outlined bars (FD-011, FD-017), TAP CONFIRM setting (FD-176); EVA ACK wired.
4. Stop tasks: placement FD-024, collapse FD-032, skip/reason FD-028, NOT SYNCED pill (FD-211), walking count (FD-212), DROPPED read-only (FD-029), typed undo (FD-059).

## Named tests (write first)

- `eva.test.ts`: `fixed geography all states`, `contrast toggle switches palette`, `ack sends ACK_ALERT`, `tap confirm fallback`
- `stopTasks.test.ts`: `collapsed during unacknowledged warning`, `read-only after ack`, `phone landscape list in map column`
- `evaViewModel.test.ts`: `age from last-linked sim time`, `navigation from crew record`

## Automated check replacing manual acceptance

Enable `eva-geometry`, `rotation`, `targets` (EVA), `viewport360` (EVA), `axe` on EVA states.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T24.02, T24.03, T24.04, T24.05, T31.05, T31.07 wip → done (stay wip naming N-nn if a hard need is missing)

## Done criteria

- No mini-map placeholder; no TODO markers in the listed files
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
