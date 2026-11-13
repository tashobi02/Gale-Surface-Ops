# Marswalk Surface Ops — CheesySpace

*(working title)* Team CheesySpace's entry for the **NASA Space Apps Challenge 2026**, challenge *Interplanetary Survival Guide: Martian Map* (Bangladesh event, 13–14 Nov 2026).

A habitat-local surface operations system for one Mars **Exploration Zone** at Gale crater (Mount Sharp). Before the walk, a planner builds a suit-safe EVA through science and resource-prospecting stops on real HiRISE terrain. During the walk, a **Hab Core** server inside the habitat runs the mission clock: two simulated astronauts follow the plan on their suit tablets and HUDs while an ops console watches everyone. Then the real solar particle event of **20 May 2024 (sol 4190)**, recorded by Curiosity's RAD, is replayed — the habitat detects it before Earth's warning can arrive, and the crew summon a pressurized rover to shelter.

Every number is labelled **measured, derived, modelled, assumed, replayed or simulated**. Nothing needs the internet at runtime, because nothing on Mars would have it.

## Status

**v2 skeleton (surface ops reframe, 2026-11-04).** Specs v2, monorepo layout, types, stubs and design tokens are in place; no functional code yet. Application code is allowed before the event (Track P, [docs/ops/rules.md](docs/ops/rules.md)). The progress bar below counts the v1 atomized subtasks; v2 tasks (TASK-05b, TASK-20–30) are listed in [06 §C.2](docs/specs/06_High_Level_Implementation_Plan.md#c2-new-in-v2-surface-ops-tier-1-unless-marked) and are not yet atomized.

## Progress

<!-- progress:start -->
`████████████████░░░░` **79 %** — 274 of 345 subtasks done, 44 in progress.

| Task | Progress | Done | In progress | Total |
| --- | --- | --- | --- | --- |
| [TASK-00 Resolve rules + register](docs/tasks/TASK-00_resolve-rules-and-register.md) | `██████████` 100 % | 5 | 0 | 5 |
| [TASK-01 Feasibility: AOI, DEM quality, coverage checks](docs/tasks/TASK-01_feasibility.md) | `██████████` 100 % | 6 | 0 | 6 |
| [TASK-02 Spike: OpenLayers custom Mars projection + custom tile grid](docs/tasks/TASK-02_projection-spike.md) | `████████░░` 80 % | 4 | 1 | 5 |
| [TASK-03 Preprocessing pipeline](docs/tasks/TASK-03_preprocessing-pipeline.md) | `██████████` 100 % | 32 | 0 | 32 |
| [TASK-04 Vectors, POIs and images](docs/tasks/TASK-04_vectors-pois-images.md) | `██████████` 100 % | 9 | 0 | 9 |
| [TASK-05 Compute core: grid loader, sampling, A*, profile, time model, walkback, warnings](docs/tasks/TASK-05_compute-core.md) | `██████░░░░` 60 % | 30 | 0 | 50 |
| [TASK-06 Mars24 solar functions + radiation estimate](docs/tasks/TASK-06_mars24-and-radiation.md) | `██████████` 100 % | 10 | 0 | 10 |
| [TASK-07 App shell + map workspace + layers panel + inspector](docs/tasks/TASK-07_app-shell-and-map-workspace.md) | `██████████` 100 % | 17 | 0 | 17 |
| [TASK-08 Plan panel + waypoint editing](docs/tasks/TASK-08_plan-panel-and-waypoints.md) | `██████████` 100 % | 11 | 0 | 11 |
| [TASK-09 Results panel + profile](docs/tasks/TASK-09_results-panel-and-profile.md) | `█████████░` 88 % | 7 | 1 | 8 |
| [TASK-10 POI detail + Conditions panel](docs/tasks/TASK-10_poi-detail-and-conditions.md) | `██████████` 100 % | 4 | 0 | 4 |
| [TASK-11 Briefing card + JSON export](docs/tasks/TASK-11_briefing-card-and-export.md) | `██████████` 100 % | 7 | 0 | 7 |
| [TASK-12 Sources & Methods + provenance attributes](docs/tasks/TASK-12_sources-methods-provenance.md) | `███████░░░` 71 % | 5 | 2 | 7 |
| [TASK-13 Visual system + accessibility](docs/tasks/TASK-13_visual-system-accessibility.md) | `████████░░` 85 % | 11 | 2 | 13 |
| [TASK-14 Integration + offline hardening + fault tests](docs/tasks/TASK-14_integration-offline-hardening.md) | `███████░░░` 73 % | 8 | 1 | 11 |
| [TASK-15 Usability test](docs/tasks/TASK-15_usability-test.md) | `██░░░░░░░░` 25 % | 1 | 1 | 4 |
| [TASK-16 Submission package](docs/tasks/TASK-16_submission-package.md) | `░░░░░░░░░░` 0 % | 0 | 7 | 7 |
| [TASK-17 Videos](docs/tasks/TASK-17_videos.md) | `░░░░░░░░░░` 0 % | 0 | 3 | 3 |
| [TASK-20 Hab Core skeleton: server, protocol v0, LAN spike](docs/tasks/TASK-20_hab-core-skeleton.md) | `██████████` 100 % | 12 | 0 | 12 |
| [TASK-21 Scenario builder: SPICE, DONKI and RAD tables, `scenario.json`, demo numbers](docs/tasks/TASK-21_scenario-builder.md) | `██████████` 100 % | 13 | 0 | 13 |
| [TASK-22 Simulation engine: clock, crew motion, consumables, alerts, event log, replay](docs/tasks/TASK-22_simulation-engine.md) | `██████████` 100 % | 16 | 0 | 16 |
| [TASK-23 Safety ops in the Hab Core: commands, haven per tick, summon and rendezvous, contingency options, abort](docs/tasks/TASK-23_safety-ops.md) | `██████████` 100 % | 8 | 0 | 8 |
| [TASK-24 EVA client and HUD: SCR-12 tablet, SCR-13 HUD, SCR-14 options sheet, SCR-18 link lost, full-screen map](docs/tasks/TASK-24_eva-client-and-hud.md) | `████░░░░░░` 36 % | 4 | 6 | 11 |
| [TASK-25 Ops console: SCR-11 with the shared map, alerts, options approval, clock control, SCR-10 join](docs/tasks/TASK-25_ops-console.md) | `███░░░░░░░` 33 % | 3 | 5 | 9 |
| [TASK-26 Links: surface link graph and `LINK_STATE`, comm-shadow warnings, Earth link widget and delayed queue](docs/tasks/TASK-26_links.md) | `█████████░` 86 % | 6 | 1 | 7 |
| [TASK-27 Event log view, post-EVA report, replay mode for GitHub Pages](docs/tasks/TASK-27_report-and-replay.md) | `███████░░░` 67 % | 4 | 1 | 6 |
| [TASK-28 Network kit and rehearsal: router, static IP, QR join, device matrix, venue checklist](docs/tasks/TASK-28_network-kit.md) | `████████░░` 80 % | 4 | 1 | 5 |
| [TASK-29 Robotic rover tasking: SCOUT, CARRY, RELAY, RETURN](docs/tasks/TASK-29_rover-tasking.md) | `████████░░` 83 % | 5 | 1 | 6 |
| [TASK-30 Score-sheet single points: challenge named, repo public, page drafted, AI use current](docs/tasks/TASK-30_score-sheet-points.md) | `░░░░░░░░░░` 0 % | 0 | 3 | 3 |
| [TASK-31 Stop task list (FR-50): protocol, engine, EVA list, ops progress, task text](docs/tasks/TASK-31_stop-task-list.md) | `█████░░░░░` 50 % | 4 | 4 | 8 |
| [TASK-32 Live operations session: presenter panel, event on demand, mission setup, stop task library](docs/tasks/TASK-32_live-session.md) | `█████████░` 88 % | 28 | 4 | 32 |

Totals leave out 43 fallback and desirable subtasks (they may never run); 23 of them done. Source: [docs/tasks/status.md](docs/tasks/status.md), regenerated by `make progress`.
<!-- progress:end -->

Generated, do not edit by hand. Record finished subtasks in [docs/tasks/status.md](docs/tasks/status.md), then run `make progress`.

## Quickstart

Requirements: Node.js LTS, conda (Miniconda or Miniforge; the pipeline's only Python environment), GNU Make.

```sh
make setup        # npm ci (all workspaces) + conda environment marswalk-pipeline
make check-env    # fails unless the pipeline interpreter, GDAL, rasterio and pyproj are right
make lint typecheck test docs-check
make test-web     # Vitest in every workspace; needs no conda
make hab          # Hab Core on 0.0.0.0:8080 (habitat LAN) — stub until TASK-20
make dev          # Vite dev server; proxies /sites, /api, /ws to the Hab Core
make demo         # production build served by the Hab Core (no internet needed)
make replay       # headless scenario replay, prints the event-log hash — stub until TASK-22
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

TODO: dataset and image credits (NFR-07), filled from each `DataSource.credit` in the site manifest. Planned sources are listed in [02 Sources](docs/specs/02_Technical_Requirements_Document.md#sources-accessed-2026-11-02). Partner-agency data: ESA Mars Express HRSC (in the Gale DEM) and ESA TGO trajectories (relay geometry).

## Licence

Code: [Apache-2.0](LICENSE). Data and images keep their original credits and use constraints.
