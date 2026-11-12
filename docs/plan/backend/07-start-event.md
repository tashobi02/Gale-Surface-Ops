# 07 — `START_EVENT`: the storm on demand, time-shifted dose series

| | |
| --- | --- |
| **Subtasks** | T32.11, T32.12 |
| **Depends on** | 06 (chain on `commands.ts`) |
| **Branch** | `be/07-start-event` |
| **Spec refs** | 02 §D.17, §D.13; 01 FR-52, FR-38; 05 EventLibraryEntry; decisions BD-97 (U-62), BD-99 |

## Files (≤ 13)

`apps/hab-core/tests/liveEvents.test.ts` (new) · `apps/hab-core/src/engine/liveEvents.ts` (new) · `commands.ts` · `engine/tick.ts` · `engine/alerts.ts` · test updates: `engine.test.ts`, `tick.test.ts`, `commands.test.ts`, `contingencyOps.test.ts`, `report.test.ts`, `contingencyOpsReal.test.ts`, `replay.test.ts`, `session.test.ts`

## Steps (tests first)

1. `liveEvents.test.ts`: T32.11 steps 1–6 on the fake scenario's synthetic series, plus `Snapshot.event_library` lists the entry and `Session.started_events` gains it.
2. `liveEvents.ts`: `startEvent`, `seriesUtc(state, entry, simTime)` (null before the press), `inputTime(entry, input)` = `t0 + t_offset_s`, `dueInputs(state, scenario, fromSim, toSim)` (used by package 18). Header records the hand-off: firing library inputs is package 18's (T26.04).
3. `alerts.ts` RADIATION_ALERT message text "Shelter now — radiation surge" (N-17). `tick.ts`, `alerts.ts`: dose rate and trigger state from compute at `seriesUtc(...)`; background rate before the press; provenance stays `replayed`.
4. Update the eight existing test files: each issues `START_EVENT {storm}` at `series_start_utc` (BD-97, UTC-preserving), so their event order and numbers stay as before. A test whose expectation still changes is a bug, not an update.

## Automated verification

- `npm --workspace @marswalk/hab-core test` (whole suite).
- Shift test: pressing at two sim times gives the same integral (compute `integrateDose` over the shifted window) and the same curve shape, offset by the difference.
- `make replay` (still on the fake/real scenario available) unchanged hash when pressed at `series_start_utc`.

## Status rows

```text
| T32.11 | done | <commit date> | [liveEvents.test.ts](../../apps/hab-core/tests/liveEvents.test.ts): background before press, shift, alert from press, rejections, determinism |
| T32.12 | done | <commit date> | [liveEvents.ts](../../apps/hab-core/src/engine/liveEvents.ts); tick/alerts read the shifted series; existing tests press at series_start_utc (U-62, BD-97) with unchanged numbers |
```

## Done when

The whole Hab Core suite passes with the storm only after `START_EVENT`.
