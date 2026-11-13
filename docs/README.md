# Gale Surface Ops — Documentation Package

*(working title)* · NASA Space Apps 2026 · Challenge: **Interplanetary Survival Guide: Martian Map** · Team: CheesySpace

| | |
| --- | --- |
| **Owner** | Team CheesySpace — documentation index |
| **Date** | 2026-11-05 |
| **Status** | Draft v2 (surface ops reframe) for team review |
| **Related** | [Specs 01–06](#documents) · [Decisions (ADRs)](decisions/) · [Reference](reference/) · [Ops templates](ops/) · [Design handoff](design/mockup-handoff.md) · [Agentic workflow](ops/agentic-workflow.md) · [Data downloads](ops/data-downloads.md) · [AI use](AI_USE.md) |

## Summary

A habitat-local **surface operations system** for one Mars Exploration Zone at **Gale crater, Mount Sharp** (science stops on the wet-to-dry climate record and boxwork; resource stops on hydrated minerals). Before the EVA, a planner builds a suit-safe route on HiRISE imagery and a 1 m terrain model. During the EVA, a **Hab Core** server in the habitat runs the mission clock and simulation; two crew follow the plan on suit tablets and a HUD; an ops console watches crew, vehicles, comm shadows and the delayed Earth link. The killer demo replays the real **20 May 2024 (sol 4190)** solar particle event: the habitat's own trigger fires before Earth's forecast arrives, and the crew summon a pressurized rover to shelter. Every number is labelled **measured, derived, modelled, assumed, replayed or simulated**. No internet at runtime, no AI-generated numbers.

v2 (2026-11-04) supersedes the v1 planner-only scope; the v1 planner is Tier 0 of v2. The reframe was conceived and directed by Sadman Shaharier Mahim (product & systems lead); Obidit Islam is team lead ([06 §A.1](specs/06_High_Level_Implementation_Plan.md#a1-roles)).

## Documents

| # | Document | Owns |
| --- | --- | --- |
| 01 | [Product Requirements](specs/01_Product_Requirements_Document.md) | Scope tiers T0–T2, personas, FR-01–FR-21 (v1, appendix) and FR-30–FR-49, killer demo, risks |
| 02 | [Technical Requirements](specs/02_Technical_Requirements_Document.md) | Architecture (Hab Core, network model, event sourcing), stack, Mars data incl. DONKI/RAD/SPICE, algorithms D.1–D.16, HTTP/WebSocket/scenario contracts, NFR-01–NFR-14 |
| 03 | [App Flow and Diagrams](specs/03_App_Flow_and_Diagrams.md) | Role routes, screens SCR-00–SCR-18, killer-demo journey, error flows, sequence and state diagrams |
| 04 | [Design Brief](specs/04_Design_Brief.md) | Mission-brutalist design language, BRIEF/OPS/HUD/PRINT modes, verified-contrast tokens, alert system, layouts for every surface, accessibility |
| 05 | [Backend and Database Schema](specs/05_Backend_and_Database_Schema.md) | Static site entities, ParamSet, Hab Core runtime entities (Scenario, Crew, Vehicle, Alert, LogEvent…), event-log persistence, ER diagrams, examples |
| 06 | [High-Level Implementation Plan](specs/06_High_Level_Implementation_Plan.md) | Roles R1–R6 and per-person assignments (§A.2), milestones M0–M8 (team dry run 11 Nov, buffer 12 Nov), TASK-00–TASK-31, critical path, cut list, video plan |

Design handoff: [design/mockup-handoff.md](design/mockup-handoff.md) and the clickable prototype in `design/prototype/` (a design artefact, not product code; every number is a cited spec example or a visible `PLACEHOLDER`).

## Context inventory

| File | Purpose | Read? |
| --- | --- | --- |
| [`challenge-overview.md`](reference/challenge-overview.md) | Official challenge statement (objectives, optional considerations) | Fully |
| [`Mars Scientific Context.md`](reference/mars-scientific-context.md) | Team's Mars science reference (radiation, atmosphere, terrain, human factors) | Fully; used for RAD rates and environmental context |
| `Space Apps 2026 Bangladesh — Build Guide (Copy).html` | Shared build kit + per-challenge suggestions (Challenge 11: traverse planner); score sheet; *Best Mission Concept* target | Fully (re-read 2026-11-04 for v2) |
| `Space Apps Challenge Participants Guide-1.pdf` | Bangladesh schedule, videos, judging sheet, submission fields | Fully |
| `Gemini Notebook` (link) | NotebookLM notebook | **Not accessible** — extension bridge disconnected |
| Official challenge page Resources tab | NASA-listed datasets | **Not accessible** — site blocks automated access; team should check manually |
| Project Submission / Judging guides (2026) | Final wording for AI disclosure | Not yet published (due 13 Nov) |

Unlinked items were claude.ai Project attachments and are not in this repository.

v2 (2026-11-04) adds the team's own direction from the planning chat: in-EVA use on a suit tablet and HUD, rover and vehicle tasking, reacting to solar events, a habitat server instead of internet, and the Exploration Zone framing. Product choices below remain **proposed** unless marked.

### Contradictions and outdated items found

| Item | Resolution |
| --- | --- |
| Build guide's Challenge 11 page frames the tool as a **rover** traverse planner (900 kg rover parameters) | Official text centres on an **astronaut Marswalk** in a suit → we plan suited walking; rovers post-MVP |
| Build guide's shared stack uses MapLibre GL | MapLibre is Web Mercator-only; for Mars we propose OpenLayers with a custom projection (02 §B) |
| Build guide lists api.nasa.gov Mars Rover Photos | **Archived** (Oct 2025) — not used |
| Participants Guide: video 2 dated 1 Nov vs. run of show 13 Nov 18:30 | Guide itself flags it; plan uses 13 Nov 18:30 — confirm with Local Lead |
| Science context file: some Gale temperature ranges lack a citation | Not used as displayed values; REMS data would be required (FR-13, desirable) |

## Research sources (material to decisions; accessed 2026-11-02)

USGS Gale merged DEM 1 m and orthophoto 25 cm (Astropedia) · USGS THEMIS thermal-inertia mosaics · ASU THEMIS global mosaics · PDS CRISM MTRDR bundle · HiRISE DTM README (artifacts) · spatialreference.org IAU_2015:49900 · Mars Trek WMTS docs · OpenLayers custom-projection/COG examples · GISS Mars24 / Allison & McEwen 2000 · `marstime` docs · Tobler hiking function (arXiv 2303.16065) · Apollo 17 traverse planning document (NASA ALSJ) · NASA 10 km walkback test summary · nasa/api-docs (Mars Photos archival) · PDS Atmospheres REMS · PDS MSL Analyst's Notebook (PLACES). Full links in [02 Sources](specs/02_Technical_Requirements_Document.md#sources-accessed-2026-11-02).

## Major proposed decisions

| ID | Decision | Alternative / trigger |
| --- | --- | --- |
| [D-01](decisions/ADR-001-site-selection.md) | Site = Mount Sharp boxwork, Gale crater (challenge's own example; only site with surface radiation measurements). **Accepted 2026-11-07** ([feasibility.md](ops/feasibility.md#d-01-outcome)) | Jezero (M2020 TRN HiRISE DTM) if the Gale DEM is not HiRISE-quality in the AOI |
| [D-02](decisions/ADR-002-static-app-no-backend.md) | ~~Static web app, no backend~~ — **superseded 2026-11-04** by D-02 v2 below | — |
| [D-03](decisions/ADR-003-openlayers-mars-projection.md) | OpenLayers with local Mars equirectangular projection (IAU_2015:49900 sphere) and custom tile grid | ImageStatic images if the spike fails |
| [D-04](decisions/ADR-004-least-time-routing.md) | Least-time A* on a 5 m grid between user-ordered stops; hard slope limit; caution multipliers | Manual polyline + validation (cut-list item 6) |
| [D-05](decisions/ADR-005-estimate-models.md) | Estimates: Tobler speed scaled to 3.3 km/h, RAD rate × duration, Mars24 sun — all labelled | — |
| [D-06](decisions/ADR-006-no-ai-in-mvp.md) | No AI in MVP | Post-MVP narration grounded in plan JSON only |
| [D-07](decisions/ADR-007-pov-imagery.md) | POV imagery = curated, locally stored Curiosity images | — |
| [D-02 v2](decisions/ADR-008-hab-core-local-server.md) | **Hab Core**: local server on the habitat LAN (session, clock, simulation, event log, WebSocket); planner keeps its worker | Single-laptop multi-window mode if multi-device fails |
| [D-10](decisions/ADR-009-surface-ops-reframe-and-storm-replay.md) | Surface-ops reframe; killer demo = replay of the real 20 May 2024 (sol 4190) SEP event; Exploration Zone framing at Gale | Shape-scaled dose curve if the RAD series is not archived |
| [D-13](decisions/ADR-010-mission-brutalist-design-language.md) | Mission-brutalist design language: BRIEF/OPS/HUD/PRINT modes, status colours only for status | Keep v1 dark theme for the planner if time runs out |
| [D-12](decisions/ADR-011-node-typescript-hab-core.md) | Hab Core in Node.js + TypeScript sharing `packages/compute` | FastAPI if TypeScript capacity < 2 people |
| [D-14](decisions/ADR-012-react-vite-web-app.md) | `apps/web` in React + Vite (static build served by the Hab Core); no Next.js | Preact (same components) if bundle size becomes a problem |

## Key assumptions and blockers

Owners: assumptions A-01–A-07 in [01 §F.2](specs/01_Product_Requirements_Document.md#f2-key-assumptions); planning assumptions in [06 §A](specs/06_High_Level_Implementation_Plan.md#a-planning-assumptions); unresolved items in each spec's *Unresolved* table.

| Type | Item |
| --- | --- |
| Resolved | Pre-event application code is allowed: Track P, Local Lead answer of 2026-11-04 ([ops/rules.md](ops/rules.md)); re-check against the 2026 guides on 13 Nov |
| Resolved | DEM quality inside the AOI (A-01, TASK-01) decides whether Gale data is usable at walking scale (resolved 2026-11-07 via U-01, see below) |
| **Blocker** | RAD time series for sol 4190 (U-15: public sources found 5 Nov, coverage to verify) and SPICE kernels for May 2024 (U-18) decide replay fidelity (TASK-21). Exact files: [ops/data-downloads.md](ops/data-downloads.md) |
| Assumption | Vehicle, suit, link, alert and shielding parameters (05 ParamSet) are illustrative until cited (U-19, U-20) |
| Assumption | Slope limit 15°/10°, walkback 5 km, suited speed 3.3 km/h — illustrative, editable |
| Assumption | Team of 6 ([ops/team.md](ops/team.md)), ~96–120 person-hours during the event |
| Assumption | DEM elevations are MOLA-areoid-referenced (verify label) |
| Resolved | D-01 site (Gale boxwork, 2026-11-07), AOI exact bounds, DEM quality inside the AOI (U-01, on the data lead's method) and CRISM coverage (U-05): [ops/feasibility.md](ops/feasibility.md) |
| Resolved | LOW_RES_DEM: no per-pixel source map; interpreted patches (U-10, 2026-11-07): [dem-quality.md](ops/feasibility/dem-quality.md#u-10-evidence) |
| Resolved | Venue details (U-14, 2026-11-09): virtual event ([ops/team.md](ops/team.md#venue-type-u-14-due-10-nov)) |
| Resolved | TI "loose fines" threshold: **no defensible threshold for the AOI** (U-03, Obidit Islam, 2026-11-10), so `ti_threshold.json` is not written and T03.10 sets no `LOW_TI` bits; A-05 stays an Assumed interpretation ([ops/ti-threshold.md](ops/ti-threshold.md#decision)) |
| Resolved | Traverse source (U-04: PDS PLACES `localized_interp.csv`, cached rover range sol 0–4868, clip to AOI plus a 100 m data-lead margin; Obidit Islam (data lead), 2026-11-10; [T04.01](tasks/TASK-04_vectors-pois-images.md#t0401--choose-and-cache-the-traverse-source-u-04-write-its-datasource-and-layer-records)); publisher, credit and licence remain `TODO(verify)` |

## Traceability (MVP requirements)

| FR | Screen(s) | Technical component | Data entities | Task(s) |
| --- | --- | --- | --- | --- |
| FR-01 Basemap offline | SCR-01, SCR-02 | Map UI, tiles, manifest boot | Site, Layer, Asset | TASK-02, 03, 07 |
| FR-02 Layers + legends | SCR-03 | Tiles, legends | Layer, DataSource | TASK-03, 07 |
| FR-03 Point inspection | SCR-02 | `SAMPLE_POINT`, grid | RoutingGrid | TASK-05, 07 |
| FR-04 POIs + images | SCR-06 | Vector layer | POI, Asset | TASK-04, 10 |
| FR-05 Mission inputs | SCR-04 | Validation (02 §E.3) | MissionScenario | TASK-08 |
| FR-06 Waypoints | SCR-02, SCR-04 | Snapping, plan store | Waypoint | TASK-05, 08 |
| FR-07 Routing | SCR-02, SCR-05 | A* worker (02 §D.2) | RoutingGrid, Leg | TASK-05, 09 |
| FR-08 Profile | SCR-05 | Profile sampling | Leg.profile | TASK-05, 09 |
| FR-09 Time / walkback | SCR-05 | Time model (02 §D.3) | PlanResult.totals | TASK-05, 09 |
| FR-10 Warnings | SCR-05, SCR-02 | Warning rules | Warning | TASK-05, 09 |
| FR-11 Daylight | SCR-07 | Mars24 (02 §D.5) | PlanResult.conditions | TASK-06, 10 |
| FR-12 Radiation | SCR-07, SCR-08 | Radiation (02 §D.4) | EnvConstant | TASK-06, 10 |
| FR-14 Briefing + export | SCR-08 | Print CSS, export | PlanExport | TASK-11 |
| FR-15 Provenance | SCR-09, all | `data-provenance` | DataSource, Layer | TASK-12 |
| FR-16 Offline/degraded | SCR-00, all | Boot validation, fault handling | Asset (checksums) | TASK-14 |
| FR-17 Traverse | SCR-02, SCR-03 | Vector layer | TraversePoint | TASK-04, 07 |

Desirable FR-13, FR-18–FR-20 → TASK-18 only after freeze criteria (06 §D.6).

## Traceability (v2 surface ops requirements)

| FR | Screen(s) | Technical component | Data entities | Task(s) |
| --- | --- | --- | --- | --- |
| FR-30 Hab Core session | SCR-10, SCR-11, SCR-18 | `apps/hab-core` server, session, log (02 §A, §E.5–E.6) | Session, LogEvent | TASK-20, 22 |
| FR-31 Client roles | SCR-10 | Permissions (02 §E.4) | ClientConnection, Command | TASK-20, 23 |
| FR-32 EVA client | SCR-12, SCR-18 | `habClient`, cached plan | Crew | TASK-24 |
| FR-33 HUD | SCR-13 | HUD mode (04 §E.6) | Crew, Alert | TASK-24 |
| FR-34 Mission clock and replay | SCR-11 | Engine clock (02 §D.14) | Scenario, Session | TASK-21, 22 |
| FR-35 Crew progress and consumables | SCR-11, SCR-12 | Engine tick, `consumables` | Crew, ParamSet | TASK-05b, 22 |
| FR-36 Conditions feed | SCR-11, SCR-12 | Engine, Mars24 | DoseSeries, EarthLinkTable | TASK-22, 25 |
| FR-37 Space-weather replay | SCR-11, SCR-12, SCR-13 | `eventDose` (02 §D.13) | DoseSeries, ScenarioEvent | TASK-05b, 21 |
| FR-38 Local radiation trigger | SCR-11–SCR-14 | `eventDose.triggerState` | Alert, ParamSet | TASK-05b, 22 |
| FR-39 Time to safe haven | SCR-05, SCR-12, SCR-13 | `haven` (02 §D.8) | Crew.haven | TASK-05b, 23 |
| FR-40 Vehicle summon and rendezvous | SCR-12, SCR-14 | `rendezvous` (02 §D.10) | Vehicle, ContingencyOption | TASK-05b, 23 |
| FR-41 Robotic rover tasking (T1 since 2026-11-05) | SCR-15 | Vehicle tasks | Vehicle | TASK-29 |
| FR-42 Comm coverage | SCR-02, SCR-11, SCR-12 | `viewshed`, `linkGraph` (02 §D.11) | RoutingGrid.comm_hab_asset, LinkState | TASK-03, 05b, 26 |
| FR-43 Earth link | SCR-11, SCR-16 | `earthLink` (02 §D.12) | EarthLinkTable, EarthMessage | TASK-05b, 21, 26 |
| FR-44 Contingency re-plan | SCR-14 | `contingency` (02 §D.15) | ContingencyOption | TASK-05b, 23 |
| FR-45 Exploration Zone layer | SCR-02, SCR-06 | POI layer | POI.stop_type, POI.evidence | TASK-04 |
| FR-46 Event log and report | SCR-11, SCR-17 | Log, report endpoint | LogEvent, PostEvaReport | TASK-22, 27 |
| FR-47 Terrain refuge (T2) | SCR-14 | `skyView` (02 §D.16) | — | TASK-18 |
| FR-48 Earth support view (T2) | SCR-16 | Delayed queue | EarthMessage | TASK-18 |
| FR-49 Dust advisory (T2) | SCR-11 | Scenario events | ScenarioEvent | TASK-18 |
