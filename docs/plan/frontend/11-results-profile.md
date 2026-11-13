# Package 11 — Route layer, profile chart, SCR-05, warnings, linking, haven/comm bands

| | |
| --- | --- |
| **Subtasks** | T09.01, T09.02, T09.03, T09.04, T09.05, T09.09 |
| **Depends on packages** | 05, 07, 10 |
| **Needs from backend** | N-28 (soft for T09.09) (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-056–FD-058, FD-062–FD-064, FD-070, FD-082, FD-120–FD-123, FD-205 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-05; 04 §C.1, §C.5, §D, Appendix A §F SCR-05; FR-07–FR-12, FR-39, FR-42; prototype `#scr-05-ok`, `#scr-05-partial`, `#scr-05-over-limits`, `#scr-05-error` |

## Files

- `apps/web/src/ui/map/routeLayer.ts`
- `apps/web/src/ui/map/routeGeometry.ts`
- `apps/web/src/ui/results/profileChart.ts`
- `apps/web/src/ui/results/profileLink.ts`
- `apps/web/src/ui/results/warningsList.ts`
- `apps/web/src/ui/screens/scr05RouteResults.tsx`
- `apps/web/src/ui/screens/scr05RouteResults.css`
- `apps/web/tests/ui/profileChart.test.ts (new)`
- `apps/web/tests/ui/profileLink.test.ts (new)`
- `apps/web/tests/ui/scr05RouteResults.test.ts`
- `apps/web/tests/ui/warningsList.test.ts`
- `docs/tasks/TASK-09…, status.md, README.md`

## Steps

1. Hazard hatch from patterns.ts (FD-070); NO_ROUTE dashed `unknown` (FD-122); along-leg interpolation (FD-082).
2. Profile chart in SVG (no library), slope-class patterns, stop markers, total climb/descent.
3. SCR-05: seven metrics (FD-056), layout FD-057, provenance per FD-123, empty copy FD-121, dose '—' when absent (FD-120).
4. Warnings: order FD-062, source FD-064, instant zoom under reduced motion (FD-063); profile ↔ map hover via PlanHoverPosition.
5. T09.09: haven and comm bands under the profile from N-28; '—' band with reason when absent.

## Named tests (write first)

- `profileChart.test.ts`: `patterns per slope class`, `stop markers at cumulative distance`
- `profileLink.test.ts`: `hover sets map marker`
- `warningsList.test.ts`: `severity then position order`

## Automated check replacing manual acceptance

Enable `results-states`.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T09.01, T09.03, T09.04 wip → done
- T09.02, T09.05, T09.09 add `done` (T09.09 wip if N-28 missing)

## Done criteria

- No 'Profile unavailable' placeholder on main; checks green
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
