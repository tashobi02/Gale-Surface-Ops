# Marswalk Planner — CheesySpace

*(working title)* Team CheesySpace's entry for the **NASA Space Apps Challenge 2026**, challenge *Interplanetary Survival Guide: Martian Map* (Bangladesh event, 13–14 Nov 2026).

An offline, browser-based planning map for one hyperlocal Mars site (proposed: Curiosity's 2025 boxwork area on Mount Sharp, Gale crater). A planner places science stops on orbital imagery and terrain; the app computes a suited-walking route that respects slope limits and hazards, and reports the elevation profile, time and walkback margins, daylight window and an estimated radiation dose. Every number is labelled **measured, derived, modelled or assumed**.

## Status

**Skeleton only.** Docs, schemas, configs and stub modules are in place; no functional code yet. Whether app code may be written before the event is still open (TASK-00, see [docs/ops/rules.md](docs/ops/rules.md)). All product decisions are *Proposed* ([docs/decisions/](docs/decisions/)).

## Quickstart

Requirements: Node.js LTS, Python ≥ 3.11, GNU Make.

```sh
make setup        # npm ci + .venv with pipeline[dev]
make lint typecheck test docs-check
make dev          # Vite dev server
make demo         # production build + local static server on 127.0.0.1:8080 (works offline)
```

The full pipeline environment (GDAL ≥ 3.6, rasterio, numpy, pyproj) is in [pipeline/environment.yml](pipeline/environment.yml); it is not needed for the checks above.

## Data is not in git

Source datasets (USGS Gale DEM and orthophoto, THEMIS, CRISM, rover images) are never committed. The offline pipeline (`make data`, TASK-03, not implemented yet) downloads into the git-ignored `pipeline/work/` and writes the site bundle to `web/public/sites/<site_id>/` (layout: [web/public/sites/gale_boxwork/README.md](web/public/sites/gale_boxwork/README.md)). Source URLs, versions and checksums go in `pipeline/sources.lock.json`. The large tiles, grid and images are shared as a GitHub release asset (chosen route, not Git LFS); see [docs/ops/feasibility.md](docs/ops/feasibility.md).

## Documentation

| Document | Contents |
| --- | --- |
| [docs/README.md](docs/README.md) | Index, decisions, blockers, FR traceability |
| [docs/specs/](docs/specs/) | 01 PRD · 02 Technical · 03 App flow · 04 Design · 05 Schema · 06 Plan |
| [docs/reference/challenge-overview.md](docs/reference/challenge-overview.md) | Official challenge text |
| [docs/reference/mars-scientific-context.md](docs/reference/mars-scientific-context.md) | Cited Mars science reference |
| [docs/ops/](docs/ops/) | Rules check, feasibility, demo script, submission checklist |
| [docs/AI_USE.md](docs/AI_USE.md) | How AI tools were used to build this |
| [CLAUDE.md](CLAUDE.md) · [AGENTS.md](AGENTS.md) | Rules for coding agents |

## Credits

TODO: dataset and image credits (NFR-07), filled from each `DataSource.credit` in the site manifest. Planned sources are listed in [02 Sources](docs/specs/02_Technical_Requirements_Document.md#sources-accessed-2026-11-02).

## Licence

Code: [Apache-2.0](LICENSE). Data and images keep their original credits and use constraints.
