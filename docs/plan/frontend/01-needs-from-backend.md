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
| N-07 | Task library to the planner | Shipped: `Snapshot.task_library` (`TaskLibraryEntry[]`, each entry keyed by `poi_id`; type in `packages/protocol`), which the planner reads from `GET api/session` on the Hab Core origin (T32.02/T32.25; no separate library endpoint) | FD-036, FD-171, FD-320 | 25 (shipped) |
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
| N-100 | Hab time field for the ops map | A per-session hab time field (seconds from the hab per grid cell, compute `habTimeField`) the ops client can fetch, for the 10/20/30 min haven isochrones and the caution hatch beyond `max_haven_min` | FD-350, FD-072 | 21 (soft) |
| N-101 | Suggested relay point and the live rover handler | `TASK_ROVER` handler and `roversTick` (still `throw` in `apps/hab-core/src/rover.ts` and `engine/rovers.ts`, N-09), and a suggested RELAY target that closes the current comm shadow, so a RELAY can be placed from the EVA tablet in two taps and confirm (T29.04 acceptance) | FD-353, 03 SCR-15 "nearest ridge for relay" | 21 |
| N-140 | Real site's grid assets | `data/sites/gale_boxwork/grid/elevation.f32`, `slope_p90.u8` and `flags.u8` reachable at `/sites/gale_boxwork/grid/…`, so `E2E_SITE=gale_boxwork` runs the real worker on the real site. This checkout ships the real site's manifest and vectors but **no** `grid/` directory, so the planner cannot route on it and the `walking-skeleton` and `scale-bar` real-site cases stay `test.fixme` | 02 §D.2 (routing on the grid), 05 §E.1 (grid assets); T03.19 | 28 (soft: the same checks run on the F4 `mock_site`, which carries a grid) |

## Package 19 follow-up

1. N-06 follow-up — N-06 supplies sol, LTST and the condition fields, but `ConditionsState` has no EVA phase. Supply the authoritative phase plus provenance and source; SCR-11 currently displays “—” (see `axe.spec.ts` `needs N-06`).

## Package 20 follow-up

1. N-31 — N-23 `Snapshot.earth` has blackout and next-pass UTC but no current-pass or link-availability state. Supply the state with provenance and source, so the widget can distinguish available from waiting. It currently shows “—” unless blackout is true (CONJUNCTION).
2. N-32 — Align the ADD_STOP_TASK handler with FD-031: fewer than four tasks per selected crew at a stop, with shared tasks counted for either crew. The current BD-109 handler counts tasks for all crews together. The frontend implements FD-031 and shows server rejections; live task-limit acceptance remains wip.
| N-70 | Repeated PUBLISH_PLAN must replace/update/delete planner-origin drafts at retained stops while LOADED | —; current `checkPublishedTasks` rejects known task ids, while rotating ids appends duplicates because `onPlanRevised` only drops tasks at removed stops. Define retained-stop replacement semantics; keep stable draft ids until then | FR-54, FD-322; `apps/hab-core/src/engine/tasks.ts`; fixme in `plan-rules` | — (backend; package 25 shipped and keeps only the repeated-publish case `test.fixme`) |

## Package 26 follow-up

1. N-80 — Supply report source IDs with manifest-resolvable references and populate the 30-second crew trace in `/api/report`; this checkout's builder returns an empty trace and the protocol has no source IDs. SCR-17 shows — when unavailable.

## Package 27 follow-up

1. N-81 — Commit the storm recording required by N-21 and include the complete ordered session log in it (including events preceding the initial snapshot), so the Pages replay can independently verify the advertised log hash. The current collector begins with a snapshot and only records later events; this checkout has no recording file.

## Package 36 follow-up

