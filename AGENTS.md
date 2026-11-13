# Agent instructions — Gale Surface Ops

For any coding agent (Codex, Cursor, Gemini CLI, …). This file is the single rule set; Claude Code users also get [CLAUDE.md](CLAUDE.md), and Gemini CLI reads this file through `.gemini/settings.json`. How each agent runs the shared pipeline, skills and design checks: [docs/ops/agentic-workflow.md](docs/ops/agentic-workflow.md).

**Project.** Team CheesySpace's NASA Space Apps 2026 entry: a habitat-local Mars surface operations system for one Exploration Zone at Gale crater — planner, Hab Core server, EVA tablet/HUD, ops console, with a replayed real solar particle event. npm workspaces: `apps/web` (TypeScript, Vite, OpenLayers, proj4), `apps/hab-core` (Node.js, Fastify, ws), `packages/compute`, `packages/protocol`; offline Python pipeline in `pipeline/`. Start at [docs/README.md](docs/README.md); `docs/specs/01–06` are the source of truth.

**Full run, 12–13 Nov 2026 (read first).** Until the submission deadline (13 Nov 18:00) the product is finished in two lanes, backend (`core-backend`, Sadman) and frontend (`core-frontend`, Obidit), integrated on `merging-core`. Read [docs/plan/README.md](docs/plan/README.md) before any work: lane boundaries, package order, implementer prompt and conflict handling. It overrides task ownership in `_coordination.md` for the duration of the run.

## Phase gate

**Track P recorded 2026-11-04: application code may be written before 13 Nov.** See [docs/ops/rules.md](docs/ops/rules.md) for the Local Lead's answer and the open scope question. Work follows the task windows and dependency order in [docs/tasks/_coordination.md](docs/tasks/_coordination.md); `pre-event-if-permitted` subtasks may start now. Re-check against the 2026 Project Submission and Judging guides on 13 Nov.

## Rules

1. No internet at runtime: clients talk only to the Hab Core on the LAN; all assets local.
2. Science is deterministic and lives only in `packages/compute/` and `pipeline/`. No AI-generated numbers anywhere. The Hab Core engine never reads wall-clock time.
3. Every displayed value has a provenance label (`measured | derived | modelled | assumed | replayed | simulated`) and a source id. Status colours mean status only (04 §A.3).
4. Mars CRS: `IAU_2015:49900` sphere (R = 3,396,190 m), planetocentric latitude, east-positive longitude, local `+proj=eqc` working projection. Never use EPSG:3857/WGS84 code paths or Earth-radius distance helpers (`ol/sphere`). Mars24 needs `west = (360 − east) mod 360`.
5. No under-18 likeness in media. Code is Apache-2.0; credit every dataset and image.
6. Log AI-assisted work in [docs/AI_USE.md](docs/AI_USE.md).
7. Never commit downloaded datasets or large binaries.

## Workflow

- Read the spec that owns what you change (05 field names, 02 behaviour, 03 screens, 04 visuals, 06 order). Update the doc first when behaviour changes.
- Keep ids (FR-, NFR-, SCR-, TASK-, D-, U-, A-) in commits and PRs. Do not alter requirement text, numbers, ids or status labels.
- Mark unknowns `TODO(verify)` and open choices `TODO(decision)`; never invent URLs, dataset properties or flags.
- Every change follows plan → human gate → tests first → implement → review → human gate → commit. Without slash commands, ask your agent to follow `.claude/commands/orch-add-feature.md` (or `orch-fix-defect.md`) and stop at each GATE.
- Visual work follows `docs/specs/04_Design_Brief.md`; it wins over Impeccable's defaults (fonts, colours, layout). Run the Impeccable skill or `make design-check` on UI changes.
- Before committing: `make lint typecheck test docs-check`.
- **Progress bar.** The README progress block is generated from [docs/tasks/status.md](docs/tasks/status.md). For every commit: add or update the row of each subtask the commit finishes (`done`) or starts (`wip`; id from [_coordination.md](docs/tasks/_coordination.md#a3-register), with the evidence link), run `make progress`, and stage `docs/tasks/status.md` and `README.md` in that same commit, so the bar always matches `HEAD`. Mark `done` only when the subtask's acceptance criteria are met; never edit the README block by hand. `make docs-check` fails when the block is stale.
