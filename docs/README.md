# Marswalk Planner — Documentation Package

*(working title)* · NASA Space Apps 2026 · Challenge: **Interplanetary Survival Guide: Martian Map** · Team: CheesySpace

| | |
| --- | --- |
| **Owner** | Team CheesySpace — documentation index |
| **Date** | 2026-11-02 |
| **Status** | Draft v1 for team review |
| **Related** | [Specs 01–06](#documents) · [Decisions (ADRs)](decisions/) · [Reference](reference/) · [Ops templates](ops/) · [AI use](AI_USE.md) |

## Summary

An offline, browser-based planning map for one hyperlocal Mars site — proposed: **Curiosity's 2025 boxwork area on Mount Sharp, Gale crater**. The planner places science stops on HiRISE imagery and a 1 m terrain model; the app computes a suited-walking route that respects slope limits and hazards, and reports the elevation profile, time and walkback margins, daylight window (Mars24) and an estimated radiation dose based on Curiosity RAD measurements. Output is a one-page Marswalk briefing card where every number is labelled **measured, derived, modelled or assumed**. Static web app, no backend, no AI-generated numbers.

## Documents

| # | Document | Owns |
| --- | --- | --- |
| 01 | [Product Requirements](specs/01_Product_Requirements_Document.md) | Scope, users, FR-01–FR-21, acceptance criteria, demo scenario, risks |
| 02 | [Technical Requirements](specs/02_Technical_Requirements_Document.md) | Architecture, stack, Mars data layers and coordinates, algorithms, worker contracts, NFR-01–NFR-11, tests |
| 03 | [App Flow and Diagrams](specs/03_App_Flow_and_Diagrams.md) | Screens SCR-00–SCR-09, journeys, error flows, Mermaid flow/navigation/sequence/state diagrams |
| 04 | [Design Brief](specs/04_Design_Brief.md) | Layout, verified-contrast palette, typography, component states, accessibility, wireframe guidance |
| 05 | [Backend and Database Schema](specs/05_Backend_and_Database_Schema.md) | Entities, static-file persistence, ER diagram, integrity, versioning, JSON examples |
| 06 | [High-Level Implementation Plan](specs/06_High_Level_Implementation_Plan.md) | Milestones M0–M6, TASK-00–TASK-18, critical path, cut list, first actions |

## Context inventory

| File | Purpose | Read? |
| --- | --- | --- |
| [`challenge-overview.md`](reference/challenge-overview.md) | Official challenge statement (objectives, optional considerations) | Fully |
| [`Mars Scientific Context.md`](reference/mars-scientific-context.md) | Team's Mars science reference (radiation, atmosphere, terrain, human factors) | Fully; used for RAD rates and environmental context |
| `Space Apps 2026 Bangladesh — Build Guide (Copy).html` | Shared build kit + per-challenge suggestions (Challenge 11: traverse planner) | Fully |
| `Space Apps Challenge Participants Guide-1.pdf` | Bangladesh schedule, videos, judging sheet, submission fields | Fully |
| `Gemini Notebook` (link) | NotebookLM notebook | **Not accessible** — extension bridge disconnected |
| Official challenge page Resources tab | NASA-listed datasets | **Not accessible** — site blocks automated access; team should check manually |
| Project Submission / Judging guides (2026) | Final wording for AI disclosure | Not yet published (due 13 Nov) |

Unlinked items were claude.ai Project attachments and are not in this repository.

No prior product decisions, team handoffs, or existing implementation were found; all product choices below are **proposed**.

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
| [D-01](decisions/ADR-001-site-selection.md) | Site = Mount Sharp boxwork, Gale crater (challenge's own example; only site with surface radiation measurements) | Jezero (M2020 TRN HiRISE DTM) if the Gale DEM is not HiRISE-quality in the AOI |
| [D-02](decisions/ADR-002-static-app-no-backend.md) | Static web app + offline Python pipeline; no backend, no database | FastAPI if browser routing p95 > 2 s |
| [D-03](decisions/ADR-003-openlayers-mars-projection.md) | OpenLayers with local Mars equirectangular projection (IAU_2015:49900 sphere) and custom tile grid | ImageStatic images if the spike fails |
| [D-04](decisions/ADR-004-least-time-routing.md) | Least-time A* on a 5 m grid between user-ordered stops; hard slope limit; caution multipliers | Manual polyline + validation (cut-list item 6) |
| [D-05](decisions/ADR-005-estimate-models.md) | Estimates: Tobler speed scaled to 3.3 km/h, RAD rate × duration, Mars24 sun — all labelled | — |
| [D-06](decisions/ADR-006-no-ai-in-mvp.md) | No AI in MVP | Post-MVP narration grounded in plan JSON only |
| [D-07](decisions/ADR-007-pov-imagery.md) | POV imagery = curated, locally stored Curiosity images | — |

## Key assumptions and blockers

Owners: assumptions A-01–A-07 in [01 §F.2](specs/01_Product_Requirements_Document.md#f2-key-assumptions); planning assumptions in [06 §A](specs/06_High_Level_Implementation_Plan.md#a-planning-assumptions); unresolved items in each spec's *Unresolved* table.

| Type | Item |
| --- | --- |
| **Blocker** | Is pre-event application code allowed? (U-12 → Track S vs. P in 06) |
| **Blocker** | DEM quality inside the AOI (A-01, TASK-01) decides the site |
| Assumption | Slope limit 15°/10°, walkback 5 km, suited speed 3.3 km/h — illustrative, editable |
| Assumption | Team of 4, ~70 person-hours during the event |
| Assumption | DEM elevations are MOLA-areoid-referenced (verify label) |
| Unresolved | AOI exact bounds; TI "loose fines" threshold; CRISM coverage; traverse source |

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
