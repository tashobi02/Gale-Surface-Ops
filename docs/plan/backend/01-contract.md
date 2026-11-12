# 01 — Contract package: protocol v0.2 for the live session (implemented second, merged to `merging-core` before any frontend implementation)

| | |
| --- | --- |
| **Subtasks** | T32.01, T32.03, T32.04, T32.05 (and the protocol halves of T32.25, T22.16, T27.01, T29.02, T26.01, T05.27) |
| **Runs after** | [02-spec-changes.md](02-spec-changes.md) (the specs say it first) |
| **Split** | Two implementer runs: **01a** types, permissions, reducer cases (§1–§7); **01b** scenario schema v2, fake scenario, F7 fixtures (§8–§9). 01a merges, then 01b, back to back |
| **Branch** | `be/01a-protocol`, `be/01b-schema-fixtures`, each cut from `merging-core` |
| **Decisions** | BD-40, BD-75, BD-76, BD-90 … BD-105 ([decisions.md](decisions.md)) |

Everything here is **additive** (C13 v0 → v0.2; `PROTOCOL_VERSION` stays `1` because no existing field changes meaning). Field names are copied from 05 (after package 02) or from the decision named. The frontend builds only against this file and the merged code. Any later change goes through a `contract-change:` note in this file and a rebase notice to the frontend orchestrator.

## 1. Roles and permissions (`packages/protocol/src/runtime.ts`, `ws.ts`)

```ts
export type Role = "planner" | "eva:EV1" | "eva:EV2" | "hud:EV1" | "hud:EV2" | "ops" | "earth" | "presenter";

export type CommandKind = /* existing 14 */ | "JUMP_NEXT_STOP" | "START_EVENT" | "RESET_SESSION" | "SELECT_HAB_SITE" | "SET_MISSION_SETUP";

// ws.ts PERMISSIONS: add
presenter: ["LOAD_SCENARIO", "SET_CLOCK", "JUMP_NEXT_EVENT", "JUMP_NEXT_STOP", "START_EVENT", "RESET_SESSION"],
// ops: append "SELECT_HAB_SITE", "SET_MISSION_SETUP"
```

The presenter has no `APPROVE_OPTION`, `ABORT`, `SUMMON_VEHICLE`, `START_EVA`, `PUBLISH_PLAN` (02 §E.4). `server.ts` `isRole` reads `PERMISSIONS`, so `presenter` joins without a server edit.

## 2. Command args (wire: `COMMAND.command.args`)

| Kind | `args` | Roles | Rejections (in order role → link → args → state) |
| --- | --- | --- | --- |
| `JUMP_NEXT_STOP` | `{}` | presenter | `INVALID` no EVA running or no stop left; `BUSY` a warning-level alert is latched |
| `START_EVENT` | `{event_id: string}` | presenter | `INVALID` unknown id; `BUSY` already started in this session |
| `RESET_SESSION` | `{}` | presenter | — |
| `SELECT_HAB_SITE` | `{candidate_id: string}` | ops | `INVALID` unknown id; `BUSY` not `LOADED` or a plan is published |
| `SET_MISSION_SETUP` | `Partial<MissionSetup>` | ops | `INVALID` `crew_count` ≠ scenario `crew[]` length, `vehicle_available: true` without a `vehicle_param_set` (given or already set), a value outside 02 §E.3; `BUSY` not `LOADED` |
| `PUBLISH_PLAN` (extended) | `{plan: PlanExport, stop_tasks?: StopTaskSeed[]}` | planner, ops | adds: `INVALID` a `stop_id` that is not a stop Waypoint of `plan`, 0 or > 4 tasks for one stop, text > 60 characters |
| `TASK_ROVER` (unchanged args) | `TaskRoverArgs` | eva, ops | adds: `INVALID` when the predicted `battery_wh_after` of the new task is below 0 |

## 3. Scenario, Session and library types (`runtime.ts`)

