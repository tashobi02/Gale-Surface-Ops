# 13 — Conditions assembly and the complete PLAN_RESULT

| | |
| --- | --- |
| **Subtasks** | T06.05, T06.09, T06.10, T05.32 |
| **Depends on** | 12; 14's warnings change can land after (the darkness inputs come from here) |
| **Branch** | `be/13-compute-conditions` |
| **Spec refs** | 02 §D.4, §D.5, §E.2; 05 PlanResult, EnvConstant; decisions BD-50, BD-64 |

## Files

`packages/compute/src/conditions.ts` · `packages/compute/src/handler.ts` · `packages/compute/tests/conditions.test.ts` (turn the five C8 `it.todo`s into tests) · `packages/compute/tests/worker.test.ts` · `apps/web/src/worker/planWorker.ts` (timing measurement only, BD-50) · `pipeline/sites/gale_boxwork/env_constants/*.json` and `sources/hassler-2014-rad.json`, `simonsen-2024-rad.json` (licence and access fields per BD-13; values unchanged) · `schemas/plan-export.schema.json` (`$comment` U-11 resolved; profile still optional)

## Steps (tests first)

1. C8 tests: site coordinate from the plan's start waypoint via the inverse working projection (package 14 adds the manifest proj4 parser — if 14 has not merged, read the projection through the existing `sampling.ts` entry point and switch in 14); EnvConstant strict rule; PARTIAL → no `radiation`; `stops_timeline` with `arrive_ltst` and `sun_elevation_deg` per stop; `conditions` block for the EVA sol, incl. `sol` from compute `mslSol` (N-15; added in package 16 if 16 runs first, else here — whichever lands first owns `mslSol`).
2. `handler.ts`: assemble `stops_timeline`, `conditions`, `radiation` into PlanResult; exporters write `profile` (BD-64).
3. `planWorker.ts`: `timing_ms.routing` and `timing_ms.estimates` measured around the calls (not inside compute).
4. T06.10: fetch each RAD source page; fill licence/credit fields (BD-13); the EnvConstant numbers stay byte-identical (test compares with 05 §C).

## Automated verification

- `npm --workspace @marswalk/compute test -- conditions worker handler` · `npm --workspace @marswalk/web test -- planWorker`.
- Determinism: two `COMPUTE_PLAN` runs on F4 equal except `computed_utc` and `timing_ms` (BD-51).
- `grep -n "TODO(decision)" packages/compute/src/conditions.ts packages/compute/src/handler.ts` returns nothing.

## Status rows

```text
| T06.05 | done | <commit date> | conditions.test.ts: the five C8 cases live (BD-50) |
| T06.09 | done | <commit date> | assembleConditions wired into PLAN_RESULT |
| T06.10 | done | <commit date> | RAD EnvConstant and DataSource records complete (values unchanged; licences per BD-13) |
| T05.32 | done | <commit date> | PLAN_RESULT complete: totals, timeline, conditions, radiation, warnings, status; timing boundaries per BD-50 |
```

## Done when

A plan on F4 returns a full PLAN_RESULT that validates against `schemas/plan-export.schema.json` when exported.
