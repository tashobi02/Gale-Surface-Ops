# Marswalk Surface Ops — Claude Code instructions

## 1. Project

Team CheesySpace's NASA Space Apps 2026 entry for *Interplanetary Survival Guide: Martian Map* (Bangladesh event, 13–14 Nov 2026).
**Marswalk Surface Ops** *(working title)*: a habitat-local surface operations system for one Mars Exploration Zone at Gale crater (Mount Sharp). A planner builds a suit-safe EVA; during the walk a **Hab Core** server runs the mission clock and simulation, EVA crew use a suit tablet / HUD, an ops console watches everyone, and a real solar particle event (20 May 2024, sol 4190) is replayed so the crew can shelter. Every number is labelled.

Layout (02 §A): `apps/web` (one web app, role views planner / ops / EVA / HUD / Earth) · `apps/hab-core` (Node.js server on the habitat LAN) · `packages/compute` (all deterministic science) · `packages/protocol` (shared types and wire format) · `pipeline/` (offline Python preprocessing) · `data/sites/` · `scenarios/`. No database; the Hab Core keeps an append-only event log.

Start at [docs/README.md](docs/README.md): index, traceability table, decisions, blockers. The specs in `docs/specs/` are the source of truth; the killer demo is [01 §E.1](docs/specs/01_Product_Requirements_Document.md#e1-killer-demo--storm-at-sol-4190-target-90-s-of-the-240-s-video).

## 2. Non-negotiables

- **No internet at runtime.** Clients talk only to the Hab Core on the habitat LAN (or `localhost`); all assets are local (NFR-01, NFR-08). External sources are contacted only by the pipeline, before the event.
- **Deterministic science lives only in `packages/compute/` and `pipeline/`.** The Hab Core engine uses sim time only — no `Date.now()` in `apps/hab-core/src/engine` (NFR-06). No LLM-computed or LLM-generated numbers anywhere, in code, data or docs ([ADR-006](docs/decisions/ADR-006-no-ai-in-mvp.md), 01 §C.4).
- **Every displayed value carries a provenance label** — `measured | derived | modelled | assumed | replayed | simulated` via `data-provenance` — and a source id (FR-15, NFR-05). Never call anything "live": replayed history is `replayed`, crew/vehicle state is `simulated`.
- **Status colours mean status only** ([04 §A.3](docs/specs/04_Design_Brief.md#a3-mission-critical-principles-non-negotiable)): every status has colour + shape + word + fixed position; brand orange never appears in OPS/HUD views.
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
| `make setup` | `npm ci` (all workspaces) + conda environment `marswalk-pipeline` from `pipeline/environment.yml` (the only pipeline environment; no `.venv`) |
| `make check-env` | Fails unless the interpreter is that environment's and GDAL, rasterio, pyproj and `IAU_2015:49900` work |
| `make -s pipeline-python` | Prints the pipeline interpreter's absolute path. Use `$(make -s pipeline-python) -m ...` in docs and Verify lines, never `conda run` or `.venv` |
| `make validate SITE=<site_id>` | Manifest validator on `data/sites/<site_id>` via that interpreter (stub until TASK-03) |
| `make lint` | markdownlint over all Markdown |
| `make typecheck` | `tsc --noEmit` in every workspace (`packages/*`, `apps/*`) |
| `make test-web` | Vitest in every workspace; needs no conda |
| `make test` | `check-env`, then Vitest (all workspaces) + pytest (`pipeline/`); needs conda |
| `make docs-check` | markdownlint + relative link/anchor check (`scripts/check_links.py`) + README progress block freshness |
| `make progress` | Regenerates the README progress bar from `docs/tasks/status.md` |
| `make dev` | Vite dev server for all role views; proxies `/sites`, `/api`, `/ws` to a running Hab Core |
| `make hab` | Hab Core on `0.0.0.0:8080` with the `storm-sol4190` scenario (stub until TASK-20) |
| `make replay` | Headless scenario replay; prints the event-log hash (stub until TASK-22) |
| `make demo` | Production build, then the Hab Core serves it on the habitat LAN |
| `make data` | Pipeline entry; not implemented yet (TASK-03) |

## 5. Repo map

| Path | Contents |
| --- | --- |
| `docs/specs/01–06` | PRD, technical requirements, app flow, design brief, data schema, implementation plan (v2) |
| `docs/decisions/` | ADR-001…011 mirroring D-01…D-12 |
| `docs/reference/` | Official challenge text (verbatim), Mars science reference |
| `docs/ops/` | Rules check (Track P), team roster, feasibility, demo script, submission checklist |
| `docs/tasks/` | Atomized v1 task plans (TASK-00…18) + coordination map; v2 tasks listed in 06 §C.2 |
| `schemas/` | JSON Schemas: site manifest, plan export, scenario, param set (from 05) |
| `packages/protocol/src/` | `schema.ts` (05 §C.1), `worker.ts` (02 §E.2), `runtime.ts` (05 §C.2), `ws.ts` (02 §E.6) |
| `packages/compute/src/` | Pure science: v1 routing/time/radiation/Mars24 + v2 haven, rendezvous, viewshed, link graph, Earth link, event dose, consumables, contingency |
| `apps/web/src/ui/screens/` | One module per SCR-00…SCR-18 (03 §B) |
| `apps/web/src/worker/` | Planner worker (thin wrapper over `@marswalk/compute`) |
| `apps/web/src/net/` | Hab Core WebSocket client |
| `apps/web/src/ui/styles/tokens.css` | Design tokens from 04 §C (modes via `<html data-mode>`) |
| `apps/hab-core/src/` | Server, session, scenario loader, event log, commands, engine (clock, reducer, tick), replay CLI |
| `data/sites/<site_id>/` | Pipeline output (binaries git-ignored; release asset) |
| `scenarios/<scenario_id>/` | Scenario files for the Hab Core (05 §C.2) |
| `pipeline/src/marswalk_pipeline/` | Acquire → clip/reproject → derive → tiles/grid/vectors → manifest → validate (+ v2: comm grid, SPICE tables, DONKI/RAD extraction — TASK-21) |

## 6. Workflow

- Read the owning spec before editing; each doc's header names what it owns. Field names come from 05, behaviour from 02, screens from 03, visuals from 04, order and cuts from 06.
- When behaviour changes, update the doc first, then code, schemas and tests together.
- Keep traceability ids (FR-, NFR-, SCR-, TASK-, D-, U-, A-) in commit messages and PR descriptions; use the PR template checklist.
- Never change requirement text, numbers, ids or Confirmed/Assumed/Proposed/Unresolved labels in a docs refactor; report factual problems instead.
- Unknown tool behaviour or data properties: check `--help`/docs, otherwise write `TODO(verify)`. Open choices: `TODO(decision)`.
- Run `make lint typecheck test docs-check` before committing.
- **Progress bar.** The README progress block is generated from [docs/tasks/status.md](docs/tasks/status.md). For every commit: add or update the row of each subtask the commit finishes (`done`) or starts (`wip`; id from [_coordination.md](docs/tasks/_coordination.md#a3-register), with the evidence link), run `make progress`, and stage `docs/tasks/status.md` and `README.md` in that same commit, so the bar always matches `HEAD` (a separate "update progress" commit after each commit would never converge). Mark `done` only when the subtask's acceptance criteria are met; never edit the README block by hand. `make docs-check` fails when the block is stale.

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
| `/impeccable` (+ `impeccable-*` agents) | project (vendored from Impeccable 4.8.0, [vendor/impeccable](vendor/impeccable/README.md)) | Critique, audit and polish of UI screens. Hooks check UI edits. [04](docs/specs/04_Design_Brief.md) wins over its defaults; `.impeccable/config.json` already allows Inter and Helvetica. Set `IMPECCABLE_LIVE_COPY_AGENT=chat` before `/impeccable live` |
| `/speckit.analyze`, `/speckit.clarify`, `/speckit.checklist` | project (vendored from spec-kit) | Read-only cross-spec analysis, ≤ 5 clarification questions written back to 01, requirement-quality checklists; checked against [.specify/memory/constitution.md](.specify/memory/constitution.md) |

Teammates also use Codex and Gemini CLI: shared rules live in [AGENTS.md](AGENTS.md); per-agent setup is in [docs/ops/agentic-workflow.md](docs/ops/agentic-workflow.md). Put rule changes in AGENTS.md first.

spec-kit files are listed in [.specify/README.md](.specify/README.md). ECC files are listed in [.claude/ecc/README.md](.claude/ecc/README.md). Where they conflict with this file — the phase gate in §3, `it.todo` instead of the ECC ≥ 80 % coverage rule, the non-negotiables in §2 — this file wins.