```ts
export interface MissionSetup {
  crew_count: number;               // must equal scenario crew[] length
  vehicle_available: boolean;
  vehicle_param_set: string | null; // FK → ParamSet (kind pressurized_rover)
  solar_phase: string;              // 05 MissionScenario name and values
  max_haven_min: number;            // 05 MissionScenario range
}
export interface EventLibraryInput {
  input_id: string; t_offset_s: number; kind: ScenarioEventKind;
  payload: Record<string, unknown>; provenance: Provenance; source_id?: string;
}
export interface EventLibraryEntry {
  event_id: string; title: string; kind: "SPACE_WEATHER";
  dose_series: "dose_series";       // key in Scenario.tables
  series_start_utc: string; label: string; source_id: string; provenance: "replayed";
  inputs?: EventLibraryInput[];
}
export type EventLibrarySummary = Pick<EventLibraryEntry, "event_id" | "title" | "kind" | "label" | "source_id" | "provenance">;
export interface TaskLibraryEntry {
  library_task_id: string; poi_id: string; crew_id: CrewId | null;
  kind: StopTaskKind; text: string; source_id?: string;
}
// Scenario: add
  mission_setup: Partial<MissionSetup> & { hab_candidate_id?: string };
  event_library: EventLibraryEntry[];
  task_library?: TaskLibraryEntry[];
// Scenario.plan and Scenario.events stay required in 01a; package 04 makes them optional (with the null checks).
// Session: add (optional in 01a, required after package 04, BD-100)
  hab_candidate_id?: string | null;
  mission_setup?: MissionSetup;
  started_events?: { event_id: string; t0_sim_time: string }[];
```

## 4. Crew, Vehicle and Snapshot additions

```ts
// Crew (SNAPSHOT and STATE_DELTA paths crew/<id>/<field>); all optional + nullable in 01a
  o2_remaining_min?: number | null;      // simulated (BD-95)
  next_stop_bearing_deg?: number | null; // derived; 0–360 clockwise from grid north (+y of the working projection)
  next_stop_distance_m?: number | null;  // derived; straight-line horizontal, projected metres
  next_stop_eta_s?: number | null;       // modelled; includes the remaining dwell at the current stop
  link_hops?: number | null;             // simulated; hops to HAB along link_path, null when unlinked (BD-103)
  link_via?: "direct" | "relay" | "crew" | null;
  last_linked_sim_time?: string | null;  // simulated; sim time of the last tick this crew member was linked (N-03)

// Vehicle (utility rover queue, BD-102)
export interface QueuedRoverTask {
  task_id: string;                       // "rt-<seq of its VEHICLE_DISPATCHED>"
  kind: RoverTaskKind;
  target: { x_m: number; y_m: number } | null; // null for RETURN
  item?: string;
  eta_s: number | null;                  // modelled, seconds from now until this task completes
  battery_wh_after: number | null;       // modelled, 02 §D.9 energy form
}
  task_id?: string | null;               // id of the active task (head), utility rover only
  queue?: QueuedRoverTask[];             // tasks after the head; [] for the pressurized rover
  relay_coverage_rev?: number | null;    // utility rover parked as RELAY: increments when its coverage grid changes; null otherwise (N-11)

// LinkStateMessage (ws.ts): add link_hops and link_via (same meaning as on Crew) (N-04)

// Snapshot (ws.ts): add
  conditions: ConditionsState;           // BD-75, see §5
  task_library: TaskLibraryEntry[];      // BD-90; [] when the scenario has none
  event_library: EventLibrarySummary[];  // BD-104
  next_stop_target: { stop_id: string; stop_index: number } | null; // BD-104, crew-wide (02 §D.17)
```

Provenance map keys added to `Snapshot.provenance`: `crew.o2_remaining_min: simulated`, `crew.next_stop_bearing_deg: derived`, `crew.next_stop_distance_m: derived`, `crew.next_stop_eta_s: modelled`, `crew.link_hops: simulated`, `crew.link_via: simulated`, `vehicles.queue.eta_s: modelled`, `vehicles.queue.battery_wh_after: modelled`, and the §5 keys. A view never computes or defaults any of these; `null` renders as "—" with the provenance attribute.

