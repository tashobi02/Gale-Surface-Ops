# Package 08 — Raster, traverse, POI and EZ layers; SCR-03 layers panel; point inspector

| | |
| --- | --- |
| **Subtasks** | T07.07, T07.09, T07.10, T07.11, T07.12, T07.18 |
| **Depends on packages** | 07 |
| **Needs from backend** | — (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-003, FD-019, FD-040, FD-065, FD-074–FD-077, FD-079, FD-107, FD-111 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-03, SCR-06 entry; 04 §C.1 map overlays, §C.5, §D two-overlay rule, §E.10; FR-02, FR-17, FR-45; prototype `#scr-03-default`, `#scr-03-unavailable`, `#scr-03-out-of-range` |

## Files

- `apps/web/src/ui/map/rasterLayers.ts`
- `apps/web/src/ui/map/traverseLayer.ts`
- `apps/web/src/ui/map/poiLayer.ts`
- `apps/web/src/ui/map/ezLayer.ts (new)`
- `apps/web/src/ui/map/inspector.ts`
- `apps/web/src/ui/map/tokenColors.ts`
- `apps/web/src/ui/screens/scr03LayersPanel.tsx`
- `apps/web/src/ui/screens/scr03LayersPanel.css (new)`
- `apps/web/src/ui/context.ts (LAYER_Z_INDEX comment, FD-040)`
- `apps/web/tests/ui/layersPanel.test.ts (new)`
- `apps/web/tests/ui/ezLayer.test.ts (new)`
- `apps/web/tests/ui/rasterLayers.test.ts`
- `docs/tasks/TASK-07…, status.md, README.md`

## Steps

1. Slope colours follow the scenario's caution/hard limits (FD-076); grayscale ortho in OPS (FD-003); validate tokens at creation (FD-065); 2D canvas only (FD-107).
2. SCR-03 rows: toggle, name, opacity, legend, native resolution, provenance chip, info link `#/sources#layer-<id>`; states Default/Loading/Unavailable/Out of range; two scientific overlays max, the FD-111 set, third turns off the oldest and says so.
3. POI selection = `selected_poi_id` UI state (FD-074) opening the SCR-06 drawer; EZ layer draws `stop_type` (T07.18, FR-45) with shape + word.
4. Inspector: position takes the elevation layer's class (FD-079).

## Named tests (write first)

- `layersPanel.test.ts`: `third overlay turns off the oldest and says so`, `unavailable row disabled with reason`, `info link anchors`
- `ezLayer.test.ts`: `stop types carry shape and word`
- `rasterLayers.test.ts`: `slope classes follow scenario limits`

## Automated check replacing manual acceptance

Enable `toggles` (≤ 300 ms part) and `contrast` on rendered tiles (FD-019).

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T07.07, T07.10, T07.11, T07.12 wip → done
- T07.09, T07.18 add `done`

## Done criteria

- No TODO markers left in the six map modules
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
