# 19 — Utility rover: `TASK_ROVER`, queue, motion, battery, relay

| | |
| --- | --- |
| **Subtasks** | T29.01, T29.02, T29.03 |
| **Depends on** | 17 (relay node in the link graph), 15 (shared motion helper unchanged) |
| **Branch** | `be/19-rover` |
| **Spec refs** | 01 FR-41, FR-42; 02 §D.9, §D.11; 05 Vehicle; decision BD-102 |

## Files

`apps/hab-core/tests/rover.test.ts` (turn every `it.todo` into a test) · `apps/hab-core/src/rover.ts` · `apps/hab-core/src/engine/rovers.ts` · `apps/hab-core/src/commands.ts` (dispatch) · `apps/hab-core/src/engine/links.ts` (parked RELAY rover as a node; antenna height from its ParamSet) · `scenarios/storm-sol4190/param_sets/ur1-assumed.json` and the fake scenario's copy (only if a 02 §D.9 key is missing; value from 02 §D.9, `assumed`)

## Steps (tests first)

1. Tests: the seven T29.01 cases; queue order with cumulative `eta_s` and `battery_wh_after` (expected values from compute route + the 02 §D.9 energy form evaluated by a compute helper, not typed); battery below 0 → `INVALID`; `VEHICLE_DISPATCHED` carries `task_id`; `VEHICLE_ARRIVED` pops; RELAY parked closes the fake scenario's shadow (`COMM_SHADOW` cleared); `relay_coverage_rev` increments and `GET /api/relay-coverage/UR1` returns the u8 grid (404 when not parked) (N-11; `server.ts` edit after package 21).
2. If the energy form is not yet in compute, add `roverEnergyWh(path, paramSet, grid)` to `packages/compute/src/consumables.ts` with its test (science in compute).
3. Implement handler (`searchLeg` with the utility-rover ParamSet) and per-tick motion/battery/relay.

## Automated verification

`npm --workspace @marswalk/hab-core test -- rover links tick` · `npm --workspace @marswalk/compute test -- consumables`.

## Status rows

```text
| T29.01 | done | <commit date> | [rover.test.ts](../../apps/hab-core/tests/rover.test.ts): no it.todo left |
| T29.02 | done | <commit date> | rover.ts: TASK_ROVER validation and FIFO queue with ETA and battery (BD-102) |
| T29.03 | done | <commit date> | rovers.ts: motion, battery, relay node in the link graph |
```

## Done when

`Vehicle.task` / `Vehicle.queue` show every accepted task with ETA and battery, and RELAY closes the shadow.
