# storm-sol4190 — "Storm at sol 4190"

| | |
| --- | --- |
| **Owner** | T21.01 (Obidit Islam, R1 Data & GIS) |
| **Date** | 2026-11-07 |
| **Status** | Layout and table formats frozen (T21.01). Only `param_sets/` exists; the other files are written by TASK-21 |
| **Related** | [TASK-21](../../docs/tasks/TASK-21_scenario-builder.md) · [05 Scenario](../../docs/specs/05_Backend_and_Database_Schema.md#scenario) · [05 DoseSeries](../../docs/specs/05_Backend_and_Database_Schema.md#doseseries-dose_seriesjson) · [05 EarthLinkTable](../../docs/specs/05_Backend_and_Database_Schema.md#earthlinktable-earth_linkjson) · [02 §E.7](../../docs/specs/02_Technical_Requirements_Document.md#e7-scenario-file-scenariosidscenariojson) · [Data downloads](../../docs/ops/data-downloads.md) |

The killer-demo scenario (docs/specs/01 §E.1): a two-person EVA at Gale on **20 May 2024 (sol 4190)**, replaying the solar particle event that Curiosity's RAD recorded that day (about 8,100 µGy total, NASA June 2024).

TASK-21 writes `scenario.json`, `dose_series.json` and `earth_link.json` here, chooses the EVA start time (LTST in daylight, T21.09) and fixes the demo numbers in 01 §E.1. Every file in this folder is a build output: change the pipeline step that writes it and rebuild, never edit the JSON by hand.

## Layout

```text
scenarios/storm-sol4190/
├── README.md            this file
├── scenario.json        Scenario: identity, seed, start_utc, plan, stop_tasks, crew, vehicles, events, tables, source_ids
├── plan.json            demo PlanExport (input to scenario.json; copied into its `plan`)
├── dose_series.json     DoseSeries: replayed RAD surface dose rate (uGy/h)
├── earth_link.json      EarthLinkTable: SPICE light time, separation, elevations, relay passes
└── param_sets/          one ParamSet per file, named <param_set_id>.json
    ├── suit-assumed.json
    ├── pr1-assumed.json
    ├── ur1-assumed.json
    ├── link-assumed.json
    ├── alert-assumed.json
    └── shielding-assumed.json
```

## Files, writers and checks

The Hab Core loader is `readScenario` in [apps/hab-core/src/scenario.ts](../../apps/hab-core/src/scenario.ts) (T22.11). The last column says what it verifies for each file.

| File | Written by | Schema | What the Hab Core loader (`readScenario`) verifies |
| --- | --- | --- | --- |
| `scenario.json` | `pipeline/src/marswalk_pipeline/scenario_build.py` (T21.08) | [scenario.schema.json](../../schemas/scenario.schema.json) | Validates against the schema (`validators().scenario`); `site_id` and `data_version` (scenario and `plan`) equal the loaded site; `events` sorted by `t_utc`; `stop_tasks` via `checkStopTasks` (each `stop_id` is a stop Waypoint of `plan`, unique `task_id`, at most 4 per stop) |
| `scenario.json` `events` (DONKI part) | `pipeline/src/marswalk_pipeline/donki.py` (T21.05), assembled by T21.08 | `ScenarioEvent` in [scenario.schema.json](../../schemas/scenario.schema.json) | As `scenario.json` (schema, sort order) |
| `plan.json` | `apps/hab-core/scripts/build-demo-plan.ts` (T21.12) | [plan-export.schema.json](../../schemas/plan-export.schema.json) | The copy inside `scenario.json` (`plan`), not `plan.json` itself: validates against the schema (`validators().plan`); `plan_hash` must equal the first 12 hex of SHA-256 over `canonicalJson({data_version, scenario, waypoints})` |
| `dose_series.json` | `pipeline/src/marswalk_pipeline/rad.py` (T21.07); fallback T21.13 (digitised curve) | [dose-series.schema.json](../../schemas/dose-series.schema.json) | `readTable`: file exists and the SHA-256 of its UTF-8 text equals `tables.dose_series.sha256`; then parses as JSON. Not validated against its schema at load |
| `earth_link.json` | `pipeline/src/marswalk_pipeline/spice_tables.py` (T21.04); fallback T21.14 (fixed light time) | [earth-link.schema.json](../../schemas/earth-link.schema.json) | `readTable`: as above against `tables.earth_link.sha256`. Not validated against its schema at load |
| `param_sets/<id>.json` | T21.01 (assumed values, reviewed; no build step) | [param-set.schema.json](../../schemas/param-set.schema.json) | `readParamSets`: every id in `param_sets` has a file that validates against the schema (`validators().paramSet`) and whose `param_set_id` equals the file name; every ParamSet used by `crew`, `vehicles` or `plan.scenario.vehicle_param_set` is listed; at least one `link`, `alert` and `shielding` set. No checksum |

Passable crew and vehicle start cells (05 §E.7) are checked on load (T22.11 follow-up, Proposed 9 Nov): `readScenario` loads the site's routing grid and `comm_hab` from `data/sites/<site_id>` (`loadSite`), then rejects a start that is off the grid or on an impassable cell (`start_blocked`). Until the real `gale_boxwork` bundle exists (T03.19), `make hab` and `make replay` with this scenario stop with a clear `ScenarioCheckError`: `site` (no `site-manifest.json`; raised by the CLI's `siteRefFor` in `replay.ts`, before the scenario loads), `site_manifest` (the manifest is unreadable or fails its schema; raised by `loadSite`) or `grid_missing` (a grid file the manifest lists is absent); these are the intended failures, not a bug.

The rule "samples / rows strictly increasing in time" cannot be written in JSON Schema; the pipeline tests (T21.03: `pipeline/tests/test_rad.py`, `pipeline/tests/test_spice_tables.py`) check it.

## Hashes written from Python

- **Table SHA-256.** `tables.<name>.sha256` is the SHA-256 (lowercase hex, 64 characters) of the table file's exact bytes as written. Write the table first, then hash the file; reformatting a table after hashing makes the loader reject the scenario.
- **`plan_hash` (RFC 8785).** `plan_hash` and `log_hash` use RFC 8785 canonical JSON (05 PlanExport, protocol v0 note of 7 Nov 2026): keys sorted by UTF-16 code units, no whitespace, numbers as ECMAScript `Number::toString` writes them. A scenario written from Python must hash `plan` with RFC 8785 number formatting (`6`, not `6.0`), or the Hab Core rejects it (TASK-21 protocol note 5). Python's `json.dumps` writes `6.0` for a float, so it is not enough on its own.

## Open items

| Id | Question | Decided in |
| --- | --- | --- |
| U-15 | Does the public RAD series cover sol 4190? | T21.06 |
| U-18 | Exact SPICE SPK files for 18–22 May 2024 (MRO, MAVEN, TGO) | T21.02 |
| U-44 | DONKI date window for the scenario: **13–24 May 2024**, decided by the data lead on 2026-11-07 | Recorded by T21.05 |
| U-45 | Which RAD dose product matches NASA's published 8,100 µGy event total | T21.06 |

Details and current status: [Data downloads](../../docs/ops/data-downloads.md).
