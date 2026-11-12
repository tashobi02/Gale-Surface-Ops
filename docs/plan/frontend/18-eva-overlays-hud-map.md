# Package 18 — SCR-14 options, SCR-18 link lost, SCR-13 HUD, full-screen map

| | |
| --- | --- |
| **Subtasks** | T24.06, T24.07, T24.08, T24.09, T24.10 |
| **Depends on packages** | 17 |
| **Needs from backend** | N-19, N-03 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-008, FD-027, FD-030, FD-033, FD-049, FD-050, FD-081, FD-088, FD-200, FD-209 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-13, SCR-14, SCR-18; 04 §E.5 full map, §E.6, §E.7; mockup SCR-14 orientation, DV-13; prototype `#scr-13-*`, `#scr-14-*-landscape`, `#scr-18-*` |

## Files

- `apps/web/src/ui/screens/scr14Options.tsx`
- `apps/web/src/ui/screens/scr18HabLinkLost.tsx`
- `apps/web/src/ui/screens/scr13Hud.tsx`
- `apps/web/src/ui/live/HudRoute.tsx`
- `apps/web/src/ui/map/FullScreenMap.tsx`
- `apps/web/src/ui/map/MapControls.tsx`
- `apps/web/src/net/habClient.ts (resend verified only; no behaviour change unless the check fails)`
- `apps/web/tests/ui/eva.test.ts`
- `apps/web/tests/ui/map/fullScreenMap.test.ts`
- `apps/web/tests/ui/hud.test.ts (new)`
- `docs/tasks/TASK-24…, status.md, README.md`

## Steps

1. SCR-14: auto-open on warning (FD-081), stops_dropped `derived` (FD-049), EVA read-only cards for ops-approval kinds (FD-050, FD-008), landscape right panel (FD-010).
2. SCR-18: real reconnect counter, ages from N-03, queued command state.
3. HUD: five values, sub-labels (FD-209), sentence-case alerts (FD-200), 2-s hold exit, no task count (FD-027), contrast from package 03.
4. Full map: real OL map, six controls, layers FD-030, 40/48 px cards (FD-033), warning closes it; remove MapControls `it.todo`.

## Named tests (write first)

- `hud.test.ts`: `two-second hold exits`, `release cancels`, `at most five values`
- `fullScreenMap.test.ts`: the three former `it.todo`

## Automated check replacing manual acceptance

Enable `hud-glance`, `contrast` (HUD), `fullmap`, `queued-resend`, `link-lost`.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T24.06, T24.07, T24.08, T24.09, T24.10 wip → done

## Done criteria

- No `it.todo` in eva/fullScreenMap tests
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
