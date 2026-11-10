# Coordination map — atomized task plans

| | |
| --- | --- |
| **Owner** | Delivery — mirrors [06](../specs/06_High_Level_Implementation_Plan.md), which owns order, dependencies and cut decisions |
| **Date** | 2026-11-03; v2 additions 2026-11-06 |
| **Status** | Approved 2026-11-03 and frozen; amended the same day by one `coord:` change after Phase 2 (3 subtasks added; edges, paths and open points synced with the task files). **`coord:` v2 change 2026-11-06** (session handoff §F.2, approved by Sadman Shaharier Mahim): TASK-05b and TASK-20–TASK-31 atomized, an Owner on every subtask, v1 subtasks re-dated to [06](../specs/06_High_Level_Implementation_Plan.md) v2.2 milestones, windows and cut list. **`coord:` change 2026-11-10** (approved by Sadman Shaharier Mahim, product & systems lead): T21.15 registered (demo timing numbers derived from the committed tables; T21.09 now depends on it). Change this file first (§h.5) |
| **Related** | [06 §C Work packages](../specs/06_High_Level_Implementation_Plan.md#c-work-packages) · [06 §D Delivery strategy](../specs/06_High_Level_Implementation_Plan.md#d-delivery-strategy) · [Docs index](../README.md) · [CLAUDE.md](../../CLAUDE.md) |

This file lets several people and AI agents work on the work packages of 06 in parallel: the 19 v1 packages (planner, Tier 0) and the 13 v2 packages (TASK-05b, TASK-20–TASK-31: surface ops, Tier 1). It fixes subtask ids (§a), lanes (§b), who writes which file (§c), the interfaces that decouple lanes (§d), the fixtures that remove waiting (§e), the dependency graph (§f), what runs together per milestone (§g) and how branches and PRs work (§h). Task files `TASK-NN_<title>.md` expand each subtask listed here; they never add a subtask, path owner or cross-task dependency that is not in this file.

The specs are the source of truth. Nothing here changes a requirement, id, number or label; gaps found while building this map are in [Open points](#open-points).

## a. Subtask ids

### a.1 Scheme

- Format `T05.03` = TASK-05, subtask 03. A task code may end in one letter: `T05b.03` = TASK-05b, subtask 03 (file `TASK-05b_compute-v2.md`). Ids are stable once published: new subtasks get the next free number in their task; nothing is ever renumbered or reused.
- A contract subtask is `.01` in its owning task and is **blocking — do first**. One contract subtask may freeze several contract files (§d).
- Titles starting `contract-change:`, `spec-change:` or `follow-up:` mark subtasks that edit a path after its owner has merged (§c.1).

### a.2 Field vocabulary

| Field | Values |
| --- | --- |
| Owner | The person who does or delegates the subtask, from [06 §A.2](../specs/06_High_Level_Implementation_Plan.md#a2-assignment-by-person-proposed-2026-11-05--sign-off-at-the-6-nov-kickoff), with their position. Shared tasks are split by subtask. *Proposed* with 06 §A.2 until the kickoff signs it off |
| Type | `contract` · `fixture` · `test` · `implement` · `integrate` · `verify` · `human` · `fallback` |
| Tag (who) | `agent-ready` (clear spec and an automated or scripted check) · `human-required` (registration, contacting people, filming, user sessions, choosing the AOI, judging trade-offs, curating content) |
| Tag (cut) | `core` · `cut-2` … `cut-9` (the [06 §D.4](../specs/06_High_Level_Implementation_Plan.md#d4-cut-list-cut-in-this-order-when-behind) v2 item that drops it; re-mapped from the v1 list on 2026-11-06, §h.6) · `desirable` (= cut-1, TASK-18). Fallbacks are `core`: once triggered they are needed. 06 §D.4 is a contingency list only: the team decided on 5 Nov not to cut scope |
| Window | `pre-event-allowed` — data, design, docs, setup (06 §D.8 Track S) · `pre-event-if-permitted` — application code before 13 Nov, allowed because Track P was recorded on 2026-11-04 ([ops/rules.md](../ops/rules.md)) · `event-only` — work that [06 §C](../specs/06_High_Level_Implementation_Plan.md#c-work-packages) schedules at the event (**E**), such as TASK-10, TASK-17 and TASK-27 |
| M | Milestone from [06 §B](../specs/06_High_Level_Implementation_Plan.md#b-milestones) v2.2: M0 kickoff 5–6 Nov · M1 spikes 6–7 Nov · M2 data and scenario 6–9 Nov · M3 walking skeleton by 10 Nov · M3b first dry run 10 Nov evening · M4 offline dry run 11 Nov · M4b buffer 12 Nov · M5 demo path green Day 1 12:30 · M6 240-s video Day 1 18:30 · M7 polish and Tier 2 Day 1 19:00 → Day 2 05:00 · M8 freeze and submit Day 2 06:00 → 09:00. v1 subtasks were re-dated from the v1 milestones on 2026-11-06 using the *When* column of 06 §C.1 |

Window interpretations this map relies on (TASK-00 recorded Track P on 2026-11-04, so `pre-event-if-permitted` work may start now):

- Contract subtasks edit only types, JSON Schemas and throwing stubs — the skeleton level `CLAUDE.md` §3 already allows — so they are `pre-event-allowed`.
- Pipeline code (TASK-03, TASK-04) produces "data preprocessing outputs" (06 §A Track S) and sits in M1 (5–10 Nov) on both tracks, so it is `pre-event-allowed` once TASK-00 resolves.
- Fixtures that are pure data (JSON, GeoJSON, tiny PNG/binary arrays from a generator script in `pipeline/`) are `pre-event-allowed`; TypeScript fixtures are code and follow the window of their task.

**Phase gate.** No `test` or `implement` subtask starts before T00.03 records the track (`CLAUDE.md` §3). This gate is global and is not drawn as an edge in §f.

### a.3 Register

The register publishes every id. Requirement ids are the ones the subtask serves; task files add spec section links.

#### TASK-00 — Resolve rules + register

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T00.01 | Check the Space Apps rules page and Participants Guide for the pre-event code rule | story | human | human-required · core | pre-event-allowed | M0 | U-12 |
| T00.02 | Ask the Dhaka Local Lead; confirm every member is registered (NASA site + Bangladesh form) | story | human | human-required · core | pre-event-allowed | M0 | U-12 |
| T00.03 | Record the answer, registration status and Track S or P in `docs/ops/rules.md` | story | human | human-required · core | pre-event-allowed | M0 | U-12 |
| T00.04 | Update the phase-gate line in `CLAUDE.md` and `AGENTS.md` for the recorded track | integration | integrate | agent-ready · core | pre-event-allowed | M0 | U-12 |
| T00.05 | Fallback — start only if no answer by 4 Nov (U-12 due date): declare Track S | story | fallback | human-required · core | pre-event-allowed | M0 | U-12 |
| T00.06 | Record team roster and skills (U-13) and venue type (U-14) | story | human | human-required · core | pre-event-allowed | M0–M2 | U-13, U-14 |

#### TASK-01 — Feasibility: AOI, DEM quality, coverage checks

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T01.01 | Download the 1 m Gale DEM; record its PDS3 label datum and no-data value | data | human | human-required · core | pre-event-allowed | M0 | FR-01–FR-03, U-02 |
| T01.02 | Propose AOI bounds from Curiosity's 2025 traverse, inside the DEM extent | data | human | human-required · core | pre-event-allowed | M0 | FR-01, U-01 |
| T01.03 | Judge DEM quality in the AOI from a hillshade; measure one reference feature | data | human | human-required · core | pre-event-allowed | M0 | FR-01, A-01, U-01, U-10 |
| T01.04 | Check THEMIS TI tile, colour HiRISE COG and CRISM coverage of the AOI by window reads | data | verify | agent-ready · core | pre-event-allowed | M0 | FR-02, FR-18, U-05, U-09 |
| T01.05 | Decide D-01; write the feasibility summary and ADR-001 | data | human | human-required · core | pre-event-allowed | M0 | D-01 |
| T01.06 | Fallback — start only if T01.05 finds the AOI DEM is not HiRISE-quality: spec-change to Jezero and re-plan | data | fallback | human-required · core | pre-event-allowed | M0 | D-01 |
| T01.07 | Choose the hab site inside the AOI (v2) | data | human | human-required · core | pre-event-allowed | M0 | FR-39, FR-42, FR-45 |

#### TASK-02 — Spike: OpenLayers custom Mars projection + custom tile grid

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T02.01 | Write the tile-grid and tile-encoding contract v1 | frontend | contract | agent-ready · core | pre-event-allowed | M1 | FR-01, FR-02, D-03 |
| T02.02 | Implement the Mars projection module with a web CRS-guard test | frontend | implement | agent-ready · core | pre-event-if-permitted | M1 | FR-01, D-03 |
| T02.03 | Build the spike page: mock-site tiles in the Mars projection with a metric scale bar | frontend | implement | agent-ready · core | pre-event-if-permitted | M1 | FR-01, D-03 |
| T02.04 | Verify the scale bar against a DEM-measured feature within 2 % on real AOI tiles | frontend | verify | human-required · core | pre-event-if-permitted | M1 | FR-01 |
| T02.05 | Record the spike outcome in ADR-003 (D-03) | frontend | human | human-required · core | pre-event-allowed | M1 | D-03 |
| T02.06 | Fallback — start only if the spike fails within 2 h: ImageStatic layer factory in the Mars projection | frontend | fallback | agent-ready · core | pre-event-if-permitted | M1 | FR-01, FR-02, D-03 |

#### TASK-03 — Preprocessing pipeline

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T03.01 | Freeze data contracts v1: 05 entity mirror, grid binary layout, site-config input layout | data | contract | agent-ready · core | pre-event-allowed | M1 | FR-01, FR-03, FR-07, FR-15, NFR-06 |
| T03.02 | Fixture: mock site bundle (manifest, placeholder tiles, tiny grid, sample POI and traverse GeoJSON) | data | fixture | agent-ready · core | pre-event-allowed | M1 | FR-01–FR-04, FR-17 |
| T03.03 | Tests: projection and raster handling (02 §C.1, §C.4) | data | test | agent-ready · core | pre-event-allowed | M2 | FR-01–FR-03 |
| T03.04 | Tests: slope, hillshade, aggregation and hazard flags | data | test | agent-ready · core | pre-event-allowed | M2 | FR-02, FR-07, FR-10 |
| T03.05 | Tests: routing-grid encoding | data | test | agent-ready · core | pre-event-allowed | M2 | FR-03, FR-07 |
| T03.06 | Tests: manifest integrity, sampled values, bundle size | data | test | agent-ready · core | pre-event-allowed | M2 | FR-01, FR-15, NFR-06, NFR-09 |
| T03.07 | Implement config (working projection for the AOI) and source acquisition | data | implement | agent-ready · core | pre-event-allowed | M2 | FR-01–FR-03, NFR-06 |
| T03.08 | Implement clip/reproject and DEM no-data → NaN | data | implement | agent-ready · core | pre-event-allowed | M2 | FR-01–FR-03 |
| T03.09 | Implement Horn slope, hillshade and p90/max aggregation | data | implement | agent-ready · core | pre-event-allowed | M2 | FR-02, FR-07 |
| T03.10 | Implement the hazard-flag bitfield | data | implement | agent-ready · core | pre-event-allowed | M2 | FR-07, FR-10, FR-16 |
| T03.11 | Implement the routing-grid writer (u8 slope encoding, little-endian arrays, TI sidecar) | data | implement | agent-ready · core | pre-event-allowed | M2 | FR-03, FR-07 |
| T03.12 | Implement tile rendering per the tile-grid contract | data | implement | agent-ready · core | pre-event-allowed | M2 | FR-01, FR-02 |
| T03.13 | Implement the manifest writer from site-config records and assets | data | implement | agent-ready · core | pre-event-allowed | M2 | FR-01, FR-15, NFR-06 |
| T03.14 | Implement `validate-manifest` | data | implement | agent-ready · core | pre-event-allowed | M2 | FR-16, NFR-06, NFR-10 |
| T03.15 | Implement the pipeline entry point (`python -m marswalk_pipeline`) | data | implement | agent-ready · core | pre-event-allowed | M2 | FR-01 |
| T03.16 | Write the site record (AOI, default start, data version) | data | human | human-required · core | pre-event-allowed | M2 | FR-01, FR-06 |
| T03.17 | Write DataSource and Layer records for the DEM, ortho and THEMIS layers | data | implement | agent-ready · core | pre-event-allowed | M2 | FR-02, FR-15, NFR-07 |
| T03.18 | Digitise HARD_HAZARD features and LOW_RES_DEM coverage | data | human | human-required · core | pre-event-allowed | M2 | FR-07, FR-10, U-10 |
| T03.19 | Run the pipeline; commit bundle v1 (manifest, vectors, lock file) | data | integrate | human-required · core | pre-event-allowed | M2 | FR-01–FR-03, FR-07, NFR-06, NFR-09 |
| T03.20 | Verify DEM hillshade vs ortho alignment; record the offset | data | verify | human-required · core | pre-event-allowed | M2 | FR-01, FR-17 |
| T03.21 | Fixture: real-grid sample cells from a `rasterio` readout | data | fixture | agent-ready · core | pre-event-allowed | M2 | FR-03 |
| T03.22 | Verify a clean-checkout re-run reproduces checksums; bundle ≤ 250 MB | data | verify | agent-ready · core | pre-event-allowed | M2 | NFR-06, NFR-09 |
| T03.23 | Fallback — start only if tiling is too slow: lower the max zoom | data | fallback | agent-ready · core | pre-event-allowed | M2 | FR-01, NFR-09 |
| T03.24 | Fallback — start only if the 5 m grid is too big or slow: 10 m cells | data | fallback | agent-ready · core | pre-event-allowed | M2 | FR-07, NFR-02 |
| T03.25 | Fallback — start only if the T02 spike fails: one PNG per 2 m layer for ImageStatic | data | fallback | agent-ready · core | pre-event-allowed | M2 | FR-01, FR-02 |
| T03.26 | Fallback — start only if the colour COG misses the AOI: grayscale 25 cm window or cached Mars Trek HiRISE tiles | data | fallback | human-required · core | pre-event-allowed | M2 | FR-01 |
| T03.27 | Fallback — start only if quantitative TI misses the AOI: THEMIS Day IR 100 m (qualitative) | data | fallback | human-required · core | pre-event-allowed | M2 | FR-02 |
| T03.28 | Tests: `comm_hab` viewshed grid (v2) | data | test | agent-ready · core | pre-event-allowed | M2 | FR-42 |
| T03.29 | Implement the `comm_hab` viewshed grid and its layer record (v2) | data | implement | agent-ready · core | pre-event-allowed | M2 | FR-42 |
| T03.30 | Verify `comm_hab` against `gdal_viewshed` at 5 points (v2) | data | verify | agent-ready · core | pre-event-allowed | M2 | FR-42 |

#### TASK-04 — Vectors, POIs and images

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T04.01 | Choose and cache the traverse source (U-04); write its DataSource and Layer records | data | human | human-required · core | pre-event-allowed | M2 | FR-17, U-04 |
| T04.02 | Tests: traverse and POI packaging | data | test | agent-ready · core | pre-event-allowed | M2 | FR-04, FR-17 |
| T04.03 | Implement traverse and POI packaging | data | implement | agent-ready · core | pre-event-allowed | M2 | FR-04, FR-17 |
| T04.04 | Curate POIs 1–4 with images, credits and position sources; write the POI layer record | story | human | human-required · core | pre-event-allowed | M2 | FR-04 |
| T04.05 | Curate POIs 5–8 (at least one, to reach the 5-POI minimum) | story | human | human-required · core | pre-event-allowed | M2 | FR-04 |
| T04.06 | Write the dataset and image credits list | story | human | human-required · core | pre-event-allowed | M2 | FR-04, NFR-07 |
| T04.07 | Resolve U-03: TI "loose fines" threshold from the AOI histogram and literature | data | human | human-required · core | pre-event-allowed | M2 | FR-10, U-03 |
| T04.08 | Verify traverse alignment with HiRISE tracks at the checkpoints; record the offset | data | verify | human-required · core | pre-event-allowed | M2 | FR-17 |
| T04.09 | Fallback — start only if PLACES parsing is too slow: MMGIS JSON cached once, labelled unofficial | data | fallback | human-required · core | pre-event-allowed | M2 | FR-17 |
| T04.10 | Write the Exploration Zone framing and the stop-type list (v2, FR-45, U-16) | story | human | human-required · core | pre-event-allowed | M2 | FR-45 |
| T04.11 | Check the dust-record source for the scenario window (v2, U-17) | data | human | human-required · desirable | pre-event-allowed | M2 | FR-49 |

#### TASK-05 — Compute core

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T05.01 | Freeze compute contracts v1: worker protocol and compute module layout | compute | contract | agent-ready · core | pre-event-allowed | M1 | FR-03, FR-06, FR-07, NFR-06 |
| T05.02 | Fixture: synthetic routing grids | compute | fixture | agent-ready · core | pre-event-if-permitted | M1 | FR-07 |
| T05.03 | Fixture: canned PLAN_RESULT messages (OK, PARTIAL, OVER_LIMITS) | compute | fixture | agent-ready · core | pre-event-allowed | M1 | FR-07–FR-12 |
| T05.04 | Fixture: mock worker answering from the canned fixtures | compute | fixture | agent-ready · core | pre-event-if-permitted | M1 | FR-03, FR-07 |
| T05.05 | Tests: grid loader and addressing | compute | test | agent-ready · core | pre-event-if-permitted | M2 | FR-03, FR-07 |
| T05.06 | Tests: point and profile sampling | compute | test | agent-ready · core | pre-event-if-permitted | M2 | FR-03, FR-08 |
| T05.07 | Tests: A* core (gap, re-sample, determinism, TIMEOUT) | compute | test | agent-ready · cut-7 | pre-event-if-permitted | M2 | FR-07, NFR-06 |
| T05.08 | Tests: no-route reasons and nearest reachable cell | compute | test | agent-ready · cut-7 | pre-event-if-permitted | M2 | FR-07 |
| T05.09 | Tests: snapping | compute | test | agent-ready · core | pre-event-if-permitted | M2 | FR-06 |
| T05.10 | Tests: leg assembly (metrics, simplification, profile) | compute | test | agent-ready · core | pre-event-if-permitted | M2 | FR-07, FR-08 |
| T05.11 | Tests: walking-time model | compute | test | agent-ready · core | pre-event-if-permitted | M2 | FR-09 |
| T05.12 | Tests: walkback | compute | test | agent-ready · core | pre-event-if-permitted | M2 | FR-09 |
| T05.13 | Tests: warnings and plan status | compute | test | agent-ready · core | pre-event-if-permitted | M2 | FR-10, FR-16 |
| T05.14 | Tests: input validation (02 §E.3) | compute | test | agent-ready · core | pre-event-if-permitted | M2 | FR-05 |
| T05.15 | Tests: worker handler and cancellation | compute | test | agent-ready · core | pre-event-if-permitted | M2 | FR-07, NFR-02, NFR-06, NFR-10 |
| T05.16 | Implement the grid loader | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-03, FR-07 |
| T05.17 | Implement point and profile sampling | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-03, FR-08 |
| T05.18 | Implement the A* least-time search | compute | implement | agent-ready · cut-7 | pre-event-if-permitted | M2 | FR-07, NFR-02, NFR-06 |
| T05.19 | Implement no-route reasons and nearest reachable cell | compute | implement | agent-ready · cut-7 | pre-event-if-permitted | M2 | FR-07 |
| T05.20 | Implement snapping | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-06 |
| T05.21 | Implement leg assembly | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-07, FR-08 |
| T05.22 | Implement the walking-time model | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-09 |
| T05.23 | Implement walkback | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-09 |
| T05.24 | Implement warnings and plan status | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-10, FR-16 |
| T05.25 | Implement input validation | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-05 |
| T05.26 | Implement the worker handler, minimum slice: SAMPLE_POINT and legs-only PLAN_RESULT | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-03, FR-07, FR-08 |
| T05.27 | Implement the worker entry: grid initialisation, latest-revision cancellation | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | NFR-02, NFR-10 |
| T05.28 | Verify on the real grid: 10 sampled cells; 20 pairs p50/p95; 3-stop loop ≤ 2 s | compute | verify | agent-ready · core | pre-event-if-permitted | M2 | FR-03, FR-07, NFR-02 |
| T05.29 | Record D-02 from the benchmark in ADR-002 | compute | human | human-required · core | pre-event-allowed | M2 | D-02 |
| T05.30 | Fallback — start only if T09.06 says no-go: manual polyline validation (compute side) | compute | fallback | agent-ready · core | pre-event-if-permitted | M2 | FR-07, FR-08, FR-10 |
| T05.31 | Fallback — start only if T05.29 records p95 > 2 s: FastAPI `/route` with a scikit-image least-cost path | compute | fallback | agent-ready · core | pre-event-if-permitted | M2 | FR-07, NFR-02 |
| T05.32 | follow-up: complete PLAN_RESULT assembly (totals, timeline, warnings, status, conditions) | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-07–FR-12 |

#### TASK-06 — Mars24 solar functions + radiation estimate

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T06.01 | Freeze the conditions interface; move the solar functions to `sun.ts` | compute | contract | agent-ready · core | pre-event-allowed | M1 | FR-11, FR-12 |
| T06.02 | Fixture: Mars24 reference values generated with `marstime` | compute | fixture | agent-ready · core | pre-event-allowed | M1 | FR-11 |
| T06.03 | Tests: Mars24 time and sun functions vs `marstime` | compute | test | agent-ready · core | pre-event-if-permitted | M2 | FR-11 |
| T06.04 | Tests: radiation estimate | compute | test | agent-ready · core | pre-event-if-permitted | M2 | FR-12 |
| T06.05 | Tests: conditions assembly | compute | test | agent-ready · core | pre-event-if-permitted | M2 | FR-10, FR-11, FR-12 |
| T06.06 | Implement the Mars24 time functions (MSD, L_s, LTST, east → west longitude) | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-11 |
| T06.07 | Implement solar position and flat-horizon sunrise/sunset | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-11 |
| T06.08 | Implement the radiation estimate | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-12 |
| T06.09 | Implement conditions assembly (timeline LTST, sun elevation, radiation) | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-10, FR-11, FR-12 |
| T06.10 | Write the RAD EnvConstant and DataSource records (05 §C values verbatim) | compute | implement | agent-ready · core | pre-event-allowed | M1 | FR-12, FR-15 |
| T06.11 | Fallback — start only if Mars24 tests fail: precomputed sun table for the demo dates | compute | fallback | agent-ready · core | pre-event-if-permitted | M2 | FR-11 |

#### TASK-07 — App shell + map workspace + layers panel + inspector

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T07.01 | Freeze UI contracts v1: app context, screen interface, map handle, layer order, provenance attributes; create UI module stubs | frontend | contract | agent-ready · core | pre-event-allowed | M1 | FR-01–FR-03, FR-15, FR-17, NFR-05 |
| T07.02 | Implement site loading (manifest fetch, `?site=` override, lookup maps) | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-01, FR-16 |
| T07.03 | Implement the app shell: hash router, boot sequence, CSP meta tag | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-01, FR-16, NFR-01, NFR-08 |
| T07.04 | Implement the worker client (request ids, latest revision, crash → retry) | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-03, FR-07, NFR-10 |
| T07.05 | Implement SCR-01 Mission Briefing | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-01, FR-15, SCR-01 |
| T07.06 | Implement the map: view, metric scale bar, north arrow, coordinate readout | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-01, SCR-02 |
| T07.07 | Implement tiled raster layers with slope classes that follow the current limits | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-01, FR-02 |
| T07.08 | Implement the SCR-02 workspace layout (top bar, drawers, toolbar, responsive) | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-01, FR-16, NFR-03, SCR-02 |
| T07.09 | Implement SCR-03 Layers panel | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-02, FR-15, FR-16, FR-17, SCR-03 |
| T07.10 | Implement the Curiosity traverse layer | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-17 |
| T07.11 | Implement the POI layer and POI selection | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-04 |
| T07.12 | Implement the point-inspector popover | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-03 |
| T07.13 | Implement `?debug=1` diagnostics | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | NFR-11 |
| T07.14 | Author the demo plan (three POI stops) | story | human | human-required · core | pre-event-allowed | M1 | FR-06, SCR-01 |
| T07.15 | Verify SCR-01, SCR-02, SCR-03: toggles ≤ 300 ms, inspector values match the grid | frontend | verify | human-required · core | pre-event-if-permitted | M2 | FR-02, FR-03, SCR-01, SCR-02, SCR-03 |
| T07.16 | Fallback — start only if projection issues persist: ImageStatic layers | frontend | fallback | agent-ready · core | pre-event-if-permitted | M2 | FR-01, FR-02 |
| T07.17 | Implement the shared map controls (+, −, FIT for planner and ops; EVA full-screen set) (v2) | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-32, FR-02 |
| T07.18 | Implement the Exploration Zone layer: POI stop types on the map (v2, FR-45) | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-45 |

#### TASK-08 — Plan panel + waypoint editing

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T08.01 | Freeze the plan-store contract v1 (state, status, actions, selection) | frontend | contract | agent-ready · core | pre-event-allowed | M2 | FR-05, FR-06 |
| T08.02 | Tests: plan store (revisions, undo, debounce, stale results) | frontend | test | agent-ready · core | pre-event-if-permitted | M3 | FR-05, FR-06 |
| T08.03 | Implement the plan store | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-05, FR-06 |
| T08.04 | Implement the SCR-04 panel and mission-inputs form | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-05, SCR-04 |
| T08.05 | Implement the stops list (reorder buttons, delete, undo) | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-06, FR-09, SCR-04 |
| T08.06 | Implement waypoint markers and placement validation with a snap offer | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-06 |
| T08.07 | Implement Add-stop mode (free placement, `A`, crosshair `Enter`) | frontend | implement | agent-ready · cut-4 | pre-event-if-permitted | M3 | FR-06, NFR-04 |
| T08.08 | Implement desktop drag: waypoints on the map, rows in the stops list | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-06 |
| T08.09 | Implement tablet touch: long-press placement and drag | frontend | implement | agent-ready · cut-4 | pre-event-if-permitted | M3 | FR-06, NFR-03 |
| T08.10 | Fallback — start only if T08.08 is not working at the Day 1 17:30 checkpoint: buttons-only stop move | frontend | fallback | agent-ready · core | pre-event-if-permitted | M3 | FR-06 |
| T08.11 | Verify the 02 §E.3 rules and SCR-04 states in the UI | frontend | verify | human-required · core | pre-event-if-permitted | M3 | FR-05, FR-06, SCR-04 |
| T08.12 | follow-up: haven rule input in the plan panel (v2, FR-39) | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-39 |

#### TASK-09 — Results panel + profile

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T09.01 | Implement the route layer (cased legs, dashed NO_ROUTE line, hazard hatch) | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-07, FR-10 |
| T09.02 | Implement the elevation/slope profile chart | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-08 |
| T09.03 | Implement SCR-05: status banner and metrics row | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-07, FR-09, FR-12, SCR-05 |
| T09.04 | Implement the warnings list with click-to-zoom | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-10 |
| T09.05 | Implement profile ↔ map linking (06 fallback: ship the profile without it) | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-08 |
| T09.06 | Run the M3 walking-skeleton check; decide auto-routing go/no-go in ADR-004 | integration | integrate | human-required · core | pre-event-if-permitted | M3 | FR-07, FR-08, D-04 |
| T09.07 | Verify SCR-05 states against the OK, PARTIAL and OVER_LIMITS fixtures | frontend | verify | human-required · core | pre-event-if-permitted | M3 | FR-07–FR-10, SCR-05 |
| T09.08 | Fallback — start only if T09.06 says no-go: draw legs by hand on the map | frontend | fallback | agent-ready · core | pre-event-if-permitted | M3 | FR-07 |
| T09.09 | follow-up: haven and comm bands in the results panel and profile (v2, FR-39, FR-42) | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-39, FR-42 |

#### TASK-10 — POI detail + Conditions panel

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T10.01 | Implement SCR-06 POI Detail | frontend | implement | agent-ready · core | event-only | M5 | FR-04, SCR-06 |
| T10.02 | Implement SCR-07 Conditions | frontend | implement | agent-ready · core | event-only | M5 | FR-11, FR-12, FR-13, SCR-07 |
| T10.03 | Verify POI images with credits and the daylight warning for a pre-dawn start | frontend | verify | human-required · core | event-only | M5 | FR-04, FR-11, FR-12, SCR-06, SCR-07 |
| T10.04 | follow-up: stop types on the POI detail (v2, FR-45) | frontend | implement | agent-ready · core | event-only | M7 | FR-45, FR-04 |

#### TASK-11 — Briefing card + JSON export

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T11.01 | Tests: plan hash and export (canonical JSON, schema-valid, reproducible) | frontend | test | agent-ready · core | pre-event-if-permitted | M4 | FR-14, NFR-06 |
| T11.02 | Implement the plan hash and PlanExport assembly | frontend | implement | agent-ready · core | pre-event-if-permitted | M4 | FR-14, NFR-06 |
| T11.03 | Implement the SCR-08 layout and print CSS | design | implement | agent-ready · core | pre-event-if-permitted | M4 | FR-14, FR-15, SCR-08 |
| T11.04 | Implement the route map snapshot | frontend | implement | agent-ready · core | pre-event-if-permitted | M4 | FR-14 |
| T11.05 | Verify one-page print in Chrome and plan_hash reproduction | design | verify | human-required · core | pre-event-if-permitted | M4 | FR-14, SCR-08 |
| T11.06 | Fallback — start only if the map snapshot cannot be made to work: static AOI thumbnail with the route as SVG | frontend | fallback | agent-ready · core | pre-event-if-permitted | M4 | FR-14 |
| T11.07 | Implement `PUBLISH_PLAN` from the briefing card to the Hab Core (v2) | frontend | implement | agent-ready · core | pre-event-if-permitted | M4 | FR-14, FR-31 |
| T11.08 | follow-up: the briefing card lists each stop's tasks (v2, FR-50) | frontend | implement | agent-ready · core | pre-event-if-permitted | M4 | FR-50, FR-14 |

#### TASK-12 — Sources & Methods + provenance attributes

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T12.01 | Implement the metric and provenance-chip component | story | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-15, NFR-05 |
| T12.02 | Tests: DOM provenance check across screens | story | test | agent-ready · core | pre-event-if-permitted | M4 | FR-15, NFR-05 |
| T12.03 | Implement SCR-09 Sources & Methods | story | implement | agent-ready · core | pre-event-if-permitted | M4 | FR-15, SCR-09 |
| T12.04 | Write the methods, models and limitations content from 02 §C–§D | story | implement | agent-ready · core | pre-event-allowed | M2 | FR-15 |
| T12.05 | Write DataSource records for the models (Tobler, Apollo 17, Mars24) | story | implement | agent-ready · core | pre-event-allowed | M2 | FR-15, NFR-07 |
| T12.06 | Verify no unlabelled metric on the demo path and every credited source in SCR-09 | story | verify | agent-ready · core | pre-event-if-permitted | M4b | FR-15, NFR-05, SCR-09 |
| T12.07 | follow-up: provenance DOM checks on the v2 role views (SCR-11–SCR-14, SCR-17) | story | test | agent-ready · core | pre-event-if-permitted | M3–M4 | NFR-05, FR-36 |

#### TASK-13 — Visual system + accessibility

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T13.01 | Freeze CSS token and status-class names v1 against 04 §C | design | contract | agent-ready · core | pre-event-allowed | M1 | NFR-04 |
| T13.02 | Self-host Inter and IBM Plex Mono; verify their licences | design | implement | agent-ready · core | pre-event-allowed | M1 | NFR-01, NFR-07 |
| T13.03 | Sketch SCR-02 and SCR-08 wireframes on paper (04 §F) | design | human | human-required · core | pre-event-allowed | M1 | SCR-02, SCR-08 |
| T13.04 | Implement base styles: typography, focus ring, reduced motion | design | implement | agent-ready · core | pre-event-if-permitted | M4 | NFR-04 |
| T13.05 | Implement status icons and patterns | design | implement | agent-ready · core | pre-event-if-permitted | M2 | NFR-04, FR-08, FR-10 |
| T13.06 | Implement keyboard map controls (04 §E) | design | implement | agent-ready · core | pre-event-if-permitted | M4 | NFR-04 |
| T13.07 | follow-up: first-run coach marks | design | implement | agent-ready · cut-4 | pre-event-if-permitted | M4 | — |
| T13.08 | Implement the light theme (U-08) | design | implement | agent-ready · cut-4 | pre-event-if-permitted | M4 | NFR-04, U-08 |
| T13.09 | Verify the axe scan: 0 serious issues | design | verify | agent-ready · core | pre-event-if-permitted | M4 | NFR-04 |
| T13.10 | Verify a keyboard-only run of the core scenario | design | verify | human-required · core | pre-event-if-permitted | M4 | NFR-04 |
| T13.11 | Self-host the outline icon set and verify its licence | design | implement | agent-ready · core | pre-event-allowed | M1 | NFR-01, NFR-07 |
| T13.12 | HUD tokens: contrast ≥ 7 : 1 (v2) | design | implement | agent-ready · core | pre-event-allowed | M2 | FR-33, NFR-04 |

#### TASK-14 — Integration + offline hardening + fault tests

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T14.01 | Integrate dependencies and build wiring (one dependency batch, `make data`) | integration | integrate | agent-ready · core | pre-event-allowed | M1 | NFR-01, NFR-07, NFR-09 |
| T14.02 | Integrate CI and the PR template (subtask id, `check_tasks.py`) | integration | integrate | agent-ready · core | pre-event-allowed | M1 | — |
| T14.03 | Implement boot validation (schema major version, dev-build SHA-256) | integration | implement | agent-ready · core | pre-event-if-permitted | M4 | FR-16, NFR-10 |
| T14.04 | Implement SCR-00 Boot error | integration | implement | agent-ready · core | pre-event-if-permitted | M4 | FR-16, NFR-10, SCR-00 |
| T14.05 | Tests: fault injection (02 §F.1 Recovery) | integration | test | agent-ready · core | pre-event-if-permitted | M4 | FR-16, NFR-10 |
| T14.06 | Verify two clean offline rehearsals of the core scenario | integration | verify | human-required · core | pre-event-if-permitted | M4 | FR-16, NFR-01 |
| T14.07 | Verify NFR-02 timings on the weakest team laptop | integration | verify | human-required · core | pre-event-if-permitted | M4 | NFR-02 |
| T14.08 | Verify the browser/device matrix and cross-browser determinism | integration | verify | human-required · core | pre-event-if-permitted | M4 | NFR-03, NFR-06 |
| T14.09 | Verify release checks: CSP, network log, bundle sizes, `?debug=1` | integration | verify | agent-ready · core | pre-event-if-permitted | M4 | NFR-08, NFR-09, NFR-11 |
| T14.10 | Verify SCR-00 and worker-crash recovery by hand | integration | verify | human-required · core | pre-event-if-permitted | M4 | NFR-10, SCR-00 |
| T14.11 | follow-up: refresh the `CLAUDE.md` command rows after the pipeline entry point lands | integration | integrate | agent-ready · core | pre-event-allowed | M1 | — |

#### TASK-15 — Usability test

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T15.01 | Write the usability-test script (3 non-team users, briefing in ≤ 5 min) | design | human | human-required · core | pre-event-allowed | M3 | PRD §B |
| T15.02 | Run three sessions; record times and issues | design | verify | human-required · core | pre-event-allowed | M3b–M4 | PRD §B |
| T15.03 | Triage the findings into follow-up subtasks | design | human | human-required · core | pre-event-allowed | M3b–M4 | PRD §B |
| T15.04 | follow-up: add the v2 criteria to the usability script (HUD glance, summon, landscape cards) | design | human | human-required · core | pre-event-allowed | M3 | FR-33, FR-40 |

#### TASK-16 — Submission package

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T16.01 | Decide the final product name (D-08); record ADR-008 | story | human | human-required · core | pre-event-allowed | M2 | D-08 |
| T16.02 | spec-change: sync spec status rows and the docs index with the M0–M1 outcomes | integration | integrate | agent-ready · core | pre-event-allowed | M2 | D-01, D-03, U-01–U-05, U-09, U-10, U-12–U-14 |
| T16.03 | Finalize the README: run instructions, data credits, licence | story | implement | agent-ready · core | pre-event-allowed | M8 | NFR-07 |
| T16.04 | Complete the AI-use disclosure | story | human | human-required · core | pre-event-allowed | M8 | — |
| T16.05 | Verify every dataset and image is credited in SCR-09 and the README | story | verify | agent-ready · core | pre-event-allowed | M8 | FR-15, NFR-07 |
| T16.06 | Fill the NASA project page fields; complete the submission checklist | story | human | human-required · core | event-only | M8 | NFR-07 |
| T16.07 | Implement the release-asset fetch route and decide what the public link shows; test the link in a private window | story | human | human-required · core | pre-event-allowed | M2–M8 | NFR-07 |

#### TASK-17 — Videos

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T17.01 | Draft the 240-s and 30-s demo scripts | story | human | human-required · core | pre-event-allowed | M3 | — |
| T17.02 | Record and submit the 240-s video by Day 1 18:30 (dry-run capture first) | story | human | human-required · core | event-only | M6 | — |
| T17.03 | Record and upload the 30-s video by Day 2 09:00 | story | human | human-required · core | event-only | M8 | — |
| T17.04 | Fallback — start only if the live demo fails on camera: cut the 240-s video from the dry-run capture | story | fallback | human-required · core | event-only | M6 | — |

#### TASK-18 — Desirables (only after the freeze criteria are met early)

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T18.01 | follow-up: CRISM layer and bundle re-release (only if T01.04 finds MTRDR coverage) | data | implement | agent-ready · desirable | pre-event-if-permitted | M4b–M7 | FR-18 |
| T18.02 | Build REMS L_s-bin temperature and pressure context from named RDR files | data | implement | agent-ready · desirable | pre-event-if-permitted | M4b–M7 | FR-13 |
| T18.03 | follow-up: seasonal-weather section in SCR-07 | frontend | implement | agent-ready · desirable | pre-event-if-permitted | M4b–M7 | FR-13, SCR-07 |
| T18.04 | follow-up: tests for the planner's illustrative O₂ estimate (02 §D.6) | compute | test | agent-ready · desirable | pre-event-if-permitted | M4b–M7 | FR-19 |
| T18.05 | follow-up: implement the planner's illustrative O₂ estimate | compute | implement | agent-ready · desirable | pre-event-if-permitted | M4b–M7 | FR-19 |
| T18.06 | follow-up: show the O₂ estimate labelled "illustrative" | frontend | implement | agent-ready · desirable | pre-event-if-permitted | M4b–M7 | FR-19 |
| T18.07 | follow-up: save and restore the last plan in browser storage | frontend | implement | agent-ready · desirable | pre-event-if-permitted | M4b–M7 | FR-20 |
| T18.08 | Cache the CRISM and REMS source files before 13 Nov | data | human | human-required · desirable | pre-event-allowed | M2 | FR-13, FR-18 |
| T18.09 | Tests: sky-view factor and refuge dose factor (v2, FR-47) | compute | test | agent-ready · desirable | pre-event-if-permitted | M4b–M7 | FR-47 |
| T18.10 | Implement the sky-view factor (v2, FR-47) | compute | implement | agent-ready · desirable | pre-event-if-permitted | M4b–M7 | FR-47 |
| T18.11 | follow-up: terrain refuge as a contingency option (v2, FR-47) | compute | implement | agent-ready · desirable | pre-event-if-permitted | M4b–M7 | FR-47, FR-44 |
| T18.12 | Implement SCR-16 Earth support view (v2, FR-48) | frontend | implement | agent-ready · desirable | pre-event-if-permitted | M4b–M7 | FR-48 |
| T18.13 | follow-up: dust advisory replay events (v2, FR-49; only if T04.11 found a record) | data | implement | human-required · desirable | pre-event-allowed | M4b–M7 | FR-49 |

FR-21 (space weather, 3D view, multi-site, AI narration) is post-MVP and has no subtask ([01 §C.3](../specs/01_Product_Requirements_Document.md#c4-post-mvp)).

<!-- v2-register:begin -->

#### TASK-05b — Compute v2: haven, rendezvous, viewshed, link graph, Earth delivery, event dose, consumables, contingency

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T05b.01 | Freeze the v2 compute signatures | compute | contract | agent-ready · core | pre-event-allowed | M1 | FR-39, FR-40, FR-42, FR-43, FR-44, NFR-06 |
| T05b.02 | Fixture: synthetic v2 grids | compute | fixture | agent-ready · core | pre-event-allowed | M1 | FR-39, FR-40, FR-42 |
| T05b.03 | Tests: time to haven (02 §D.8 cases) | compute | test | agent-ready · core | pre-event-if-permitted | M1 | FR-39 |
| T05b.04 | Implement haven fields (reverse Dijkstra, bounded Dijkstra, live and planning forms) | compute | implement | agent-ready · core | pre-event-if-permitted | M1 | FR-39, NFR-06 |
| T05b.05 | Verify the full-grid Dijkstra benchmark on the weakest laptop (M1 go/no-go) | compute | verify | agent-ready · core | pre-event-if-permitted | M1 | FR-39, NFR-02 |
| T05b.06 | Tests: rendezvous (02 §D.10 cases) | compute | test | agent-ready · cut-6 | pre-event-if-permitted | M2 | FR-40, NFR-06 |
| T05b.07 | Implement the rendezvous search | compute | implement | agent-ready · cut-6 | pre-event-if-permitted | M2 | FR-40, NFR-06 |
| T05b.08 | Tests: line of sight, curvature and dynamic viewshed (02 §D.11) | compute | test | agent-ready · core | pre-event-if-permitted | M2 | FR-42 |
| T05b.09 | Implement line of sight and the 20 m dynamic viewshed | compute | implement | agent-ready · cut-5 | pre-event-if-permitted | M2 | FR-42 |
| T05b.10 | Tests: surface link graph | compute | test | agent-ready · core | pre-event-if-permitted | M2 | FR-42 |
| T05b.11 | Implement the surface link graph | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-42 |
| T05b.12 | Tests: Earth delivery rule | compute | test | agent-ready · core | pre-event-if-permitted | M2 | FR-43 |
| T05b.13 | Implement the Earth delivery rule | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-43 |
| T05b.14 | Tests: radiation trigger and event dose integral | compute | test | agent-ready · core | pre-event-if-permitted | M2 | FR-38 |
| T05b.15 | Implement the radiation trigger and event dose integral | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-38 |
| T05b.16 | Tests: suit consumables (02 §D.14) | compute | test | agent-ready · core | pre-event-if-permitted | M2 | FR-35 |
| T05b.17 | Implement suit consumables | compute | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-35 |
| T05b.18 | Tests: contingency options and ranking (02 §D.15) | compute | test | agent-ready · core | pre-event-if-permitted | M3 | FR-44 |
| T05b.19 | Implement contingency options and ranking | compute | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-44, NFR-06 |
| T05b.20 | Verify on the real grid: haven, rendezvous and viewshed vs independent checks; NFR-02 timings | compute | verify | agent-ready · core | pre-event-if-permitted | M3 | FR-39, FR-40, FR-42, NFR-02 |
| T05b.21 | Fallback — start only if T05b.05 says no-go: 10 m grid for all fields; `T_hab` precomputed in the pipeline | compute | fallback | agent-ready · core | pre-event-if-permitted | M1–M2 | FR-39, NFR-02 |

#### TASK-20 — Hab Core skeleton: server, protocol v0, LAN spike

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T20.01 | Freeze `packages/protocol` v0: runtime entities, wire messages, permissions | hab-core | contract | agent-ready · core | pre-event-allowed | M1 | FR-30, FR-31 |
| T20.02 | Fixture: mock WebSocket message sequences for the demo beats | hab-core | fixture | agent-ready · core | pre-event-allowed | M1 | FR-30, FR-32, FR-50 |
| T20.03 | Tests: server handshake, fan-out, reconnect and heartbeat | hab-core | test | agent-ready · core | pre-event-if-permitted | M1 | FR-30, FR-31, NFR-13 |
| T20.04 | Implement the HTTP + WebSocket server | hab-core | implement | agent-ready · core | pre-event-if-permitted | M1 | FR-30, FR-31, NFR-08, NFR-12 |
| T20.05 | Tests: web client handshake, ordering, reconnect and link-lost | hab-core | test | agent-ready · core | pre-event-if-permitted | M2 | FR-31, FR-32, NFR-13 |
| T20.06 | Implement the web client for the Hab Core | hab-core | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-31, FR-32, NFR-01, NFR-13 |
| T20.07 | Build the LAN spike page and script | hab-core | implement | agent-ready · core | pre-event-if-permitted | M1 | NFR-12 |
| T20.08 | Verify the LAN spike: 2 phones + 1 laptop ≤ 500 ms on the router (M1 go/no-go) | hab-core | verify | human-required · core | pre-event-if-permitted | M1 | NFR-12, NFR-01 |
| T20.09 | Fallback — start only if T20.08 says no-go: single-laptop multi-window mode | hab-core | fallback | agent-ready · core | pre-event-if-permitted | M1–M3 | FR-30, NFR-01 |
| T20.10 | spec-change: protocol v0 decisions of 7 Nov (reconnect, command dedupe, event `data` by kind, canonical JSON, 02 §E examples) | hab-core | contract | agent-ready · core | pre-event-allowed | M1 | FR-30, FR-31, FR-34, NFR-06, NFR-13 |
| T20.11 | contract-change: protocol v0 event `data` types, `command_ref` and rover-task shape (C13) | hab-core | contract | agent-ready · core | pre-event-allowed | M1 | FR-30, FR-31, FR-41, NFR-06 |
| T20.12 | follow-up: server sends SNAPSHOT, then the missed EVENTs, on reconnect | hab-core | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-30, NFR-13 |
| T20.13 | follow-up: client reconnect within NFR-13 (1 s backoff cap, SNAPSHOT then replay) | hab-core | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-31, FR-32, NFR-13 |

#### TASK-21 — Scenario builder: SPICE, DONKI and RAD tables, `scenario.json`, demo numbers

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T21.01 | Freeze the scenario folder layout and the table formats | data | contract | agent-ready · core | pre-event-allowed | M1 | FR-34, FR-43, FR-37 |
| T21.02 | Download the SPICE kernels for 18–22 May 2024; record exact files (U-18) | data | human | human-required · core | pre-event-allowed | M2 | FR-43, NFR-07 |
| T21.03 | Tests: SPICE table, DONKI extraction and RAD series | data | test | agent-ready · core | pre-event-allowed | M2 | FR-37, FR-43 |
| T21.04 | Implement the SPICE Earth-link table | data | implement | agent-ready · core | pre-event-allowed | M2 | FR-43 |
| T21.05 | Decide the DONKI window (U-44); implement DONKI extraction | data | implement | agent-ready · core | pre-event-allowed | M2 | FR-37 |
| T21.06 | Download the RAD series; verify sol-4190 coverage (U-15) and the product (U-45) | data | human | human-required · core | pre-event-allowed | M2 | FR-37, FR-38, NFR-07 |
| T21.07 | Implement the RAD dose-series extraction | data | implement | agent-ready · core | pre-event-allowed | M2 | FR-37, FR-38 |
| T21.08 | Assemble `scenario.json` with checksums and initial stop tasks | data | implement | agent-ready · core | pre-event-allowed | M2 | FR-34, FR-50, NFR-06 |
| T21.09 | spec-change: choose the EVA start time; write the final demo numbers into 01 §E.1 and the demo script | story | human | human-required · core | pre-event-allowed | M2 | FR-34, FR-37 |
| T21.10 | Verify: the timeline table reproduces source times (M2) | data | verify | agent-ready · core | pre-event-allowed | M2 | FR-37, FR-43 |
| T21.11 | Fixture: real-scenario excerpt for engine tests | data | fixture | agent-ready · core | pre-event-if-permitted | M2 | FR-38, NFR-06 |
| T21.12 | Build the demo `PlanExport` headlessly from the demo plan stops | compute | implement | agent-ready · core | pre-event-allowed | M2 | FR-34, NFR-06 |
| T21.13 | Fallback — start only if T21.06 finds no sol-4190 series: digitised dose curve | data | fallback | human-required · core | pre-event-allowed | M2 | FR-37 |
| T21.14 | Fallback — start only if T21.02 cannot get the kernels: fixed light time for the date | data | fallback | agent-ready · core | pre-event-allowed | M2 | FR-43 |
| T21.15 | Derive the demo timing numbers from the committed tables | hab-core | implement | agent-ready · core | pre-event-allowed | M2 | FR-34, FR-37, FR-38, FR-43 |

#### TASK-22 — Simulation engine: clock, crew motion, consumables, alerts, event log, replay

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T22.01 | Freeze engine interfaces; create the engine-module stubs | hab-core | contract | agent-ready · core | pre-event-allowed | M1 | FR-34, NFR-06 |
| T22.02 | Fixture: fake scenario with a straight-line route and a stepped dose curve | hab-core | fixture | agent-ready · core | pre-event-allowed | M1 | FR-34, NFR-14 |
| T22.03 | Tests: mission clock | hab-core | test | agent-ready · core | pre-event-if-permitted | M2 | FR-34, NFR-06 |
| T22.04 | Implement the mission clock | hab-core | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-34, NFR-06 |
| T22.05 | Tests: reducer, event log, `log_hash`, snapshots and determinism | hab-core | test | agent-ready · core | pre-event-if-permitted | M2 | FR-34, NFR-06, NFR-10, NFR-14 |
| T22.06 | Implement the reducer | hab-core | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-34, NFR-06 |
| T22.07 | Implement the append-only event log, `log_hash` and snapshots | hab-core | implement | agent-ready · core | pre-event-if-permitted | M2 | NFR-06, NFR-10 |
| T22.08 | Tests: tick — crew motion, dwell, consumables, dose and alert order | hab-core | test | agent-ready · core | pre-event-if-permitted | M2 | FR-35, FR-37, FR-38 |
| T22.09 | Implement tick: crew motion, dwell, consumables and dose | hab-core | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-35, NFR-06 |
| T22.10 | Implement alert evaluation: radiation, consumables, buddy distance | hab-core | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-37, FR-38 |
| T22.11 | Implement the scenario loader and its checks | hab-core | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-34, NFR-10 |
| T22.12 | Implement the session manager: load, commands, persistence, resume | hab-core | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-30, FR-34, NFR-10 |
| T22.13 | Implement headless replay and the CLI (`make replay`, `make hab`) | hab-core | implement | agent-ready · core | pre-event-if-permitted | M3 | NFR-14 |
| T22.14 | Verify: two runs give the same hash; 60× full run; tick cost (M3) | hab-core | verify | agent-ready · core | pre-event-if-permitted | M3 | NFR-02, NFR-06, NFR-14 |
| T22.15 | Fallback — start only if consumables slip past M3: O₂ only | hab-core | fallback | agent-ready · core | pre-event-if-permitted | M3 | FR-35 |
| T22.16 | Implement the conditions feed values in the engine (FR-36) | hab-core | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-36 |
| T22.17 | follow-up: fake-scenario `plan_hash` with RFC 8785 canonical JSON | hab-core | fixture | agent-ready · core | pre-event-allowed | M2 | FR-34, NFR-06 |

#### TASK-23 — Safety ops in the Hab Core: commands, haven per tick, summon and rendezvous, contingency options, abort

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T23.01 | Tests: command validation and rejections | hab-core | test | agent-ready · core | pre-event-if-permitted | M2 | FR-31 |
| T23.02 | Implement command validation and dispatch | hab-core | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-31, NFR-06 |
| T23.03 | Implement haven per tick and `HAVEN_TIME_EXCEEDED` | compute | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-39 |
| T23.04 | Tests: summon, rendezvous, vehicle motion and sheltering | hab-core | test | agent-ready · core | pre-event-if-permitted | M2 | FR-40 |
| T23.05 | Implement summon, rendezvous dispatch and vehicle motion | hab-core | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-40, NFR-06 |
| T23.06 | Tests: contingency options, approval and abort | hab-core | test | agent-ready · core | pre-event-if-permitted | M2 | FR-44 |
| T23.07 | Implement contingency options, `APPROVE_OPTION` and `ABORT` | hab-core | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-44, NFR-06 |
| T23.08 | Verify: killer demo steps 0:30–1:10 run headless (M3) | hab-core | verify | agent-ready · core | pre-event-if-permitted | M3 | FR-38, FR-40, FR-44 |
| T23.09 | Fallback — start only if exact rendezvous fails by M3 or cut 6 is called: drive to the nearest vehicle-passable cell | hab-core | fallback | agent-ready · core | pre-event-if-permitted | M3 | FR-40 |

#### TASK-24 — EVA client and HUD: SCR-12 tablet, SCR-13 HUD, SCR-14 options sheet, SCR-18 link lost, full-screen map

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T24.01 | Freeze the EVA view model and component props | frontend | contract | agent-ready · core | pre-event-allowed | M1 | FR-32, FR-33, NFR-05 |
| T24.02 | Tests: EVA view model on the mock fixtures | frontend | test | agent-ready · core | pre-event-if-permitted | M2 | FR-32, NFR-05 |
| T24.03 | Implement the EVA view model | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-32, NFR-05 |
| T24.04 | Implement SCR-12 EVA tablet layout with fixed geography | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-32, NFR-04, NFR-05 |
| T24.05 | Implement hold-to-confirm and wire SUMMON, ABORT and TASK ROVER | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-32, FR-40, FR-44 |
| T24.06 | Implement SCR-14 options sheet (EVA) | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-44, NFR-05 |
| T24.07 | Implement SCR-18 hab-link-lost overlay with cached, stale-labelled values | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-32, NFR-13 |
| T24.08 | Implement SCR-13 HUD | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-33, NFR-04 |
| T24.09 | Implement the full-screen EVA map with its controls | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-32 |
| T24.10 | Tests: EVA DOM tests (fixed geography, targets, hold-to-confirm, HUD, link lost, full-screen map) | frontend | test | agent-ready · core | pre-event-if-permitted | M2 | FR-32, FR-33, NFR-04 |
| T24.11 | Verify on phones: ≤ 2 taps + confirm, link-lost, glance check, device matrix (M3–M4) | frontend | verify | human-required · core | pre-event-if-permitted | M3b–M4 | FR-32, FR-33, NFR-03 |
| T24.12 | Fallback — start only if SCR-12 is not usable by M3b: HUD only, no map | frontend | fallback | agent-ready · core | pre-event-if-permitted | M3b | FR-32, FR-33 |

#### TASK-25 — Ops console: SCR-11 with the shared map, alerts, options approval, clock control, SCR-10 join

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T25.01 | Implement the SCR-11 layout: crew and vehicle cards, metadata strip, slots | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-30, FR-31, NFR-04, NFR-05 |
| T25.02 | Implement the ops map layers: crew, vehicles, coverage, haven bands | frontend | implement | agent-ready · core | pre-event-if-permitted | M2 | FR-30, FR-39, FR-42 |
| T25.03 | Implement the alert stack with acknowledgement | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-31, FR-37, FR-38 |
| T25.04 | Implement the ops options panel with `APPROVE_OPTION` | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-44 |
| T25.05 | Implement clock control and scenario load | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-34 |
| T25.06 | Implement SCR-10 join / role select | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-31 |
| T25.07 | Tests: ops and join DOM tests | frontend | test | agent-ready · core | pre-event-if-permitted | M2 | FR-31, FR-34, FR-44, NFR-04 |
| T25.08 | Verify: ops runs the whole demo without a terminal (M3b–M4) | frontend | verify | human-required · core | pre-event-if-permitted | M3b–M4 | FR-30, FR-34 |
| T25.09 | Fallback — start only if clock control is not ready by M3: keyboard shortcuts | frontend | fallback | agent-ready · core | pre-event-if-permitted | M3 | FR-34 |
| T25.10 | Implement the ops conditions panel and the EVA conditions strip values (FR-36) | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-36, NFR-05 |

#### TASK-26 — Links: surface link graph and `LINK_STATE`, comm-shadow warnings, Earth link widget and delayed queue

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T26.01 | Implement the link graph per tick, link events and `COMM_SHADOW` on the remaining route | compute | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-42 |
| T26.02 | follow-up: send `LINK_STATE` to the suit's device; queue its commands while unlinked | compute | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-42, FR-32 |
| T26.03 | Tests: Earth messages, forecasts and blackout in the engine | compute | test | agent-ready · core | pre-event-if-permitted | M3 | FR-43, FR-37 |
| T26.04 | Implement Earth messages and forecasts in the engine | compute | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-43 |
| T26.05 | Implement the Earth link widget on ops | compute | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-43, NFR-05 |
| T26.06 | Tests: link graph per tick and comm-shadow warnings | compute | test | agent-ready · core | pre-event-if-permitted | M3 | FR-42 |
| T26.07 | Verify: the demo shadow appears and clears; the forecast arrives at the computed time | compute | verify | agent-ready · core | pre-event-if-permitted | M3–M4 | FR-42, FR-43 |
| T26.08 | Fallback — start only if cut 5 is called: static hab coverage and a fixed delay | compute | fallback | agent-ready · core | pre-event-if-permitted | M3 | FR-42, FR-43 |

#### TASK-27 — Event log view, post-EVA report, replay mode for GitHub Pages

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T27.01 | follow-up: report builder and `GET /api/report` | frontend | implement | agent-ready · core | pre-event-if-permitted | M3–M4 | FR-46, FR-50 |
| T27.02 | Tests: report values equal the counts reduced from the log | frontend | test | agent-ready · core | pre-event-if-permitted | M3 | FR-46, FR-50 |
| T27.03 | Implement SCR-17 post-EVA report (print, ≤ 2 pages) | frontend | implement | agent-ready · core | event-only | M7 | FR-46 |
| T27.04 | Implement the event log view on ops | frontend | implement | agent-ready · core | pre-event-if-permitted | M4 | FR-46 |
| T27.05 | Implement replay mode for GitHub Pages (`#/replay`, recorded log, no Hab Core) | frontend | implement | agent-ready · core | event-only | M7 | FR-34, FR-46 |
| T27.06 | Verify: report ≤ 2 pages; the Pages link replays the recorded log | frontend | verify | human-required · core | event-only | M7 | FR-46, FR-34 |
| T27.07 | Fallback — start only if SCR-17 is not ready by M7: report = printed log table | frontend | fallback | agent-ready · core | event-only | M7 | FR-46 |

#### TASK-28 — Network kit and rehearsal: router, static IP, QR join, device matrix, venue checklist

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T28.01 | Set up the travel router: SSID, WPA2, no WAN, fixed address for the Hab Core laptop (U-21) | integration | human | human-required · core | pre-event-allowed | M1 | NFR-01, NFR-08 |
| T28.02 | follow-up: join QR endpoint `/api/join-qr` | integration | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-31, NFR-01 |
| T28.03 | Device matrix: Android Chrome, iOS Safari, laptops | integration | verify | human-required · core | pre-event-allowed | M3–M4 | NFR-03 |
| T28.04 | follow-up: write the venue checklist and pack list | integration | human | human-required · core | pre-event-allowed | M4b | NFR-01 |
| T28.05 | Verify network faults: Wi-Fi toggle, Hab Core kill and restart, single-laptop mode | integration | verify | human-required · core | pre-event-if-permitted | M4 | NFR-10, NFR-13 |

#### TASK-29 — Robotic rover tasking: SCOUT, CARRY, RELAY, RETURN

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T29.01 | Tests: `TASK_ROVER` handler, queue, battery and relay | compute | test | agent-ready · core | pre-event-if-permitted | M3 | FR-41, FR-42 |
| T29.02 | Implement the `TASK_ROVER` handler and queue | compute | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-41 |
| T29.03 | Implement rover motion, battery and the relay node | compute | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-41, FR-42 |
| T29.04 | Implement SCR-15 rover tasking on the map | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-41 |
| T29.05 | Implement the rover queue display (ETA and battery) | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-41, NFR-05 |
| T29.06 | Verify: RELAY closes the demo shadow; queue shows ETA and battery | compute | verify | agent-ready · core | pre-event-if-permitted | M3–M4 | FR-41, FR-42 |
| T29.07 | Fallback — start only if cut 2 is called: RELAY only | compute | fallback | agent-ready · core | pre-event-if-permitted | M3 | FR-41 |

#### TASK-30 — Score-sheet single points: challenge named, repo public, page drafted, AI use current

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T30.01 | Name the challenge on the project page and in the README; draft the page; decide when the repo goes public | story | human | human-required · core | pre-event-allowed | M0 | NFR-07 |
| T30.02 | Keep `docs/AI_USE.md` current (weekly sweep) | story | human | human-required · core | pre-event-allowed | M0–M8 | NFR-07 |
| T30.03 | Verify the three single points and record the evidence | story | verify | human-required · core | pre-event-allowed | M8 | NFR-07 |

#### TASK-31 — Stop task list (FR-50): protocol, engine, EVA list, ops progress, task text

| ID | Subtask | Lane | Type | Tag | Window | M | Reqs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T31.01 | Contract: FR-50 types, scenario schema field and the 6 Nov UI stubs | hab-core | contract | agent-ready · core | pre-event-allowed | M1 | FR-50 |
| T31.02 | Write the task text for each stop of the demo plan (U-58) | story | human | human-required · core | pre-event-allowed | M2 | FR-50, FR-45 |
| T31.03 | Tests: stop task commands, events and engine behaviour | hab-core | test | agent-ready · core | pre-event-if-permitted | M2 | FR-50, NFR-06 |
| T31.04 | Implement the task engine: commands, seeding, DROPPED on revision, auto-complete | hab-core | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-50, NFR-06 |
| T31.05 | Implement the EVA task list and TASKS button | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-50, NFR-04 |
| T31.06 | Implement ops task progress and the add-task popover | frontend | implement | agent-ready · core | pre-event-if-permitted | M3 | FR-50 |
| T31.07 | Tests: EVA list and ops progress DOM tests | frontend | test | agent-ready · core | pre-event-if-permitted | M2 | FR-50, NFR-04 |
| T31.08 | Verify: tap on tablet shows on ops ≤ 500 ms; abort drops open tasks; report counts match the log | integration | verify | human-required · core | pre-event-if-permitted | M3b–M4 | FR-50, NFR-12 |
| T31.09 | Fallback — start only if TASK-31 runs late at M3: ops view-only, no `ADD_STOP_TASK` | frontend | fallback | agent-ready · core | pre-event-if-permitted | M3 | FR-50 |

<!-- v2-register:end -->

## b. Lanes

Each subtask's *Lane* (the register column) groups related work for the checker's hour totals; the subtask's **Owner** field names the person. Roles R1–R6 come from [06 §A.1](../specs/06_High_Level_Implementation_Plan.md#a1-roles), people from [06 §A.2](../specs/06_High_Level_Implementation_Plan.md#a2-assignment-by-person-proposed-2026-11-05--sign-off-at-the-6-nov-kickoff) (*Proposed* until the kickoff signs it off). The role lead reviews and merges the PRs of their group, whoever (person or agent) does the work.

| Lane | Role · people | Scope |
| --- | --- | --- |
| `data` | R1 Data & GIS · Obidit Islam (Mishkat Ahmed Khan supports) | TASK-01, TASK-03, data side of TASK-04, TASK-21 and TASK-18; site-config records; scenario tables |
| `compute` | R2 Compute · Mishkat Ahmed Khan (Anjim Hossain supports) | TASK-05, TASK-05b, TASK-06, compute side of TASK-23, TASK-26, TASK-29 and TASK-18 |
| `hab-core` | R4 Hab Core · Sadman Shaharier Mahim (Anjim Hossain supports) | TASK-20, TASK-22, Hab Core side of TASK-23, TASK-26, TASK-29 and TASK-31; `packages/protocol` jointly with R2 |
| `frontend` | R3 Map & Planner UI · Saba Atharique; R5 EVA & Ops UI · Ridita Alam | TASK-02, TASK-07–TASK-11 (R3); TASK-24, TASK-25, TASK-27, UI side of TASK-29 and TASK-31 (R5, with R3 on the shared map) |
| `design` | R6 design system · Ridita Alam | TASK-13, TASK-15, SCR-08 layout and print |
| `story` | R6 Science, Story & Design · Sadman (demo story, script, task text), Obidit (submission, project page) | TASK-00, TASK-12, TASK-16, TASK-17, TASK-30, POI curation, demo plan, script half of TASK-21 |
| `integration` | Integration lead · Anjim Hossain | Shared files, dependency batch, CI, walking-skeleton check, spec sync, offline hardening (TASK-14), network kit (TASK-28) |

The M4 dry runs and TASK-14 are all-hands on 10–12 Nov (06 §A.2). TASK-18 has no owner: whoever has finished their own tasks takes an item, only after M3 passes.

## c. Path ownership

### c.1 Rules

1. **One owner per path.** The owner is the only subtask that writes the path's content. A row ending in `/` covers every file inside unless a more specific row exists.
2. **Stubs.** A contract subtask may create a throwing stub, or change a stub signature, in a path owned by someone else. It writes `path (stub → Txx.yy)` in its *Owns* field; the owner soft-depends on it and takes over after it merges.
3. **Writers after the owner.** Only a `fallback` subtask (`path (replaces Txx.yy)`) or a subtask titled `contract-change:`, `spec-change:` or `follow-up:` (`path (after Txx.yy)`, with a hard dependency on that owner) may write an owned path later. Never two at once.
4. **Append-only paths** follow the rule in their row: add lines or files only at the stated place; never edit, reorder or delete other subtasks' content. On a rebase conflict keep both sides.
5. **Unlisted paths are read-only** for this plan. Writing one needs a new subtask and an edit to this table first (§h).
6. Every subtask also appends one row to the `docs/AI_USE.md` log when AI helped (row c.6).
7. A module owns its sibling stylesheet with the same base name (`metric.ts` → `metric.css`), as the screens do; no separate row is needed.

### c.2 Docs

| Path | Owner | Rule |
| --- | --- | --- |
| `docs/tasks/_coordination.md`, `docs/tasks/TASK-*.md` | this plan | Change-process only (§h); T15.03 and later triage may append subtasks at the end of a task file |
| `docs/tasks/README.md` | this plan | Claims: one PR edits only the *Claimed by* cell of one row |
| `docs/specs/**` | — | `spec-change:` subtasks only: T16.02, T20.10, T21.09 (01 §E.1 only), T01.06 (fallback). One open spec-change PR at a time |
| `docs/README.md` | T16.02 | — |
| `docs/contracts/tile-grid.md` | T02.01 | Contract (§d) |
| `docs/ops/rules.md` | T00.03 | — |
| `docs/ops/team.md` | T00.06 | — |
| `docs/ops/feasibility.md` | T01.05 | — |
| `docs/ops/feasibility/dem-label.md` | T01.01 | — |
| `docs/ops/feasibility/aoi.md` | T01.02 | — |
| `docs/ops/feasibility/dem-quality.md` | T01.03 | — |
| `docs/ops/feasibility/coverage.md` | T01.04 | — |
| `docs/ops/credits.md` | T04.06 | — |
| `docs/ops/ti-threshold.md` | T04.07 | — |
| `docs/ops/usability-script.md` | T15.01 | — |
| `docs/ops/demo-script.md` | T17.01 | — |
| `docs/ops/submission-checklist.md` | T16.06 | — |
| `docs/ops/hosting.md` | T16.07 | — |
| `docs/ops/verification-log.md` | every `verify` subtask | Append-only: one `## Txx.yy — <title>` section per verify subtask, at the end; video links from T17.02/T17.03 go here too |
| `docs/decisions/ADR-001-site-selection.md` | T01.05 | — |
| `docs/decisions/ADR-002-static-app-no-backend.md` | T05.29 | — |
| `docs/decisions/ADR-003-openlayers-mars-projection.md` | T02.05 | — |
| `docs/decisions/ADR-004-least-time-routing.md` | T09.06 | — |
| `docs/decisions/ADR-008-product-name.md` | T16.01 | New; mirrors D-08 |
| `docs/design/wireframes/` | T13.03 | — |
| `docs/AI_USE.md` | T16.04 (header, Tools, Prompts location) | Log table append-only for every subtask: one row per PR, at the end |
| `README.md` | T16.03 | — |
| `CLAUDE.md`, `AGENTS.md` | T00.04 | T14.11 follows up on the `CLAUDE.md` §4 command rows |

### c.3 Pipeline

| Path | Owner | Rule |
| --- | --- | --- |
| `pipeline/sites/README.md` | T03.01 | Contract (§d, C5) |
| `pipeline/sites/gale_boxwork/site.json` | T03.16 | — |
| `pipeline/sites/gale_boxwork/sources/` | T03.17 (DEM, ortho, THEMIS), T04.01 (traverse), T06.10 (RAD), T12.05 (models), T18.01 (CRISM), T18.02 (REMS) | Append-only by file: one `<source_id>.json` per record, owned by its creator |
| `pipeline/sites/gale_boxwork/layers/` | T03.17 (ortho, hillshade, elevation, slope, thermal inertia, hazard flags), T04.01 (traverse), T04.04 (POIs), T18.01 (CRISM) | Append-only by file: one `<layer_id>.json` per record |
| `pipeline/sites/gale_boxwork/env_constants/` | T06.10 | Append-only by file |
| `pipeline/sites/gale_boxwork/known_offsets/` | T03.20 (`elevation.json`), T04.08 (`traverse.json`) | Append-only by file |
| `pipeline/sites/gale_boxwork/pois/` | T04.04 (POIs 1–4), T04.05 (POIs 5–8) | Append-only by file: one `<poi_id>.json` per POI |
| `pipeline/sites/gale_boxwork/hazards.geojson`, `pipeline/sites/gale_boxwork/low_res_dem.geojson` | T03.18 | — |
| `pipeline/sites/gale_boxwork/ti_threshold.json` | T04.07 | Absent by the 2026-11-10 U-03 decision (no defensible threshold); it stays unwritten |
| `pipeline/src/marswalk_pipeline/config.py`, `acquire.py` | T03.07 | — |
| `pipeline/src/marswalk_pipeline/clip_reproject.py` | T03.08 | — |
| `pipeline/src/marswalk_pipeline/derive.py` | T03.09 | T03.01 moves the `hazard_flags` stub out (stub → T03.10) |
| `pipeline/src/marswalk_pipeline/flags.py` | T03.10 | New; stub by T03.01 |
| `pipeline/src/marswalk_pipeline/grid.py` | T03.11 | — |
| `pipeline/src/marswalk_pipeline/tiles.py` | T03.12 | — |
| `pipeline/src/marswalk_pipeline/manifest.py` | T03.13 | — |
| `pipeline/src/marswalk_pipeline/validate_manifest.py` | T03.14 | — |
| `pipeline/src/marswalk_pipeline/__main__.py` | T03.15 | New |
| `pipeline/src/marswalk_pipeline/vectors.py` | T04.03 | — |
| `pipeline/src/marswalk_pipeline/static_images.py` | T03.25 | New; fallback |
| `pipeline/src/marswalk_pipeline/sun_table.py` | T06.11 | New; fallback |
| `pipeline/src/marswalk_pipeline/crism.py` | T18.01 | New; desirable |
| `pipeline/src/marswalk_pipeline/rems.py` | T18.02 | New; desirable |
| `pipeline/src/marswalk_pipeline/__init__.py` | — | Read-only |
| `pipeline/tests/test_clip_reproject.py` | T03.03 | — |
| `pipeline/tests/test_derive.py` | T03.04 | Covers `derive.py` and `flags.py` |
| `pipeline/tests/test_grid.py` | T03.05 | — |
| `pipeline/tests/test_manifest.py` | T03.06 | — |
| `pipeline/tests/test_vectors.py` | T04.02 | New |
| `pipeline/tests/fixtures/make_mock_site.py` | T03.02 | New |
| `pipeline/tests/fixtures/make_sample_cells.py` | T03.21 | New |
| `pipeline/tests/fixtures/make_mars24_reference.py` | T06.02 | New |
| `pipeline/sources.lock.json` | T03.19 | Written by the pipeline run |
| `pipeline/work/` | — | Git-ignored local workspace; never committed |
| `server/` | T05.31 | New; fallback only |

### c.4 Web app

| Path | Owner | Rule |
| --- | --- | --- |
| `packages/protocol/src/schema.ts` | T03.01 | Contract (§d, C1) |
| `packages/protocol/src/worker.ts` | T05.01 | Contract (§d, C6) |
| `packages/compute/src/grid.ts` | T05.16 | — |
| `packages/compute/src/sampling.ts` | T05.17 | Stub edit by T05.01 (inputs for lat/lon) |
| `packages/compute/src/route.ts` | T05.18 | T05.01 moves `snapToPassable` and `toLeg` out (stub → T05.18) |
| `packages/compute/src/noRoute.ts` | T05.19 | New; stub by T05.01 |
| `packages/compute/src/snap.ts` | T05.20 | New; stub by T05.01 |
| `packages/compute/src/leg.ts` | T05.21 | New; stub by T05.01 |
| `packages/compute/src/timeModel.ts` | T05.22 | — |
| `packages/compute/src/walkback.ts` | T05.23 | — |
| `packages/compute/src/warnings.ts` | T05.24 | Stub edit by T05.01 (access to grid flags) |
| `packages/compute/src/validate.ts` | T05.25 | New; stub by T05.01; also imported by the UI (T08.04) |
| `packages/compute/src/handler.ts` | T05.26 | New; stub by T05.01 (moves `handleMessage` out of `worker.ts`); T05.32 completes it (after T05.26) |
| `apps/web/src/worker/planWorker.ts` | T05.27 | Stub edit by T05.01 |
| `packages/compute/src/manualLeg.ts` | T05.30 | New; fallback |
| `packages/compute/src/sunTable.json` | T06.11 | New; fallback (cut 5) |
| `packages/compute/src/mars24.ts` | T06.06 | T06.01 moves the solar functions out (stub → T06.06) |
| `packages/compute/src/sun.ts` | T06.07 | New; stub by T06.01 |
| `packages/compute/src/radiation.ts` | T06.08 | — |
| `packages/compute/src/conditions.ts` | T06.09 | New; stub by T06.01 (contract C8); T06.11 may replace it |
| `packages/compute/src/consumables.ts` | T05b.17 | Suit consumables (FR-35, core since v2); T18.05 follows up with the planner's illustrative estimate (FR-19) |
| `apps/web/src/state/planStore.ts` | T08.03 | Interfaces frozen by T08.01 (stub → T08.03, contract C11); T18.07 follows up |
| `apps/web/src/state/persist.ts` | T18.07 | New; desirable |
| `apps/web/src/ui/context.ts` | T07.01 | New; contract C10 |
| `apps/web/src/boot/loadSite.ts` | T07.02 | New; stub by T07.01 |
| `apps/web/src/boot/validateSite.ts` | T14.03 | New; stub by T07.01 |
| `apps/web/src/ui/router.ts`, `apps/web/src/main.ts`, `apps/web/index.html` | T07.03 | Route registry: all four hash routes registered by T07.03; screens never edit it |
| `apps/web/src/ui/workerClient.ts` | T07.04 | New; stub by T07.01 |
| `apps/web/src/ui/debug.ts` | T07.13 | New; stub by T07.01 |
| `apps/web/src/ui/demoPlan.json` | T07.14 | New |
| `apps/web/src/ui/screens/scr00BootError.tsx` (+ `.css`) | T14.04 | — |
| `apps/web/src/ui/screens/scr01MissionBriefing.tsx` (+ `.css`) | T07.05 | — |
| `apps/web/src/ui/screens/scr02MapWorkspace.tsx` (+ `.css`) | T07.08 | T13.07 follows up (coach marks) |
| `apps/web/src/ui/screens/scr03LayersPanel.tsx` (+ `.css`) | T07.09 | — |
| `apps/web/src/ui/screens/scr04PlanPanel.tsx` (+ `.css`) | T08.04 | — |
| `apps/web/src/ui/screens/scr05RouteResults.tsx` (+ `.css`) | T09.03 | T18.06 follows up |
| `apps/web/src/ui/screens/scr06PoiDetail.tsx` (+ `.css`) | T10.01 | — |
| `apps/web/src/ui/screens/scr07Conditions.tsx` (+ `.css`) | T10.02 | T18.03 follows up |
| `apps/web/src/ui/screens/scr08BriefingCard.tsx` (+ `.css`) | T11.03 | T18.06 follows up |
| `apps/web/src/ui/screens/scr09SourcesMethods.tsx` (+ `.css`) | T12.03 | — |
| `apps/web/src/ui/map/projection.ts` | T02.02 | New |
| `apps/web/src/ui/map/imageStatic.ts` | T02.06 | New; fallback |
| `apps/web/src/ui/map/createMap.ts` | T07.06 | New; stub by T07.01 |
| `apps/web/src/ui/map/rasterLayers.ts` | T07.07 | New; stub by T07.01; T07.16 may replace it |
| `apps/web/src/ui/map/traverseLayer.ts` | T07.10 | New; stub by T07.01 |
| `apps/web/src/ui/map/poiLayer.ts` | T07.11 | New; stub by T07.01 |
| `apps/web/src/ui/map/inspector.ts` | T07.12 | New; stub by T07.01 |
| `apps/web/src/ui/map/waypointLayer.ts` | T08.06 | New; stub by T07.01 |
| `apps/web/src/ui/map/addStopMode.ts` | T08.07 | New; stub by T07.01 |
| `apps/web/src/ui/map/waypointDrag.ts` | T08.08 | New; stub by T07.01; T08.10 may replace it |
| `apps/web/src/ui/map/touchInput.ts` | T08.09 | New; stub by T07.01 |
| `apps/web/src/ui/map/routeLayer.ts` | T09.01 | New; stub by T07.01 |
| `apps/web/src/ui/map/drawLegs.ts` | T09.08 | New; fallback |
| `apps/web/src/ui/map/keyboard.ts` | T13.06 | New; stub by T07.01 |
| `apps/web/src/ui/plan/stopsList.ts` | T08.05 | New; stub by T07.01 |
| `apps/web/src/ui/results/profileChart.ts` | T09.02 | New; stub by T07.01 (SCR-05 and SCR-08 both use it) |
| `apps/web/src/ui/results/warningsList.ts` | T09.04 | New; stub by T07.01 |
| `apps/web/src/ui/results/profileLink.ts` | T09.05 | New; stub by T07.01 |
| `apps/web/src/ui/briefing/mapSnapshot.ts` | T11.04 | New; stub by T07.01; T11.06 may replace it |
| `apps/web/src/export/planExport.ts` | T11.02 | New; stub by T07.01 |
| `apps/web/src/ui/components/metric.ts` | T12.01 | New; stub by T07.01 |
| `apps/web/src/ui/components/statusIcon.ts` | T13.05 | New; stub by T07.01 |
| `apps/web/src/ui/coachMarks.ts` | T13.07 | New; desirable path for cut 2 |
| `apps/web/src/ui/content/methods.json` | T12.04 | New |
| `apps/web/src/ui/styles/tokens.css` | T13.01 | Contract C12; after T13.01, append-only: add new custom properties at the end of the matching block with a 04 §C reference; renames need a contract-change |
| `apps/web/src/ui/styles/base.css` | T13.04 | New; stub by T13.01 (imported from `tokens.css`) |
| `apps/web/src/ui/styles/patterns.css` | T13.05 | New; stub by T13.01 |
| `apps/web/src/ui/styles/light.css` | T13.08 | New; stub by T13.01 |
| `apps/web/public/fonts/` | T13.02 | New |
| `apps/web/public/icons/` | T13.11 | New |
| `data/sites/mock_site/` | T03.02 | Fixture F4; needs the `.gitignore` negation (c.6) |
| `data/sites/gale_boxwork/README.md` | T03.01 | Static-asset layout doc |
| `data/sites/gale_boxwork/` (everything else) | T03.19 | Generated by the pipeline run; binaries stay git-ignored; T18.01 follows up |
| `apps/web/spike/` | T02.03 | New; throwaway spike page |

### c.5 Web tests and fixtures

| Path | Owner | Rule |
| --- | --- | --- |
| `packages/compute/tests/grid.test.ts` | T05.05 | — |
| `packages/compute/tests/sampling.test.ts` | T05.06 | — |
| `packages/compute/tests/route.test.ts` | T05.07 | Moves the `snapToPassable` todos to `snap.test.ts` |
| `packages/compute/tests/noRoute.test.ts` | T05.08 | New |
| `packages/compute/tests/snap.test.ts` | T05.09 | New |
| `packages/compute/tests/leg.test.ts` | T05.10 | New |
| `packages/compute/tests/timeModel.test.ts` | T05.11 | — |
| `packages/compute/tests/walkback.test.ts` | T05.12 | — |
| `packages/compute/tests/warnings.test.ts` | T05.13 | — |
| `packages/compute/tests/validate.test.ts` | T05.14 | New |
| `packages/compute/tests/worker.test.ts` | T05.15 | New |
| `packages/compute/tests/realGrid.test.ts` | T05.28 | New; skips when the real bundle is absent |
| `packages/compute/tests/mars24.test.ts`, `packages/compute/tests/sun.test.ts` | T06.03 | `sun.test.ts` is new |
| `packages/compute/tests/radiation.test.ts` | T06.04 | — |
| `packages/compute/tests/conditions.test.ts` | T06.05 | New |
| `packages/compute/tests/consumables.test.ts` | T18.04 | New; desirable |
| `apps/web/tests/state/planStore.test.ts` | T08.02 | New |
| `apps/web/tests/export/planExport.test.ts` | T11.01 | New |
| `apps/web/tests/ui/projection.test.ts` | T02.02 | New |
| `apps/web/tests/ui/provenance.test.ts` | T12.02 | New |
| `apps/web/tests/integration/faults.test.ts` | T14.05 | New |
| `apps/web/tests/fixtures/grids.ts` | T05.02 | Fixture F1 |
| `apps/web/tests/fixtures/plan-results/` | T05.03 | Fixture F2 |
| `apps/web/tests/fixtures/mockWorker.ts` | T05.04 | Fixture F3 |
| `apps/web/tests/fixtures/real/sample_cells.json` | T03.21 | Fixture F5 |
| `apps/web/tests/fixtures/mars24-reference.json` | T06.02 | Fixture F6 |
| `apps/web/tests/fixtures/README.md` | every fixture subtask | Append-only: one `## Fn — <name>` section per fixture with its value sources (§e) |

### c.6 Shared and build files

| Path | Owner | Rule |
| --- | --- | --- |
| `package.json`, `package-lock.json`, `apps/web/package.json` | T14.01 | Single integration owner: every planned dependency lands in one batch; a later need is a new integration subtask |
| `apps/hab-core/package.json` | — | Append-only for `scripts`: any subtask may add one line for its own CLI at the end of `scripts` (T21.15 adds `demo-numbers`); the trailing comma on the preceding entry is allowed; on a rebase conflict keep both lines (§c.1.4). Dependency changes need an integration subtask, as in the T14.01 row |
| `pipeline/pyproject.toml`, `pipeline/environment.yml` | T14.01 | Same |
| `Makefile` | T14.01 | Same (wires `make data` to `python -m marswalk_pipeline`) |
| `apps/web/vite.config.ts`, `apps/web/tsconfig.json` | T14.01 | Same; DOM tests choose their environment per file, so no config edit is expected |
| `.github/` | T14.02 | — |
| `.gitignore` | — | Append-only: add lines at the end under `# Txx.yy`; never edit existing lines (T03.02 adds the `mock_site` negation) |
| `docs/AI_USE.md` log | every subtask | See c.2 |
| `scripts/check_tasks.py` | this plan | Phase 3 of the planning task |
| `scripts/check_links.py`, `LICENSE`, `.editorconfig`, `.gitattributes`, `.markdownlint.jsonc`, `.claude/`, `.specify/` | — | Read-only |

<!-- v2-paths:begin -->

### c.7 v2 paths (generated from the task files on 2026-11-06)

Paths created or taken over by the v2 subtasks. Append-only paths are listed in §c.2–§c.6 and keep their rules (`docs/ops/verification-log.md`, `docs/AI_USE.md`, `pipeline/sites/gale_boxwork/layers/`, `tokens.css`).

| Path | Owner | Rule |
| --- | --- | --- |
| `apps/hab-core/scripts/build-demo-plan.ts` | T21.12 | — |
| `apps/hab-core/scripts/demo-numbers.ts` | T21.15 | — |
| `apps/hab-core/spike/` | T20.07 | — |
| `apps/hab-core/src/cli.ts` | T22.13 | — |
| `apps/hab-core/src/commands.ts` | T23.02 | — |
| `apps/hab-core/src/engine/README.md` | T22.01 | — |
| `apps/hab-core/src/engine/alerts.ts` | T22.10 | stub by T22.01 |
| `apps/hab-core/src/engine/clock.ts` | T22.04 | — |
| `apps/hab-core/src/engine/conditions.ts` | T22.16 | stub by T22.01 |
| `apps/hab-core/src/engine/contingencyOps.ts` | T23.07 | stub by T22.01 |
| `apps/hab-core/src/engine/earth.ts` | T26.04 | stub by T22.01 |
| `apps/hab-core/src/engine/haven.ts` | T23.03 | stub by T22.01 |
| `apps/hab-core/src/engine/links.ts` | T26.01 | stub by T22.01; fallback T26.08 may replace it |
| `apps/hab-core/src/engine/reducer.ts` | T22.06 | stub by T22.01 |
| `apps/hab-core/src/engine/rovers.ts` | T29.03 | stub by T22.01 |
| `apps/hab-core/src/engine/tasks.ts` | T31.04 | stub by T22.01 |
| `apps/hab-core/src/engine/tick.ts` | T22.09 | stub by T22.01; fallback T22.15 may replace it |
| `apps/hab-core/src/engine/vehicles.ts` | T23.05 | stub by T22.01; fallback T23.09 may replace it |
| `apps/hab-core/src/localMode.ts` | T20.09 | — |
| `apps/hab-core/src/log.ts` | T22.07 | stub by T22.01 |
| `apps/hab-core/src/replay.ts` | T22.13 | — |
| `apps/hab-core/src/report.ts` | T27.01 | — |
| `apps/hab-core/src/rover.ts` | T29.02 | fallback T29.07 may replace it |
| `apps/hab-core/src/scenario.ts` | T22.11 | stub by T22.01 |
| `apps/hab-core/src/server.ts` | T20.04 | T20.12, T26.02, T27.01, T28.02 follow up (one at a time) |
| `apps/hab-core/src/session.ts` | T22.12 | stub by T22.01 |
| `apps/hab-core/tests/__snapshots__/demoNumbers.alert.snap` | T21.15 | Written by Vitest (`toMatchFileSnapshot`); committed so a rebuilt table shows as a diff |
| `apps/hab-core/tests/__snapshots__/demoNumbers.eva.snap` | T21.15 | Written by Vitest once `plan.json` exists |
| `apps/hab-core/tests/clock.test.ts` | T22.03 | — |
| `apps/hab-core/tests/commands.test.ts` | T23.01 | — |
| `apps/hab-core/tests/conditions.test.ts` | T22.16 | — |
| `apps/hab-core/tests/contingencyOps.test.ts` | T23.06 | — |
| `apps/hab-core/tests/demoNumbers.test.ts` | T21.15 | — |
| `apps/hab-core/tests/earth.test.ts` | T26.03 | — |
| `apps/hab-core/tests/engine.test.ts` | T22.05 | — |
| `apps/hab-core/tests/fixtures/fake-scenario/` | T22.02 | T22.17 follows up |
| `apps/hab-core/tests/fixtures/storm-excerpt/` | T21.11 | — |
| `apps/hab-core/tests/havenTick.test.ts` | T23.03 | — |
| `apps/hab-core/tests/killerDemo.test.ts` | T23.08 | — |
| `apps/hab-core/tests/links.test.ts` | T26.06 | — |
| `apps/hab-core/tests/report.test.ts` | T27.02 | — |
| `apps/hab-core/tests/rover.test.ts` | T29.01 | — |
| `apps/hab-core/tests/scenario.test.ts` | T22.11 | — |
| `apps/hab-core/tests/server.test.ts` | T20.03 | T20.12 follows up |
| `apps/hab-core/tests/stopTasks.test.ts` | T31.03 | — |
| `apps/hab-core/tests/summon.test.ts` | T23.04 | — |
| `apps/hab-core/tests/tick.test.ts` | T22.08 | — |
| `apps/web/src/net/habClient.ts` | T20.06 | T20.13 follows up |
| `apps/web/src/net/replaySource.ts` | T27.05 | — |
| `apps/web/src/ui/briefing/publishPlan.ts` | T11.07 | — |
| `apps/web/src/ui/eva/HoldToConfirm.tsx` | T24.05 | — |
| `apps/web/src/ui/eva/viewModel.ts` | T24.03 | stub by T24.01 |
| `apps/web/src/ui/map/FullScreenMap.tsx` | T24.09 | stub by T31.01 |
| `apps/web/src/ui/map/MapControls.tsx` | T07.17 | stub by T31.01 |
| `apps/web/src/ui/map/ezLayer.ts` | T07.18 | — |
| `apps/web/src/ui/map/opsLayers.ts` | T25.02 | — |
| `apps/web/src/ui/ops/AddTaskPopover.tsx` | T31.06 | fallback T31.09 may replace it |
| `apps/web/src/ui/ops/AlertStack.tsx` | T25.03 | — |
| `apps/web/src/ui/ops/ClockControl.tsx` | T25.05 | fallback T25.09 may replace it |
| `apps/web/src/ui/ops/ConditionsPanel.tsx` | T25.10 | — |
| `apps/web/src/ui/ops/EarthLinkWidget.tsx` | T26.05 | — |
| `apps/web/src/ui/ops/EventLog.tsx` | T27.04 | — |
| `apps/web/src/ui/ops/OptionsPanel.tsx` | T25.04 | — |
| `apps/web/src/ui/ops/RoverQueue.tsx` | T29.05 | — |
| `apps/web/src/ui/ops/TaskProgress.tsx` | T31.06 | stub by T31.01 |
| `apps/web/src/ui/screens/scr04PlanPanel.tsx` | T08.04 | T08.12 follow up (one at a time) |
| `apps/web/src/ui/screens/scr05RouteResults.tsx` | T09.03 | T09.09, T18.06 follow up (one at a time) |
| `apps/web/src/ui/screens/scr06PoiDetail.tsx` | T10.01 | T10.04 follow up (one at a time) |
| `apps/web/src/ui/screens/scr08BriefingCard.tsx` | T11.03 | T11.08, T18.06 follow up (one at a time) |
| `apps/web/src/ui/screens/scr10Join.tsx` | T25.06 | — |
| `apps/web/src/ui/screens/scr11OpsConsole.tsx` | T25.01 | — |
| `apps/web/src/ui/screens/scr12/StopTaskList.tsx` | T31.05 | stub by T31.01 |
| `apps/web/src/ui/screens/scr12/TasksButton.tsx` | T31.05 | — |
| `apps/web/src/ui/screens/scr12EvaTablet.tsx` | T24.04 | fallback T24.12 may replace it |
| `apps/web/src/ui/screens/scr13Hud.tsx` | T24.08 | — |
| `apps/web/src/ui/screens/scr14Options.tsx` | T24.06 | — |
| `apps/web/src/ui/screens/scr15RoverTask.tsx` | T29.04 | — |
| `apps/web/src/ui/screens/scr16EarthView.tsx` | T18.12 | — |
| `apps/web/src/ui/screens/scr17PostEvaReport.tsx` | T27.03 | fallback T27.07 may replace it |
| `apps/web/src/ui/screens/scr18HabLinkLost.tsx` | T24.07 | — |
| `apps/web/tests/fixtures/ws/` | T20.02 | T20.11 follows up |
| `apps/web/tests/net/habClient.test.ts` | T20.05 | T20.13 follows up |
| `apps/web/tests/ui/eva.test.ts` | T24.10 | — |
| `apps/web/tests/ui/evaViewModel.test.ts` | T24.02 | — |
| `apps/web/tests/ui/map/fullScreenMap.test.ts` | T24.10 | — |
| `apps/web/tests/ui/ops.test.ts` | T25.07 | — |
| `apps/web/tests/ui/provenance.test.ts` | T12.02 | T12.07 follow up (one at a time) |
| `apps/web/tests/ui/stopTasks.test.ts` | T31.07 | — |
| `docs/ops/data-downloads.md` | T21.02 | — |
| `docs/ops/demo-kit.md` | T28.01 | T28.04 follow up (one at a time) |
| `docs/ops/demo-script.md` | T17.01 | T21.09 follow up (one at a time) |
| `docs/ops/dust-record.md` | T04.11 | — |
| `docs/ops/exploration-zone.md` | T04.10 | — |
| `docs/ops/feasibility/hab-site.md` | T01.07 | — |
| `docs/ops/rad-series.md` | T21.06 | — |
| `docs/ops/usability-script.md` | T15.01 | T15.04 follow up (one at a time) |
| `packages/compute/bench/haven.bench.ts` | T05b.05 | — |
| `packages/compute/src/consumables.ts` | T05b.17 | stub by T05b.01; T18.05 follow up (one at a time) |
| `packages/compute/src/contingency.ts` | T05b.19 | stub by T05b.01; T18.11 follow up (one at a time) |
| `packages/compute/src/earthLink.ts` | T05b.13 | stub by T05b.01 |
| `packages/compute/src/eventDose.ts` | T05b.15 | stub by T05b.01 |
| `packages/compute/src/haven.ts` | T05b.04 | stub by T05b.01; fallback T05b.21 may replace it |
| `packages/compute/src/index.ts` | T05b.01 | — |
| `packages/compute/src/linkGraph.ts` | T05b.11 | stub by T05b.01 |
| `packages/compute/src/rendezvous.ts` | T05b.07 | stub by T05b.01 |
| `packages/compute/src/skyView.ts` | T18.10 | — |
| `packages/compute/src/viewshed.ts` | T05b.09 | stub by T05b.01 |
| `packages/compute/tests/consumables.test.ts` | T05b.16 | T18.04 follow up (one at a time) |
| `packages/compute/tests/contingency.test.ts` | T05b.18 | — |
| `packages/compute/tests/earthLink.test.ts` | T05b.12 | — |
| `packages/compute/tests/eventDose.test.ts` | T05b.14 | — |
| `packages/compute/tests/fixtures/v2grids.ts` | T05b.02 | — |
| `packages/compute/tests/haven.test.ts` | T05b.03 | — |
| `packages/compute/tests/linkGraph.test.ts` | T05b.10 | — |
| `packages/compute/tests/realGridV2.test.ts` | T05b.20 | — |
| `packages/compute/tests/rendezvous.test.ts` | T05b.06 | — |
| `packages/compute/tests/skyView.test.ts` | T18.09 | — |
| `packages/compute/tests/viewshed.test.ts` | T05b.08 | — |
| `packages/protocol/src/index.ts` | T20.01 | — |
| `packages/protocol/src/runtime.ts` | T20.01 | stub by T31.01; T20.11 contract-change |
| `packages/protocol/src/ws.ts` | T20.01 | stub by T31.01; T20.11 contract-change |
| `pipeline/cache/donki/` | T21.05 | — |
| `pipeline/spice/kernels.lock.json` | T21.02 | — |
| `pipeline/src/marswalk_pipeline/comm_grid.py` | T03.29 | — |
| `pipeline/src/marswalk_pipeline/donki.py` | T21.05 | — |
| `pipeline/src/marswalk_pipeline/rad.py` | T21.07 | — |
| `pipeline/src/marswalk_pipeline/scenario_build.py` | T21.08 | — |
| `pipeline/src/marswalk_pipeline/spice_tables.py` | T21.04 | — |
| `pipeline/tests/check_v2_independent.py` | T05b.20 | — |
| `pipeline/tests/test_comm_grid.py` | T03.28 | — |
| `pipeline/tests/test_donki.py` | T21.03 | — |
| `pipeline/tests/test_rad.py` | T21.03 | — |
| `pipeline/tests/test_spice_tables.py` | T21.03 | — |
| `scenarios/storm-sol4190/README.md` | T21.01 | — |
| `scenarios/storm-sol4190/dose_series.json` | T21.07 | fallback T21.13 may replace it |
| `scenarios/storm-sol4190/earth_link.json` | T21.04 | fallback T21.14 may replace it |
| `scenarios/storm-sol4190/param_sets/` | T21.01 | — |
| `scenarios/storm-sol4190/plan.json` | T21.12 | — |
| `scenarios/storm-sol4190/scenario.json` | T21.08 | T18.13 follow up (one at a time) |
| `scenarios/storm-sol4190/stop_tasks.json` | T31.02 | — |
| `schemas/dose-series.schema.json` | T21.01 | — |
| `schemas/earth-link.schema.json` | T21.01 | — |
| `schemas/scenario.schema.json` | T31.01 | — |

<!-- v2-paths:end -->

## d. Contracts registry

Lanes code against these interfaces, not against each other's implementations. All start at **v1**.

| ID | Contract | Path(s) | Owner | Freeze | Main consumers | Decisions the owner must record |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | TypeScript mirror of every 05 entity | `packages/protocol/src/schema.ts` | T03.01 | End of M0 (5 Nov) | All web subtasks | Required vs optional PlanResult/Leg/Warning fields (existing `TODO(decision)`), including whether `conditions`, `radiation` and `stops_timeline` may be absent for the M3 slice |
| C2 | Site-manifest JSON Schema | `schemas/site-manifest.schema.json` | T03.01 | End of M0 | T03.13, T03.14, T03.02, T07.02, T14.03 | Legend structure (05 leaves it open) |
| C3 | Plan-export JSON Schema | `schemas/plan-export.schema.json` | T03.01 | End of M0 | T11.01, T11.02, T05.03 | U-11 (store profile arrays in the export) |
| C4 | Routing-grid binary layout | Spec: 05 §C RoutingGrid and Flag bits, 05 §E.1. Mirrors: `pipeline/src/marswalk_pipeline/config.py` constants, `FLAG_BITS` in `schema.ts`, `LoadedGrid` in `packages/compute/src/grid.ts` | T03.01 (freeze by review; no write to `config.py` or `grid.ts`) | End of M0 | T03.10, T03.11, T03.02, T05.02, T05.16 | Code never hard-codes 5 m: it reads `cell_m` (T03.24 fallback) |
| C5 | Site-config input layout (one JSON file per DataSource, Layer, EnvConstant, POI, offset) | `pipeline/sites/README.md` | T03.01 | End of M0 | T03.13, T03.16, T03.17, T04.*, T06.10, T12.05 | Layer ids; where the TI threshold lives (05 has no field) |
| C6 | Worker message protocol (02 §E.2) | `packages/protocol/src/worker.ts` | T05.01 | End of M0 (Track P) or M2 (Track S) | T05.04, T05.15, T05.26, T05.27, T07.04, T08.03 | How the worker receives the grid (02 §E.2 defines no load message); cancellation mechanism (02 §E.2 needs the search to yield) |
| C7 | Compute module layout and exported signatures | Stubs in `packages/compute/src/` (`noRoute.ts`, `snap.ts`, `leg.ts`, `validate.ts`, `handler.ts`) | T05.01 | Same as C6 | Compute lane; T08.04 (`validate.ts`) | Projection maths in the worker (proj4 or hand-written eqc, 02 §B) |
| C8 | Conditions interface (timeline LTST, sun elevation, conditions, radiation) | `packages/compute/src/conditions.ts`, `packages/compute/src/sun.ts` stubs | T06.01 | M2 | T05.32, T06.05, T06.09, T06.11 | — |
| C9 | Tile grid and tile pixel encoding | `docs/contracts/tile-grid.md` | T02.01 | v1 at M0; v1.1 after T02.04 if the spike changes it; frozen end of M1 (10 Nov) | T02.02, T02.03, T03.02, T03.12, T07.07 | z/x/y addressing and y direction (`TODO(verify)` in the spike); data-encoded slope tiles, because 04 §C.1 slope classes follow the current limits |
| C10 | UI app context: screen renderer signature, worker-client interface, map handle, fixed layer order, provenance attribute names; UI module stubs | `apps/web/src/ui/context.ts` + stubs listed in c.4 | T07.01 | M2 | All frontend, design and story code | Where traverse and waypoints sit in the FR-02 layer order; attribute name for the source id (NFR-05) |
| C11 | Plan-store state and events | Interfaces in `apps/web/src/state/planStore.ts` | T08.01 | M2 | T07.04, T08.*, T09.*, T10.*, T11.*, T13.06 | Selection and hover shape for map ↔ list ↔ profile linking |
| C12 | CSS token names and status classes | `apps/web/src/ui/styles/tokens.css` | T13.01 | M2 | All UI CSS | Pattern class names for ok / caution / blocked / unknown |
| C13 *(v2)* | Protocol v0: runtime entities, wire messages, permissions (05 §C.2, 02 §E.4, §E.6) | `packages/protocol/src/runtime.ts`, `packages/protocol/src/ws.ts` | T20.01 (FR-50 parts by T31.01); T20.11 completes v0 with the 7 Nov decisions (T20.10) | M1 (Sat 7 Nov, 06 §D.3) | Every v2 subtask | Command body shape (flat or `args`); `TaskRoverArgs`; the accepted-rover-task event kind |
| C14 *(v2)* | Engine interfaces and engine-module split (`reduce`, `tick`, session, log; one module per concern) | `apps/hab-core/src/engine/`, `scenario.ts`, `session.ts`, `log.ts` | T22.01 | M1 | TASK-22, TASK-23, TASK-26, TASK-29, TASK-31 | Module call order inside `tick` (02 §D.14) |
| C15 *(v2)* | Compute v2 signatures (haven, rendezvous, viewshed, link graph, Earth delivery, event dose, consumables, contingency) | `packages/compute/src/` v2 modules | T05b.01 | M1 | TASK-22, TASK-23, TASK-26, TASK-29, T09.09 | Which spec constants are code constants and which come from ParamSets |
| C16 *(v2)* | Scenario tables: `dose_series.json`, `earth_link.json` formats; scenario folder layout | `schemas/dose-series.schema.json`, `schemas/earth-link.schema.json`, `scenarios/storm-sol4190/README.md` | T21.01 | M1 | T05b.12, T05b.14, T21.*, T22.11 | Sample step of the dose series (`TODO(verify)` on download) |
| C17 *(v2)* | EVA view model (selectors from the client store) | `apps/web/src/ui/eva/viewModel.ts` | T24.01 | M1 | TASK-24, T31.05 | — |
| C18 *(v2)* | FR-50 stop tasks: `StopTask`, task commands and events, `scenario.json` `stop_tasks` | `packages/protocol/src/runtime.ts` (part), `schemas/scenario.schema.json` | T31.01 (**done** 6 Nov) | M1 | TASK-31, T21.08, T11.08, T27.01 | U-46, U-52, U-56, U-58, undo |

**Change process.**

1. Append `Txx.yy — contract-change: <what>` to the owning task (Type `contract`).
2. If the contract mirrors a spec (05, 02 §E), the spec changes first, through a `spec-change:` subtask.
3. List every consumer subtask and path to update, from the *Main consumers* column and §c.
4. Bump the version here: v1.1 for additive changes, v2 for breaking ones. Fixtures built for the old version (§e) are updated in the same PR or by listed `follow-up:` subtasks.
5. One open contract-change per contract at a time; consumers rebase after it merges.

## e. Fixtures and mocks

These let consumers start before the real upstream output exists.

| ID | Fixture | Path | Owner | Matches | Window | Consumers |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Synthetic routing grids: 10° plane, wall with one gap, uniform 20° ramp, NaN island, hazard wall, variant without TI (02 §D.2 validation cases) | `apps/web/tests/fixtures/grids.ts` | T05.02 | C1, C4 v1 | pre-event-if-permitted | T05.05–T05.15, T05.30 |
| F2 | Canned PLAN_RESULT messages: OK, PARTIAL (NO_ROUTE leg), OVER_LIMITS | `apps/web/tests/fixtures/plan-results/{ok,partial,over-limits}.json` | T05.03 | C1, C6 v1 | pre-event-allowed | T05.04, T09.*, T10.*, T11.*, T12.02 |
| F3 | Mock worker: answers SAMPLE_POINT and COMPUTE_PLAN from F2, selectable in dev builds | `apps/web/tests/fixtures/mockWorker.ts` | T05.04 | C6 v1 + F2 | pre-event-if-permitted | T07.04, T07.12, T08.*, T09.* |
| F4 | Mock site bundle `mock_site`: manifest, placeholder tiles, tiny grid, sample POI and traverse GeoJSON | `data/sites/mock_site/` (generator `pipeline/tests/fixtures/make_mock_site.py`) | T03.02 | C1, C2, C4, C9 v1 | pre-event-allowed | T02.03, T07.*, T08.06, T10.01, T14.05 |
| F5 | Real-grid sample cells (10 cells read with `rasterio`) | `apps/web/tests/fixtures/real/sample_cells.json` (generator `pipeline/tests/fixtures/make_sample_cells.py`) | T03.21 | C4 + bundle v1 `data_version` | pre-event-allowed | T05.28, T07.15 |
| F6 | Mars24 reference values from `marstime` (≥ 3 timestamps at the site) | `apps/web/tests/fixtures/mars24-reference.json` (generator `pipeline/tests/fixtures/make_mars24_reference.py`) | T06.02 | C8 | pre-event-allowed | T06.03 |
| F7 *(v2)* | Mock WebSocket message sequences for the demo beats (02 §E.6 example values or placeholders) | `apps/web/tests/fixtures/ws/` | T20.02 | C13 | pre-event-allowed | T20.05, T24.*, T25.*, T31.07, T12.07 |
| F8 *(v2)* | Fake scenario: straight-line route, stepped synthetic dose curve (06 §D.2) | `apps/hab-core/tests/fixtures/fake-scenario/` | T22.02 | C14, C16 | pre-event-allowed | T22.*, T23.*, T26.*, T27.02, T29.01, T31.03 |
| F9 *(v2)* | Synthetic v2 grids for the 02 §D.8, §D.10, §D.11 validation cases | `packages/compute/tests/fixtures/v2grids.ts` | T05b.02 | C15 | pre-event-allowed | T05b.03–T05b.18 |
| F10 *(v2)* | Real-scenario excerpt (dose onset hour, matching Earth-link rows) cut by a script | `apps/hab-core/tests/fixtures/storm-excerpt/` | T21.11 | C16 | pre-event-if-permitted | engine tests that need real shapes |

**Fixture value rule** (`CLAUDE.md` §2, ADR-006: no LLM-generated numbers in code, data or docs). Fixtures are synthetic test inputs, never science. Every value is either:

1. copied verbatim from a spec example, with the section cited (02 §E.2 PLAN_RESULT, 05 §F.1 manifest, 05 §F.2 POI, 05 §F.3 plan export);
2. a spec range limit or default (02 §E.3, 05 §C) — e.g. the OVER_LIMITS fixture keeps the 05 §F.3 result and sets `walkback_limit_km` to the 02 §E.3 minimum, 0.5, so its `max_walkback_km` of 3.06 exceeds it;
3. produced by a committed deterministic generator; or
4. a typed placeholder (`0`, `""`, `[]`, `null`) or a declared synthetic shape parameter (grid size, ramp angle taken from the spec case).

Expected test outputs come only from spec reference values. Each fixture's `README.md` section lists the source of every non-placeholder value. Mock data never ships as real data: it lives under `site_id` `mock_site`, and the demo never loads it.

## f. Dependency graph

Nodes are contracts, fixtures, decisions and groups of subtasks. Solid arrows are **hard** dependencies (the real output is needed); dotted arrows are **soft** (only a contract or fixture is needed — it must be merged, but nothing needs to be implemented). Red-outlined nodes are the critical path of [06 §D.1](../specs/06_High_Level_Implementation_Plan.md#d1-critical-path): TASK-01 → TASK-03 → TASK-05 / TASK-07 → TASK-09 → TASK-11 → TASK-14 → TASK-17, and TASK-01 → TASK-02 → TASK-07. Intra-task edges and the global phase gate (§a.2) are left to the task files.

```mermaid
flowchart LR
  subgraph L_story["story + integration"]
    T00_03["T00.03 track recorded"]
    T00_04["T00.04 phase gate"]
    T14_01["T14.01 dependency batch"]
    T16_02["T16.02 spec sync"]
    T12_05["T12.05 model sources"]
    T07_14["T07.14 demo plan"]
    T12_U["T12.01, T12.03 metric component, SCR-09"]
    T14_V["T14.03–T14.10 hardening + verify"]
    T15_02["T15.02 usability"]
    T16_06["T16.06 submission"]
    T17_02["T17.02 240-s video"]
    T17_03["T17.03 30-s video"]
  end
  subgraph L_data["data"]
    T01_03["T01.03 DEM quality + feature"]
    T01_05["T01.05 D-01 + AOI"]
    T03_01["T03.01 C1–C5"]
    T03_02["T03.02 F4 mock site"]
    T03_P["T03.07–T03.11, T03.13–T03.15 pipeline code"]
    T03_12["T03.12 tiler"]
    T03_16["T03.16 site record"]
    T04_IN["T04.01, T04.03–T04.05 traverse, POIs, images"]
    T03_20["T03.20 DEM offset"]
    T04_08["T04.08 traverse offset"]
    T03_19["T03.19 bundle v1"]
    T03_21["T03.21 F5 sample cells"]
  end
  subgraph L_compute["compute"]
    T05_01["T05.01 C6–C7"]
    T05_02["T05.02 F1 grids"]
    T05_03["T05.03 F2 results"]
    T05_04["T05.04 F3 mock worker"]
    T05_T["T05.05–T05.15 tests"]
    T05_I["T05.16–T05.27 implementation"]
    T05_32["T05.32 full PLAN_RESULT"]
    T05_28["T05.28 real-grid check"]
    T05_29["T05.29 D-02"]
    T06_01["T06.01 C8"]
    T06_02["T06.02 F6 marstime"]
    T06_10["T06.10 RAD records"]
    T06_I["T06.03–T06.09 Mars24, radiation, conditions"]
  end
  subgraph L_front["frontend + design"]
    T02_01["T02.01 C9 tile grid"]
    T02_02["T02.02–T02.03 projection + spike"]
    T02_04["T02.04 2 % scale check"]
    T02_05["T02.05 D-03"]
    T07_01["T07.01 C10 + UI stubs"]
    T08_01["T08.01 C11"]
    T13_01["T13.01 C12"]
    T07_S["T07.02–T07.08 shell + map"]
    T08_03["T08.03 plan store"]
    T09_C["T09.01–T09.02 route layer + profile"]
    T09_06["T09.06 M3 go/no-go"]
    T09_R["T09.03–T09.05 results panel"]
    T10_U["T10.01–T10.02 POI + conditions"]
    T11_U["T11.02–T11.04 briefing + export"]
    T11_05["T11.05 print check"]
  end

  T00_03 --> T00_04
  T00_03 --> T16_02
  T01_03 --> T01_05
  T01_05 --> T03_16
  T01_05 --> T03_P
  T01_05 --> T16_02
  T03_P --> T03_12
  T03_P --> T03_20
  T03_P --> T04_08
  T04_IN --> T04_08
  T03_16 --> T03_19
  T03_P --> T03_19
  T03_12 --> T03_19
  T04_IN --> T03_19
  T03_20 --> T03_19
  T04_08 --> T03_19
  T06_10 --> T03_19
  T12_05 --> T03_19
  T03_19 --> T03_21
  T01_03 --> T02_04
  T03_12 --> T02_04
  T02_02 --> T02_04
  T02_04 --> T02_05
  T02_02 --> T07_S
  T04_IN --> T07_14
  T05_T --> T05_I
  T05_I --> T05_32
  T05_I --> T05_28
  T03_19 --> T05_28
  T03_21 --> T05_28
  T05_28 --> T05_29
  T14_01 --> T06_02
  T14_01 --> T09_C
  T03_19 --> T09_06
  T05_I --> T09_06
  T07_S --> T09_06
  T08_03 --> T09_06
  T09_C --> T09_06
  T09_C --> T11_U
  T11_U --> T11_05
  T05_32 --> T11_05
  T07_S --> T14_V
  T09_R --> T14_V
  T10_U --> T14_V
  T11_05 --> T14_V
  T12_U --> T14_V
  T09_R --> T17_02
  T10_U --> T17_02
  T11_U --> T17_02
  T12_U --> T17_02
  T14_V --> T15_02
  T14_V --> T17_03
  T12_U --> T16_06
  T14_V --> T16_06

  T03_01 -.-> T03_P
  T03_01 -.-> T03_02
  T03_01 -.-> T05_02
  T03_01 -.-> T05_03
  T02_01 -.-> T03_02
  T02_01 -.-> T03_12
  T02_01 -.-> T02_02
  T03_02 -.-> T02_02
  T03_02 -.-> T07_S
  T05_01 -.-> T05_04
  T05_01 -.-> T05_T
  T05_01 -.-> T07_S
  T05_02 -.-> T05_T
  T05_03 -.-> T05_04
  T05_03 -.-> T09_R
  T05_03 -.-> T10_U
  T05_03 -.-> T11_U
  T05_04 -.-> T07_S
  T05_04 -.-> T08_03
  T05_04 -.-> T09_C
  T06_01 -.-> T05_32
  T06_01 -.-> T06_I
  T06_02 -.-> T06_I
  T07_01 -.-> T07_S
  T07_01 -.-> T08_03
  T07_01 -.-> T09_C
  T07_01 -.-> T09_R
  T07_01 -.-> T10_U
  T07_01 -.-> T11_U
  T07_01 -.-> T12_U
  T08_01 -.-> T08_03
  T08_01 -.-> T09_R
  T08_01 -.-> T10_U
  T08_01 -.-> T11_U
  T13_01 -.-> T07_S
  T13_01 -.-> T09_R
  T13_01 -.-> T11_U
  T13_01 -.-> T12_U

  classDef crit stroke:#B42318,stroke-width:3px
  class T01_03,T01_05,T03_P,T03_16,T03_12,T03_19,T02_02,T07_S,T05_I,T09_C,T09_06,T11_U,T11_05,T14_V,T17_03 crit
```

**Cross-task hard dependencies** (each is unavoidable; the reason is in the task file):

| From → To | Why the real output is needed |
| --- | --- |
| T01.05 → T03.07, T03.16 | The working projection and the site record need the chosen AOI and site |
| T01.03 → T02.04 | The 2 % check needs the DEM-measured reference feature |
| T03.12 → T02.04 | The 2 % check runs on real AOI tiles |
| T03.08 → T04.07, T04.08 | The TI histogram and the alignment check need the clipped AOI rasters |
| T04.01, T04.03–T04.05, T04.08 → T03.19 | Manifest checksums must cover the vectors and images (05 §E.3) |
| T06.10, T12.05 → T03.19 | The manifest carries the EnvConstants and model DataSources |
| T04.04 → T07.14 | The demo plan references curated POI ids |
| T03.19, T03.21 → T05.28 | The benchmark and the rasterio comparison run on the real grid |
| T02.02 → T07.06 | The map is built on the projection module |
| T03.19, T05.16–T05.18, T05.21, T05.22, T05.26, T05.27, T07.02–T07.08, T08.03, T09.01–T09.02 → T09.06 | The M3 check is the real end-to-end slice (only the M3 compute subset of §g) |
| T09.06 → T05.30, T09.08 | The fallbacks start only on a no-go |
| T09.01–T09.02 → T11.03 | The briefing card renders the real profile (06: TASK-11 after TASK-09) |
| T05.32 → T11.05 | "Reloading the export reproduces identical metrics" needs the real worker |
| T06.09 → T10.03 | The pre-dawn daylight warning needs real conditions |
| T14.01 → T06.02, T09.02, T08.02, T11.01, T12.02, T13.09, T14.05, T03.14 | `marstime`, the chart library, the DOM test environment and the JSON-Schema validator arrive in the dependency batch (each choice is a `TODO(decision)` in T14.01) |
| Screens → T12.06, T13.09, T13.10, T14.03–T14.10 | Verification runs on the integrated app (06: TASK-14 after TASK-07…TASK-12) |
| T14.06 → T15.02 | 06: TASK-15 after TASK-14 |
| T12.03 → T16.03–T16.06 | 06: TASK-16 after TASK-12 |
| Demo path → T17.02; freeze → T17.03; freeze criteria → T18.* | 06 §B M4, M6 and TASK-18 gate |
| T00.03, T01.05 → T16.02 | The sync applies only recorded outcomes; D-03 joins only if ADR-003 already records it (under Track S the spike decides on Day 1) |
| T01.05 → T04.01, T04.04, T04.05 | The cached traverse range and the POIs depend on the chosen AOI and site |
| T01.04 → T03.17, T18.01, T18.08 | Source records and CRISM work need the coverage result |
| T02.06, T03.25 → T07.16 | The ImageStatic fallback builds on both |
| T03.19, T05.32, T08.04, T12.01 → T10.03 | The check needs real images, real `DARKNESS` warnings, the start-time input and labelled values |
| T07.06 → T11.04 | The snapshot needs a rendered map |
| T07.03 → T11.05 | The print check runs on the `#/briefing` route of the integrated app |
| T12.01 → T09.07 | SCR-05 values need provenance labels (FR-15) |
| T05.25 → T08.11 | The UI check needs the real validation rules |
| T05.32 → T14.05 | Two fault cases run the real worker |
| T03.19 → T12.06 | SCR-09 must list the real bundle's sources |
| T14.03–T14.10 → T16.06 | The page and checklist record the verified build |
| T16.01 → T17.02, T17.03 | The product name is said and shown on camera |
| T00.04, T03.15, T14.01 → T14.11 | Follow-up on `CLAUDE.md` once the pipeline entry and `make data` exist |
| T07.08 → T13.07; T03.19 → T18.01; T10.02 → T18.03; T09.03, T11.03 → T18.06; T08.03, T11.02 → T18.07 | `follow-up:` subtasks wait for the owner of the path they edit (§c.1 rule 3); T18.07 also stores the export T11.02 assembles |

<!-- v2-edges:begin -->

**v2 cross-task hard dependencies** (generated from the task files on 2026-11-06; the reason is the text after `hard:` in the subtask):

| From → To | Why the real output is needed |
| --- | --- |
| T01.05 → T04.10 | AOI and site |
| T01.07 → T03.29 | hab position |
| T01.07 → T21.04 | hab position for elevations |
| T01.07 → T21.08 | start positions |
| T03.19 → T05b.20 | real grid |
| T03.19 → T21.12 | real grid |
| T03.29 → T05b.20 | `comm_hab` grid |
| T04.04 → T31.02 | POI objectives |
| T04.11 → T18.13 | record found |
| T05.16 → T05b.04 | grid loader |
| T05.18 → T05b.04 | shares the least-time step cost |
| T05.18 → T29.02 | route search |
| T05.32 → T21.12 | complete PLAN_RESULT |
| T05b.04 → T09.09 | planning haven values |
| T05b.04 → T23.03 | haven fields |
| T05b.07 → T23.05 | rendezvous |
| T05b.11 → T26.01 | link graph |
| T05b.11 → T29.03 | link graph |
| T05b.13 → T22.16 | Earth link status |
| T05b.13 → T26.04 | delivery rule |
| T05b.15 → T21.15 | triggerState for the first alert sample |
| T05b.15 → T22.09 | real dose integral |
| T05b.15 → T22.16 | event dose rate |
| T05b.16 → T18.04 | owner of the test file; the engine's suit-consumables cases come first |
| T05b.17 → T18.05 | owner of `consumables.ts` since v2, FR-35 |
| T05b.17 → T22.09 | real consumables |
| T05b.19 → T18.11 | owner of `contingency.ts` |
| T05b.19 → T23.07 | ranking |
| T06.06 → T21.15 | LTST |
| T06.06 → T22.16 | Mars24 time functions |
| T06.07 → T21.15 | sunrise and sunset |
| T06.07 → T22.16 | sun elevation |
| T07.06 → T24.09 | map module |
| T07.06 → T25.02 | map module |
| T07.14 → T21.12 | demo stops |
| T07.14 → T31.02 | the demo plan's stops |
| T07.17 → T24.09 | shared map controls |
| T07.17 → T25.02 | shared controls |
| T14.01 → T28.02 | QR library |
| T16.07 → T27.06 | hosting of the public link |
| T17.01 → T21.09 | owner of the demo script |
| T20.04 → T26.02 | owner of `server.ts` |
| T20.10 → T22.17 | canonical JSON rule (05 PlanExport) |
| T20.04 → T27.01 | owner of `server.ts` |
| T20.04 → T28.02 | owner of `server.ts` |
| T20.06 → T11.07 | client store |
| T20.06 → T24.03 | client store |
| T20.06 → T24.05 | commands are sent through the client |
| T20.06 → T25.01 | client store |
| T20.06 → T25.02 | client store |
| T20.06 → T25.03 | client store |
| T20.06 → T25.05 | client store |
| T20.06 → T25.06 | client store |
| T20.06 → T25.10 | client store |
| T20.06 → T26.05 | client store |
| T20.06 → T27.04 | client store |
| T20.06 → T27.05 | client store interface |
| T20.06 → T29.04 | client store |
| T20.06 → T29.05 | client store |
| T20.06 → T31.06 | client store |
| T20.08 → T31.08 | LAN latency method |
| T21.08 → T18.13 | owner of `scenario.json` |
| T21.08 → T22.14 | the real sol-4190 scenario |
| T21.08 → T23.08 | real scenario |
| T21.08 → T26.07 | real scenario |
| T21.08 → T29.06 | real scenario |
| T22.07 → T27.01 | log |
| T22.12 → T23.08 | session |
| T22.12 → T28.05 | resume from disk |
| T22.14 → T27.05 | recorded log |
| T22.16 → T25.10 | conditions in state |
| T23.02 → T29.02 | dispatch |
| T23.02 → T31.04 | dispatch |
| T23.05 → T29.03 | motion helper |
| T23.07 → T24.11 | real options from the Hab Core |
| T23.07 → T31.08 | abort |
| T23.08 → T18.09 | 06 Tier 2 gate, M3 passes |
| T23.08 → T18.10 | Tier 2 gate |
| T23.08 → T18.12 | Tier 2 gate |
| T23.08 → T18.13 | Tier 2 gate |
| T23.08 → T25.08 | the demo works headless |
| T24.03 → T31.05 | view model |
| T24.04 → T12.07 | SCR-12 |
| T24.04 → T28.03 | EVA view |
| T24.05 → T25.04 | hold-to-confirm |
| T24.06 → T25.04 | options component |
| T24.07 → T28.05 | link-lost view |
| T25.01 → T12.07 | SCR-11 |
| T25.01 → T28.03 | ops view |
| T25.02 → T29.04 | ops map layers |
| T26.01 → T29.06 | comm shadow in the engine |
| T26.04 → T18.12 | Earth messages |
| T27.01 → T31.08 | report counts |
| T28.01 → T20.08 | a configured travel router |

<!-- v2-edges:end -->

## g. Parallel lanes board

Generated from the register's *M* column on 2026-11-06 (06 v2.2). A subtask spanning milestones sits in its first one; fallbacks are in brackets and run only if triggered. TASK-14 and the dry runs are all-hands on 10–12 Nov.

| Milestone | data | compute | frontend | design | story | integration | hab-core |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **M0** kickoff 5–6 Nov | T01.01–05, (T01.06), T01.07 | — | — | — | T00.01–03, (T00.05), T00.06, T30.01, T30.02 | T00.04 | — |
| **M1** spikes 6–7 Nov | T03.01, T03.02, T21.01 | T05.01–04, T05b.01–05, (T05b.21), T06.01, T06.02, T06.10 | T02.01–05, (T02.06), T07.01, T24.01 | T13.01–03, T13.11 | T07.14 | T14.01, T14.02, T14.11, T28.01 | T20.01–04, T20.07, T20.08, (T20.09), T22.01, T22.02, T31.01 |
| **M2** data and scenario 6–9 Nov | T03.03–22, (T03.23), (T03.24), (T03.25), (T03.26), (T03.27), T03.28–30, T04.01–03, T04.07, T04.08, (T04.09), T04.11, T18.08, T21.02–08, T21.10, T21.11, (T21.13), (T21.14) | T05.05–29, (T05.30), (T05.31), T05.32, T05b.06–17, T06.03–09, (T06.11), T21.12 | T07.02–13, T07.15, (T07.16), T07.17, T08.01, T24.02–05, T24.07, T24.10, T25.01, T25.02, T25.07, T31.07 | T13.05, T13.12 | T04.04–06, T04.10, T12.04, T12.05, T16.01, T16.07, T21.09, T31.02 | T16.02 | T20.05, T20.06, T21.15, T22.03–08, T22.11, T23.01, T23.02, T23.04, T23.06, T31.03 |
| **M3** walking skeleton by 10 Nov | — | T05b.18–20, T23.03, T26.01–07, (T26.08), T29.01–03, T29.06, (T29.07) | T07.18, T08.02–09, (T08.10), T08.11, T08.12, T09.01–05, T09.07, (T09.08), T09.09, T24.06, T24.08, T24.09, T25.03–06, (T25.09), T25.10, T27.01, T27.02, T29.04, T29.05, T31.05, T31.06, (T31.09) | T15.01, T15.04 | T12.01, T12.07, T17.01 | T09.06, T28.02, T28.03 | T22.09, T22.10, T22.12–14, (T22.15), T22.16, T23.05, T23.07, T23.08, (T23.09), T31.04 |
| **M3b** first dry run 10 Nov evening | — | — | T24.11, (T24.12), T25.08 | T15.02, T15.03 | — | T31.08 | — |
| **M4** offline dry run 11 Nov | — | — | T11.01, T11.02, T11.04, (T11.06), T11.07, T11.08, T27.04 | T11.03, T11.05, T13.04, T13.06–10 | T12.02, T12.03 | T14.03–10, T28.05 | — |
| **M4b** buffer 12 Nov | T18.01, T18.02, T18.13 | T18.04, T18.05, T18.09–11 | T18.03, T18.06, T18.07, T18.12 | — | T12.06 | T28.04 | — |
| **M5** Day 1 → 12:30 | — | — | T10.01–03 | — | — | — | — |
| **M6** Day 1 → 18:30 | — | — | — | — | T17.02, (T17.04) | — | — |
| **M7** Day 1 19:00 → Day 2 05:00 | — | — | T10.04, T27.03, T27.05, T27.06, (T27.07) | — | — | — | — |
| **M8** Day 2 06:00 → 09:00 | — | — | — | — | T16.03–06, T17.03, T30.03 | — | — |

Capacity: 06 §A v2.2 assumes 288–360 person-hours over the 6 build days (8–10 h/day each) and ≈ 100 person-hours at the event; `scripts/check_tasks.py --summary` gives the subtask totals per group and window.

## h. Working conventions

### h.1 Branches, PRs and commits

- One subtask = one branch = one PR. Branch `t05.18-astar-core` (lower-case id + short slug); PR title starts with the id: `T05.18 Implement the A* least-time search`.
- Human subtasks whose *Owns* is `none` open no PR; the subtask that depends on them records their output.
- Commit trailers: `Subtask: T05.18` and `Refs: FR-07, NFR-02, NFR-06` (the subtask's requirement ids). Fill the PR template's traceability block.
- Rebase on `main` before merge; `make lint typecheck test docs-check` must pass. Shared files (c.6) change only in integration subtasks, except the append-only rows of c.6.
- Each PR appends one `docs/AI_USE.md` log row when AI helped (`CLAUDE.md` §2).

### h.2 Agents and worktrees

- One git worktree per agent: `git worktree add ../wt-t05.18 -b t05.18-astar-core main`.
- An agent receives the subtask's *Agent brief*, this file and its task file. It writes only its *Owns* paths and the append-only rows it is allowed; it never edits another task file or this map.
- Agents never invent URLs, dataset properties or numbers: unknowns become `TODO(verify)`, open choices `TODO(decision)` (`AGENTS.md`).

### h.3 Tests-first merge order

A `test` subtask's PR stays a draft until its paired `implement` subtask makes it pass. The implement branch is stacked on the test branch; the two merge back to back so `main` stays green. Each task file names its pairs (e.g. T05.07 → T05.18).

### h.4 Claiming

Claim a subtask before starting by putting your name or agent id in its *Claimed by* cell in `docs/tasks/README.md`, in a one-line PR. Clear the cell when you stop. If the team moves to GitHub issues, the issue title starts with the subtask id.

### h.5 Changing this map

After approval this file is frozen. A change (new subtask, new path, new cross-task edge, contract version) lands first as its own PR titled `coord: <change>`, then in the task files. New subtasks take the next free number in their task; ids are never reused. `scripts/check_tasks.py` must pass on every change.

### h.6 Cut list → subtasks ([06 §D.4](../specs/06_High_Level_Implementation_Plan.md#d4-cut-list-cut-in-this-order-when-behind))

**Contingency only.** The team decided on 5 Nov not to cut scope; the team lead and the product & systems lead invoke this list together only if M3 (10 Nov) is missed, from item 1. Re-mapped from the v1 list on 2026-11-06: v1 cuts 2 and 3 became cut 4, v1 cut 6 became cut 7; v1 cuts 4 (sand warnings), 5 (live Mars24) and 7 (tiled layers) have no v2 item, so T04.07, T06.03, T06.06, T06.07 and T07.07 are `core` and their fallbacks (T06.11, T07.16 with T02.06 and T03.25) stay available as fallbacks.

| Cut | 06 §D.4 item (v2) | Drop | Then |
| --- | --- | --- | --- |
| 1 | All Tier 2 (TASK-18) | T18.01–T18.13 | — |
| 2 | Rover tasking down to RELAY only | SCOUT, CARRY, RETURN in T29.02 and T29.04 | Start T29.07 |
| 3 | Second crew device | EV2's tablet in T24.11 and T28.03 | EV2 stays simulated and visible on ops only (T31.04 auto-complete keeps the log deterministic) |
| 4 | Planner polish: coach marks, drag, free placement → POI-only stops | T13.07, T13.08, T08.09, T08.07 | Stops come from SCR-06 *Add as stop* (T10.01); the demo uses the scenario's plan (T21.12) |
| 5 | Dynamic relay viewshed → static hab coverage only | dynamic part of T05b.09 | Start T26.08 |
| 6 | Exact rendezvous → nearest vehicle-passable cell | T05b.06, T05b.07 | Start T23.09 |
| 7 | Live planner routing in the demo → scenario's precomputed plan | T05.07, T05.08, T05.18, T05.19 | The demo loads `plan.json` (T21.12); the planner keeps T05.30 and T09.08 as its manual-polyline fallback |
| 8 | Multi-device → single-laptop multi-window demo | — | Start T20.09 |
| 9 | Live engine in the video → headless replay rendered on ops | — | T17.02 records a `make replay` run shown in replay mode (T27.05) |

**Never cut** (06 §D.4): the storm moment (alert → options → summon → shelter: T22.10, T23.*, T24.04–T24.06, T25.03–T25.04), real replayed event data (T21.*), provenance labels (T12.01–T12.03, T12.06, T12.07), the prototype disclaimer (T07.05, T11.03), no-internet operation (T14.06, T28.*), the three single score points (TASK-30).

### h.7 Fallbacks ([06 §C](../specs/06_High_Level_Implementation_Plan.md#c-work-packages), [§D.5](../specs/06_High_Level_Implementation_Plan.md#d5-data-and-service-fallbacks))

| Fallback | Start only if | Replaces |
| --- | --- | --- |
| T00.05 | No rules answer by 4 Nov | — (Track S applies) |
| T01.06 | T01.05 finds the AOI DEM is not HiRISE-quality | Gale site → Jezero M2020 TRN HiRISE DTM mosaic |
| T02.06 (+ T03.25, T07.16) | The spike fails within 2 h, or cut 7 | Tiled rendering of the 2 m layers |
| T03.23 | Tiling is too slow | Highest zoom level |
| T03.24 | The 5 m grid is too big, or routing is too slow | 5 m cells → 10 m |
| T03.26 | The colour HiRISE COG does not cover the AOI | Ortho source |
| T03.27 | Quantitative THEMIS TI does not cover the AOI | TI source |
| T04.09 | PDS PLACES parsing is too slow | Traverse source |
| T05.30 + T09.08 | T09.06 records no-go, or cut 6 | Auto-routing |
| T05.31 | T05.29 records browser p95 > 2 s after T03.24 | Browser router |
| T06.11 | Fallback — start only if Mars24 tests fail: precomputed sun table for the demo dates | Live Mars24 |
| T08.10 | Drag does not work at the Day 1 17:30 checkpoint | Drag |
| T11.06 | The map snapshot cannot be made to work | Map snapshot |
| T17.04 | The live demo fails on camera | Live 240-s recording |
| T05b.21 | T05b.05 records a full-grid Dijkstra over 2 s | Haven fields on the 5 m grid |
| T20.09 | T20.08 records LAN broadcast over 500 ms, or cut 8 | Multi-device demo |
| T21.13 | T21.06 finds no RAD series for sol 4190 | Archived dose series |
| T21.14 | T21.02 cannot get the orbiter kernels | SPICE Earth-link table |
| T22.15 | Consumables slip past M3 | Full consumables |
| T23.09 | Exact rendezvous fails by M3, or cut 6 | Exact rendezvous |
| T24.12 | SCR-12 is not usable by M3b | Tablet layout |
| T25.09 | Clock control is not ready by M3 | Clock-control UI |
| T26.08 | Cut 5 | Dynamic relay coverage |
| T27.07 | SCR-17 is not ready by M7 | Report layout |
| T29.07 | Cut 2 | SCOUT, CARRY, RETURN |
| T31.09 | TASK-31 runs late at M3 | `ADD_STOP_TASK` |

Fallbacks that only drop work are marked on the dropped subtask instead: profile ↔ map linking (T09.05), coach marks (T13.07), desirables (TASK-18). The Mars Rover Photos API row of 06 §D.5 needs no subtask: images are saved by hand from the start (T04.04, T04.05).

### h.8 Definition of done

Every subtask: its *Acceptance* and *Verify* pass; [06 §D.7](../specs/06_High_Level_Implementation_Plan.md#d7-definition-of-done-per-feature) holds where it applies (acceptance criteria met, unit test or manual test note, provenance label, keyboard reachable, works offline, sources listed in SCR-09); the AI-use row is added; `scripts/check_tasks.py` passes.

## Test-case allocation

Every test case named in [02 §D](../specs/02_Technical_Requirements_Document.md#d-core-processing-and-simulation-behavior) and [02 §F.1](../specs/02_Technical_Requirements_Document.md#f1-test-plan), plus the pitfalls of [02 §C.4](../specs/02_Technical_Requirements_Document.md#c4-mars-specific-pitfalls-to-test-explicitly), has exactly one `test` or `verify` subtask.

| Case | Source | Subtask |
| --- | --- | --- |
| Outside AOI → `OUTSIDE_AOI`; NaN cell → `NO_DATA` | 02 §D.1 | T05.06 |
| 10 sampled cells match the `rasterio` readout (elevation exact, slope ±0.1°) | 01 FR-03 | T05.28 |
| Route passes through the single gap in a wall | 02 §D.2 (1) | T05.07 |
| Uniform 20° ramp, 15° limit → `NO_ROUTE` / `DISCONNECTED_BY_SLOPE` | 02 §D.2 (2) | T05.08 |
| No returned step violates the hard limit when re-sampled | 02 §D.2 (3) | T05.07 |
| Identical output for repeated runs (tie-break by cell index) | 02 §D.2 (4) | T05.07 |
| `START_BLOCKED`, `END_BLOCKED`, `DISCONNECTED_BY_HAZARD`, `DISCONNECTED_BY_NODATA`; `nearest_reachable` | 02 §D.2 | T05.08 |
| `TIMEOUT` after 3 × 10⁶ node expansions | 02 §D.2 | T05.07 |
| Snap to the nearest passable cell within 50 m, else rejected | 02 §D.2 | T05.09 |
| Douglas–Peucker 2 m for display only; metrics on the unsimplified path | 02 §D.2 | T05.10 |
| Speed table (six rows) exact to 0.01 km/h | 02 §D.3, §F.1 Time model | T05.11 |
| 1 km flat → 18.18 min; 1 km at +10° → 1015.4 m, ≈ 34.2 min | 02 §D.3 | T05.11 |
| EVA timeline = start + Σ walk + Σ dwell | 02 §D.3 | T05.11 |
| Walkback on loop and one-way routes | 02 §D.3 | T05.12 |
| 7 h at solar max → 0.187 (0.152–0.222) mSv; solar min → 0.248–0.292 mSv | 02 §D.4, §F.1 Radiation | T06.04 |
| ≥ 3 timestamps vs `marstime`: 0.1° elevation, 1 min LTST | 02 §D.5, §F.1 Mars24 | T06.03 |
| 351.7 W → ≈ 1.03 L/min O₂ (illustrative) | 02 §D.6 | T18.04 |
| Any `NO_ROUTE` leg → `PARTIAL`, `totals` null | 02 §E.2 | T05.13 |
| Only the latest `plan_revision` is processed; cooperative cancel | 02 §E.2 | T05.15 |
| Ranges of 02 §E.3 → `INVALID_INPUT` | 02 §E.3 | T05.14 |
| Same plan twice → identical result | NFR-06 | T05.15 |
| Same plan twice → identical `plan_hash` | NFR-06 | T11.01 |
| Traverse on ortho at the checkpoints | 02 §F.1 Data alignment | T04.08 |
| DEM hillshade vs ortho edge alignment | 02 §F.1 Data alignment | T03.20 |
| Measured offsets present in manifest `known_offsets_m` | 02 §F.1 Data alignment | T03.19 |
| Lat/lon ↔ x/y round trip within 1 mm | 02 §F.1 Projection | T03.03 |
| Scale bar vs DEM-measured feature within 2 % | 02 §F.1 Projection | T02.04 |
| Synthetic planes 0°, 10°, 30° within ±0.05° (includes the 02 §C.2 L3 ramp) | 02 §F.1 Slope | T03.04 |
| NaN edges give NaN, not spikes | 02 §F.1 Slope | T03.04 |
| Real grid: 20 random pairs, p50/p95; 3-stop loop ≤ 2 s | 02 §F.1 Routing | T05.28 |
| Keyboard path through the core scenario | 02 §F.1 UI | T13.10 |
| Print preview fits one page | 02 §F.1 UI | T11.05 |
| Offline mode | 02 §F.1 UI | T14.06 |
| Missing TI layer; corrupted grid checksum; worker exception; impossible stop placement | 02 §F.1 Recovery | T14.05 |
| Mars24 longitude sign at Gale | 02 §C.4.1 | T06.03 |
| No EPSG:3857/WGS84 path in the pipeline | 02 §C.4.2 | T03.03 |
| No EPSG:3857 view or `ol/sphere` in the web app | 02 §C.4.2 | T02.02 |
| Row 0 = north after reprojection | 02 §C.4.3 | T03.03 |
| Grid addressing `i = floor((origin_y − y)/cell)` | 05 §E.1 | T05.05 |
| DEM no-data → NaN before slope | 02 §C.4.4 | T03.03 |

### Test-case allocation — v2

Every v2 validation case named in [02 §D.8–§D.16](../specs/02_Technical_Requirements_Document.md#d8-time-to-safe-haven-fr-39) and [02 §F.2](../specs/02_Technical_Requirements_Document.md#f2-test-plan-additions-v2) has one `test` or `verify` subtask.

| Case | Source | Subtask |
| --- | --- | --- |
| Hab at origin, vehicle 2 km away, crew 1 km from hab; wall detour; vehicle slower than walking | 02 §D.8 | T05b.03 |
| Ridge the vehicle cannot climb → rendezvous at the foot; vehicle blocked → `NO_RENDEZVOUS`; two-crew permutation | 02 §D.10 | T05b.06 |
| Horizon distances for 2 m and 10 m; shadow behind a single wall; sphere-sampled grid | 02 §D.11 | T05b.08 (compute), T03.28 (pipeline) |
| Light time vs `spiceypy` spot check within 1 s | 02 §D.12 | T21.03 |
| Message sent mid-pass vs between passes; blackout | 02 §D.12 | T05b.12 (rule), T26.03 (engine) |
| Timeline table reproduces source times | 02 §F.2 Space weather | T21.10 |
| Trigger fires on the right sample; dose integral for a 3-step series | 02 §D.13, §F.2 | T05b.14 |
| Contingency ranking by dose, then ETA | 02 §D.15 | T05b.18 |
| Sky-view factor on a flat plane and below a cliff | 02 §D.16 | T18.09 |
| Haven and rendezvous at 5 real-grid positions vs scikit-image; viewshed at 5 points vs `gdal_viewshed`; NFR-02 timings | 02 §F.2 Haven / rendezvous, Comm | T05b.20 |
| `comm_hab` vs `gdal_viewshed` at 5 points | 06 §C.1 TASK-03 | T03.30 |
| 60× full run finishes; log hash stable across two runs and two machines | 02 §F.2 Engine | T22.14 |
| 3 devices on the router; Wi-Fi toggle; Hab Core kill/restart; single-laptop mode | 02 §F.2 Network | T20.08, T28.05 |
| HUD 3-s glance; "summon vehicle" without instruction | 02 §F.2 Usability | T15.04 (script), T15.02 (sessions) |
| Killer demo 0:30–1:10 headless | 06 §C.2 TASK-23 | T23.08 |
| Tablet tap on ops ≤ 500 ms; abort drops open tasks; report counts = log | 01 FR-50 | T31.08 |
| RELAY closes the demo comm shadow; queue shows ETA and battery | 01 FR-41 | T29.06 |

## Requirement coverage

| Req | Implemented by | Tested or verified by |
| --- | --- | --- |
| FR-01 | T02.02, T03.07–T03.13, T07.02, T07.03, T07.06 | T02.04, T07.15, T14.06 |
| FR-02 | T03.09, T03.12, T03.17, T07.07, T07.09 | T07.15 |
| FR-03 | T05.16, T05.17, T07.12 | T05.06, T05.28, T07.15 |
| FR-04 | T04.03–T04.05, T07.11, T10.01 | T04.02, T10.03 |
| FR-05 | T05.25, T08.04 | T05.14, T08.11 |
| FR-06 | T05.20, T08.03, T08.05–T08.08 | T05.09, T08.02, T08.11 |
| FR-07 | T05.18, T05.19, T05.21, T05.26, T09.01 | T05.07, T05.08, T05.28, T09.07 |
| FR-08 | T05.17, T05.21, T09.02, T09.05 | T05.10, T09.07 |
| FR-09 | T05.22, T05.23, T09.03 | T05.11, T05.12, T09.07 |
| FR-10 | T03.10, T05.24, T09.04 | T05.13, T09.07 |
| FR-11 | T06.06, T06.07, T06.09, T10.02 | T06.03, T06.05, T10.03 |
| FR-12 | T06.08, T06.09, T06.10, T10.02 | T06.04, T10.03 |
| FR-13 (S) | T18.02, T18.03 | T10.03 checks "Not included in this build" |
| FR-14 | T11.02–T11.04 | T11.01, T11.05 |
| FR-15 | T03.13, T12.01, T12.03, T12.04 | T12.02, T12.06, T16.05 |
| FR-16 | T03.14, T05.24, T07.09, T14.03, T14.04 | T14.05, T14.06, T14.10 |
| FR-17 | T04.03, T07.10 | T04.02, T04.08 |
| FR-18–FR-20 (S) | T18.01, T18.05, T18.06, T18.07 | T18.04 |
| NFR-01…NFR-11 | — | NFR-01 T14.06 · NFR-02 T05.28, T14.07 · NFR-03 T14.08 · NFR-04 T13.09, T13.10 · NFR-05 T12.06 · NFR-06 T03.22, T14.08 · NFR-07 T16.05 · NFR-08 T14.09 · NFR-09 T03.22, T14.09 · NFR-10 T14.10 · NFR-11 T14.09 |
| SCR-00…SCR-09 | SCR-00 T14.04 · SCR-01 T07.05 · SCR-02 T07.08 · SCR-03 T07.09 · SCR-04 T08.04, T08.05 · SCR-05 T09.03 · SCR-06 T10.01 · SCR-07 T10.02 · SCR-08 T11.03 · SCR-09 T12.03 | SCR-00 T14.10 · SCR-01–SCR-03 T07.15 · SCR-04 T08.11 · SCR-05 T09.07 · SCR-06, SCR-07 T10.03 · SCR-08 T11.05 · SCR-09 T12.06 |
| 05 entities | All 14 (Site, DataSource, Layer, Asset, RoutingGrid, POI, TraversePoint, EnvConstant, MissionScenario, Waypoint, PlanResult, Leg, Warning, PlanExport) are created by one contract subtask, T03.01 (C1–C3) | `make typecheck`; T03.06; T11.01 |

<!-- v2-coverage:begin -->

### Requirement coverage — v2 (generated from the task files on 2026-11-06)

From each subtask's *Serves* line. Implemented by: `contract`, `fixture`, `implement`, `integrate`, `human` and `fallback` subtasks; tested by: `test` and `verify` subtasks.

| Req | Implemented by | Tested or verified by |
| --- | --- | --- |
| FR-30 | T20.01, T20.02, T20.04, T20.09, T22.12, T25.01, T25.02 | T20.03, T25.08 |
| FR-31 | T11.07, T20.01, T20.04, T20.06, T23.02, T25.01, T25.03, T25.06, T28.02 | T20.03, T20.05, T23.01, T25.07 |
| FR-32 | T07.17, T20.02, T20.06, T24.01, T24.03, T24.04, T24.05, T24.07, T24.09, T24.12, T26.02 | T20.05, T24.02, T24.10, T24.11 |
| FR-33 | T13.12, T15.04, T24.01, T24.08, T24.12 | T24.10, T24.11 |
| FR-34 | T21.01, T21.08, T21.09, T21.12, T21.15, T22.01, T22.02, T22.04, T22.06, T22.11, T22.12, T25.05, T25.09, T27.05 | T22.03, T22.05, T25.07, T25.08, T27.06 |
| FR-35 | T05b.17, T22.09, T22.15 | T05b.16, T22.08 |
| FR-36 | T22.16, T25.10 | T12.07 |
| FR-37 | T21.01, T21.05, T21.06, T21.07, T21.09, T21.13, T21.15, T22.10, T25.03 | T21.03, T21.10, T22.08, T26.03 |
| FR-38 | T05b.15, T21.06, T21.07, T21.11, T21.15, T22.10, T25.03 | T05b.14, T22.08, T23.08 |
| FR-39 | T01.07, T05b.01, T05b.02, T05b.04, T05b.21, T08.12, T09.09, T23.03, T25.02 | T05b.03, T05b.05, T05b.20 |
| FR-40 | T05b.01, T05b.02, T05b.07, T15.04, T23.05, T23.09, T24.05 | T05b.06, T05b.20, T23.04, T23.08 |
| FR-41 | T29.02, T29.03, T29.04, T29.05, T29.07 | T29.01, T29.06 |
| FR-42 | T01.07, T03.29, T05b.01, T05b.02, T05b.09, T05b.11, T09.09, T25.02, T26.01, T26.02, T26.08, T29.03 | T03.28, T03.30, T05b.08, T05b.10, T05b.20, T26.06, T26.07, T29.01, T29.06 |
| FR-43 | T05b.01, T05b.13, T21.01, T21.02, T21.04, T21.14, T21.15, T26.04, T26.05, T26.08 | T05b.12, T21.03, T21.10, T26.03, T26.07 |
| FR-44 | T05b.01, T05b.19, T18.11, T23.07, T24.05, T24.06, T25.04 | T05b.18, T23.06, T23.08, T25.07 |
| FR-45 | T01.07, T04.10, T07.18, T10.04, T31.02 | — |
| FR-46 | T27.01, T27.03, T27.04, T27.05, T27.07 | T27.02, T27.06 |
| FR-47 | T18.10, T18.11 | T18.09 |
| FR-48 | T18.12 | — |
| FR-49 | T04.11, T18.13 | — |
| FR-50 | T11.08, T20.02, T21.08, T27.01, T31.01, T31.02, T31.04, T31.05, T31.06, T31.09 | T27.02, T31.03, T31.07, T31.08 |
| NFR-01 | T20.06, T20.09, T28.01, T28.02, T28.04 | T20.08 |
| NFR-02 | T05b.21 | T05b.05, T05b.20, T22.14 |
| NFR-03 | — | T24.11, T28.03 |
| NFR-04 | T13.12, T24.04, T24.08, T25.01, T31.05 | T24.10, T25.07, T31.07 |
| NFR-05 | T24.01, T24.03, T24.04, T24.06, T25.01, T25.10, T26.05, T29.05 | T12.07, T24.02 |
| NFR-06 | T05b.01, T05b.04, T05b.07, T05b.19, T21.08, T21.11, T21.12, T22.01, T22.04, T22.06, T22.07, T22.09, T23.02, T23.05, T23.07, T31.04 | T05b.06, T22.03, T22.05, T22.14, T31.03 |
| NFR-07 | T21.02, T21.06, T30.01, T30.02 | T30.03 |
| NFR-08 | T20.04, T28.01 | — |
| NFR-10 | T22.07, T22.11, T22.12 | T22.05, T28.05 |
| NFR-12 | T20.04, T20.07 | T20.08, T31.08 |
| NFR-13 | T20.06, T24.07 | T20.03, T20.05, T28.05 |
| NFR-14 | T22.02, T22.13 | T22.05, T22.14 |

<!-- v2-coverage:end -->

## Open points

Gaps and contradictions found while building this map. None is resolved here; each has an owner subtask.

1. **Window interpretations** (§a.2): contract subtasks and pipeline code treated as `pre-event-allowed` once TASK-00 resolves. Confirm with the rules answer — T00.03, `TODO(decision)`.
2. **TASK-06 timing.** 06 §D.2 says TASK-06 has no data dependency, but 06 §A Track P lists only TASK-02 and TASK-05, so TASK-06 stays `event-only` — `TODO(decision)`.
3. **M3 without TASK-06.** 06 §B M3 lists TASK-05/07/09 only, but 05 PlanResult has no *Req* column; T03.01 must decide whether `conditions`, `radiation` and `stops_timeline` may be absent in the M3 slice, or M3 hard-depends on TASK-06.
4. **Grid delivery to the worker.** 02 §E.2 defines `GRID_NOT_LOADED` but no message that delivers the grid — T05.01; a new message needs a `spec-change:` to 02 §E.2.
5. **Cancellation mechanism.** A check every 50,000 expansions (02 §E.2) only sees newer messages if the search yields to the worker's event loop; the stub `searchLeg` is synchronous — T05.01, `TODO(decision)`.
6. **Slope tile encoding.** 04 §C.1 and 05 §F.1 (`breaks_follow_scenario: true`) make slope classes follow the current limits, so slope tiles cannot be pre-coloured — T02.01, `TODO(decision)`; the spike checks it (`TODO(verify)`).
7. **Layer order.** FR-02 fixes six classes but not where the traverse and waypoints go — T07.01, `TODO(decision)`.
8. **Source-id attribute.** NFR-05 requires a source id on every value but names no attribute — T07.01, `TODO(decision)`.
9. **Alignment checkpoints.** FR-17 and 06 TASK-04 say ≥ 3; 01 §B and 02 §F.1 say 5 — T04.08 records both counts.
10. **TI threshold.** 02 assigns U-03 to TASK-04, 06 TASK-04 does not list it, and 05 has no manifest field for it. U-03 is decided (2026-11-10: no defensible TI "loose fines" threshold for the AOI), so T04.07 records the outcome in `docs/ops/ti-threshold.md` only and `ti_threshold.json` remains absent; 05 still has no manifest field and no manifest change follows ([ti-threshold.md](../ops/ti-threshold.md#decision)). The 02 U-03 row still needs a status label — T16.02 (spec-sync note in [TASK-04](TASK-04_vectors-pois-images.md#t0407--resolve-u-03-ti-loose-fines-threshold-from-the-aoi-histogram-and-literature)).
11. **Duplicate test.** The pipeline stub `test_scale_bar_vs_dem_measured_feature_within_2_percent` duplicates the F.1 case allocated to T02.04 — T03.03 removes it.
12. **Solar-min source.** 05 gives the solar-min EnvConstant values and a note (Simonsen et al. 2024) but no `source_id`. Obidit Islam (data lead), 2026-11-10 chose `simonsen-2024-rad`, matching the existing DataSource. T06.10's RAD metadata and access-date checks remain `TODO(verify)`.
13. **Bundle hosting.** Closed: GitHub release asset, not Git LFS (`docs/ops/feasibility.md`). T16.07 implements it and still settles what the public link shows (02 §B).
14. **D-09** (default slope, walkback and speed values; 01 §F.4 suggests the 11:30 mentor round) has no task in 06 — not planned.
15. **Demo plan location.** 03 SCR-01 "Open demo plan" has no defined data file — T07.14 proposes `apps/web/src/ui/demoPlan.json`, `TODO(decision)`.
16. **Dependency choices** for T14.01: profile chart (02 §B: uPlot or Chart.js; plain SVG alternative), DOM test environment, axe tooling (NFR-04), JSON-Schema validator for `validate-manifest`, `marstime` version — `TODO(decision)`.
17. **Committed mock binaries.** `.gitignore` excludes `data/sites/*/tiles/` and `grid/`; whether a negation re-includes them for `mock_site` is `TODO(verify)` with `git check-ignore` in T03.02.
18. **Effort.** Atomized estimates will exceed some 06 ranges (e.g. TASK-05: 8–12 h); Phase 3 reports per-lane totals against the ≈ 70 event person-hours.
19. **SAMPLE_POINT has no slope limit.** Passability depends on the hard slope limit (02 §D.2), but the SAMPLE_POINT request (02 §E.2) carries none — T05.01; a fix needs a `spec-change:` to 02 §E.2.
20. **SAMPLE_RESULT nullability.** 02 §D.1 returns `null` values with `OUTSIDE_AOI` / `NO_DATA`; the skeleton types them as numbers — T05.01 (C6).
21. **Demo dose vs default EVA limit.** 01 §E step 8 expects 0.19 mSv for a 7 h EVA, but FR-05's default maximum is 6 h and the dose uses the planned EVA total (05 §F.3) — T07.14 and T17.01 must pick a scenario that matches; spec question for 01.
22. **Missing TI tiles vs `LOW_TI` bits.** FR-16 expects "unknown" sand warnings when the TI tiles are deleted. The grid carries no `LOW_TI` bits (U-03 decided 2026-11-10: no defensible threshold, so no `ti_threshold.json`; [ti-threshold.md](../ops/ti-threshold.md#decision)), but the worker still cannot tell that a layer is missing — T05.01, T14.05.
23. **Moving a stop by keyboard.** Demo step 5 drags a stop; 04 §E gives no keyboard way to move one (NFR-04) — T08.08, T13.06, `TODO(decision)`.
24. **Light theme and toasts.** 04 §C.1 defines no light-theme values (T13.08, cut 2), and no subtask owns the toast that 03 §D uses — T07.01 decides the toast; the light theme needs a `spec-change:` to 04 if kept.
25. **REMS output path.** T18.02 has no bundle re-release unless CRISM triggers T18.01 — decide with TASK-18 if FR-13 is attempted.
26. **POI field names.** 01 FR-04 says `source_url` and makes image credit mandatory; 05 uses `image_source_url` and makes image fields conditional — the plan follows 05 (T04.04, T10.01).

### v2 open points (2026-11-06)

Found while atomizing the v2 packages and re-dating v1. Each has an owner subtask or a decision owner.

1. **Estimates above 06.** Without fallbacks and desirables the subtasks sum to 341.5–511 h, against 160–245 h in 06 §C for the same packages and 288–360 h of pre-event capacity (06 §A v2.2). The subtask estimates are planning guesses; re-check them at the kickoff ([task index](README.md#hours-per-group-and-window)).
2. **Open points 1 and 2 above are settled** by Track P (recorded 4 Nov) and 06 v2.2 (TASK-06 is pre-event, P 7–9 Nov); the windows in the register follow them.
3. **No test or verify subtask for FR-45, FR-48 and FR-49** (v2 coverage table). FR-48 and FR-49 are Tier 2; FR-45 is Tier 0 and may need a check — `TODO(decision)`.
4. **Command body shape.** The 02 §E.6 examples put command fields beside `kind`; `CommandMessage` nests them in `args` — T20.01.
5. **TASK-27 timing.** 06 §C.2 says event, but 06 §F lists the report view on 11 Nov and TASK-31's done-when needs report counts before M4; this plan builds the report data before the event (T27.01, T27.02) — confirm.
6. **Committed scenario tables.** `earth_link.json`, `dose_series.json` and the DONKI cache are small derived files and are committed; `CLAUDE.md` forbids committing downloaded datasets, not derived tables — confirm with the team lead (T21.01).
7. **Repo public date** for the score-sheet single point — T30.01, `TODO(decision)`.
8. **Rover relay beat in the 240-s video** — the product & systems lead's call (session handoff §F.4); not planned as a subtask.
9. **Dependency batch.** T14.01 (M1) now also has to bring a DOM test environment for React components and a local QR library (T28.02); React itself landed on 6 Nov (ADR-012).
10. **v1 step texts** still name v1 times ("Day 1", v1 milestones) in places; the register and each file's header are authoritative (re-dating note in every v1 file).