## 5. Conditions (`apps/hab-core/src/engine/conditions.ts` type moves to `runtime.ts`)

```ts
export interface ConditionsState {
  ltst: string | null;                        // "HH:MM" local true solar time at the hab, derived
  sun_elevation_deg: number | null;           // derived (flat-horizon model, 02 §D.5)
  dose_rate_background_ugy_h: number | null;  // replayed (DoseSeries.background_rate)
  dose_rate_event_ugy_h: number | null;       // replayed; equals background before START_EVENT
  event_series_utc: string | null;            // the series time being played (time-shifted), null before START_EVENT
  sol: number | null;                         // MSL mission sol at sim time, derived by compute mslSol() (N-06)
  source_ids: Record<string, string>;         // field → source id (e.g. dose rates → "rad-sol4190", ltst → "mars24-allison-mcewen-2000")
  provenance: ProvenanceMap;
}
```

Temperature and pressure are absent ("not included in this build", FR-36). STATE_DELTA paths: `conditions/<key>`.

## 6. Log events (`LogEventKind`, `LogEventData`)

```ts
| "CLOCK_JUMPED" | "EVENT_STARTED" | "SESSION_RESET" | "SITE_SELECTED" | "MISSION_SETUP_SET"

CLOCK_JUMPED: { reason: "next_stop"; from_sim_time: string; to_sim_time: string; stop_id: string;
                ended_by: "arrival" | "alert" | "plan_revised" | "eva_ended" | "sheltered" };   // logged after the jump's events
EVENT_STARTED: { event_id: string; t0_sim_time: string; series_start_utc: string; source_id: string };
SESSION_RESET: { session_id: string; next_session_id: string };   // last line of the old log
SITE_SELECTED: { candidate_id: string };
MISSION_SETUP_SET: Partial<MissionSetup>;                         // the keys set, incl. vehicle_param_set
// changed
SESSION_LOADED: … & { plan_hash: string | null };
VEHICLE_DISPATCHED: … & { task_id?: string };                     // accepted TASK_ROVER only
```

`reducer.ts` gets the five cases (pure): `SITE_SELECTED` sets `session.hab_candidate_id`; `MISSION_SETUP_SET` merges into `session.mission_setup`; `EVENT_STARTED` appends to `session.started_events`; `CLOCK_JUMPED` and `SESSION_RESET` change only `last_seq` and `sim_time`. A `VEHICLE_DISPATCHED` with `task_id` appends a `QueuedRoverTask` (eta and battery `null` until the tick fills them); `VEHICLE_ARRIVED` for a utility rover pops the head. `reduce` stays exhaustive.

## 7. Other shared types

