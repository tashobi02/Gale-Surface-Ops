# Needs from the backend plan

| | |
| --- | --- |
| **Owner** | Frontend planner (Claude) for Sadman Shaharier Mahim |
| **Date** | 2026-11-12 |
| **Status** | Written before `origin/core-backend:docs/plan/backend/01-contract.md` existed (checked 12 Nov 2026 with `git fetch -q && git show origin/core-backend:docs/plan/backend/01-contract.md`: branch not found). When it lands, each frontend package reads the contract's names and uses them; the names below are the Proposed names from the TASK files and are used only if the contract is silent |
| **Related** | [Overview](00-overview.md) · [Decisions](decisions.md) |

Rule for every frontend package: a field the backend has not shipped renders "—" with `data-unavailable="true"` and an `unavailable:<path>` source (existing `provenance.ts` rule). No package invents a value, a field or a client-side computation to fill a gap. A package whose **hard** need is missing finishes everything else, leaves the dependent harness check as `test.fixme('needs N-nn')`, and keeps its status row `wip` naming the need.

| ID | Need | Proposed shape (if the contract is silent) | Source | Hard for packages |
| --- | --- | --- | --- | --- |
| N-01 | Start the Hab Core on a scenario folder outside `scenarios/` | `hab:start -- --scenario-dir <path>` | Harness (FD-198) | 01 (soft: a copy workaround exists) |
| N-02 | Per-crew navigation and O₂ margin in the snapshot, with provenance map entries | `Crew.o2_remaining_min`, `next_stop_bearing_deg`, `next_stop_distance_m`, `next_stop_eta_s` (T32.30–T32.31) | TASK-32 Q9 | 17, 18 |
| N-03 | Crew last-linked sim time | `Crew.last_linked_sim_time` (UTC sim time) | FD-044 | 17, 18, 21 |
| N-04 | Per-crew link state: hops and via, **no bars** | `Crew.link_hops?: number \| null`, `Crew.link_via?: "direct" \| "relay" \| "crew" \| null`; the same on `LINK_STATE` (contract N-04, "Changed: no `quality_bars`") | FD-045, FD-261 | 17, 18 |
| N-05 | Session summary over HTTP for planner, join and presenter | `GET /api/session` → `{session_id, scenario_id, status, sim_time, speed, eva_start_utc, hab_site_id, plan_published}` | FD-042 | 09, 22, 23 |
| N-06 | Conditions in the snapshot | `Snapshot.conditions {sol, ltst, sun_elevation_deg, eva_phase, background_rate, event_rate}` with provenance and source ids (T22.16) | FD-085, FD-166 | 19 |
| N-07 | Task library to the planner | One transport (T32.02/T32.25), e.g. `GET /api/task-library` → `TaskLibraryEntry[]` keyed by POI id; type in `packages/protocol` | FD-036, FD-171 | 25 |
| N-08 | Typed command args | `ADD_STOP_TASK {crew_id, stop_id, kind, text}`, `UPDATE_STOP_TASK {task_id, state, reason?, undo?}`, `PUBLISH_PLAN {plan, stop_tasks}`, `TASK_ROVER {vehicle_id, kind, target_m?, item?}` | FD-054, FD-059 | 13, 17, 20, 21, 25 |
| N-09 | Rover tasking live: handler, CARRY items, accepted-task event kind | `TASK_ROVER` handler (T29.01–T29.03); `Scenario.carry_items: string[]`; log kind for an accepted task | FD-052, FD-168 | 21 |
| N-10 | Report contract | `ApiPostEvaReport` in `packages/protocol`; 30 s-decimated `trace` per crew; per-stop planned/actual times; per-alert shelter response per crew; dropped stops by Waypoint id; planned background dose with source or null; `GET /api/log` full JSON | FD-053, FD-087, FD-179, FD-180 | 26, 29 |
| N-11 | Relay coverage | Per-relay coverage grid asset id in the snapshot when a RELAY is active | FD-071 | 21 (soft) |
| N-12 | Vehicle task queue | `Vehicle.queue: {kind, target_m, eta_s, battery_after_wh}[]` or confirmation that there is none | FD-084 | 21 (soft) |
| N-13 | Fixture metadata | Radiation DataSource metadata, marstime pin, F6 date reconciliation (pipeline) | FD-097 | 04 (README text only) |
| N-14 | C6 `SAMPLE_POINT` slope limit field | Confirm `hard_slope_limit_deg` | FD-112 | 10 |
| N-15 | Worker conditions sol date | `PlanResult.conditions.sol` (compute) | FD-126 | 12 (soft) |
| N-16 | Join QR images | `GET /api/join-qr?role=<role>` → SVG (T28.02) | FD-177 | 22, 23 |
| N-17 | 05 §F.6 alert text example | "Shelter now — radiation surge" grammar (04 §D.4) | FD-206 | — |
| N-18 | Live-session protocol (C13) | `presenter` role; `JUMP_NEXT_STOP`, `START_EVENT {event_id}`, `RESET_SESSION`, `SELECT_HAB_SITE {candidate_id}`, `SET_MISSION_SETUP {…}`; Session fields `hab_site_id`, `mission_setup`, `events_started`, `advancing_to_stop`; log kinds `CLOCK_JUMPED`, `EVENT_STARTED`, `SITE_SELECTED`, `SESSION_RESET`; role matrix; fresh `SNAPSHOT` after reset (T32.01, T32.10–T32.15); F7 fixtures in `apps/web/tests/fixtures/ws/` (T32.03) | 01 FR-51–FR-53 | 22, 23, 24 |
| N-19 | Contingency options in the snapshot and `APPROVE_OPTION` live | Options list with ids, kinds, ETA to shelter, dose, stops dropped, violations (T23.07 done on the gem- branch; confirm on main) | FD-049, FD-050 | 18, 20 |
| N-20 | Real scenario | `scenarios/storm-sol4190/scenario.json` in the live shape (T21.08, T32.32) for `E2E_SITE=gale_boxwork` runs | Harness | 28, 29, 32 |
| N-21 | Recorded log for replay | A committed recorded log (T22.14) plus a pure `logHash()` in `packages/protocol` so the web replay can verify `log_hash` | FD-160 | 27, 29 |
| N-22 | Per-candidate comm grids served | `data/sites/<id>/grid/comm_hab*.u8` reachable at `/sites/…` (manifest `comm_hab_asset`, T03.34 done) | FR-53 | 24 |
| N-23 | Earth link and messages | Snapshot Earth block (light time, next pass, queue, state) and `SEND_MESSAGE` for `earth` (T26.04) | FR-43, FR-48 | 20 (widget), 36 |
| N-24 | Desirable compute/data | T18.02 REMS context output; T18.05 O₂ estimate function | FD-194 | 35 |
| N-25 | Fallback inputs | C6 message for hand-drawn legs (T05.30); one PNG per 2 m layer (T03.25) | FD-193 | 33 |
| N-26 | Real worker results | Full `PLAN_RESULT` with radiation and `DARKNESS` warnings (T05.32, T06.x) | Verify checks | 28 |
| N-27 | EVA end | Session status `ended` and the command that ends an EVA, so SCR-11 → SCR-17 can be driven from the UI | 03 SCR-11 Ended | 19, 29 |
| N-28 | Haven fields | Haven bands per tick for the ops map (T23.03) and planning haven values per leg (T05b.04) | FR-39 | 11, 21 |
| N-30 | SCR-09 scenario metadata | Supply the loaded scenario ParamSet files (including values, provenance and source ids) and the loaded dose-series source id and title to the planner; the site manifest and planner boot currently expose neither | FD-304, FR-15 | 15 (T12.03) |
| N-29 | Revise a skipped task reason during the undo window | Permit an actor to change the reason on its own SKIPPED task without undoing and re-skipping it; preserve the audit and revision rules | FD-028; current engine accepts SKIPPED only from TODO | 17 |
