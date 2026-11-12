# 15 — `cellsAlongPath`, CONTINUE_SKIP metrics, second rendezvous; close T23.07

| | |
| --- | --- |
| **Subtasks** | T23.07 (remaining gap); compute follow-ups of T05b.04/T05b.07 |
| **Depends on** | 04 (plan from state in `contingencyOps.ts`, `vehicles.ts`), 05 |
| **Branch** | `be/15-paths-contingency` |
| **Spec refs** | 02 §D.10, §D.15; 01 FR-40, FR-44; decisions BD-58, BD-59, BD-62, BD-80 |

## Files

`packages/compute/src/grid.ts` (`centreOfCell` exported) · `packages/compute/src/paths.ts` (new: `cellsAlongPath(grid, polyline)`, supercover traversal, cell indices in order, repeats collapsed) · `packages/compute/tests/paths.test.ts` (new) · `rendezvous.ts`, `haven.ts` (use the shared `centreOfCell`) · `packages/compute/src/index.ts` · `apps/hab-core/src/engine/contingencyOps.ts` (CONTINUE_SKIP via `cellsAlongPath` + `toLeg`; final hop via the start cell) · `apps/hab-core/src/engine/vehicles.ts` (second meeting) · `apps/hab-core/tests/contingencyOpsReal.test.ts`, `summonReal.test.ts`, `contingencyOps.test.ts`, `summon.test.ts`

## Steps (tests first)

1. `paths.test.ts`: horizontal, vertical, diagonal through a corner (both touched cells), polyline with a vertex outside the grid (stops at the edge, returns what is inside), determinism.
2. Contingency tests: CONTINUE_SKIP leg gets non-zero climb/descent/max slope on the tilted F9 grid, labelled `derived`; a hab-bound leg's walk time includes the final hop (compare with `toLeg` on the extended cell path); BD-80 test (crew within one cell of the new first leg's first vertex after APPROVE_OPTION and ABORT).
3. Summon tests: two-crew summon drives the second meeting after the first `CREW_SHELTERED`; both crew end `SHELTERED` with `haven_kind: "vehicle"`; event keys unchanged.
4. Implement; remove the T23.07 markers listed in [decisions-index.md](decisions-index.md) for `contingencyOps.ts`, `vehicles.ts`, `tick.ts` (replace with the BD id).

## Automated verification

`npm --workspace @marswalk/compute test -- paths rendezvous haven` · `npm --workspace @marswalk/hab-core test -- contingencyOps summon tick` · `make typecheck`.

## Status row

```text
| T23.07 | done | <commit date> | CONTINUE_SKIP metrics from compute cellsAlongPath (BD-59); second rendezvous driven (BD-58); contingencyOpsReal and summonReal green |
```

## Done when

No `assumed` zero remains on a revised leg that has a grid path, and both crew of a two-crew summon shelter.