```ts
// packages/protocol/src/report.ts (new, exported from index.ts) — moved from apps/hab-core/src/report.ts unchanged, plus:
  dose: { …existing…; planned_background_ugy: number | null; planned_background_reason: string | null;
          provenance: { planned_background_ugy: "modelled" } };
  trace: { crew_id: CrewId; points: { sim_time: string; x_m: number; y_m: number }[] }[]; // 30 s decimated, simulated
// apps/hab-core/src/report.ts re-exports the types; package 20 fills the new fields.

// packages/protocol/src/recording.ts (new) — BD-105
export interface Recording {
  format: "marswalk-recording"; version: 1;
  scenario_id: string; seed: number; data_version: string; log_hash: string;
  label: "replayed recording";                 // shown by the Pages replay; never "live"
  messages: (Snapshot | EventMessage | StateDelta)[];   // first is the SNAPSHOT; seq order; deltas coalesced per sim second
}
// written to scenarios/storm-sol4190/recording.json by package 11

// packages/protocol/src/commandList.ts (new) — BD-93
export interface RecordedCommand { sim_time: string; role: Role; kind: CommandKind; args: Record<string, unknown> }
export interface CommandList { $comment: string; scenario_id: string; seed: number; commands: RecordedCommand[] }
export interface CommandJournalLine extends RecordedCommand { after_seq: number; command_id: string; client_id: string } // commands.jsonl

// packages/protocol/src/worker.ts — BD-40, BD-41 (C6 v1)
export interface LoadGridRequest {
  type: "LOAD_GRID"; request_id: string; site_id: string; data_version: string;
  meta: LoadedGridMeta;                         // the compute LoadedGrid meta incl. working-projection proj4
  arrays: { elevation: ArrayBuffer; slopeP90: ArrayBuffer; slopeMax: ArrayBuffer; flags: ArrayBuffer; ti: ArrayBuffer | null; commHab: ArrayBuffer };
}
// contract-change: (01a, 12 Nov) the array keys are the compute names (`slopeP90`, `slopeMax`, `commHab`, as `loadGrid` takes them;
// `commHab` is required there), as the note below this block says; `LoadedGridMeta = RoutingGrid & { proj4: string }` is defined in protocol.
export interface GridLoaded { type: "GRID_LOADED"; request_id: string; site_id: string; data_version: string }
export type WorkerRequest = LoadGridRequest | SamplePointRequest | ComputePlanRequest;
export type WorkerResponse = GridLoaded | SampleResult | PlanResultMessage | WorkerError;
// A COMPUTE_PLAN with a higher plan_revision cancels the running one; the cancelled one is answered ERROR CANCELLED.

// Manual-leg fallback (T05.30, N-25): validate a hand-drawn leg
export interface ValidateManualLegRequest { type: "VALIDATE_MANUAL_LEG"; request_id: string; plan_revision: number;
  scenario: MissionScenario; from: string; to: string; vertices: [number, number][] }
export interface ManualLegResult { type: "MANUAL_LEG_RESULT"; request_id: string; plan_revision: number; leg: Leg; warnings: Warning[] }

// packages/protocol/src/args.ts (new) — typed command args (N-08); names follow the handlers on main
export interface AddStopTaskArgs { stop_id: string; text: string; crew_id?: CrewId | null; kind?: StopTaskKind }
export interface UpdateStopTaskArgs { task_id: string; state: StopTaskState; reason?: StopTaskReason | null; undo?: boolean }
export interface PublishPlanArgs { plan: PlanExport; stop_tasks?: StopTaskSeed[] }
export interface StartEventArgs { event_id: string }
export interface SelectHabSiteArgs { candidate_id: string }
export type SetMissionSetupArgs = Partial<MissionSetup>;
export type CommandArgs = { ADD_STOP_TASK: AddStopTaskArgs; UPDATE_STOP_TASK: UpdateStopTaskArgs; PUBLISH_PLAN: PublishPlanArgs;
  TASK_ROVER: TaskRoverArgs; START_EVENT: StartEventArgs; SELECT_HAB_SITE: SelectHabSiteArgs; SET_MISSION_SETUP: SetMissionSetupArgs;
  JUMP_NEXT_STOP: Record<string, never>; RESET_SESSION: Record<string, never>; /* the remaining kinds: copied from their handlers in commands.ts */ };
// If a handler on main parses a different key, the handler's key wins and this file is corrected in the same PR.

// packages/protocol/src/logHash.ts (new, pure; N-21)
export function canonicalJson(value: unknown): string;               // RFC 8785 (JCS), as the Hab Core log uses
export function logLine(event: LogEvent): string;                    // canonicalJson(event) + "\n"
export function logHashOf<T extends string | Promise<string>>(events: readonly LogEvent[], sha256Hex: (text: string) => T): T;
// apps/hab-core/src/log.ts uses canonicalJson with node:crypto; the web replay uses logHashOf with WebCrypto. A test proves logHashOf gives the Hab Core's hash.
// contract-change: (01a, 12 Nov) `logHashStep(prevHex, event, sha256Hex)` is replaced by `logLine` and `logHashOf`: `log_hash` is the SHA-256 of the
// bytes of session.jsonl (apps/hab-core/src/log.ts), which cannot be extended from a hex digest, so a one-event step cannot give the committed hash.
```

## 7a. HTTP and CLI additions

