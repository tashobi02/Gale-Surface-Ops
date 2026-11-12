# Marswalk Surface Ops — CheesySpace

*(working title)* Team CheesySpace's entry for the **NASA Space Apps Challenge 2026**, challenge *Interplanetary Survival Guide: Martian Map* (Bangladesh event, 13–14 Nov 2026).

A habitat-local surface operations system for one Mars **Exploration Zone** at Gale crater (Mount Sharp). Before the walk, a planner builds a suit-safe EVA through science and resource-prospecting stops on real HiRISE terrain. During the walk, a **Hab Core** server inside the habitat runs the mission clock: two simulated astronauts follow the plan on their suit tablets and HUDs while an ops console watches everyone. Then the real solar particle event of **20 May 2024 (sol 4190)**, recorded by Curiosity's RAD, is replayed — the habitat detects it before Earth's warning can arrive, and the crew summon a pressurized rover to shelter.

Every number is labelled **measured, derived, modelled, assumed, replayed or simulated**. Nothing needs the internet at runtime, because nothing on Mars would have it.

## Status

**v2 skeleton (surface ops reframe, 2026-11-04).** Specs v2, monorepo layout, types, stubs and design tokens are in place; no functional code yet. Application code is allowed before the event (Track P, [docs/ops/rules.md](docs/ops/rules.md)). The progress bar below counts the v1 atomized subtasks; v2 tasks (TASK-05b, TASK-20–30) are listed in [06 §C.2](docs/specs/06_High_Level_Implementation_Plan.md#c2-new-in-v2-surface-ops-tier-1-unless-marked) and are not yet atomized.

## Progress

<!-- progress:start -->
`██████████████░░░░░░` **70 %** — 241 of 345 subtasks done, 38 in progress.

| Task | Progress | Done | In progress | Total |
| --- | --- | --- | --- | --- |
| [TASK-00 Resolve rules + register](docs/tasks/TASK-00_resolve-rules-and-register.md) | `██████████` 100 % | 5 | 0 | 5 |
| [TASK-01 Feasibility: AOI, DEM quality, coverage checks](docs/tasks/TASK-01_feasibility.md) | `██████████` 100 % | 6 | 0 | 6 |
| [TASK-02 Spike: OpenLayers custom Mars projection + custom tile grid](docs/tasks/TASK-02_projection-spike.md) | `████████░░` 80 % | 4 | 1 | 5 |
| [TASK-03 Preprocessing pipeline](docs/tasks/TASK-03_preprocessing-pipeline.md) | `██████████` 100 % | 32 | 0 | 32 |
| [TASK-04 Vectors, POIs and images](docs/tasks/TASK-04_vectors-pois-images.md) | `██████████` 100 % | 9 | 0 | 9 |
| [TASK-05 Compute core: grid loader, sampling, A*, profile, time model, walkback, warnings](docs/tasks/TASK-05_compute-core.md) | `██████░░░░` 60 % | 30 | 0 | 50 |
| [TASK-06 Mars24 solar functions + radiation estimate](docs/tasks/TASK-06_mars24-and-radiation.md) | `██████████` 100 % | 10 | 0 | 10 |
| [TASK-07 App shell + map workspace + layers panel + inspector](docs/tasks/TASK-07_app-shell-and-map-workspace.md) | `█████████░` 94 % | 16 | 0 | 17 |
| [TASK-08 Plan panel + waypoint editing](docs/tasks/TASK-08_plan-panel-and-waypoints.md) | `█████████░` 91 % | 10 | 0 | 11 |
| [TASK-09 Results panel + profile](docs/tasks/TASK-09_results-panel-and-profile.md) | `██████░░░░` 62 % | 5 | 1 | 8 |
| [TASK-10 POI detail + Conditions panel](docs/tasks/TASK-10_poi-detail-and-conditions.md) | `████████░░` 75 % | 3 | 0 | 4 |
| [TASK-11 Briefing card + JSON export](docs/tasks/TASK-11_briefing-card-and-export.md) | `████░░░░░░` 43 % | 3 | 0 | 7 |
| [TASK-12 Sources & Methods + provenance attributes](docs/tasks/TASK-12_sources-methods-provenance.md) | `████░░░░░░` 43 % | 3 | 1 | 7 |
| [TASK-13 Visual system + accessibility](docs/tasks/TASK-13_visual-system-accessibility.md) | `███████░░░` 69 % | 9 | 0 | 13 |
| [TASK-14 Integration + offline hardening + fault tests](docs/tasks/TASK-14_integration-offline-hardening.md) | `████░░░░░░` 36 % | 4 | 0 | 11 |
| [TASK-15 Usability test](docs/tasks/TASK-15_usability-test.md) | `██░░░░░░░░` 25 % | 1 | 1 | 4 |
| [TASK-16 Submission package](docs/tasks/TASK-16_submission-package.md) | `░░░░░░░░░░` 0 % | 0 | 7 | 7 |
| [TASK-17 Videos](docs/tasks/TASK-17_videos.md) | `░░░░░░░░░░` 0 % | 0 | 1 | 3 |
| [TASK-20 Hab Core skeleton: server, protocol v0, LAN spike](docs/tasks/TASK-20_hab-core-skeleton.md) | `█████████░` 92 % | 11 | 0 | 12 |
| [TASK-21 Scenario builder: SPICE, DONKI and RAD tables, `scenario.json`, demo numbers](docs/tasks/TASK-21_scenario-builder.md) | `████████░░` 77 % | 10 | 2 | 13 |
| [TASK-22 Simulation engine: clock, crew motion, consumables, alerts, event log, replay](docs/tasks/TASK-22_simulation-engine.md) | `█████████░` 94 % | 15 | 0 | 16 |
| [TASK-23 Safety ops in the Hab Core: commands, haven per tick, summon and rendezvous, contingency options, abort](docs/tasks/TASK-23_safety-ops.md) | `█████████░` 88 % | 7 | 0 | 8 |
| [TASK-24 EVA client and HUD: SCR-12 tablet, SCR-13 HUD, SCR-14 options sheet, SCR-18 link lost, full-screen map](docs/tasks/TASK-24_eva-client-and-hud.md) | `█░░░░░░░░░` 9 % | 1 | 9 | 11 |
| [TASK-25 Ops console: SCR-11 with the shared map, alerts, options approval, clock control, SCR-10 join](docs/tasks/TASK-25_ops-console.md) | `██░░░░░░░░` 22 % | 2 | 6 | 9 |
| [TASK-26 Links: surface link graph and `LINK_STATE`, comm-shadow warnings, Earth link widget and delayed queue](docs/tasks/TASK-26_links.md) | `███████░░░` 71 % | 5 | 1 | 7 |
| [TASK-27 Event log view, post-EVA report, replay mode for GitHub Pages](docs/tasks/TASK-27_report-and-replay.md) | `███████░░░` 67 % | 4 | 1 | 6 |
| [TASK-28 Network kit and rehearsal: router, static IP, QR join, device matrix, venue checklist](docs/tasks/TASK-28_network-kit.md) | `██████░░░░` 60 % | 3 | 0 | 5 |
| [TASK-29 Robotic rover tasking: SCOUT, CARRY, RELAY, RETURN](docs/tasks/TASK-29_rover-tasking.md) | `███████░░░` 67 % | 4 | 1 | 6 |
| [TASK-30 Score-sheet single points: challenge named, repo public, page drafted, AI use current](docs/tasks/TASK-30_score-sheet-points.md) | `░░░░░░░░░░` 0 % | 0 | 3 | 3 |
| [TASK-31 Stop task list (FR-50): protocol, engine, EVA list, ops progress, task text](docs/tasks/TASK-31_stop-task-list.md) | `█████░░░░░` 50 % | 4 | 3 | 8 |
| [TASK-32 Live operations session: presenter panel, event on demand, mission setup, stop task library](docs/tasks/TASK-32_live-session.md) | `████████░░` 78 % | 25 | 0 | 32 |

Totals leave out 43 fallback and desirable subtasks (they may never run); 3 of them done. Source: [docs/tasks/status.md](docs/tasks/status.md), regenerated by `make progress`.
<!-- progress:end -->

Generated, do not edit by hand. Record finished subtasks in [docs/tasks/status.md](docs/tasks/status.md), then run `make progress`.

## Run it

Requirements: Node.js LTS, conda (Miniconda or Miniforge; the pipeline's only Python environment), GNU Make.

```sh
make setup        # npm ci (all workspaces) + conda environment marswalk-pipeline + agent skills
make check-env    # fails unless the pipeline interpreter, GDAL, rasterio and pyproj are right
make lint typecheck test docs-check # static analysis, typechecking, full tests, link checks
make test-web     # Vitest in every workspace; needs no conda
make e2e          # Playwright end-to-end browser verification (headless Chromium, localhost)
make e2e-one CHECK=<name> # run a single Playwright e2e check (e.g. CHECK=offline)
make dev          # Vite dev server; proxies /sites, /api, /ws to the Hab Core
make hab          # Hab Core on 0.0.0.0:8080 (serves web app, sites and WebSocket on habitat LAN)
make demo         # production build served by the Hab Core (no internet needed)
make replay       # headless scenario replay, prints the event-log hash (NFR-06, NFR-14)
make record       # write static recording for GitHub Pages replay (scenarios/storm-sol4190/recording.json)
make data         # offline preprocessing pipeline entry point (TASK-03)
make progress     # regenerate the README progress bar from docs/tasks/status.md
```

Demo setup (06 §D.3, TASK-28): one laptop runs `make demo`; phones join the same offline travel router and open the role URL (ops shows QR codes).

### Layout

| Path | What |
| --- | --- |
| `apps/web` | One web app, five role views: planner, ops, EVA tablet, HUD, Earth |
| `apps/hab-core` | Habitat server: session, mission clock, simulation engine, event log, WebSocket |
| `packages/compute` | All deterministic science, shared by the planner worker and the Hab Core |
| `packages/protocol` | Shared types and wire format |
| `pipeline/` | Offline Python preprocessing (GDAL, rasterio; SPICE and DONKI tables in TASK-21) |
| `data/sites/`, `scenarios/` | Site bundles and replay scenarios |

The full pipeline environment (GDAL ≥ 3.6, rasterio, numpy, pyproj) is in [pipeline/environment.yml](pipeline/environment.yml) and is created by `make setup`. `make test` and `make check-env` need it; `make lint`, `typecheck`, `docs-check` and `test-web` do not.

## Data is not in git

Source datasets (USGS Gale DEM and orthophoto, THEMIS, CRISM, rover images) are never committed. The offline pipeline (`make data`, TASK-03, not implemented yet) downloads into the git-ignored `pipeline/work/` and writes the site bundle to `data/sites/<site_id>/` (layout: [data/sites/gale_boxwork/README.md](data/sites/gale_boxwork/README.md)). Source URLs, versions and checksums go in `pipeline/sources.lock.json`. The large tiles, grid and images are shared as a GitHub release asset (chosen route, not Git LFS); see [docs/ops/feasibility.md](docs/ops/feasibility.md).

## Documentation

| Document | Contents |
| --- | --- |
| [docs/README.md](docs/README.md) | Index, decisions, blockers, FR traceability |
| [docs/specs/](docs/specs/) | v2: 01 PRD · 02 Technical · 03 App flow · 04 Design · 05 Schema · 06 Plan |
| [docs/reference/challenge-overview.md](docs/reference/challenge-overview.md) | Official challenge text |
| [docs/reference/mars-scientific-context.md](docs/reference/mars-scientific-context.md) | Cited Mars science reference |
| [docs/ops/](docs/ops/) | Rules check (Track P), team roster, feasibility, demo script, submission checklist |
| [docs/AI_USE.md](docs/AI_USE.md) | How AI tools were used to build this |
| [CLAUDE.md](CLAUDE.md) · [AGENTS.md](AGENTS.md) | Rules for coding agents |

## Credits

Planned sources are listed in [02 Sources](docs/specs/02_Technical_Requirements_Document.md#sources-accessed-2026-11-02). Partner-agency data: ESA Mars Express HRSC (in the Gale DEM) and ESA TGO trajectories (relay geometry).

### DataSources

Every dataset is credited per its official archive record ([docs/ops/credits.md](docs/ops/credits.md)):

| source_id | Title | Credit |
| --- | --- | --- |
| `apollo17-planning` | Apollo 15 EVA Capability And Constraints Envelopes | P. Benjamin, Bellcomm, Inc.; Memorandum for File B70 10028, 13 October 1970. PDF document courtesy NASA Technical Reports Server. |
| `hassler-2014-rad` | Mars' surface radiation environment measured with the Mars Science Laboratory's Curiosity rover | Hassler et al., 2014 |
| `mars24-allison-mcewen-2000` | Mars24 Sunclock — Time on Mars | Mars24: Robert B. Schmunk; algorithms: Michael D. Allison; algorithm reference: Allison, M., and M. McEwen (2000), A post-Pathfinder evaluation of aerocentric solar coordinates with improved timing recipes for Mars seasonal/diurnal climate studies (Planetary and Space Science; © 2000 Elsevier Science Ltd). |
| `nasa-msl-blog-sols-4620-4621` | Curiosity Blog, Sols 4620-4621: Among the Hollows and the Ridges | NASA/JPL-Caltech (Curiosity blog) |
| `nasa-msl-blog-sols-4649-4654` | Curiosity Blog, Sols 4649-4654: Ridges, Hollows and Nodules, Oh My | NASA/JPL-Caltech (Curiosity blog) |
| `nasa-msl-blog-sols-4675-4681` | Curiosity Blog, Sols 4675-4681: Deciding Where to Dig Into the Boxworks | NASA/JPL-Caltech (Curiosity blog) |
| `nasa-msl-blog-sols-4695-4701` | Curiosity Blog, Sols 4695-4701: Searching for Answers at Monte Grande | NASA/JPL-Caltech (Curiosity blog) |
| `nasa-msl-blog-sols-4709-4715` | Curiosity Blog, Sols 4709-4715: Drilling High and Low in the Boxwork Unit | NASA/JPL-Caltech (Curiosity blog) |
| `nasa-msl-blog-sols-4716-4722` | Curiosity Blog, Sols 4716-4722: Drilling Success at Nevado Sajama | NASA/JPL-Caltech (Curiosity blog) |
| `nasa-msl-blog-sols-4845-4851` | Curiosity Blog, Sols 4845-4851: Bye-Bye Boxwork, Bye-Bye | NASA/JPL-Caltech (Curiosity blog) |
| `nasa-msl-boxwork-article-2025-06` | NASA's Curiosity Mars Rover Starts Unpacking Boxwork Formations | NASA/JPL-Caltech/MSSS (images on the page); text: NASA, Jet Propulsion Laboratory (release 2025-080) |
| `nasa-sev-factsheet-2011` | The Space Exploration Vehicle Characteristics (Surface Concept) | NASA, The Space Exploration Vehicle Characteristics (Surface Concept), NASA Facts FS-2011-08-045-JSC |
| `pds-msl-places-localizations` | Collection of localization data products for Rover PLACES | Deen, Robert G. (2024), Mars Science Laboratory Rover PLACES Bundle, version 42.0, NASA Planetary Data System, doi:10.17189/8nyv-8p60; collection "Collection of localization data products for Rover PLACES" (Citation_Information of bundle.xml and collection_data_localizations.xml) |
| `pds-msl-places-sis-1-3` | Mars Science Laboratory Software Interface Specification: PLACES Data Products for PDS | Robert Deen (2016), PLACES Data Products for PDS SIS, JPL; Copyright 2016 California Institute of Technology, government sponsorship acknowledged |
| `simonsen-2024-rad` | The Martian Radiation Environment and Human Health Risks | Simonsen et al., 2024 |
| `tobler-1993` | Improved prediction of hiking speeds using a data driven approach | Andrew Wood; William Mackaness; T. Ian Simpson; J. Douglas Armstrong; arXiv:2303.16065v6 |
| `usgs-gale-dem-1m-v3` | Mars MSL Gale Merged DEM 1m | Please credit authors |
| `usgs-gale-ortho-25cm-v3` | Mars MSL Gale Merged Orthophoto Mosaic 25cm, colour version HiRISE 78 quad color basemap | NASA/JPL-Caltech/University of Arizona; USGS Astrogeology (Calef & Parker 2016) |
| `usgs-themis-ti-30s120e` | THEMIS Thermal Inertia Mosaic Quantitative 30S120E 100mpp | Please cite authors |

### POI Images

- NASA/JPL-Caltech
- NASA/JPL-Caltech/MSSS

### Replay Data & Space Weather

- NASA Community Coordinated Modeling Center (CCMC) / Moon-to-Mars (M2M) Space Weather Analysis Office, DONKI (Database Of Notifications, Knowledge, Information), NASA Goddard Space Flight Center.
- Heber, Bernd; Löwe, Jan Leo (2026). *MSL/RAD Dose rates*. Zenodo. doi:10.5281/zenodo.20536564. CC BY 4.0
- NASA PDS Planetary Plasma Interactions Node; RAD PI D. Hassler (SwRI)
- NASA Navigation and Ancillary Information Facility (NAIF), Jet Propulsion Laboratory: SPICE kernels

### Partner Agencies (02 §C.5)

- "ESA Mars Express HRSC data are part of the USGS Gale merged DEM (L2)."
- "ESA ExoMars Trace Gas Orbiter trajectory kernels (ESA SPICE Service) are used for the relay geometry (L10)."
- "The X12 flare-class estimate for 20 May 2024 comes from ESA/NASA Solar Orbiter data, as reported in NASA's release of 10 June 2024 (L9)."

## Licence

Code: [Apache-2.0](LICENSE). Data and images keep their original credits and use constraints.
