# Task plans — index

| | |
| --- | --- |
| **Owner** | Delivery — the coordination map owns ids, paths and dependencies |
| **Date** | 2026-11-03 |
| **Status** | Plan complete: 19 task files, 191 subtasks, `scripts/check_tasks.py` clean |
| **Related** | [Coordination map](_coordination.md) · [06 Implementation plan](../specs/06_High_Level_Implementation_Plan.md) · [Docs index](../README.md) |

The 19 work packages of [06 §C](../specs/06_High_Level_Implementation_Plan.md#c-work-packages), split into subtasks of 0.5–3 h that people and agents can take in parallel. Read [`_coordination.md`](_coordination.md) first: it fixes subtask ids, path owners, contracts, fixtures, the dependency graph and the branch and PR rules. Each task file below expands its subtasks with steps, acceptance criteria, a verify command and an agent brief.

## Tasks

| Task | Title | Lanes | Milestones | Windows | Subtasks | Estimate (h) |
| --- | --- | --- | --- | --- | --- | --- |
| TASK-00 | [Resolve rules + register](TASK-00_resolve-rules-and-register.md) | story, integration | M0–M2 | pre-event-allowed | 6 | 3–4 |
| TASK-01 | [Feasibility: AOI, DEM quality, coverage checks](TASK-01_feasibility.md) | data | M0 | pre-event-allowed | 6 | 8–13 |
| TASK-02 | [Spike: OpenLayers custom Mars projection + custom tile grid](TASK-02_projection-spike.md) | frontend | M0–M1 | pre-event-allowed, pre-event-if-permitted | 6 | 5–7 |
| TASK-03 | [Preprocessing pipeline](TASK-03_preprocessing-pipeline.md) | data | M0–M2 | pre-event-allowed | 27 | 41.5–63 |
| TASK-04 | [Vectors, POIs and images](TASK-04_vectors-pois-images.md) | data, story | M1 | pre-event-allowed | 9 | 12–20 |
| TASK-05 | [Compute core: grid loader, sampling, A*, profile, time model, walkback, warnings](TASK-05_compute-core.md) | compute | M0–M4 | pre-event-allowed, pre-event-if-permitted | 32 | 39–58.5 |
| TASK-06 | [Mars24 solar functions + radiation estimate](TASK-06_mars24-and-radiation.md) | compute | M0–M4 | pre-event-allowed, event-only | 11 | 12–20 |
| TASK-07 | [App shell + map workspace + layers panel + inspector](TASK-07_app-shell-and-map-workspace.md) | frontend, story | M2–M4 | pre-event-allowed, event-only | 16 | 23.5–35 |
| TASK-08 | [Plan panel + waypoint editing](TASK-08_plan-panel-and-waypoints.md) | frontend | M2–M4 | pre-event-allowed, event-only | 11 | 17.5–26.5 |
| TASK-09 | [Results panel + profile](TASK-09_results-panel-and-profile.md) | frontend, integration | M3–M4 | event-only | 8 | 11.5–18 |
| TASK-10 | [POI detail + Conditions panel](TASK-10_poi-detail-and-conditions.md) | frontend | M4 | event-only | 3 | 3.5–6 |
| TASK-11 | [Briefing card + JSON export](TASK-11_briefing-card-and-export.md) | frontend, design | M4 | event-only | 6 | 8.5–11 |
| TASK-12 | [Sources & Methods + provenance attributes](TASK-12_sources-methods-provenance.md) | story | M1–M5 | pre-event-allowed, event-only | 6 | 8–12.5 |
| TASK-13 | [Visual system + accessibility](TASK-13_visual-system-accessibility.md) | design | M2–M5 | pre-event-allowed, event-only | 11 | 13–20.5 |
| TASK-14 | [Integration + offline hardening + fault tests](TASK-14_integration-offline-hardening.md) | integration | M2–M5 | pre-event-allowed, event-only | 11 | 13.5–22 |
| TASK-15 | [Usability test](TASK-15_usability-test.md) | design | M2–M5 | pre-event-allowed, event-only | 3 | 3–4.5 |
| TASK-16 | [Submission package](TASK-16_submission-package.md) | story, integration | M2–M6 | pre-event-allowed, event-only | 7 | 7–12.5 |
| TASK-17 | [Videos](TASK-17_videos.md) | story | M2–M6 | pre-event-allowed, event-only | 4 | 5–9 |
| TASK-18 | [Desirables (only after freeze criteria met early)](TASK-18_desirables.md) | data, frontend, compute | M1–M6 | pre-event-allowed, event-only | 8 | 9.5–14.5 |

Estimates are the sums of the subtasks' low and high estimates, computed by `scripts/check_tasks.py --summary`; they include fallbacks and desirables that may never run.

## Hours per lane and window

| Lane | pre-event-allowed | pre-event-if-permitted | event-only | fallback | desirable | All |
| --- | --- | --- | --- | --- | --- | --- |
| data | 46–72 | — | — | 11.5–17 | 5–8 | 62.5–97 |
| compute | 6–9.5 | 32–48.5 | 7.5–12.5 | 5.5–8 | 1–1.5 | 52–80 |
| frontend | 5–6.5 | 2.5–3.5 | 50.5–77.5 | 6.5–10 | 3.5–5 | 68–102.5 |
| design | 5–7 | — | 14.5–22 | — | — | 19.5–29 |
| story | 14.5–24 | — | 10–16.5 | 1.5–2.5 | — | 26–43 |
| integration | 5–7.5 | — | 11–18.5 | — | — | 16–26 |
| all | 81.5–126.5 | 34.5–52 | 93.5–147 | 25–37.5 | 9.5–14.5 | 244–377.5 |

**Capacity.** 06 §A assumes ≈ 96–120 person-hours at the event for a team of 6 (*Assumed*; the earlier team-of-4 figure was ≈ 70). Under Track S, the work left for the event (`pre-event-if-permitted` plus `event-only`, without fallbacks and desirables) is 128–199 h; 110–170.5 h of it is `agent-ready` and 18–28.5 h `human-required`. Under Track P, 93.5–147 h remains for the event. Either way the plan only fits if agents carry most of the agent-ready work and the cut list ([map §h.6](_coordination.md#h6-cut-list--subtasks-06-d4)) is applied from the top when behind.

## Start here

Subtasks with no hard dependency, by lane (fallbacks excluded). Soft dependencies still need their contract or fixture merged, and every `test` or `implement` subtask waits for the phase gate (T00.03, [map §a.2](_coordination.md#a2-field-vocabulary)).

- data: T01.01, T01.02, T03.01, T03.02, T03.03, T03.04, T03.05, T03.06, T03.12, T03.15
- compute: T05.01, T05.02, T05.03, T05.04, T05.05, T05.06, T05.07, T05.08, T05.09, T05.10, T05.11, T05.12, T05.13, T05.14, T05.15, T06.01, T06.03, T06.04, T06.05, T06.10
- frontend: T02.01, T02.02, T07.01, T07.02, T07.04, T08.01, T09.01, T09.03, T09.04, T10.01, T10.02
- design: T13.01, T13.02, T13.03, T13.05, T13.06, T13.08, T13.11, T15.01
- story: T00.01, T00.02, T00.06, T12.01, T12.05, T16.01, T16.07, T17.01
- integration: T14.01, T14.02

First wave, startable today (no dependency at all, `pre-event-allowed`, not `test` or `implement`):

- data: T01.01, T01.02, T03.01
- frontend: T02.01
- design: T13.01, T13.03, T15.01
- story: T00.01, T00.02, T00.06, T16.01, T16.07, T17.01
- integration: T14.01, T14.02

## How to claim a subtask

1. Pick an unclaimed row in the claims table below whose dependencies have merged.
2. Open a one-line PR that writes your name or agent id into its *Claimed by* cell, and only that cell. Merge it before you start.
3. Work on branch `<id>-<slug>` (e.g. `t05.18-astar-core`) in your own worktree, following [map §h](_coordination.md#h-working-conventions).
4. Clear the cell if you stop. If the team moves to GitHub issues, the issue title starts with the subtask id and replaces the cell.

## Checking the plan

```sh
python3 scripts/check_tasks.py              # every rule; exit 1 on a problem
python3 scripts/check_tasks.py --summary    # tables above, start-here list, cross-task edges
python3 scripts/check_tasks.py --file docs/tasks/TASK-05_compute-core.md   # one file
```

## Claims

| ID | Subtask | Lane | Window | M | Claimed by |
| --- | --- | --- | --- | --- | --- |
| T00.01 | Check the Space Apps rules page and Participants Guide for the pre-event code rule | story | pre-event-allowed | M0 | |
| T00.02 | Ask the Dhaka Local Lead; confirm every member is registered (NASA site + Bangladesh form) | story | pre-event-allowed | M0 | |
| T00.03 | Record the answer, registration status and Track S or P in `docs/ops/rules.md` | story | pre-event-allowed | M0 | |
| T00.04 | Update the phase-gate line in `CLAUDE.md` and `AGENTS.md` for the recorded track | integration | pre-event-allowed | M0 | |
| T00.05 | Fallback — start only if no answer by 4 Nov (U-12 due date): declare Track S | story | pre-event-allowed | M0 | |
| T00.06 | Record team roster and skills (U-13) and venue type (U-14) | story | pre-event-allowed | M0–M2 | |
| T01.01 | Download the 1 m Gale DEM; record its PDS3 label datum and no-data value | data | pre-event-allowed | M0 | |
| T01.02 | Propose AOI bounds from Curiosity's 2025 traverse, inside the DEM extent | data | pre-event-allowed | M0 | |
| T01.03 | Judge DEM quality in the AOI from a hillshade; measure one reference feature | data | pre-event-allowed | M0 | |
| T01.04 | Check THEMIS TI tile, colour HiRISE COG and CRISM coverage of the AOI by window reads | data | pre-event-allowed | M0 | |
| T01.05 | Decide D-01; write the feasibility summary and ADR-001 | data | pre-event-allowed | M0 | |
| T01.06 | Fallback — start only if T01.05 finds the AOI DEM is not HiRISE-quality: spec-change to Jezero and re-plan | data | pre-event-allowed | M0 | |
| T02.01 | Write the tile-grid and tile-encoding contract v1 | frontend | pre-event-allowed | M0 | |
| T02.02 | Implement the Mars projection module with a web CRS-guard test | frontend | pre-event-if-permitted | M0 | |
| T02.03 | Build the spike page: mock-site tiles in the Mars projection with a metric scale bar | frontend | pre-event-if-permitted | M0 | |
| T02.04 | Verify the scale bar against a DEM-measured feature within 2 % on real AOI tiles | frontend | pre-event-if-permitted | M1 | |
| T02.05 | Record the spike outcome in ADR-003 (D-03) | frontend | pre-event-allowed | M1 | |
| T02.06 | Fallback — start only if the spike fails within 2 h: ImageStatic layer factory in the Mars projection | frontend | pre-event-if-permitted | M0–M1 | |
| T03.01 | Freeze data contracts v1: 05 entity mirror, grid binary layout, site-config input layout | data | pre-event-allowed | M0 | |
| T03.02 | Fixture: mock site bundle (manifest, placeholder tiles, tiny grid, sample POI and traverse GeoJSON) | data | pre-event-allowed | M0 | |
| T03.03 | Tests: projection and raster handling (02 §C.1, §C.4) | data | pre-event-allowed | M1 | |
| T03.04 | Tests: slope, hillshade, aggregation and hazard flags | data | pre-event-allowed | M1 | |
| T03.05 | Tests: routing-grid encoding | data | pre-event-allowed | M1 | |
| T03.06 | Tests: manifest integrity, sampled values, bundle size | data | pre-event-allowed | M1 | |
| T03.07 | Implement config (working projection for the AOI) and source acquisition | data | pre-event-allowed | M1 | |
| T03.08 | Implement clip/reproject and DEM no-data → NaN | data | pre-event-allowed | M1 | |
| T03.09 | Implement Horn slope, hillshade and p90/max aggregation | data | pre-event-allowed | M1 | |
| T03.10 | Implement the hazard-flag bitfield | data | pre-event-allowed | M1 | |
| T03.11 | Implement the routing-grid writer (u8 slope encoding, little-endian arrays, TI sidecar) | data | pre-event-allowed | M1 | |
| T03.12 | Implement tile rendering per the tile-grid contract | data | pre-event-allowed | M1 | |
| T03.13 | Implement the manifest writer from site-config records and assets | data | pre-event-allowed | M1 | |
| T03.14 | Implement `validate-manifest` | data | pre-event-allowed | M1 | |
| T03.15 | Implement the pipeline entry point (`python -m marswalk_pipeline`) | data | pre-event-allowed | M1 | |
| T03.16 | Write the site record (AOI, default start, data version) | data | pre-event-allowed | M1 | |
| T03.17 | Write DataSource and Layer records for the DEM, ortho and THEMIS layers | data | pre-event-allowed | M1 | |
| T03.18 | Digitise HARD_HAZARD features and LOW_RES_DEM coverage | data | pre-event-allowed | M1 | |
| T03.19 | Run the pipeline; commit bundle v1 (manifest, vectors, lock file) | data | pre-event-allowed | M1 | |
| T03.20 | Verify DEM hillshade vs ortho alignment; record the offset | data | pre-event-allowed | M1 | |
| T03.21 | Fixture: real-grid sample cells from a `rasterio` readout | data | pre-event-allowed | M1 | |
| T03.22 | Verify a clean-checkout re-run reproduces checksums; bundle ≤ 250 MB | data | pre-event-allowed | M2 | |
| T03.23 | Fallback — start only if tiling is too slow: lower the max zoom | data | pre-event-allowed | M1 | |
| T03.24 | Fallback — start only if the 5 m grid is too big or slow: 10 m cells | data | pre-event-allowed | M1 | |
| T03.25 | Fallback — start only if T02 spike fails or cut 7 is called: one PNG per 2 m layer for ImageStatic | data | pre-event-allowed | M1 | |
| T03.26 | Fallback — start only if the colour COG misses the AOI: grayscale 25 cm window or cached Mars Trek HiRISE tiles | data | pre-event-allowed | M1 | |
| T03.27 | Fallback — start only if quantitative TI misses the AOI: THEMIS Day IR 100 m (qualitative) | data | pre-event-allowed | M1 | |
| T04.01 | Choose and cache the traverse source (U-04); write its DataSource and Layer records | data | pre-event-allowed | M1 | |
| T04.02 | Tests: traverse and POI packaging | data | pre-event-allowed | M1 | |
| T04.03 | Implement traverse and POI packaging | data | pre-event-allowed | M1 | |
| T04.04 | Curate POIs 1–4 with images, credits and position sources; write the POI layer record | story | pre-event-allowed | M1 | |
| T04.05 | Curate POIs 5–8 (at least one, to reach the 5-POI minimum) | story | pre-event-allowed | M1 | |
| T04.06 | Write the dataset and image credits list | story | pre-event-allowed | M1 | |
| T04.07 | Resolve U-03: TI "loose fines" threshold from the AOI histogram and literature | data | pre-event-allowed | M1 | |
| T04.08 | Verify traverse alignment with HiRISE tracks at the checkpoints; record the offset | data | pre-event-allowed | M1 | |
| T04.09 | Fallback — start only if PLACES parsing is too slow: MMGIS JSON cached once, labelled unofficial | data | pre-event-allowed | M1 | |
| T05.01 | Freeze compute contracts v1: worker protocol and compute module layout | compute | pre-event-allowed | M0 | |
| T05.02 | Fixture: synthetic routing grids | compute | pre-event-if-permitted | M0 | |
| T05.03 | Fixture: canned PLAN_RESULT messages (OK, PARTIAL, OVER_LIMITS) | compute | pre-event-allowed | M0 | |
| T05.04 | Fixture: mock worker answering from the canned fixtures | compute | pre-event-if-permitted | M0 | |
| T05.05 | Tests: grid loader and addressing | compute | pre-event-if-permitted | M3 | |
| T05.06 | Tests: point and profile sampling | compute | pre-event-if-permitted | M3 | |
| T05.07 | Tests: A* core (gap, re-sample, determinism, TIMEOUT) | compute | pre-event-if-permitted | M3 | |
| T05.08 | Tests: no-route reasons and nearest reachable cell | compute | pre-event-if-permitted | M4 | |
| T05.09 | Tests: snapping | compute | pre-event-if-permitted | M4 | |
| T05.10 | Tests: leg assembly (metrics, simplification, profile) | compute | pre-event-if-permitted | M3 | |
| T05.11 | Tests: walking-time model | compute | pre-event-if-permitted | M3 | |
| T05.12 | Tests: walkback | compute | pre-event-if-permitted | M4 | |
| T05.13 | Tests: warnings and plan status | compute | pre-event-if-permitted | M4 | |
| T05.14 | Tests: input validation (02 §E.3) | compute | pre-event-if-permitted | M4 | |
| T05.15 | Tests: worker handler and cancellation | compute | pre-event-if-permitted | M3 | |
| T05.16 | Implement the grid loader | compute | pre-event-if-permitted | M3 | |
| T05.17 | Implement point and profile sampling | compute | pre-event-if-permitted | M3 | |
| T05.18 | Implement the A* least-time search | compute | pre-event-if-permitted | M3 | |
| T05.19 | Implement no-route reasons and nearest reachable cell | compute | pre-event-if-permitted | M4 | |
| T05.20 | Implement snapping | compute | pre-event-if-permitted | M4 | |
| T05.21 | Implement leg assembly | compute | pre-event-if-permitted | M3 | |
| T05.22 | Implement the walking-time model | compute | pre-event-if-permitted | M3 | |
| T05.23 | Implement walkback | compute | pre-event-if-permitted | M4 | |
| T05.24 | Implement warnings and plan status | compute | pre-event-if-permitted | M4 | |
| T05.25 | Implement input validation | compute | pre-event-if-permitted | M4 | |
| T05.26 | Implement the worker handler, minimum slice: SAMPLE_POINT and legs-only PLAN_RESULT | compute | pre-event-if-permitted | M3 | |
| T05.27 | Implement the worker entry: grid initialisation, latest-revision cancellation | compute | pre-event-if-permitted | M3 | |
| T05.28 | Verify on the real grid: 10 sampled cells; 20 pairs p50/p95; 3-stop loop ≤ 2 s | compute | pre-event-if-permitted | M4 | |
| T05.29 | Record D-02 from the benchmark in ADR-002 | compute | pre-event-allowed | M4 | |
| T05.30 | Fallback — start only if T09.06 says no-go: manual polyline validation (compute side) | compute | pre-event-if-permitted | M3 | |
| T05.31 | Fallback — start only if T05.29 records p95 > 2 s: FastAPI `/route` with a scikit-image least-cost path | compute | pre-event-if-permitted | M4 | |
| T05.32 | follow-up: complete PLAN_RESULT assembly (totals, timeline, warnings, status, conditions) | compute | pre-event-if-permitted | M4 | |
| T06.01 | Freeze the conditions interface; move the solar functions to `sun.ts` | compute | pre-event-allowed | M0 | |
| T06.02 | Fixture: Mars24 reference values generated with `marstime` | compute | pre-event-allowed | M1 | |
| T06.03 | Tests: Mars24 time and sun functions vs `marstime` | compute | event-only | M4 | |
| T06.04 | Tests: radiation estimate | compute | event-only | M4 | |
| T06.05 | Tests: conditions assembly | compute | event-only | M4 | |
| T06.06 | Implement the Mars24 time functions (MSD, L_s, LTST, east → west longitude) | compute | event-only | M4 | |
| T06.07 | Implement solar position and flat-horizon sunrise/sunset | compute | event-only | M4 | |
| T06.08 | Implement the radiation estimate | compute | event-only | M4 | |
| T06.09 | Implement conditions assembly (timeline LTST, sun elevation, radiation) | compute | event-only | M4 | |
| T06.10 | Write the RAD EnvConstant and DataSource records (05 §C values verbatim) | compute | pre-event-allowed | M1 | |
| T06.11 | Fallback — start only if Mars24 tests fail or cut 5 is called: precomputed sun table for the demo dates | compute | event-only | M4 | |
| T07.01 | Freeze UI contracts v1: app context, screen interface, map handle, layer order, provenance attributes; create UI module stubs | frontend | pre-event-allowed | M2 | |
| T07.02 | Implement site loading (manifest fetch, `?site=` override, lookup maps) | frontend | event-only | M3 | |
| T07.03 | Implement the app shell: hash router, boot sequence, CSP meta tag | frontend | event-only | M3 | |
| T07.04 | Implement the worker client (request ids, latest revision, crash → retry) | frontend | event-only | M3 | |
| T07.05 | Implement SCR-01 Mission Briefing | frontend | event-only | M3 | |
| T07.06 | Implement the map: view, metric scale bar, north arrow, coordinate readout | frontend | event-only | M3 | |
| T07.07 | Implement tiled raster layers with slope classes that follow the current limits | frontend | event-only | M3 | |
| T07.08 | Implement the SCR-02 workspace layout (top bar, drawers, toolbar, responsive) | frontend | event-only | M3 | |
| T07.09 | Implement SCR-03 Layers panel | frontend | event-only | M4 | |
| T07.10 | Implement the Curiosity traverse layer | frontend | event-only | M4 | |
| T07.11 | Implement the POI layer and POI selection | frontend | event-only | M4 | |
| T07.12 | Implement the point-inspector popover | frontend | event-only | M4 | |
| T07.13 | Implement `?debug=1` diagnostics | frontend | event-only | M4 | |
| T07.14 | Author the demo plan (three POI stops) | story | pre-event-allowed | M2 | |
| T07.15 | Verify SCR-01, SCR-02, SCR-03: toggles ≤ 300 ms, inspector values match the grid | frontend | event-only | M4 | |
| T07.16 | Fallback — start only if projection issues persist or cut 7 is called: ImageStatic layers | frontend | event-only | M3 | |
| T08.01 | Freeze the plan-store contract v1 (state, status, actions, selection) | frontend | pre-event-allowed | M2 | |
| T08.02 | Tests: plan store (revisions, undo, debounce, stale results) | frontend | event-only | M3 | |
| T08.03 | Implement the plan store | frontend | event-only | M3 | |
| T08.04 | Implement the SCR-04 panel and mission-inputs form | frontend | event-only | M4 | |
| T08.05 | Implement the stops list (reorder buttons, delete, undo) | frontend | event-only | M4 | |
| T08.06 | Implement waypoint markers and placement validation with a snap offer | frontend | event-only | M3 | |
| T08.07 | Implement Add-stop mode (free placement, `A`, crosshair `Enter`) | frontend | event-only | M3 | |
| T08.08 | Implement desktop drag: waypoints on the map, rows in the stops list | frontend | event-only | M4 | |
| T08.09 | Implement tablet touch: long-press placement and drag | frontend | event-only | M4 | |
| T08.10 | Fallback — start only if T08.08 is not working at the Day 1 17:30 checkpoint: buttons-only stop move | frontend | event-only | M4 | |
| T08.11 | Verify the 02 §E.3 rules and SCR-04 states in the UI | frontend | event-only | M4 | |
| T09.01 | Implement the route layer (cased legs, dashed NO_ROUTE line, hazard hatch) | frontend | event-only | M3 | |
| T09.02 | Implement the elevation/slope profile chart | frontend | event-only | M3 | |
| T09.03 | Implement SCR-05: status banner and metrics row | frontend | event-only | M4 | |
| T09.04 | Implement the warnings list with click-to-zoom | frontend | event-only | M4 | |
| T09.05 | Implement profile ↔ map linking (06 fallback: ship the profile without it) | frontend | event-only | M4 | |
| T09.06 | Run the M3 walking-skeleton check; decide auto-routing go/no-go in ADR-004 | integration | event-only | M3 | |
| T09.07 | Verify SCR-05 states against the OK, PARTIAL and OVER_LIMITS fixtures | frontend | event-only | M4 | |
| T09.08 | Fallback — start only if T09.06 says no-go: draw legs by hand on the map | frontend | event-only | M3 | |
| T10.01 | Implement SCR-06 POI Detail | frontend | event-only | M4 | |
| T10.02 | Implement SCR-07 Conditions | frontend | event-only | M4 | |
| T10.03 | Verify POI images with credits and the daylight warning for a pre-dawn start | frontend | event-only | M4 | |
| T11.01 | Tests: plan hash and export (canonical JSON, schema-valid, reproducible) | frontend | event-only | M4 | |
| T11.02 | Implement the plan hash and PlanExport assembly | frontend | event-only | M4 | |
| T11.03 | Implement the SCR-08 layout and print CSS | design | event-only | M4 | |
| T11.04 | Implement the route map snapshot | frontend | event-only | M4 | |
| T11.05 | Verify one-page print in Chrome and plan_hash reproduction | design | event-only | M4 | |
| T11.06 | Fallback — start only if the map snapshot cannot be made to work: static AOI thumbnail with the route as SVG | frontend | event-only | M4 | |
| T12.01 | Implement the metric and provenance-chip component | story | event-only | M3 | |
| T12.02 | Tests: DOM provenance check across screens | story | event-only | M4 | |
| T12.03 | Implement SCR-09 Sources & Methods | story | event-only | M4 | |
| T12.04 | Write the methods, models and limitations content from 02 §C–§D | story | pre-event-allowed | M2 | |
| T12.05 | Write DataSource records for the models (Tobler, Apollo 17, Mars24) | story | pre-event-allowed | M1 | |
| T12.06 | Verify no unlabelled metric on the demo path and every credited source in SCR-09 | story | event-only | M5 | |
| T13.01 | Freeze CSS token and status-class names v1 against 04 §C | design | pre-event-allowed | M2 | |
| T13.02 | Self-host Inter and IBM Plex Mono; verify their licences | design | pre-event-allowed | M2 | |
| T13.03 | Sketch SCR-02 and SCR-08 wireframes on paper (04 §F) | design | pre-event-allowed | M2 | |
| T13.04 | Implement base styles: typography, focus ring, reduced motion | design | event-only | M5 | |
| T13.05 | Implement status icons and patterns | design | event-only | M4 | |
| T13.06 | Implement keyboard map controls (04 §E) | design | event-only | M5 | |
| T13.07 | follow-up: first-run coach marks | design | event-only | M5 | |
| T13.08 | Implement the light theme (U-08) | design | event-only | M5 | |
| T13.09 | Verify the axe scan: 0 serious issues | design | event-only | M5 | |
| T13.10 | Verify a keyboard-only run of the core scenario | design | event-only | M5 | |
| T13.11 | Self-host the outline icon set and verify its licence | design | pre-event-allowed | M2 | |
| T14.01 | Integrate dependencies and build wiring (one dependency batch, `make data`) | integration | pre-event-allowed | M2 | |
| T14.02 | Integrate CI and the PR template (subtask id, `check_tasks.py`) | integration | pre-event-allowed | M2 | |
| T14.03 | Implement boot validation (schema major version, dev-build SHA-256) | integration | event-only | M5 | |
| T14.04 | Implement SCR-00 Boot error | integration | event-only | M5 | |
| T14.05 | Tests: fault injection (02 §F.1 Recovery) | integration | event-only | M5 | |
| T14.06 | Verify two clean offline rehearsals of the core scenario | integration | event-only | M5 | |
| T14.07 | Verify NFR-02 timings on the weakest team laptop | integration | event-only | M5 | |
| T14.08 | Verify the browser/device matrix and cross-browser determinism | integration | event-only | M5 | |
| T14.09 | Verify release checks: CSP, network log, bundle sizes, `?debug=1` | integration | event-only | M5 | |
| T14.10 | Verify SCR-00 and worker-crash recovery by hand | integration | event-only | M5 | |
| T14.11 | follow-up: refresh the `CLAUDE.md` command rows after the pipeline entry point lands | integration | pre-event-allowed | M2 | |
| T15.01 | Write the usability-test script (3 non-team users, briefing in ≤ 5 min) | design | pre-event-allowed | M2 | |
| T15.02 | Run three sessions; record times and issues | design | event-only | M5 | |
| T15.03 | Triage the findings into follow-up subtasks | design | event-only | M5 | |
| T16.01 | Decide the final product name (D-08); record ADR-008 | story | pre-event-allowed | M2 | |
| T16.02 | spec-change: sync spec status rows and the docs index with the M0–M1 outcomes | integration | pre-event-allowed | M2 | |
| T16.03 | Finalize the README: run instructions, data credits, licence | story | pre-event-allowed | M6 | |
| T16.04 | Complete the AI-use disclosure | story | pre-event-allowed | M6 | |
| T16.05 | Verify every dataset and image is credited in SCR-09 and the README | story | pre-event-allowed | M6 | |
| T16.06 | Fill the NASA project page fields; complete the submission checklist | story | event-only | M6 | |
| T16.07 | Implement the release-asset fetch route and decide what the public link shows; test the link in a private window | story | pre-event-allowed | M2–M6 | |
| T17.01 | Draft the 240-s and 30-s demo scripts | story | pre-event-allowed | M2 | |
| T17.02 | Record and submit the 240-s video by Day 1 18:30 (dry-run capture first) | story | event-only | M4 | |
| T17.03 | Record and upload the 30-s video by Day 2 09:00 | story | event-only | M6 | |
| T17.04 | Fallback — start only if the live demo fails on camera: cut the 240-s video from the dry-run capture | story | event-only | M4 | |
| T18.01 | follow-up: CRISM layer and bundle re-release (only if T01.04 finds MTRDR coverage) | data | event-only | M5–M6 | |
| T18.02 | Build REMS L_s-bin temperature and pressure context from named RDR files | data | event-only | M5–M6 | |
| T18.03 | follow-up: seasonal-weather section in SCR-07 | frontend | event-only | M5–M6 | |
| T18.04 | Tests: illustrative O₂ estimate (02 §D.6) | compute | event-only | M5–M6 | |
| T18.05 | Implement the illustrative O₂ estimate | compute | event-only | M5–M6 | |
| T18.06 | follow-up: show the O₂ estimate labelled "illustrative" | frontend | event-only | M5–M6 | |
| T18.07 | follow-up: save and restore the last plan in browser storage | frontend | event-only | M5–M6 | |
| T18.08 | Cache the CRISM and REMS source files before 13 Nov | data | pre-event-allowed | M1–M2 | |
