# Package 06 — App shell, site loading, worker mock switch, SCR-00 boot error

| | |
| --- | --- |
| **Subtasks** | T07.02, T07.03, T07.04, T14.04 |
| **Depends on packages** | 05 |
| **Needs from backend** | — (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-086, FD-091, FD-108, FD-173, FD-174, FD-207 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 §A, SCR-00, §D; 02 §E.1; prototype `#scr-00-single`, `src/js/h_misc.js` |

## Files

- `apps/web/src/boot/loadSite.ts`
- `apps/web/src/boot/bootPlanner.ts`
- `apps/web/src/ui/workerClient.ts`
- `apps/web/src/ui/live/PlannerHost.tsx`
- `apps/web/src/ui/live/placeholders.tsx`
- `apps/web/src/ui/screens/scr00BootError.tsx`
- `apps/web/src/ui/screens/scr00BootError.css (new)`
- `apps/web/src/worker/planWorker.ts (header note only, FD-091)`
- `apps/web/tests/boot/loadSite.test.ts`
- `apps/web/tests/ui/workerClient.test.ts`
- `apps/web/tests/ui/bootError.test.ts (new)`
- `docs/tasks/TASK-07_app-shell-and-map-workspace.md, TASK-14 (T14.04 row note)`
- `docs/tasks/status.md, README.md`

## Steps

1. Default site `gale_boxwork`, `?site=mock_site` allowlisted; missing manifest → SCR-00 naming the path (FD-086).
2. `?mock_worker=1` wires the F3 mock worker (FD-174); align T07.04 step 5 text with per-request TIMEOUT (FD-173).
3. SCR-00 (T14.04): OPS mode (FD-207), plain-language cause, missing asset, Retry, README link; PlannerHost's BootFailure uses it.
4. Remove the 'plan store: T08.03' placeholder branch from PlannerHost.

## Named tests (write first)

- `bootError.test.ts`: `names the missing file`, `retry re-runs boot`, `renders in OPS mode`
- `loadSite.test.ts`: `default site is gale_boxwork`
- `workerClient.test.ts`: `mock_worker switch uses the F3 mock`

## Automated check replacing manual acceptance

Enable `offline` for `#/planner?site=mock_site` and SCR-00 (delete a manifest copy in a temp site); `axe` on SCR-00.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T07.02 wip → done
- T07.03 wip → done (planner screens mount; remaining placeholders are named packages)
- T07.04 wip → done
- T14.04 add `done` (integration lane; note T14.05 fault tests remain integration's)

## Done criteria

- No 'not built' placeholder for SCR-00; checks green
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
