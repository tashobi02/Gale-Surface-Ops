# 25 — The real scenario: demo PlanExport and `scenario.json` in the live shape

| | |
| --- | --- |
| **Subtasks** | T21.12, T21.08, T32.32, T21.11, T21.06, T31.02 |
| **Depends on** | 23 (real grid), 13 and 14 (complete PLAN_RESULT), 04 (loader), 07 (event library semantics) |
| **Branch** | `be/25-scenario-build` |
| **Spec refs** | 02 §E.7; 05 Scenario, EventLibraryEntry, TaskLibraryEntry; 06 §D.1; decisions BD-10, BD-25, BD-97 … BD-99, BD-106, BD-110 |

## Files

`apps/hab-core/scripts/build-demo-plan.ts` (new) · `scenarios/storm-sol4190/plan.json` (new) · `pipeline/src/marswalk_pipeline/scenario_build.py` (new) · `pipeline/tests/test_scenario_build.py` (new) · `scenarios/storm-sol4190/scenario.json` (new) · `scenarios/storm-sol4190/README.md` (layout rows) · `apps/hab-core/tests/fixtures/storm-excerpt/` + `make_storm_excerpt.py` (T21.11) · `pipeline/tests/test_rad.py` (BD-25 boundary test) · `pipeline/tests/test_donki.py` (BD-110) · `scenarios/storm-sol4190/stop_tasks.md` (U-52/U-58 decided)

## Steps (tests first)

1. `test_scenario_build.py`: output validates against `schemas/scenario.schema.json`; `mission_setup.hab_candidate_id == "hab-first"` (read from `hab_candidates.json`, BD-10); `series_start_utc` by the BD-98 rule (expected computed in the test from the series + compute-equivalent rule in Python, cross-checked by a Vitest calling compute `triggerState` on the same file); library inputs' `t_offset_s` = recorded time − `series_start_utc`; simulated inputs carry `payload.answers` (BD-99); `task_library` re-keyed from `stop_tasks.json` via the plan's Waypoint `poi_id`; table SHA-256s match; two runs → identical bytes.
2. T21.12: `build-demo-plan.ts` loads the real grid, runs the compute core on `apps/web/src/ui/demoPlan.json` stops (BD-106), writes `plan.json` with `plan_hash`; run twice → same hash; validates against `schemas/plan-export.schema.json`.
3. T21.08 + T32.32: `scenario_build.py` writes the scenario (identity, seed, `start_utc` from the T21.15 rule — package 26 fills it when T21.15 part (b) runs; until then the builder takes `--start-utc` from `demo-numbers` output, never typed).
4. T21.06: a scripted re-read of the RAD archive file recomputes sol-4190 coverage and the product id (BD-25); BD-25 rateAt/step-hold cross-test.
5. T21.11: excerpt of the onset hour by the committed script; byte-identical on re-run.
6. Loader check: `npm --workspace @marswalk/hab-core test -- scenario` includes a case loading the real scenario (skips without the bundle).

## Automated verification

- `"$PY" -m pytest -q pipeline/tests/test_scenario_build.py pipeline/tests/test_rad.py pipeline/tests/test_donki.py`.
- `npx tsx apps/hab-core/scripts/build-demo-plan.ts` twice → same `plan_hash`.
- `npm run -s hab:replay -- scenarios/storm-sol4190` loads the scenario (plan present) and prints a hash.

## Status rows

```text
| T21.12 | done | <commit date> | [build-demo-plan.ts](../../apps/hab-core/scripts/build-demo-plan.ts) → plan.json, same plan_hash twice |
| T21.08 | done | <commit date> | [scenario.json](../../scenarios/storm-sol4190/scenario.json) validates; loader accepts it |
| T32.32 | done | <commit date> | scenario.json in the live shape (mission_setup hab-first, event_library storm with BD-98 series_start_utc, task_library) |
| T21.11 | done | <commit date> | storm-excerpt fixture, deterministic script |
| T21.06 | done | <commit date> | Scripted re-read of the RAD file: sol-4190 coverage and product confirmed (BD-25) |
| T31.02 | done | <commit date> | Stop task text approved (BD-06); re-keyed into task_library |
```

## Done when

`make replay` runs on the real scenario.
