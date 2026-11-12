# Fake scenario fixture (F8)

| | |
| --- | --- |
| **Owner** | T22.02 (Sadman Shaharier Mahim, R4 Hab Core) |
| **Date** | 2026-11-06 |
| **Status** | Test fixture. Synthetic shapes, not data; `site_id` `mock_site`; the demo never loads it |
| **Related** | [06 §D.2](../../../../../docs/specs/06_High_Level_Implementation_Plan.md#d2-parallel-streams) · [05 Scenario](../../../../../docs/specs/05_Backend_and_Database_Schema.md#scenario) · [fixture value rule](../../../../../docs/tasks/_coordination.md#e-fixtures-and-mocks) · [TASK-22](../../../../../docs/tasks/TASK-22_simulation-engine.md) |

A small scenario so the engine and server can run before TASK-21 delivers `storm-sol4190`: two crew, one pressurized rover, a straight-line loop plan (out to two stops and back), two stop tasks, a stepped synthetic dose curve and one constant Earth-link row.

Since backend package 01b (T32.04, T32.05) it also has the live-session shape (05 Scenario, 2026-11-10): `mission_setup`, an `event_library` with one entry `storm`, a `task_library`, a plan-less variant `scenario.planless.json`, and a two-candidate site folder `two-candidate-site/`.

**Do not edit the JSON by hand.** Change `make_fake_scenario.py` and run it:

```sh
python3 apps/hab-core/tests/fixtures/fake-scenario/make_fake_scenario.py
```

It writes `scenario.json`, `scenario.planless.json`, `dose_series.json`, `earth_link.json` and `two-candidate-site/`. Running it twice gives identical bytes (`--out <dir>` writes elsewhere; `fixture.test.ts` runs it twice into temporary folders and compares both runs with the committed files).

`fixture.test.ts` validates `scenario.json` against `schemas/scenario.schema.json`, the plan against `schemas/plan-export.schema.json` and each ParamSet against `schemas/param-set.schema.json`, and recomputes the table SHA-256s and `plan_hash`.

## Value sources

| Value | Source |
| --- | --- |
| `scenario_schema_version` 1.0.0, `start_utc` 2024-05-20T00:00:00Z, `seed` 4190, crew `EV1`/`EV2` with `suit-assumed` and `start_offset_s` 0, `param_sets` list, Earth message body | 05 §F.4 scenario example |
| `export_schema_version` 1.0.0, `app_version` 0.1.0, `max_eva_duration_h` 6, `dwell_min_per_stop` 20, `hard_slope_limit_deg` 15, `caution_slope_deg` 10, `walkback_limit_km` 5, `solar_phase` max, `loop` true, disclaimer | 05 §F.3 plan export example (6.0 and 5.0 written as 6 and 5, see below) |
| `max_haven_min` 30, `crew_count` 2, `vehicle_available` true, `vehicle_param_set` `pr1-assumed` | 05 §F.4 `plan.scenario` |
| `suited_flat_speed_kmh`, all ParamSet values | `param_sets/*.json`, copied unchanged from `scenarios/storm-sol4190/param_sets/` (each file cites its sources) |
| Task text "Image the ridge crest", kind `image` | 05 StopTask example; the second task's text "Fixture task" is a placeholder |
| `step_s` 60 | 05 EarthLinkTable rule |
| Waypoints at x = 0, 1000, 2000 m on y = 0; rover start at the plan start | declared shape: `STOP_SPACING_M` 1000, `N_STOPS` 2 |
| Dose curve: 1 µGy/h background, then `STEP_FACTOR` × `rad_k_background` × background for 1 h, then background; samples every 600 s | declared shape: `BACKGROUND_UGY_H` 1, `STEP_FACTOR` 2, `PHASE_S` 3600, `SAMPLE_STEP_S` 600; `rad_k_background` from `alert-assumed` |
| Earth message time = step onset | declared shape: `EARTH_MESSAGE_OFFSET_S` = `PHASE_S` |
| Leg `walk_time_min`, `distance_m`, `geometry` (including the return leg `loop` requires), `totals`, dose `integral_check`, `plan_hash`, table `sha256` | computed by `make_fake_scenario.py` from the values above; `max_walkback_km` = max over waypoints of min(cumulative, total − cumulative) along the loop |
| `eva_start_utc` | equals `start_utc` |
| `mission_setup`: `crew_count`, `vehicle_available`, `vehicle_param_set`, `solar_phase`, `max_haven_min` | the values of `plan.scenario` above (05 §F.4); `hab_candidate_id` `hab-first`, the id of the rank-1 candidate of 05 HabCandidate |
| `event_library[0]` `storm`: `kind`, `dose_series`, `provenance`, `source_id` | 05 EventLibraryEntry (`SPACE_WEATHER`, key `dose_series`, `replayed`); `source_id` `fixture-synthetic`; `title` and `label` say "fixture" and "synthetic" |
| `event_library[0].series_start_utc` | computed by the generator with the BD-98 rule: the last sample at or below the background before the alert starts (an alert starts at the second of two consecutive samples above `rad_k_background` × background, as compute `triggerState`); `fixture.test.ts` recomputes it with compute |
| `task_library`: two entries on `poi-boxwork-ridge` | the POI of `data/sites/mock_site/vectors/pois.geojson`; texts as the two stop tasks (05 StopTask example and the placeholder); ids `lt-boxwork-01`, `lt-boxwork-02` are fixture identifiers |
| `scenario.planless.json` | the live session before `PUBLISH_PLAN`: the same setup, library, crew, vehicles, ParamSets and tables, with no `plan`, `stop_tasks` or `events`; `scenario_id` `fake-planless` |
| `two-candidate-site/` | `data/sites/mock_site`'s manifest and its six `grid/` files, plus a second candidate. Declared synthetic shape: the second mast mirrors the first across x = 0 (`x_m` → −`x_m`, same `y_m` and `height_m`), and its comm grid `grid/comm_hab-alternative.u8` is the first grid's 0/1 mask mirrored left to right, no-data cells unchanged. It is a declared mask, not a computed viewshed. `lat` and `lon_e` come from the working projection's inverse (02 §C.1); candidate `note` reads "fixture - not a real source" (BD-31) |
| Earth-link row values 0, `passes` [], `kernels` [], `stops_timeline` [], `warnings` [], `provenance_summary` [] | placeholders |
| Second task `crew_id` null (either crew) and `kind` `other` | placeholders within the 05 StopTask enums |
| `data_version` `mock_site-fixture`, `scenario_id` `fake-straight-line`, `title`, `source_id` `fixture-synthetic`, task ids `t-s1-01`/`t-s2-01`, event id `e1`, waypoint ids `wp-0`…`wp-2` | fixture identifiers |

## Known limits

- `two-candidate-site/` ships the manifest and `grid/` only: the manifest still lists the mock site's tiles, vectors and layers (the Hab Core reads the grid and the manifest), so those assets dangle by design. Its `data_version` is the mock site's dated `mock_site-2026.11.05`, because the manifest schema requires a dated version and the fake scenario's `mock_site-fixture` is not one; a test that loads the pair passes the site's version to `loadSite`.
- The fake scenario has no hab candidates of its own (BD-31); the site folder above is the Hab Core's two-candidate fixture (T32.05).
- `scenario.json` keeps `plan`, `stop_tasks` and the Earth event `e1` in `events` unchanged, so its `plan_hash` and the replay hashes are unchanged; the storm library entry has no `inputs`.
- `DoseSeries.provenance` must be `replayed` (05 DoseSeries); here the curve is synthetic and is marked by `source_id` `fixture-synthetic` and `method` `template_scaled`. It is never shown as real data.
- `plan_hash` hashes RFC 8785 (JCS) canonical JSON (decision of 2026-11-07, 05 PlanExport): keys sorted by UTF-16 code units, no whitespace, numbers as JavaScript prints them (`6.0` is `6`, `1e21` is `1e+21`). The generator implements that number format in pure Python (`js_number`) and checks it against known JavaScript outputs on every run; `fixture.test.ts` recomputes the hash in JavaScript.
- `integral_check.expected_ugy` equals `computed_ugy`: 05 sets `expected` to the published event total, and a synthetic shape has none. The test recomputes the integral from the samples independently instead.
- `earth_link.json` is labelled `derived` (05 EarthLinkTable) but holds one placeholder row at `start_utc`: light time 0 s, Earth and every orbiter at 0° elevation, no passes. Engine code that looks up later times must treat the last row as holding, and must not read anything into the zeros.
- `stops_timeline` is empty, so nothing gives arrive/depart times; the engine derives motion from the legs.
- `grid` and `comm` in `LoadedScenario` are null for this fixture: `mock_site` has no site data yet (F4, T03.02).
