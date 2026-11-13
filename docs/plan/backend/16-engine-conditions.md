# 16 — Conditions feed in the engine (FR-36)

| | |
| --- | --- |
| **Subtasks** | T22.16 |
| **Depends on** | 07 (`seriesUtc`), 12, 13 (site coordinate helper) |
| **Branch** | `be/16-engine-conditions` |
| **Spec refs** | 01 FR-36; 02 §D.5, §D.13; decision BD-75 |

## Files

`apps/hab-core/src/engine/conditions.ts` · `apps/hab-core/tests/conditions.test.ts` (new) · `apps/hab-core/src/session.ts` (`Snapshot.conditions` and provenance keys) · `apps/hab-core/src/engine/reducer.ts` (`conditions` in `EngineState`, initial nulls)

## Steps (tests first)

1. Tests: every 01-contract §5 field present after the first tick with its provenance class; LTST and sun elevation equal compute `mars24`/`solarPosition` at the hab (east → west conversion inside compute); event rate equals background before `START_EVENT` and the shifted series after; `event_series_utc` null before the press; deltas `conditions/<key>` only on change; `sol` from a new compute `mslSol(utc)` (landing epoch constant cited to its NASA source in the code, test against F6), `source_ids` filled; nothing labelled `live`.
2. Implement `conditionsTick` with compute calls only.

## Automated verification

`npm --workspace @marswalk/hab-core test -- conditions tick engine`; reference `log_hash` unchanged; NFR-06 grep.

## Status row

```text
| T22.16 | done | <commit date> | [conditions.ts](../../apps/hab-core/src/engine/conditions.ts): LTST, sun elevation, background and event dose rate in SNAPSHOT.conditions (BD-75) |
```

## Done when

`Snapshot.conditions` is filled every tick from compute.
