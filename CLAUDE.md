# Marswalk Planner — Claude Code instructions

## 1. Project

Team CheesySpace's NASA Space Apps 2026 entry for *Interplanetary Survival Guide: Martian Map* (Bangladesh event, 13–14 Nov 2026).
An offline, browser-based planning map for one hyperlocal Mars site (proposed: Mount Sharp boxwork, Gale crater) that computes a suited-walking route and labels every number.
Static web app (`web/`) + offline Python preprocessing pipeline (`pipeline/`); no backend, no database.

Start at [docs/README.md](docs/README.md): index, traceability table, decisions, blockers. The specs in `docs/specs/` are the source of truth.

## 2. Non-negotiables

- **Offline-first.** No network request leaves `localhost` at runtime; all assets are local (NFR-01, NFR-08). External sources are contacted only by the pipeline, before the event.
- **Deterministic science lives only in `web/src/compute/` and `pipeline/`.** No LLM-computed or LLM-generated numbers anywhere, in code, data or docs ([ADR-006](docs/decisions/ADR-006-no-ai-in-mvp.md), 01 §C.4).
- **Every displayed value carries a provenance label** — `measured | derived | modelled | assumed` via `data-provenance` — and a source id (FR-15, NFR-05).
- **Mars CRS** ([02 §C.1, §C.4](docs/specs/02_Technical_Requirements_Document.md#c1-coordinate-reference-conventions-applies-to-every-layer)):
  - Base `IAU_2015:49900` sphere, R = 3,396,190 m; planetocentric latitude; **east-positive** longitude.
  - Working projection is the local `+proj=eqc` string; pipeline and UI use the byte-identical string.
  - Never pass Mars coordinates through EPSG:3857 / WGS84 code paths. Never use `ol/sphere` (Earth radius); measure in projected metres.
  - Mars24 implementations often take west longitude: convert `west = (360 − east) mod 360`.
  - Raster row 0 = north; DEM no-data becomes `NaN` before slope.
- **Media:** no under-18 likeness in videos or images (06 TASK-17).
- **Licence:** Apache-2.0; credit every dataset and image in the UI and README (NFR-07).
- **AI use:** log every AI-assisted change in [docs/AI_USE.md](docs/AI_USE.md).
- **Data:** never commit downloaded datasets or large binaries; `pipeline/work/` and site tiles/grids are git-ignored.

## 3. Phase gate

**Track P recorded 2026-11-04: application code may be written before 13 Nov.** See [docs/ops/rules.md](docs/ops/rules.md) for the Local Lead's answer and the open scope question.

Work follows the task windows and dependency order in [docs/tasks/_coordination.md](docs/tasks/_coordination.md); `pre-event-if-permitted` subtasks may start now. Re-check against the 2026 Project Submission and Judging guides on 13 Nov. The rules in §2 still apply to all code.

## 4. Commands

| Command | What it does |
| --- | --- |
| `make setup` | `npm ci` + conda environment `marswalk-pipeline` from `pipeline/environment.yml` (the only pipeline environment; no `.venv`) |
| `make check-env` | Fails unless the interpreter is that environment's and GDAL, rasterio, pyproj and `IAU_2015:49900` work |
| `make -s pipeline-python` | Prints the pipeline interpreter's absolute path. Use `$(make -s pipeline-python) -m ...` in docs and Verify lines, never `conda run` or `.venv` |
| `make validate SITE=<site_id>` | Manifest validator via that interpreter (stub until TASK-03) |
| `make lint` | markdownlint over all Markdown |
| `make typecheck` | `tsc --noEmit` in `web/` |
| `make test-web` | Vitest only (`web/`); needs no conda |
| `make test` | `check-env`, then Vitest (`web/`) + pytest (`pipeline/`); needs conda |
| `make docs-check` | markdownlint + relative link/anchor check (`scripts/check_links.py`) |
| `make dev` | Vite dev server |
| `make demo` | Production build + local static server (works offline) |
| `make data` | Pipeline entry; not implemented yet (TASK-03) |

## 5. Repo map

| Path | Contents |
| --- | --- |
| `docs/specs/01–06` | PRD, technical requirements, app flow, design brief, data schema, implementation plan |
| `docs/decisions/` | ADR-001…007 mirroring D-01…D-07 (Proposed) |
| `docs/reference/` | Official challenge text (verbatim), Mars science reference |
| `docs/ops/` | Rules check, feasibility, demo script, submission checklist |
| `schemas/` | JSON Schemas for `site-manifest.json` and plan export (from 05) |
| `web/src/types/schema.ts` | TypeScript mirror of every 05 entity |
| `web/src/compute/` | Worker protocol (02 §E.2) and pure compute functions |
| `web/src/ui/screens/` | One module per SCR-00…SCR-09 (03 §B) |
| `web/public/sites/<site_id>/` | Pipeline output (not in git yet) |
| `pipeline/src/marswalk_pipeline/` | Acquire → clip/reproject → derive → tiles/grid/vectors → manifest → validate |

## 6. Workflow

- Read the owning spec before editing; each doc's header names what it owns. Field names come from 05, behaviour from 02, screens from 03, visuals from 04, order and cuts from 06.
- When behaviour changes, update the doc first, then code, schemas and tests together.
- Keep traceability ids (FR-, NFR-, SCR-, TASK-, D-, U-, A-) in commit messages and PR descriptions; use the PR template checklist.
- Never change requirement text, numbers, ids or Confirmed/Assumed/Proposed/Unresolved labels in a docs refactor; report factual problems instead.
- Unknown tool behaviour or data properties: check `--help`/docs, otherwise write `TODO(verify)`. Open choices: `TODO(decision)`.
- Run `make lint typecheck test docs-check` before committing.

## 7. Tooling

### graphify (knowledge graph, v0.9.80)

This project keeps a knowledge graph in `graphify-out/` (only `GRAPH_REPORT.md` is committed).

- For codebase questions, run `graphify query "<question>"` first when `graphify-out/graph.json` exists; use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for one concept.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain are not enough.
- After code changes, run `graphify update .` (AST only, no LLM). **It does not re-read Markdown**: after doc changes, rebuild with `/graphify .`.
- The project hooks in `.claude/settings.json` (`graphify hook-guard`) are advisory, not strict.

### Plugins and skills

| Plugin / skill | Scope | Use for |
| --- | --- | --- |
| `code-review@claude-plugins-official` | project | Reviewing PRs against FR/TASK ids |
| `claude-md-management@claude-plugins-official` | project | Auditing this file (`claude-md-improver`) |
| `pyright-lsp@claude-plugins-official` | project | Type diagnostics in `pipeline/`. Finds rasterio/pyproj only if the conda env's `python` is first on PATH: run `conda activate marswalk-pipeline` before starting Claude Code or the editor |
| `agent-skills@addy-agent-skills` | user (recommended) | ADRs, CI, spec-driven work; third-party marketplace, so not project-enabled |
| `/trace <FR-id>` | project command | Screens, modules, entities, tasks and tests that reference an FR |
| `/rehearse-offline` | project command | Offline rehearsal checklist (06 §D.6) |
| `/orch-add-feature`, `/orch-fix-defect`, `/orch-change-feature`, `/orch-refine-code`, `/orch-review` | project (vendored from ECC) | Gated multi-agent pipeline: plan → GATE → TDD → review → GATE → commit, with the agents in `.claude/agents/` |
| `/speckit.analyze`, `/speckit.clarify`, `/speckit.checklist` | project (vendored from spec-kit) | Read-only cross-spec analysis, ≤ 5 clarification questions written back to 01, requirement-quality checklists; checked against [.specify/memory/constitution.md](.specify/memory/constitution.md) |

spec-kit files are listed in [.specify/README.md](.specify/README.md). ECC files are listed in [.claude/ecc/README.md](.claude/ecc/README.md). Where they conflict with this file — the phase gate in §3, `it.todo` instead of the ECC ≥ 80 % coverage rule, the non-negotiables in §2 — this file wins.