| Endpoint / CLI | Response | Need |
| --- | --- | --- |
| `GET /api/session/summary` | `{session_id, scenario_id, status, sim_time, speed, paused, eva_start_utc \| null, hab_candidate_id \| null, plan_published: boolean}` | N-05 (02 §E.5 keeps `GET /api/session` = full SNAPSHOT) |
| `GET /api/log` (no `after`) | the whole current log as JSON lines; `?download=1` adds `Content-Disposition: attachment; filename=session-<id>.jsonl` | N-10 |
| `GET /api/relay-coverage/<vehicle_id>` | u8 grid in the `comm_hab` layout (same width, height, origin, cell) for a parked RELAY rover; 404 otherwise; `ETag` = `relay_coverage_rev` | N-11 |
| `GET /api/join-qr?role=<role>` | `image/svg+xml` (BD-82) | N-16 |
| `hab start --scenario-dir <path>` | loads a scenario folder outside `scenarios/` (same loader checks) | N-01 |

`LoadedGridMeta` is the existing compute meta type re-exported by protocol (no new fields beyond `proj4`). The exact array key names follow `packages/compute/src/grid.ts`; if they differ, the compute names win and this table is updated in the same PR.

## 7b. Frontend needs N-01 … N-28 → contract

Source: `origin/core-frontend:docs/plan/frontend/01-needs-from-backend.md` (02daf72). Where the frontend's Proposed name differs from a 05/02 name, the spec name wins (05 is the field-name owner).

