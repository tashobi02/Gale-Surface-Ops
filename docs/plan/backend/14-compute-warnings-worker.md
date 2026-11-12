# 14 — Warnings, worker grid delivery and effective cancellation

| | |
| --- | --- |
| **Subtasks** | T05.13, T05.15, T05.18, T05.24, T05.27 |
| **Depends on** | 01a (worker types), 13 |
| **Branch** | `be/14-compute-warnings-worker` |
| **Spec refs** | 01 FR-10; 02 §D.2, §E.2; 04 §C.1; decisions BD-40 … BD-49, BD-51 … BD-53 |

## Files (≤ 14)

`packages/compute/src/warnings.ts` · `route.ts` (async search with yield, BD-41) · `handler.ts` (async handler; cancel flag) · `noRoute.ts` (tie rule; no default limit) · `sampling.ts` (projection from proj4, BD-45) · `grid.ts` (proj4 parse into meta; `centreOfCell` export is package 15's) · `packages/compute/tests/warnings.test.ts`, `worker.test.ts`, `workerCancel.test.ts`, `noRoute.test.ts`, `sampling.test.ts`, `route.test.ts` · `apps/web/src/worker/planWorker.ts` (handle `LOAD_GRID`; latest-revision cancel) · `apps/web/tests/worker/planWorker.test.ts`

## Steps (tests first)

1. Warnings tests for BD-49 (LOW_RES_DEM caution per run, NO_DATA_ADJACENT caution per run, DARKNESS at timeline instants and sunset-in-interval, never LOW_TI).
2. Worker tests: `LOAD_GRID` → `GRID_LOADED`; requests before it → `GRID_NOT_LOADED`; a second `COMPUTE_PLAN` with a higher `plan_revision` sent while the first is searching makes the first answer `CANCELLED` (in-flight, not only stale-at-start); TIMEOUT via injectable `maxExpansions`.
3. Ratification tests: mixed-barrier tie order, combined multipliers, inclusive ranges, little-endian byte pattern, projection origin read from a manifest proj4 string that differs from the old constant.
4. Implement; delete `DEFAULT_PROJECTION` and the `hardSlopeLimitDeg = 15` default.

## Automated verification

- `npm --workspace @marswalk/compute test` and `npm --workspace @marswalk/web test -- worker`.
- `make typecheck`; `grep -rn "DEFAULT_PROJECTION\|= 15)" packages/compute/src` returns nothing.

## Status rows

```text
| T05.13 | done | <commit date> | warnings.test.ts incl. LOW_RES_DEM, NO_DATA_ADJACENT, DARKNESS (BD-49) |
| T05.24 | done | <commit date> | warnings.ts complete per BD-49 |
| T05.15 | done | <commit date> | worker tests incl. in-flight cancellation and LOAD_GRID |
| T05.18 | done | <commit date> | searchLeg yields every 50,000 expansions; cancellation effective (BD-41) |
| T05.27 | done | <commit date> | planWorker: LOAD_GRID initialisation and latest-revision cancellation (BD-40) |
```

## Done when

No compute source file in these modules contains a `TODO(decision)` and cancellation is shown in-flight by a test.
