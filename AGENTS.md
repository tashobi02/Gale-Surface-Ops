# Agent instructions — Marswalk Planner

For any coding agent (Codex, Cursor, Gemini CLI, …). Claude Code users also get [CLAUDE.md](CLAUDE.md).

**Project.** Team CheesySpace's NASA Space Apps 2026 entry: an offline, browser-based Marswalk planning map for one Mars site. Static web app in `web/` (TypeScript, Vite, OpenLayers, proj4) plus an offline Python pipeline in `pipeline/`. Start at [docs/README.md](docs/README.md); `docs/specs/01–06` are the source of truth.

## Phase gate

**Skeleton only until TASK-00 resolves; do not implement.** Function bodies stay stubs that throw/raise with a `TASK-xx` id; tests stay `it.todo` / `@pytest.mark.skip`. See [docs/ops/rules.md](docs/ops/rules.md).

## Rules

1. Offline-first: no runtime network requests; all assets local.
2. Science is deterministic and lives only in `web/src/compute/` and `pipeline/`. No AI-generated numbers anywhere.
3. Every displayed value has a provenance label (`measured | derived | modelled | assumed`) and a source id.
4. Mars CRS: `IAU_2015:49900` sphere (R = 3,396,190 m), planetocentric latitude, east-positive longitude, local `+proj=eqc` working projection. Never use EPSG:3857/WGS84 code paths or Earth-radius distance helpers (`ol/sphere`). Mars24 needs `west = (360 − east) mod 360`.
5. No under-18 likeness in media. Code is Apache-2.0; credit every dataset and image.
6. Log AI-assisted work in [docs/AI_USE.md](docs/AI_USE.md).
7. Never commit downloaded datasets or large binaries.

## Workflow

- Read the spec that owns what you change (05 field names, 02 behaviour, 03 screens, 04 visuals, 06 order). Update the doc first when behaviour changes.
- Keep ids (FR-, NFR-, SCR-, TASK-, D-, U-, A-) in commits and PRs. Do not alter requirement text, numbers, ids or status labels.
- Mark unknowns `TODO(verify)` and open choices `TODO(decision)`; never invent URLs, dataset properties or flags.
- Before committing: `make lint typecheck test docs-check`.
