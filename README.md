# Gale Surface Ops — CheesySpace

Team CheesySpace's entry for the **NASA Space Apps Challenge 2026**, challenge *Interplanetary Survival Guide: Martian Map* (Bangladesh event, 13–14 Nov 2026).

A habitat-local surface operations system for one Mars **Exploration Zone** at Gale crater (Mount Sharp). Before the walk, a planner builds a suit-safe EVA through science and resource-prospecting stops on real HiRISE terrain. During the walk, a **Hab Core** server inside the habitat runs the mission clock: two simulated astronauts follow the plan on their suit tablets and HUDs while an ops console watches everyone. Then the real solar particle event of **20 May 2024 (sol 4190)**, recorded by Curiosity's RAD, is replayed — the habitat detects it before Earth's warning can arrive, and the crew summon a pressurized rover to shelter.

Every number is labelled **measured, derived, modelled, assumed, replayed or simulated**. Nothing needs the internet at runtime, because nothing on Mars would have it.

## Status

**Submitted.** On 13 November 2026, team lead Obidit Islam confirmed that the videos and all other project materials had been submitted. [Watch the submitted video](https://www.youtube.com/watch?v=ovzdp5B8Hh8&feature=youtu.be) and see the [submission record](docs/ops/submit-now.md#submission-confirmation) for the archive source and verification evidence.

The planner, habitat server and role views are implemented. The progress block below tracks engineering acceptance and documentation audits; submission completion is recorded separately. The submission archive includes the complete Gale site bundle; repository users obtain it through the [bundle download instructions](docs/ops/hosting.md#3-team-release-asset-fetch-route).

## Progress

<!-- progress:start -->
`██████████████████░░` **92 %** — 318 of 345 subtasks done, 5 in progress.

| Task | Progress | Done | In progress | Total |
| --- | --- | --- | --- | --- |
| [TASK-00 Resolve rules + register](docs/tasks/TASK-00_resolve-rules-and-register.md) | `██████████` 100 % | 5 | 0 | 5 |
| [TASK-01 Feasibility: AOI, DEM quality, coverage checks](docs/tasks/TASK-01_feasibility.md) | `██████████` 100 % | 6 | 0 | 6 |
| [TASK-02 Spike: OpenLayers custom Mars projection + custom tile grid](docs/tasks/TASK-02_projection-spike.md) | `██████████` 100 % | 5 | 0 | 5 |
| [TASK-03 Preprocessing pipeline](docs/tasks/TASK-03_preprocessing-pipeline.md) | `██████████` 100 % | 32 | 0 | 32 |
| [TASK-04 Vectors, POIs and images](docs/tasks/TASK-04_vectors-pois-images.md) | `██████████` 100 % | 9 | 0 | 9 |
| [TASK-05 Compute core: grid loader, sampling, A*, profile, time model, walkback, warnings](docs/tasks/TASK-05_compute-core.md) | `██████░░░░` 60 % | 30 | 0 | 50 |
| [TASK-06 Mars24 solar functions + radiation estimate](docs/tasks/TASK-06_mars24-and-radiation.md) | `██████████` 100 % | 10 | 0 | 10 |
| [TASK-07 App shell + map workspace + layers panel + inspector](docs/tasks/TASK-07_app-shell-and-map-workspace.md) | `██████████` 100 % | 17 | 0 | 17 |
| [TASK-08 Plan panel + waypoint editing](docs/tasks/TASK-08_plan-panel-and-waypoints.md) | `██████████` 100 % | 11 | 0 | 11 |
| [TASK-09 Results panel + profile](docs/tasks/TASK-09_results-panel-and-profile.md) | `██████████` 100 % | 8 | 0 | 8 |
| [TASK-10 POI detail + Conditions panel](docs/tasks/TASK-10_poi-detail-and-conditions.md) | `██████████` 100 % | 4 | 0 | 4 |
| [TASK-11 Briefing card + JSON export](docs/tasks/TASK-11_briefing-card-and-export.md) | `██████████` 100 % | 7 | 0 | 7 |
| [TASK-12 Sources & Methods + provenance attributes](docs/tasks/TASK-12_sources-methods-provenance.md) | `██████████` 100 % | 7 | 0 | 7 |
| [TASK-13 Visual system + accessibility](docs/tasks/TASK-13_visual-system-accessibility.md) | `██████████` 100 % | 13 | 0 | 13 |
| [TASK-14 Integration + offline hardening + fault tests](docs/tasks/TASK-14_integration-offline-hardening.md) | `████████░░` 82 % | 9 | 0 | 11 |
| [TASK-15 Usability test](docs/tasks/TASK-15_usability-test.md) | `████████░░` 75 % | 3 | 1 | 4 |
| [TASK-16 Submission package](docs/tasks/TASK-16_submission-package.md) | `███████░░░` 71 % | 5 | 2 | 7 |
| [TASK-17 Videos](docs/tasks/TASK-17_videos.md) | `██████████` 100 % | 3 | 0 | 3 |
| [TASK-20 Hab Core skeleton: server, protocol v0, LAN spike](docs/tasks/TASK-20_hab-core-skeleton.md) | `██████████` 100 % | 12 | 0 | 12 |
| [TASK-21 Scenario builder: SPICE, DONKI and RAD tables, `scenario.json`, demo numbers](docs/tasks/TASK-21_scenario-builder.md) | `██████████` 100 % | 13 | 0 | 13 |
| [TASK-22 Simulation engine: clock, crew motion, consumables, alerts, event log, replay](docs/tasks/TASK-22_simulation-engine.md) | `██████████` 100 % | 16 | 0 | 16 |
| [TASK-23 Safety ops in the Hab Core: commands, haven per tick, summon and rendezvous, contingency options, abort](docs/tasks/TASK-23_safety-ops.md) | `██████████` 100 % | 8 | 0 | 8 |
| [TASK-24 EVA client and HUD: SCR-12 tablet, SCR-13 HUD, SCR-14 options sheet, SCR-18 link lost, full-screen map](docs/tasks/TASK-24_eva-client-and-hud.md) | `██████████` 100 % | 11 | 0 | 11 |
| [TASK-25 Ops console: SCR-11 with the shared map, alerts, options approval, clock control, SCR-10 join](docs/tasks/TASK-25_ops-console.md) | `██████████` 100 % | 9 | 0 | 9 |
| [TASK-26 Links: surface link graph and `LINK_STATE`, comm-shadow warnings, Earth link widget and delayed queue](docs/tasks/TASK-26_links.md) | `██████████` 100 % | 7 | 0 | 7 |
| [TASK-27 Event log view, post-EVA report, replay mode for GitHub Pages](docs/tasks/TASK-27_report-and-replay.md) | `██████████` 100 % | 6 | 0 | 6 |
| [TASK-28 Network kit and rehearsal: router, static IP, QR join, device matrix, venue checklist](docs/tasks/TASK-28_network-kit.md) | `██████████` 100 % | 5 | 0 | 5 |
| [TASK-29 Robotic rover tasking: SCOUT, CARRY, RELAY, RETURN](docs/tasks/TASK-29_rover-tasking.md) | `██████████` 100 % | 6 | 0 | 6 |
| [TASK-30 Score-sheet single points: challenge named, repo public, page drafted, AI use current](docs/tasks/TASK-30_score-sheet-points.md) | `███░░░░░░░` 33 % | 1 | 2 | 3 |
| [TASK-31 Stop task list (FR-50): protocol, engine, EVA list, ops progress, task text](docs/tasks/TASK-31_stop-task-list.md) | `██████████` 100 % | 8 | 0 | 8 |
| [TASK-32 Live operations session: presenter panel, event on demand, mission setup, stop task library](docs/tasks/TASK-32_live-session.md) | `██████████` 100 % | 32 | 0 | 32 |

Totals leave out 43 fallback and desirable subtasks (they may never run); 31 of them done. Source: [docs/tasks/status.md](docs/tasks/status.md), regenerated by `make progress`.
<!-- progress:end -->

Generated, do not edit by hand. Record finished subtasks in [docs/tasks/status.md](docs/tasks/status.md), then run `make progress`.

## Quickstart

To run the application, use Node.js 26.x with npm (verified with Node.js 26.13.0). The submission archive includes the Gale runtime data. For a repository checkout, first obtain the [site bundle](docs/ops/hosting.md#3-team-release-asset-fetch-route).

```sh
npm ci
npm run build
npm run hab:local -- --open
```

Open `http://localhost:8080/#/` for the mission briefing. The local launcher also prints and opens the ops, presenter, EV1 tablet and EV1 HUD URLs. Use `#/planner` to plan a route, `#/sources` to inspect provenance, and `#/replay` to watch the reference recording. The runtime needs no internet after installation and building.

The offline preprocessing pipeline and full development checks additionally require conda (Miniconda or Miniforge) and GNU Make:

```sh
make setup        # npm ci (all workspaces) + conda environment marswalk-pipeline
make check-env    # fails unless the pipeline interpreter, GDAL, rasterio and pyproj are right
make lint typecheck test docs-check
make test-web     # Vitest in every workspace; needs no conda
make hab          # Hab Core on 0.0.0.0:8080 (habitat LAN)
make dev          # Vite dev server; proxies /sites, /api, /ws to the Hab Core
make demo         # production build served by the Hab Core (no internet needed)
make replay       # headless scenario replay, prints the event-log hash
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

Source datasets (USGS Gale DEM and orthophoto, THEMIS, CRISM, rover images) are never committed. The offline pipeline (`make data`) downloads into the git-ignored `pipeline/work/` and writes the site bundle to `data/sites/<site_id>/` (layout: [data/sites/gale_boxwork/README.md](data/sites/gale_boxwork/README.md)). Source URLs, versions and checksums go in `pipeline/sources.lock.json`. The large tiles, grid and images are shared as a GitHub release asset (chosen route, not Git LFS); see [docs/ops/feasibility.md](docs/ops/feasibility.md).

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

Credits below reproduce the source and image credits in the site manifests and POI records. The mock-site data are synthetic fixtures.

### Gale site sources

- **Apollo 15 EVA Capability And Constraints Envelopes** (`apollo17-planning`): P. Benjamin, Bellcomm, Inc.; Memorandum for File B70 10028, 13 October 1970. PDF document courtesy NASA Technical Reports Server.
- **Mars' surface radiation environment measured with the Mars Science Laboratory's Curiosity rover** (`hassler-2014-rad`): Hassler et al., 2014
- **Mars24 Sunclock — Time on Mars** (`mars24-allison-mcewen-2000`): Mars24: Robert B. Schmunk; algorithms: Michael D. Allison; algorithm reference: Allison, M., and M. McEwen (2000), A post-Pathfinder evaluation of aerocentric solar coordinates with improved timing recipes for Mars seasonal/diurnal climate studies (Planetary and Space Science; © 2000 Elsevier Science Ltd).
- **Curiosity Blog, Sols 4620-4621: Among the Hollows and the Ridges** (`nasa-msl-blog-sols-4620-4621`): NASA/JPL-Caltech (Curiosity blog)
- **Curiosity Blog, Sols 4649-4654: Ridges, Hollows and Nodules, Oh My** (`nasa-msl-blog-sols-4649-4654`): NASA/JPL-Caltech (Curiosity blog)
- **Curiosity Blog, Sols 4675-4681: Deciding Where to Dig Into the Boxworks** (`nasa-msl-blog-sols-4675-4681`): NASA/JPL-Caltech (Curiosity blog)
- **Curiosity Blog, Sols 4695-4701: Searching for Answers at Monte Grande** (`nasa-msl-blog-sols-4695-4701`): NASA/JPL-Caltech (Curiosity blog)
- **Curiosity Blog, Sols 4709-4715: Drilling High and Low in the Boxwork Unit** (`nasa-msl-blog-sols-4709-4715`): NASA/JPL-Caltech (Curiosity blog)
- **Curiosity Blog, Sols 4716-4722: Drilling Success at Nevado Sajama** (`nasa-msl-blog-sols-4716-4722`): NASA/JPL-Caltech (Curiosity blog)
- **Curiosity Blog, Sols 4845-4851: Bye-Bye Boxwork, Bye-Bye** (`nasa-msl-blog-sols-4845-4851`): NASA/JPL-Caltech (Curiosity blog)
- **NASA's Curiosity Mars Rover Starts Unpacking Boxwork Formations** (`nasa-msl-boxwork-article-2025-06`): NASA/JPL-Caltech/MSSS (images on the page); text: NASA, Jet Propulsion Laboratory (release 2025-080)
- **The Space Exploration Vehicle Characteristics (Surface Concept)** (`nasa-sev-factsheet-2011`): NASA, The Space Exploration Vehicle Characteristics (Surface Concept), NASA Facts FS-2011-08-045-JSC
- **Collection of localization data products for Rover PLACES** (`pds-msl-places-localizations`): Deen, Robert G. (2024), Mars Science Laboratory Rover PLACES Bundle, version 42.0, NASA Planetary Data System, doi:10.17189/8nyv-8p60; collection "Collection of localization data products for Rover PLACES" (Citation_Information of bundle.xml and collection_data_localizations.xml)
- **Mars Science Laboratory Software Interface Specification: PLACES Data Products for PDS** (`pds-msl-places-sis-1-3`): Robert Deen (2016), PLACES Data Products for PDS SIS, JPL; Copyright 2016 California Institute of Technology, government sponsorship acknowledged
- **Mars Science Laboratory (MSL) REMS Bundle** (`pds-atmos-msl-rems`): Rodriguez-Manfredi, J. A., and de la Torre Juarez, M. (2026), Mars Science Laboratory (MSL) REMS Bundle, version 1.0, NASA Planetary Data System, Atmospheres Node, doi:10.17189/vwva-ms24. The app reads the air temperature, ground temperature and pressure columns of the named RNV files and reports the 10th, 50th and 90th percentiles of each 5 degree L_s bin; no figure or text is reproduced from the files.
- **The Martian Radiation Environment and Human Health Risks** (`simonsen-2024-rad`): Simonsen et al., 2024
- **Improved prediction of hiking speeds using a data driven approach** (`tobler-1993`): Andrew Wood; William Mackaness; T. Ian Simpson; J. Douglas Armstrong; arXiv:2303.16065v6
- **Mars MSL Gale Merged DEM 1m** (`usgs-gale-dem-1m-v3`): Please credit authors
- **Mars MSL Gale Merged Orthophoto Mosaic 25cm, colour version HiRISE 78 quad color basemap** (`usgs-gale-ortho-25cm-v3`): NASA/JPL-Caltech/University of Arizona; USGS Astrogeology (Calef & Parker 2016)
- **THEMIS Thermal Inertia Mosaic Quantitative 30S120E 100mpp** (`usgs-themis-ti-30s120e`): Please cite authors

### Mock-site fixture sources

- **Mars MSL Gale Merged DEM 1m** (`usgs-gale-dem-1m-v3`): Please credit authors
- **Hassler et al., 2014** (`hassler-2014-rad`): Hassler et al., 2014
- **Simonsen et al., 2024** (`simonsen-2024-rad`): Simonsen et al., 2024

POI images: NASA/JPL-Caltech; NASA/JPL-Caltech/MSSS. See the [POI records](data/sites/gale_boxwork/vectors/pois.geojson) for the individual image credits.

### Storm replay and partner-agency sources

- **DONKI** (Database Of Notifications, Knowledge, Information, L8): NASA Community Coordinated Modeling Center (CCMC) / Moon-to-Mars (M2M) Space Weather Analysis Office, NASA Goddard Space Flight Center.
- **MSL/RAD Dose rates** (L9): Heber, Bernd; Löwe, Jan Leo (2026). *MSL/RAD Dose rates*. Zenodo. doi:10.5281/zenodo.20536564. CC BY 4.0 (with NASA SPDF `msl_rad_obs-l2` CDF and NASA PDS Planetary Plasma Interactions Node `MSL-M-RAD-3-RDR-V1.0`; acknowledging RAD PI Dr. Donald M. Hassler, Southwest Research Institute Boulder).
- **NASA NAIF SPICE kernels** (L10): NASA Navigation and Ancillary Information Facility (NAIF), Jet Propulsion Laboratory: generic, MRO and MAVEN SPICE kernels.
- **ESA SPICE Service ExoMars 2016 Trace Gas Orbiter kernels** (L10): ESA SPICE Service, ExoMars 2016 Trace Gas Orbiter kernels.
- **Partner-agency credits (02 §C.5):**
  - ESA Mars Express HRSC data are part of the USGS Gale merged DEM (L2).
  - ESA ExoMars Trace Gas Orbiter trajectory kernels (ESA SPICE Service) are used for the relay geometry (L10).
  - The X12 flare-class estimate for 20 May 2024 comes from ESA/NASA Solar Orbiter data, as reported in NASA's release of 10 June 2024 (L9).

### Fonts and icons

Inter, IBM Plex Mono, Chakra Petch and Source Serif 4 are bundled under SIL Open Font License 1.1; their licence files are included under [apps/web/public/fonts](apps/web/public/fonts/). Lucide icons use the bundled [ISC licence](apps/web/public/icons/LICENSE).

## Prototype boundary

Gale Surface Ops is an exploratory hackathon prototype. It is not astronaut operations software. Crew, suit, rover and vehicle states are simulated. Solar events are real historical records replayed on a simulated clock — not a live feed from Mars. Slope limits, speeds, consumables and shelter values are illustrative assumptions from Earth and Apollo-era references. Radio coverage is line-of-sight only.

## Licence

Code: [Apache-2.0](LICENSE). Data and images keep their original credits and use constraints.
