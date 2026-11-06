# Task status

| | |
| --- | --- |
| **Owner** | Whoever completes a subtask records it here, in the same commit as the work |
| **Date** | 2026-11-04 |
| **Status** | Live record; the progress bar in the [README](../../README.md#progress) is generated from it |
| **Related** | [Task index](README.md) · [Coordination map](_coordination.md) · `scripts/update_progress.py` |

One row per subtask that is finished (`done`) or started (`wip`). A subtask with no row is not started. Ids come from the register in [_coordination.md](_coordination.md#a3-register); the Evidence column links the file, ADR or commit that shows the acceptance criteria are met.

After editing this file run `make progress`. Do not edit the README progress block by hand.

| Subtask | State | Date | Evidence |
| --- | --- | --- | --- |
| T00.01 | done | 2026-11-04 | Rules page and Participants Guide checked by the team owner; see [rules.md](../ops/rules.md#sources-to-check). The verbatim passages are not copied into the repo |
| T00.02 | done | 2026-11-04 | Local Lead's reply quoted and registration confirmed in [rules.md](../ops/rules.md#answer) |
| T00.03 | done | 2026-11-04 | [rules.md](../ops/rules.md): answer, sources, registration and Track P recorded |
| T00.04 | done | 2026-11-04 | Phase-gate line in [CLAUDE.md](../../CLAUDE.md) and [AGENTS.md](../../AGENTS.md) |
| T00.06 | wip | 2026-11-04 | Roster in [team.md](../ops/team.md); venue (U-14) still `TODO(verify)` |
| T03.01 | done | 2026-11-06 | Contracts C1–C5 at v1: [schema.ts](../../packages/protocol/src/schema.ts), [site-manifest schema](../../schemas/site-manifest.schema.json), [plan-export schema](../../schemas/plan-export.schema.json), [site-config layout](../../pipeline/sites/README.md). Decisions signed off by the data lead; U-11 stays `TODO(decision)`; the 05 wording needs a `spec-change:` subtask. `LoadedGrid.commHab` added by Obidit Islam for Mishkat Ahmed Khan (T05.16) ([TASK-03](TASK-03_preprocessing-pipeline.md)) |
| T03.02 | done | 2026-11-06 | Fixture F4: [make_mock_site.py](../../pipeline/tests/fixtures/make_mock_site.py) rebuilds `data/sites/mock_site/` byte for byte; manifest validates against C2; sources in the [fixtures README](../../apps/web/tests/fixtures/README.md). Tile layout `TODO(verify)` until C9 (T02.01) |
| T03.03 | done | 2026-11-06 | [test_clip_reproject.py](../../pipeline/tests/test_clip_reproject.py): 3 red until T03.07 and T03.08, CRS guard green; all pass against a throwaway reference implementation |
| T03.04 | done | 2026-11-06 | [test_derive.py](../../pipeline/tests/test_derive.py): 33 red until T03.09 and T03.10; all pass against a throwaway reference implementation |
| T03.05 | done | 2026-11-06 | [test_grid.py](../../pipeline/tests/test_grid.py): 5 red until T03.11, flag-bit mirror green. Slopes above 63.5° clamp to 254 (data lead, 2026-11-06) |
| T03.06 | done | 2026-11-06 | [test_manifest.py](../../pipeline/tests/test_manifest.py): 25 red until T03.13 and T03.14, 5 skipped until T03.19 or T14.01; all pass against a throwaway reference implementation |
| T03.08 | done | 2026-11-06 | [clip_reproject.py](../../pipeline/src/marswalk_pipeline/clip_reproject.py): T03.03's row-0 and no-data tests pass; extent, resolution and CRS checked on a synthetic raster |
| T03.09 | done | 2026-11-06 | [derive.py](../../pipeline/src/marswalk_pipeline/derive.py): T03.04's slope, NaN-edge, hillshade and aggregation tests pass; matches `gdaldem` on a synthetic DEM |
| T03.10 | done | 2026-11-06 | [flags.py](../../pipeline/src/marswalk_pipeline/flags.py): all 33 tests in [test_derive.py](../../pipeline/tests/test_derive.py) pass; `rasterize_mask` checked by hand on a synthetic polygon |
| T03.11 | done | 2026-11-06 | [grid.py](../../pipeline/src/marswalk_pipeline/grid.py): all 6 tests in [test_grid.py](../../pipeline/tests/test_grid.py) pass; array sizes match 02 §C.3 |
| T03.13 | done | 2026-11-06 | [manifest.py](../../pipeline/src/marswalk_pipeline/manifest.py): reproduces the F4 manifest, deterministic, valid against C2 with ajv. `test_write_manifest_*` need `validate()` (T03.14) or `jsonschema` (T14.01), so they stay red or skipped; committed with the data lead's OK |
| T03.15 | done | 2026-11-06 | [`__main__.py`](../../pipeline/src/marswalk_pipeline/__main__.py): `--help` lists the steps; stub run stops at `acquire` and names it. Step wiring is finished by T03.19 |
| T03.28 | done | 2026-11-06 | [test_comm_grid.py](../../pipeline/tests/test_comm_grid.py): 5 red until T03.29; all pass against a throwaway reference implementation. `comm_hab` counts the suit antenna (data lead, 2026-11-06) |
| T20.01 | wip | 2026-11-06 | Protocol v0 reviewed field by field against 05 §C.2 and 02 §E.4/§E.6 on branch `t20.01-protocol-v0`; `PERMISSIONS` matches 02 §E.4 except `INJECT_EVENT` (ops), which 02 §E.4 omits; open items marked `TODO(decision)`/`TODO(verify)`. Mishkat's review and the 7 Nov freeze announcement still to do ([TASK-20](TASK-20_hab-core-skeleton.md)) |
| T20.02 | done | 2026-11-06 | Eight beat files, `index.ts` loader and `fixtures.test.ts` (10 tests; keys and enums typed from protocol v0) in [apps/web/tests/fixtures/ws/](../../apps/web/tests/fixtures/ws/README.md); every value sourced in its README ([TASK-20](TASK-20_hab-core-skeleton.md)) |
| T20.03 | done | 2026-11-06 | Seven named server tests in `apps/hab-core/tests/server.test.ts`: red against the stub, green with T20.04 ([TASK-20](TASK-20_hab-core-skeleton.md)) |
| T20.04 | done | 2026-11-06 | `apps/hab-core/src/server.ts`: T20.03 passes 7/7; real process serves the built app and `/api/health` with the NFR-08 CSP; survives malformed WS input, `//` upgrades and oversized payloads; no external host in code ([TASK-20](TASK-20_hab-core-skeleton.md)) |
| T20.07 | wip | 2026-11-06 | Spike in [apps/hab-core/spike/](../../apps/hab-core/spike/README.md) runs the real server and emits one event per second (local check: ~1 s gaps, page and script served); the Android Chrome / iOS Safari LAN check happens in T20.08 ([TASK-20](TASK-20_hab-core-skeleton.md)) |
| T22.01 | done | 2026-11-06 | Engine contract C14: `EngineState`, `reduce`, `tick` with `MODULE_ORDER`, one stub module per concern with its owner, scenario/log/session APIs; module map in [engine/README.md](../../apps/hab-core/src/engine/README.md); `make typecheck` green ([TASK-22](TASK-22_simulation-engine.md)) |
| T22.02 | done | 2026-11-06 | Fake scenario, tables and ParamSets generated by `make_fake_scenario.py`; `fixture.test.ts` (9 tests) validates against the scenario, plan-export and param-set schemas and recomputes hashes ([fake-scenario/](../../apps/hab-core/tests/fixtures/fake-scenario/README.md), [TASK-22](TASK-22_simulation-engine.md)) |
| T31.01 | done | 2026-11-06 | StopTask types, commands, events, permissions, `SNAPSHOT.tasks`, scenario `stop_tasks`, UI stubs and `it.todo` tests: commits `28ff78e`, `099dc17`, `d43d5b1`, `d39aa0f` ([TASK-31](TASK-31_stop-task-list.md)) |
