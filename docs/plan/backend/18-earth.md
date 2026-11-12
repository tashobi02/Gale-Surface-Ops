# 18 — Earth messages, forecasts and blackout in the engine

| | |
| --- | --- |
| **Subtasks** | T26.03, T26.04 |
| **Depends on** | 07 (`dueInputs`, `inputTime`) |
| **Branch** | `be/18-earth` |
| **Spec refs** | 01 FR-43, FR-37; 02 §D.12; 05 EarthMessage, EventLibraryEntry inputs; decisions BD-60, BD-99 |

## Files

`apps/hab-core/tests/earth.test.ts` (new) · `apps/hab-core/src/engine/earth.ts` · `apps/hab-core/tests/tick.test.ts` (remove the T26.04 stub expectation) · `apps/hab-core/src/commands.ts` (dispatch `SEND_MESSAGE` to `handleSendMessage`)

## Steps (tests first)

1. `earth.test.ts`: `SEND_MESSAGE` to Earth → `EARTH_MSG_QUEUED` then `EARTH_MSG_DELIVERED` at compute's delivery time; an `earth`-role message to Mars delayed the same way; a library input (forecast) fires at `t0 + t_offset_s` and is delivered at the rule's time; scenario `events` (non-library) still fire at their `t_utc`; blackout (conjunction) holds delivery (BD-60); `Snapshot.earth` fields filled from compute.
2. Implement with `@marswalk/compute` `earthLink` only.

## Automated verification

`npm --workspace @marswalk/hab-core test -- earth tick`; NFR-06 grep.

## Status rows

```text
| T26.03 | done | <commit date> | [earth.test.ts](../../apps/hab-core/tests/earth.test.ts) |
| T26.04 | done | <commit date> | earth.ts: queue, delivery, library inputs at t0 + t_offset_s, blackout |
```

## Done when

Messages and forecasts flow with delivery times from the tables only.