| Need | Contract answer | Package | Accepted / changed / rejected (reason) |
| --- | --- | --- | --- |
| N-01 `--scenario-dir` | `hab start --scenario-dir <path>` (§7a) | 11 | Accepted |
| N-02 per-crew O₂ and navigation | `Crew.o2_remaining_min`, `next_stop_bearing_deg`, `next_stop_distance_m`, `next_stop_eta_s` (§4) | 09 | Accepted (same names) |
| N-03 last-linked time | `Crew.last_linked_sim_time` (§4) | 17 | Accepted |
| N-04 link state with bars | `LINK_STATE` + `Crew` carry `linked`, `link_hops`, `link_via` | 17 | Changed: **no `quality_bars`** — 02 §D.11 models line of sight only, so bars would be invented (BD-103). Show hops and via |
| N-05 session summary | `GET /api/session/summary` (§7a); `hab_candidate_id` | 11 | Changed: new path, because 02 §E.5 fixes `GET /api/session` as the full snapshot; `hab_site_id` → 05 name `hab_candidate_id` |
| N-06 conditions | `Snapshot.conditions` (§5) with `sol`, `ltst`, `sun_elevation_deg`, `dose_rate_background_ugy_h`, `dose_rate_event_ugy_h`, `event_series_utc`, `source_ids`, provenance | 16 | Changed: dose names keep the 05 unit suffix; **`eva_phase` rejected** — it duplicates `Session.status` and crew `activity` |
| N-07 task library | `Snapshot.task_library: TaskLibraryEntry[]` (§4) | 10 | Changed: one transport, the SNAPSHOT (BD-90); no `GET /api/task-library` |
| N-08 typed args | `packages/protocol/src/args.ts` (§7) | 01a | Changed: `TASK_ROVER` keeps the 05 names `task` and `target {x_m, y_m}` (not `kind`, `target_m`) |
| N-09 rover live | handler, queue (package 19); accepted task = `VEHICLE_DISPATCHED` + `task_id` | 19 | Changed: **no `Scenario.carry_items`** — CARRY items are free text (decided 7 Nov, 05 Vehicle) |
| N-10 report | `PostEvaReport` in `packages/protocol/src/report.ts` with `trace`, per-stop planned/actual, per-alert shelter response per crew, dropped stops by `stop_id`, `planned_background_ugy` + reason; full log via `GET /api/log` | 20 | Changed: name stays the 05 entity name `PostEvaReport` (no `Api` prefix) |
| N-11 relay coverage | `Vehicle.relay_coverage_rev` + `GET /api/relay-coverage/<vehicle_id>` | 19 | Changed: runtime grid, not a site asset id (relay coverage is computed at runtime, 02 §D.11) |
| N-12 vehicle queue | `Vehicle.task_id`, `Vehicle.queue: QueuedRoverTask[]` | 19 | Changed names: `target {x_m, y_m}`, `battery_wh_after` (prefix of 05 `battery_wh`) |
| N-13 fixture metadata | RAD DataSource fields (13), `marstime` pin and F6 sol labels (12) | 12, 13 | Accepted |
| N-14 `SAMPLE_POINT` limit | `hard_slope_limit_deg?` confirmed (BD-42) | 14 | Accepted |
| N-15 sol in PlanResult | `PlanResult.conditions.sol` (MSL sol of the EVA start, compute `mslSol`); 05 PlanResult gains the field | 13 | Accepted |
| N-16 join QR | `GET /api/join-qr?role=` | 21 | Accepted |
| N-17 alert text example | 05 §F.6 example message "Shelter now — radiation surge" (04 §D.4 grammar, ≤ 60 chars); the engine's RADIATION_ALERT message uses the same text | 02, 07 | Accepted |
| N-18 live-session protocol | §1–§6; F7 beats (§9) | 01a, 01b, 06–08 | Changed: `hab_site_id` → `hab_candidate_id`, `events_started` → `started_events` (05 Session); **`advancing_to_stop` rejected** — Next stop runs to completion inside one command, so there is no observable advancing state; the UI shows its pending state until `COMMAND_RESULT` and labels it from `next_stop_target`. `MISSION_SETUP_SET` is also a log kind |
| N-19 options + APPROVE_OPTION | `Snapshot.options` (on `main`); T23.07 closed in package 15 | 15 | Accepted (already on `main`) |
| N-20 real scenario | `scenarios/storm-sol4190/scenario.json`, live shape | 25 | Accepted |
| N-21 recorded log + hash | `scenarios/storm-sol4190/recording.json` (`Recording`, §7) and `logHash.ts` in protocol | 11, 26 | Accepted |
| N-22 candidate comm grids | served at `/sites/gale_boxwork/grid/comm_hab.u8` and `comm_<candidate_id>.u8` (static, follows the SSD symlinks); checked by curl in 27 | 23, 27 | Accepted |
| N-23 Earth block and messages | `Snapshot.earth` (on `main`), `SEND_MESSAGE` for `earth` | 18 | Accepted |
| N-24 desirables T18.02, T18.05 | not in the backend scope (TASK-18) | — | **Not planned here**: reported to the orchestrator for assignment |
| N-25 fallback inputs | `VALIDATE_MANUAL_LEG` / `MANUAL_LEG_RESULT` (§7); static images `images/<layer_id>.png` (BD-23) | 29 | Accepted |
| N-26 full PLAN_RESULT | radiation, conditions, timeline, `DARKNESS` | 13, 14 | Accepted |
| N-27 EVA end | `Session.status` `"ENDED"` (05 casing) after the engine's `EVA_ENDED` (all crew back or the plan's maximum EVA duration); no END_EVA command exists in 02 §E.4 — the presenter reaches it with Next stop, or ops with `ABORT` | — | Changed: no new command (02 §E.4 has none) |
| N-28 haven | `Crew.haven` per tick (package 05); planning haven per leg stays a compute output of `havenAlongRoute` (T05b.04, on `main`) | 05 | Accepted |

## 8. Scenario schema v2 (`schemas/scenario.schema.json`) — 01b

Add `mission_setup` (required; keys optional; ranges from 02 §E.3), `event_library` (required, ≥ 1 entry, `t_offset_s` ≥ 0), `task_library` (optional; `text` ≤ 60); make `plan` and `events` optional; `stop_tasks` requires `plan` (`dependentRequired`). A `$comment` says the cross-field rules (crew count, vehicle ParamSet, ids, sample times, 1–4 per POI, digit → `source_id`) belong to the loader (package 04).

