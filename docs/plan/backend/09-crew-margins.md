# 09 — Per-crew O₂ time left, bearing, distance and ETA to the next stop

| | |
| --- | --- |
| **Subtasks** | T32.30, T32.31 |
| **Depends on** | 07 (chain on `tick.ts`), 08 (chain on `session.ts`) |
| **Branch** | `be/09-crew-margins` |
| **Spec refs** | 01 FR-32, FR-33, FR-35; 02 §C.1; 05 Crew (after package 02); decision BD-95 |

## Files

`apps/hab-core/tests/crewMargins.test.ts` (new) · `apps/hab-core/src/engine/crewMargins.ts` (new) · `engine/tick.ts` (call after motion, consumables and dose; add the four fields to the delta fields) · `session.ts` (provenance map keys) · `packages/compute/src/geometry.ts` (new: `bearingDeg(from, to)` and `horizontalDistanceM(from, to)` in projected metres; pure) · `packages/compute/tests/geometry.test.ts` (new) · `packages/compute/src/index.ts`

## Steps (tests first)

1. Compute geometry tests: bearing 0 for +y, 90 for +x, range [0, 360); distance is the Euclidean distance in projected metres; no `ol/sphere`, no Earth radius.
2. `crewMargins.test.ts`: T32.30 steps 1–4 with BD-95's choices named in the test titles (per-crew next stop; ETA includes remaining dwell; straight-line distance); expected values come from compute calls (`o2RemainingS`, `bearingDeg`, the engine's own leg timing), never typed constants; `null` with no plan and after the last stop; deltas only on change; equal after `JUMP_NEXT_STOP` and after a walked run.
3. Implement `crewMargins.ts` (ETA = remaining dwell + remaining walk time from the engine's motion state; no inline science beyond summing engine times).

## Automated verification

- `npm --workspace @marswalk/compute test -- geometry` · `npm --workspace @marswalk/hab-core test -- crewMargins tick engine nextStop`.
- Reference `log_hash` unchanged (fields are state).

## Status rows

```text
| T32.30 | done | <commit date> | [crewMargins.test.ts](../../apps/hab-core/tests/crewMargins.test.ts): O₂ time, bearing, distance, ETA (BD-95) |
| T32.31 | done | <commit date> | [crewMargins.ts](../../apps/hab-core/src/engine/crewMargins.ts) and compute geometry.ts; fields in SNAPSHOT and STATE_DELTA with provenance |
```

## Done when

The fields appear in every SNAPSHOT and change by delta; no view needs to compute them.
