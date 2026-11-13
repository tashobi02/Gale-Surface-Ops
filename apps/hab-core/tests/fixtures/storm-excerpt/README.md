# storm-excerpt: the onset hour of the real storm tables

| | |
| --- | --- |
| **Owner** | Backend plan package 25 (T21.11) |
| **Status** | Fixture for engine tests; a cut of real tables, not new data |
| **Related** | [TASK-21](../../../../../docs/tasks/TASK-21_scenario-builder.md) · [scenario README](../../../../../scenarios/storm-sol4190/README.md) |

Written by `make_storm_excerpt.py` (**Do not edit** the files here; re-run the script, which gives the same bytes).

- **The cut:** every sample and every row whose UTC hour is `2024-05-20T05`, the hour that holds `series_start_utc`
  (`2024-05-20T05:16:55Z`) of `scenarios/storm-sol4190/scenario.json`. It holds the alert sample
  `2024-05-20T05:50:32Z`.
- **Counts:** 4 dose samples, 60 Earth-link rows, 0 passes touching the hour.
- **`dose_series.json`:** cut of `scenarios/storm-sol4190/dose_series.json` (SHA-256 `993a7826b97dd7d71e8d344fb98208969ae1c08ff9ebef1be0e4a650b85486b1`). Every field except `samples` and `integral_check` is the source's. `integral_check` is recomputed over the excerpt, and `expected_ugy` equals `computed_ugy` because an excerpt has no published total.
- **`earth_link.json`:** cut of `scenarios/storm-sol4190/earth_link.json` (SHA-256 `3f7b038ac4c9b307c94c4ec6d67604ef82d982da56e38803030f42e30ea72422`); `kernels`, `step_s` and `provenance` unchanged.
- **Check:** `pipeline/tests/test_storm_excerpt.py` re-runs the script into a temporary folder and compares every file byte for byte.
