# Package 33 — Planner fallbacks as degradation paths

| | |
| --- | --- |
| **Subtasks** | T02.06, T07.16, T09.08, T11.06 |
| **Depends on packages** | 08, 11, 14 |
| **Needs from backend** | N-25 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-101, FD-125, FD-137, FD-193 ([decisions](decisions.md)) |
| **Spec and mockup** | 06 §D.4; FD-101, FD-125, FD-137, FD-193 |

## Files

- `apps/web/src/ui/map/imageStatic.ts (new)`
- `apps/web/src/ui/map/rasterLayers.ts (fallback branch)`
- `apps/web/src/ui/map/drawLegs.ts (new)`
- `apps/web/src/ui/briefing/mapSnapshot.ts (fallback branch)`
- `apps/web/tests/ui/imageStatic.test.ts (new)`
- `apps/web/tests/ui/drawLegs.test.ts (new)`
- `apps/web/tests/ui/mapSnapshot.test.ts`
- `docs/tasks/TASK-02…, TASK-07…, TASK-09…, TASK-11…, status.md, README.md`

## Steps

1. ImageStatic factory in the Mars projection; raster layers fall back when tile loads fail (FD-101).
2. drawLegs behind `?draw_legs=1` and on worker NO_ROUTE-all; crosshair Enter keyboard path (FD-125); needs N-25.
3. Snapshot fallback: thumbnail + SVG route when canvas export throws (FD-137).

## Named tests (write first)

- `imageStatic.test.ts`: `tile failure switches to image`
- `drawLegs.test.ts`: `keyboard places leg points`
- `mapSnapshot.test.ts`: `canvas failure uses thumbnail`

## Automated check replacing manual acceptance

Harness `offline` + `print` re-run with forced failures.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T02.06, T07.16, T09.08, T11.06 add `done`

## Done criteria

- Primary paths unchanged (existing tests green)
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