1. N-130 — Supply Earth-visible delayed crew and alert summary with its simulated as-of timestamp and provenance/source ids. Current Snapshot crew and alerts are current Mars state, not the delayed Earth view; SCR-16 shows — until supplied. Link available/waiting remains N-31.
2. N-213 — The committed real bundle `scenarios/storm-sol4190` cannot deliver an Earth message during the EVA, so T18.12's acceptance cannot be exercised on the real site. The relay table's passes are 08:50–08:56 (maven) and 10:05–10:12 (mro) on 20 May 2024, but the EVA runs 04:11:00 → 06:35:31 and the ticks stop when it ends; the committed recording shows the storm's forecast queued at 05:36:00 with `deliver_utc 2024-05-20T08:50:00.000Z` and **no** `EARTH_MSG_DELIVERED` afterwards. The Earth → Mars rule (`packages/compute/src/earthLink.ts`: `t_deliver = next_pass_start(t_send + light_time)`) is correct; the bundle's window is the problem. Please either extend the EVA window (or the scenario's `max_eva_duration_h`) so a pass falls inside it, or extend the session so queued messages are delivered after the EVA has ended (for example, a delivery tick that still runs while the status is ENDED). Frontend cannot change the backend-owned scenario or the engine's tick loop, so the browser check `earth-message` runs on the harness's declared synthetic table (`apps/web/e2e/lib/fakeScenario.ts`) and asserts the engine's arrival time; T18.12 stays `wip` until the real bundle can deliver a message too.

## Package 23 follow-up

1. N-90 — Implement N-16 `GET /api/join-qr?role=<role>` for the protocol roles, including presenter and HUD. The contract lists it but apps/hab-core/src has no handler in this checkout; SCR-19 shows “—” when an image is unavailable and keeps the same-origin join link.

## Package 18 follow-up

1. N-120 — Supply the hab walking-time field and its documented grid/source metadata to live EVA (the same dependency as N-100 for ops). The current site/snapshot contract has no transported field. Full-map haven bands show “— unavailable”; the specific haven-band browser check stays `test.fixme('needs N-120')`. No client time field or ETA is computed.

## Package 33 follow-up

1. N-160 — Complete N-25. (a) Answer C6 `VALIDATE_MANUAL_LEG` in the worker with a `MANUAL_LEG_RESULT` (today the worker answers `ERROR`, "Unknown worker request type", so the manual-leg panel of T09.08 shows Unavailable and "—"). (b) Give each site manifest the BD-23 static PNGs (`images/<layer_id>.png`, pipeline `--static-images`), so a 2 m overlay can fall back to an image on the real site (the ortho already falls back to its own coarsest tile). (c) Take validated legs into the plan authoritatively (totals, timeline, conditions, radiation and computed time): the page shows only the worker's one-leg result and "—" for totals, and never computes them. T09.08 stays `wip` until (a) and (c); the check `fallbacks-planner` has the `fixme("needs N-160")` that passes once they land.

   **Closed 14 Nov 2026 (a) and (c).** The worker answers `VALIDATE_MANUAL_LEG` with `MANUAL_LEG_RESULT` (BD-150, on `main`). For (c), `ComputePlanRequest` gained an optional `manual_legs` (BD-170): the page sends the polyline it drew, never a number, and the worker measures that polyline on the grid itself and substitutes the measured leg for that pair's routed leg. The plan's totals, timeline, conditions and radiation therefore come from the worker's own measurement, and the panel reads them from the worker's `PLAN_RESULT` (`result.totals.eva_total_min`) with that source. The `fallbacks-planner` check "the real worker validates a manual leg and the plan integrates it (N-160(c), T09.08)" passes; `manualLegPlan.test.ts` (10 tests) and the plan store's own tests carry the contract, mutation-checked. **(b) stays declined for the release asset** (BD-160): the released `gale_boxwork` bundle is built without `--static-images`, because rebuilding it would replace a release asset whose `data_version` the scenario and the plan hash name.

## Package 29 follow-up

1. N-200 — The SCR-11-only mission acceptance (T25.08) needs a supported way for ops to start the library storm. `START_EVENT` is presenter-only in `packages/protocol/src/ws.ts` (02 §D.17), SCR-11 has no Start storm control, and `engine/liveEvents.ts` deliberately keeps dose at background until that command. Event-clock jumps cannot start it. Please resolve the ops permission/surface contract or revise the acceptance explicitly; frontend cannot grant protocol permission in this lane. The complete `ops-no-terminal` storm case remains `test.fixme('needs N-200')`, T25.08 stays wip. The active console-only unstormed mission, approval fixture and presenter-started task/abort check do not claim that missing acceptance.

## Package 31 follow-up

1. N-170 — Complete the product-name migration in backend-owned `apps/hab-core/scripts/build-demo-plan.ts`, `pipeline/cache/donki/README.md` and `scenarios/storm-sol4190/{plan.json,scenario.json,recording.json}`, coordinating the mandatory disclaimer in 01 §F.1 and its consumers. The recorded scenario and replay need their owning lane to preserve reproducibility and hashes. The specs 01 and 03, the shared contract `docs/contracts/tile-grid.md`, the Makefile and the constitution are outside this package's permitted files and also retain the working title. **Frontend side is done:** the launchpad briefing, the post-EVA report and the exported plan JSON now carry one shared boundary statement (`apps/web/src/ui/content/disclaimer.ts`, the ADR-013 name), and the demo script's spoken name matches the on-screen name. The repo-wide rename check stays skipped until the owners above reconcile the title; no historical record should be rewritten.

   Two backend-owned artefacts must change with it, so the pair can be finished in one edit:

   - `apps/hab-core/scripts/build-demo-plan.ts` still declares `PROTOTYPE_DISCLAIMER` with the retired working title in the first sentence. The disclaimer names the product (ADR-013), so the backend copy must adopt the ADR-013 name to stay word-for-word identical to the web copy.
   - `apps/hab-core/tests/buildDemoPlan.test.ts` ("T21.12 (a) the export carries the web app's disclaimer") reads the web copy with the regex `/export const PROTOTYPE_DISCLAIMER =([\s\S]*?);\n/` against `apps/web/src/export/planExport.ts`. The literal now lives in `apps/web/src/ui/content/disclaimer.ts` and `planExport.ts` re-exports it, so the regex matches nothing and the test throws on `null`. The test should read the new location (or read the re-export's source) so the cross-lane consistency invariant — the one thing that catches the two copies drifting apart — keeps working. The invariant itself is sound and worth keeping; only the path it reads changed.

   Until that pair lands, `make test-web` is red on exactly this one backend test. No frontend test depends on the backend copy.

## Package 99 follow-up

1. N-210 — Annotate lines 28, 57 and 62 of backend-owned `apps/web/tests/fixtures/README.md` individually with `N-13` so literal `TODO(decision)`/`TODO(verify)` greps match the `99-verification.md` §B.2 N-13 exception per line.
2. N-211 — Provide a worker/backend-owned mechanism to fail a live routing computation on demand so `release-recovery.spec.ts` can verify the T09.07 "Computation failed" + Retry path without adding a production debug hook (`FD-543`). **Closed 14 Nov 2026:** the F3 mock worker gained a `transient-error` variant (`apps/web/tests/fixtures/mockWorker.ts`) that answers the first `COMPUTE_PLAN` with the worker's own `TIMEOUT` error and the next one with the `ok` fixture. The failure is the worker's, so the app needs no hook, and the recovery is observable. `release-recovery.spec.ts` drives the real planner UI with it and asserts the banner, the error code, the Retry and the recovery to OK. The code is `TIMEOUT` and not `INTERNAL` on purpose: an `INTERNAL` answer marks the client crashed, so the Retry would restart the worker, reset the counter and fail for ever.

## QoL pass follow-up

1. N-212 — QoL Q2's SCR-12 top bar (`CrewMotionButton` beside the alert slot, backend-owned for Q2 per [the QoL brief](../qol/README.md) §2) breaks fixed geography: `eva-geometry` and `fullmap` fail on `tablet-landscape-1024x768` because `[data-slot=alert-slot]` is 329 px wide and 64 px high in one state and 389 × 72 px in another, and `haven`/`o2` widen with it (205 vs 235 px). Give the HOLD / RESUME button and the alert slot the same box in every crew state (for example, always render the button, disabled when not walking, at a stop or holding), so 04 §A.3 fixed position holds. Reproduced on core-frontend `af2a7f6`, independent of the frontend's alert-message `flex` line.

## T09.09 follow-up

1. N-214 — The planning haven form's **vehicle branch** cannot be computed for a plan, so a leg profile's `haven_min` is the hab branch alone. 02 §D.8 defines the planning form as `min(haven_hab(p), haven_veh(p))`, with `haven_veh(p) ≈ min over q within 300 m of p of max(dist_walk(p,q), T_veh(q))`; the frozen `havenAlongRoute` takes the rover's time field as its fourth argument. A plan cannot supply it: `ComputePlanRequest` carries no vehicle start position and no rover ParamSet, and 05's `Scenario.vehicles[].start_x_m` / `start_y_m` and the pressurised rover's `ParamSet` live on the Hab Core side (05 §F.4). The plan therefore quotes only the suit's ingress (`MissionScenario.hab_ingress_min`, 02 §D.8 `t_ingress`, BD-57) and computes `T_hab` from the plan's `role: "start"` waypoint. **What is needed:** the rover's start position and its ParamSet available to the compute worker when it computes a plan — either as fields on `ComputePlanRequest` (`vehicle_start_m: {x_m, y_m}` plus the rover's `vehicle_param_set`) or as a snapshot/session input the worker adapter passes through — so `havenAlongRoute`'s vehicle branch can run and the planning form can take `min(hab, vehicle)` as 02 §D.8 specifies. Until then the band's value is the hab branch alone and no vehicle haven time is invented. The live (exact) form in the Hab Core already has the rover's field, so only the **planning** form is affected.