## 9. Fixtures — 01b

- **Fake scenario** (`apps/hab-core/tests/fixtures/fake-scenario/`, generator `make_fake_scenario.py`): live shape with `mission_setup`, one `event_library` entry `storm` over the synthetic step series, a `task_library` for the fixture plan's POIs; a plan-less variant `scenario.planless.json`; a two-candidate site folder `two-candidate-site/` generated from the mock site's grid (second mast). Every synthetic value labelled in the README; regenerating twice gives identical bytes.
- **F7 WebSocket beats** (`apps/web/tests/fixtures/ws/`): SNAPSHOT in `LOADED` with no plan (with `hab_candidate_id`, `mission_setup`, `conditions`, `task_library`, `event_library`, `next_stop_target: null`); `SITE_SELECTED`; `MISSION_SETUP_SET`; presenter `JUMP_NEXT_STOP` → `CLOCK_JUMPED` (`arrival`, then `alert`); `EVENT_STARTED`; `SESSION_RESET` then a fresh SNAPSHOT with a new `session_id`; `COMMAND_RESULT` `FORBIDDEN_ROLE` (presenter sends `ABORT`) and `BUSY` (Next stop while latched); a crew STATE_DELTA with the six new crew fields; a utility-rover SNAPSHOT with a two-task `queue`. Values are typed placeholders or 02 §D.17 shapes; their sources are listed in the folder README.

## 10. Steps (tests first)

1. 01a: extend `packages/compute/tests/contracts.test.ts` (or a new `packages/protocol` type test run by hab-core Vitest) with compile-time checks of every new name; add `apps/hab-core/tests/permissions.test.ts` asserting the full 02 §E.4 matrix row by row from `PERMISSIONS` (red before the edit).
2. 01a: edit `runtime.ts`, `ws.ts`, `worker.ts`; add `report.ts`, `recording.ts`, `commandList.ts`; export from `index.ts`; add the reducer cases; move `ConditionsState`.
3. 01a: `apps/web/src/net/habClient.ts` already resets `events()` on a new `session_id`; add one test in `apps/web/tests/net/habClient.test.ts` that a SNAPSHOT with a new `session_id` also resets `last_seq` (this is the T32.15 client half; no other client edit).
4. 01b: schema v2, fixture generator, fixtures, fixture tests (`fixture.test.ts` validates both variants; `apps/web/tests/fixtures` test checks every new beat has its `LogEventData` keys).

## 11. Automated verification

- `make typecheck` and `make test-web` green (all workspaces).
- `npm --workspace @marswalk/hab-core test -- permissions fixture` and `npm --workspace @marswalk/web test -- fixtures habClient`.
- `python3 -m json.tool schemas/scenario.schema.json`; generator run twice → `git diff --exit-code` on the fixture folder.
- Existing replay hash unchanged: `npm --workspace @marswalk/hab-core test -- replay` (the fields are state, not events).

## 12. Status rows (in the same commit; then `make progress`)

```text
| T32.01 | done | <commit date> | Protocol v0.2 in [runtime.ts](../../packages/protocol/src/runtime.ts), [ws.ts](../../packages/protocol/src/ws.ts); decisions BD-90…BD-105 in [docs/plan/backend/decisions.md](../plan/backend/decisions.md); permissions.test.ts green |
| T32.03 | done | <commit date> | F7 live-session beats in [apps/web/tests/fixtures/ws/](../../apps/web/tests/fixtures/ws/) with sources in its README; fixture test green |
| T32.04 | done | <commit date> | [scenario.schema.json](../../schemas/scenario.schema.json) v2 (mission_setup, event_library, task_library; plan/events optional) |
| T32.05 | done | <commit date> | Fake scenario live shape, plan-less variant and two-candidate site in [fake-scenario/](../../apps/hab-core/tests/fixtures/fake-scenario/); byte-identical regeneration |
```

## 13. Done when

All of §11 is green on `merging-core`, the frontend orchestrator is told the contract merged, and `docs/AI_USE.md` has one row per run.
