# Package 10 — Waypoint markers, placement validation, add-stop mode, drag, touch, keyboard move

| | |
| --- | --- |
| **Subtasks** | T08.06, T08.07, T08.08, T08.09, T08.10 |
| **Depends on packages** | 09 |
| **Needs from backend** | N-14 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-001, FD-112, FD-116, FD-117, FD-119 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-02 Inputs/validation, §C.3; 04 Appendix A §C.5 (selection vs focus), §D; prototype `#scr-02-add-stop-mode` |

## Files

- `apps/web/src/ui/map/waypointLayer.ts`
- `apps/web/src/ui/map/waypointLayer.css (new, FD-116)`
- `apps/web/src/ui/map/addStopMode.ts`
- `apps/web/src/ui/map/waypointDrag.ts`
- `apps/web/src/ui/map/touchInput.ts`
- `apps/web/src/ui/map/keyboardMove.ts (new, T08.10 path)`
- `apps/web/src/ui/map/keyboard.ts (delegate A/Enter, FD-117)`
- `apps/web/tests/ui/waypoints.test.ts (new)`
- `apps/web/tests/ui/keyboardMove.test.ts (new)`
- `docs/tasks/TASK-08…, status.md, README.md`

## Steps

1. Placement: inside AOI, passable or snap offer ≤ 50 m via SAMPLE_POINT with the hard limit (FD-112); free and POI placement (FD-001).
2. Add-stop mode: `A`, crosshair `Enter` (FD-117); desktop drag of markers and list rows; tablet long-press and drag.
3. Keyboard move (T08.10, FD-119): with a selected stop, arrows nudge one grid cell, 'Move to crosshair'; each move validated like a drop.

## Named tests (write first)

- `waypoints.test.ts`: `outside AOI refused`, `snap offered within 50 m`, `A toggles add-stop`, `drag drop validates`, `long-press places`
- `keyboardMove.test.ts`: `arrow nudges selected stop one cell`, `move to crosshair validates`

## Automated check replacing manual acceptance

Enable `plan-rules` placement cases; `keyboard-path` step 'move stop 2'.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T08.06, T08.07, T08.08, T08.09, T08.10 add `done` (T08.10 as the keyboard path, FD-119)

## Done criteria

- 01 §E step 5 doable by mouse, touch and keyboard
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
