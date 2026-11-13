# Package 21 — Ops map layers, SCR-15 rover tasking, rover queue

| | |
| --- | --- |
| **Subtasks** | T25.02, T29.04, T29.05 |
| **Depends on packages** | 19, 17 |
| **Needs from backend** | N-09, N-11, N-12, N-28 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-051, FD-052, FD-071, FD-072, FD-084, FD-168 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-11 map, SCR-15; 04 §C.1 overlays; FR-39, FR-41, FR-42; prototype `#scr-15-choosing`…`#scr-15-failed` |

## Files

- `apps/web/src/ui/map/opsLayers.ts`
- `apps/web/src/ui/screens/scr15RoverTask.tsx`
- `apps/web/src/ui/ops/RoverQueue.tsx`
- `apps/web/src/ui/screens/scr11OpsConsole.tsx (map column, vehicle card)`
- `apps/web/src/ui/screens/scr12EvaTablet.tsx (TASK ROVER entry only)`
- `apps/web/tests/ui/map/opsLayers.test.ts`
- `apps/web/tests/ui/roverTask.test.ts`
- `apps/web/tests/ui/roverQueue.test.ts`
- `docs/tasks/TASK-25…, TASK-29…, status.md, README.md`

## Steps

1. Mount opsLayers on the SCR-11 map column: crew, vehicles, coverage, haven bands (N-28), caution hatch (FD-072), relay coverage (FD-071).
2. SCR-15 entries from SCR-12 and the vehicle card; target picked on map; '—' preview (FD-051); CARRY item (FD-052); event kind FD-168.
3. RoverQueue in the vehicle card; queue per FD-084.

## Named tests (write first)

- `roverTask.test.ts`: `entry from vehicle card`, `queued only on ok`
- `opsLayers.test.ts`: `relay coverage row says not computed without grid`

## Automated check replacing manual acceptance

Enable `ops-no-terminal` rover step (if N-09 live).

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T25.02, T29.04, T29.05 wip → done

## Done criteria

- Map column has no placeholder
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
