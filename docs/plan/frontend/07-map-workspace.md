# Package 07 — SCR-02 workspace layout, map mount, keyboard and debug overlay

| | |
| --- | --- |
| **Subtasks** | T07.06, T07.08, T07.13, T13.06 |
| **Depends on packages** | 06 |
| **Needs from backend** | — (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-063, FD-080, FD-118, FD-202 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-02; 04 §E.3, §F, Appendix A §B, §F (SCR-02 wireframe); prototype `#scr-02-idle`, `#scr-02-loading-tiles`, `src/js/g_planner.js`, `d_map.js` |

## Files

- `apps/web/src/ui/screens/scr02MapWorkspace.tsx`
- `apps/web/src/ui/screens/scr02MapWorkspace.css (new)`
- `apps/web/src/ui/map/createMap.ts`
- `apps/web/src/ui/map/keyboard.ts`
- `apps/web/src/ui/debug.ts`
- `apps/web/src/ui/context.ts (C10 v3: fitExtent options, FD-063)`
- `apps/web/tests/ui/mapWorkspace.test.ts (new)`
- `apps/web/tests/ui/createMap.test.ts`
- `apps/web/tests/ui/keyboard.test.ts`
- `docs/tasks/TASK-07…, TASK-13…`
- `docs/tasks/status.md, README.md`

## Steps

1. Layout: top bar (logo → SCR-01, data-version chip, Briefing, Sources), left drawer (Layers), right drawer (Plan/POI/Conditions), bottom results panel 220/180 px, toolbar; ≥ 1280 three columns, 1024–1279 one drawer (04 §F); root `data-surface="planner"`.
2. Mount createMap with scale bar, north arrow, readout (`derived`, `proj:IAU_2015:49900`, FD-080), MapControls (T07.17), keyboard layer (B, ?, arrows, +/−, Delete), DebugOverlay with `?debug=1`.
3. Call every map module attach function; hide a toolbar control whose module is not ready (FD-118).
4. C10 v3: `fitExtent(extent, {animate})` (FD-063).

## Named tests (write first)

- `mapWorkspace.test.ts`: `three columns at 1280`, `one drawer at 1024`, `B opens briefing`, `? opens sources`, `debug overlay only with debug=1`, `readout is derived with projection source`

## Automated check replacing manual acceptance

Enable `offline`, `axe`, `targets` (planner) and `provenance` on `#/planner`.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T07.06 wip → done
- T07.08 add `done`
- T07.13 wip → done
- T13.06 wip → done

## Done criteria

- `#/planner` renders the real map on F4 with no placeholder
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
