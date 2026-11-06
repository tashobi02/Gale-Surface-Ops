# Mock WebSocket fixtures (F7)

| | |
| --- | --- |
| **Owner** | T20.02 (Sadman Shaharier Mahim, R4 Hab Core) |
| **Date** | 2026-11-06 |
| **Status** | Mock data for tests and mock-mode screens (06 §D.2). It never ships and the demo never loads it |
| **Related** | [02 §E.6](../../../../../docs/specs/02_Technical_Requirements_Document.md#e6-websocket-protocol-ws) · [01 §E.1](../../../../../docs/specs/01_Product_Requirements_Document.md#e1-killer-demo--storm-at-sol-4190-target-90-s-of-the-240-s-video) · [03 §C.6](../../../../../docs/specs/03_App_Flow_and_Diagrams.md#c6-killer-demo-journey--storm-at-sol-4190-v2-01-e1) · [fixture value rule](../../../../../docs/tasks/_coordination.md#e-fixtures-and-mocks) · protocol v0 (`packages/protocol/src/ws.ts`) |

One JSON file per killer-demo beat, each an array of `ServerMessage`s in the order the server sends them. Load them with `wsFixtures[beat]` from `index.ts`. `fixtures.test.ts` checks every message against key tables typed from protocol v0, so a protocol change fails `make typecheck` or the test until these files follow. A `contract-change:` of protocol v0 updates these files in the same PR.

| File | Beat (03 §C.6 row) | Messages |
| --- | --- | --- |
| `connect.json` | 1: client joins | `SNAPSHOT`, the reply to the 02 §E.6 `HELLO` (`role` `eva:EV1`, `client_id` `c-7f3a`, `last_seq` 0) |
| `walking.json` | 2: crew walking | `STATE_DELTA`, `PING` |
| `radiation-alert.json` | 4: local trigger | `EVENT ALERT_RAISED` |
| `options-proposed.json` | 4–6: options sheet | `EVENT OPTIONS_PROPOSED` with two options |
| `summon-accepted.json` | 6: "Go — option 1" | `EVENT VEHICLE_DISPATCHED`, `COMMAND_RESULT` for `k-0091` |
| `link-lost-restored.json` | 7: comm shadow | `LINK_STATE` false, `EVENT LINK_LOST`, `LINK_STATE` true, `EVENT LINK_RESTORED` |
| `stop-task-ticked.json` | FR-50 task ticked | `EVENT TASK_UPDATED`, `COMMAND_RESULT` for `k-0102` |

"HAB LINK LOST" on the client (FR-32) is the absence of `PING` for `LINK_LOST_AFTER_MS`; it needs no fixture.

## Value sources

Every value is a spec example (cited), a typed placeholder (`0`, `""`, `[]`, `null`), or an identifier or enum member that the protocol requires. Placeholders are not data: `seq` 0 and `sim_time` `""` mean "not given by any example", so files are independent sequences, not one continuous session.

| Value | Where | Source |
| --- | --- | --- |
| `seq` 412, `sim_time` `2024-05-20T13:05:00Z`, `session_id` `s-0007`, `scenario_id` `storm-sol4190`, `data_version` `gale_boxwork-2026.11.08`, `speed` 60, `paused` false, `plan_revision` 3 | `connect` | 02 §E.6 SNAPSHOT example (`plan_revision` from its `plan`) |
| `last_seq` 412 | `connect` | equals the SNAPSHOT `seq` (02 §E.6 reconnect rule) |
| `seed` 4190 | `connect` | 05 Scenario example |
| EV1 `x_m` 2410.5, `y_m` −1875.0, `o2_frac` 0.71, `dose_event_ugy` 0, `linked` true, `haven.minutes` 18.4, `haven.kind` `vehicle` | `connect` | 02 §E.6 SNAPSHOT example (haven nested per 05 Crew) |
| PR1 `pressurized_rover` at −1800, −1500, `PARKED` | `connect` | 02 §E.6 SNAPSHOT example |
| `param_set` `pr1-assumed` | `connect` | 05 ParamSet example |
| Snapshot `provenance` keys and classes | `connect` | 02 §E.6 SNAPSHOT example, keys renamed to the nested 05 shapes |
| Task `t-s2-02`, `stop_id` `wp-2`, `kind` `image`, text "Image the ridge crest" | `connect`, `stop-task-ticked` | 02 §E.6 UPDATE_STOP_TASK example (`task_id`); 05 StopTask examples (`stop_id`, text) |
| Task provenance `state` simulated, `text` assumed | `connect` | 05 StopTask provenance rule |
| `seq` 413, `sim_time` `2024-05-20T13:05:01Z`, EV1 `x_m` 2411.2, `o2_frac` 0.7099 | `walking` | 02 §E.6 STATE_DELTA example |
| `seq` 420, `sim_time` `2024-05-20T13:12:00Z`, `RADIATION_ALERT`, `source` `replayed:rad-sol4190` | `radiation-alert` | 02 §E.6 EVENT example |
| `level` warning | `radiation-alert` | 04 §D.2 (radiation alert is a Warning) |
| `alert_id` `a-420` | `radiation-alert`, `options-proposed` | 05 Alert rule `a-<seq>` |
| `message` "Shelter now — radiation surge" | `radiation-alert` | 04 §D.2 example text |
| `rate_ugy_h`, `threshold_ugy_h` null | `radiation-alert` | placeholders (`"…"` in the 02 §E.6 example) |
| `eta_shelter_min` 14 (rendezvous) and 41 (abort) | `options-proposed` | 01 §E.1 row 0:30 (values marked **illustrative** there) |
| `event_seq` 421, `command_id` `k-0091`, crew `EV1`, `EV2` | `summon-accepted` | 02 §E.6 COMMAND and COMMAND_RESULT examples |
| `command_id` `k-0102`, `state` DONE, event fields `{task_id, stop_id, crew_id, state, reason}` | `stop-task-ticked` | 02 §E.6 UPDATE_STOP_TASK example and the TASK_UPDATED rule below it |
| `option_id` `o-1`, `o-2`; all other numbers 0; times `""` | various | placeholders |
