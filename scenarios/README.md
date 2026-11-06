# Scenarios

A scenario is a reproducible EVA run for the Hab Core (docs/specs/05 §C.2 Scenario, 02 §E.7). One folder per scenario:

| File | Content | Built by |
| --- | --- | --- |
| `scenario.json` | Start time, plan (PlanExport), crew, vehicles, ParamSet ids, scheduled events, table checksums | TASK-21 |
| `dose_series.json` | Replayed surface dose rate (µGy/h) for the event | TASK-21 (pipeline) |
| `earth_link.json` | SPICE light time, conjunction angle and relay passes at 60 s steps | TASK-21 (pipeline) |
| `param_sets/*.json` | Suit, vehicle, link, alert and shielding parameters (05 ParamSet) | TASK-21 |

Schemas: `schemas/scenario.schema.json`, `schemas/param-set.schema.json`. A scenario is valid for exactly one site `data_version`.

Headless run (NFR-14): `npm run hab:replay -- scenarios/storm-sol4190`.
