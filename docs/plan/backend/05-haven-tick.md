# 05 — Haven per tick, `HAVEN_TIME_EXCEEDED`, hab ingress in the ParamSet

| | |
| --- | --- |
| **Subtasks** | T23.03 |
| **Depends on** | 01a (can run in parallel with 04; rebase on 04 before merge because both touch the engine) |
| **Branch** | `be/05-haven-tick` |
| **Spec refs** | 02 §D.8 (live form), §D.2; 01 FR-39; 05 ParamSet, Crew.haven; decisions BD-57 |

## Files

`apps/hab-core/tests/havenTick.test.ts` (new) · `apps/hab-core/src/engine/haven.ts` · `packages/compute/src/haven.ts` (read `hab_ingress_min` from the suit ParamSet; delete `HAB_INGRESS_S`; no-data slope 255 impassable for suit and vehicle) · `packages/compute/tests/haven.test.ts` (new cases) · `scenarios/storm-sol4190/param_sets/suit-assumed.json` and the fake scenario `param_sets/suit-assumed.json` (add `hab_ingress_min` = the 02 §D.8 `t_ingress` value, note "02 §D.8 t_ingress, Assumed") · `apps/hab-core/src/engine/contingencyOps.ts` (use the ParamSet value instead of the constant) · `apps/hab-core/tests/contingencyOps*.test.ts` (fixture ParamSets only)

## Steps (tests first)

1. Compute tests: hab ingress read from the ParamSet (missing key → RangeError naming the key); a slope-255 cell blocks the crew field and the vehicle field (previously passable).
2. `havenTick.test.ts`: per crew member each tick `haven.minutes`, `kind`, `target_*`; provenance `modelled`; `HAVEN_TIME_EXCEEDED` raised once when minutes exceed the plan's `max_haven_min` and cleared when back under; the hab field is computed once per (grid, limits, candidate) and reused (spy on compute); tick cost on the fake scenario under the NFR-02 engine budget (measured with `performance.now()` in the test, not in the engine).
3. Implement `havenTick` with the compute live form; cache the hab field in engine state keyed by `{data_version, hab_candidate_id, hard_slope_limit_deg, max_haven_min}`; export `invalidateHavenCache()` for package 08.
4. Update the existing compute and contingency tests that pinned the old ingress constant or the old slope-255 behaviour; each changed expectation cites BD-57 in a comment.

## Automated verification

- `npm --workspace @marswalk/compute test -- haven` · `npm --workspace @marswalk/hab-core test -- havenTick contingencyOps tick` · `make typecheck`.
- `grep -rn "HAB_INGRESS_S" packages apps --include=*.ts` returns nothing.

## Status row

```text
| T23.03 | done | <commit date> | [haven.ts](../../apps/hab-core/src/engine/haven.ts) per tick with cached hab field; HAVEN_TIME_EXCEEDED; hab_ingress_min in the suit ParamSet (BD-57); havenTick.test.ts green |
```

## Done when

All listed tests pass and no haven code uses a typed ingress or treats no-data as passable.
