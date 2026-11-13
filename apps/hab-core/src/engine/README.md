# Hab Core engine

| | |
| --- | --- |
| **Owner** | T22.01 (contract C14); each module's owner is listed below |
| **Date** | 2026-11-06 |
| **Status** | Interfaces frozen with protocol v0 (M1, 7 Nov). All modules are throwing stubs until their owner subtask lands |
| **Related** | [02 §A.6](../../../../docs/specs/02_Technical_Requirements_Document.md#a6-state-model-commands--events--state) · [02 §D.14](../../../../docs/specs/02_Technical_Requirements_Document.md#d14-simulation-engine-fr-34-fr-35) · [05 §C.2](../../../../docs/specs/05_Backend_and_Database_Schema.md#c2-runtime-entities-hab-core-v2) · [TASK-22](../../../../docs/tasks/TASK-22_simulation-engine.md) |

## The one rule

Nothing under `src/engine/` reads wall-clock time: no `Date.now()`, no `new Date()` without an argument, no timers (NFR-06). Time is `state.session.clock.sim_time`. The server (`src/server.ts`) turns real elapsed time into a number of fixed 1-s sim steps and calls `SessionHandle.advance`. Randomness, if ever enabled, uses the seeded PRNG from the scenario (02 §A.6); none is used by default.

## State model

State is a fold of the event log over the scenario's initial state (02 §A.6):

- `reducer.ts`: `EngineState`, `initialState(scenario, session_id)`, `reduce(state, event)`. Shared types `PendingEvent` (a LogEvent before its `seq`), `StateChange` (one STATE_DELTA entry) and `CommandOutcome`.
- Commands are never logged; the events they produce are (05 Command). A command handler returns `CommandOutcome` = `{result, events}` and never changes state directly.
- Per-tick positions are STATE_DELTAs, not LogEvents; replay and resume re-derive them by re-running ticks (05 LogEvent), so resuming is snapshot + re-run ticks + tail events, never "reduce the tail" alone.
- **State rule for modules:** a module changes only never-logged state (positions, O₂, dose, haven, links, conditions, Earth status, paths and ETAs) directly; anything a LogEvent describes (alerts, options, tasks, plan, activity changes) changes only by returning the event. `tick.ts` reduces each module's events, with seqs from `ctx.next_seq`, before the next module runs, so later modules see them. The state `tick()` returns already includes its events: the session appends them (the log must assign the same seqs) and does not reduce them again. Command events are the opposite: the session appends and then reduces them.

## Tick and module map

`tick(state, scenario, dt_s, next_seq)` (T22.09; rules S1–S11 in [TASK-22](../../../../docs/tasks/TASK-22_simulation-engine.md), proposed 2026-11-07) works in this order:

1. **Per crew member, in `state.crew` order:** event dose (`integrateDose`), then O₂ (`stepO2`), then `eva_elapsed_s`, then motion along the plan's legs. Dose and O₂ use the activity at the start of the step, over `[sim_time − dt_s, sim_time)` because the clock has already advanced. Motion (constant speed per leg, dwell at stops, start offset, re-anchoring after `PLAN_REVISED`) keeps its progress in `EngineState.motion`, which is engine-only (saved in snapshots, never sent to clients).
2. **Motion events** (`ARRIVED_STOP`, `LEFT_STOP`, `CREW_SHELTERED` hab at the end of a loop) are reduced with seqs from `next_seq`.
3. **Then each `EngineModule`** (`(state, ctx) → {state, events, deltas}`) in `MODULE_ORDER`, with `ctx.next_seq` the next free seq. Its events are reduced before the next module runs. A module whose body is still a `TODO(TASK-nn): Tnn.nn not implemented` stub is skipped (per call, nothing cached); any other error propagates. Stub modules are skipped silently (TODO: a one-time warning once the session has a logger).
4. **EVA end:** after the modules, on the first tick where the session is `RUNNING` and every crew member is `IN_HAB` or `SHELTERED`, tick logs one system `EVA_ENDED {crew_ids}` (03 §E.6).
5. **Deltas:** tick's own crew STATE_DELTAs (`crew/<id>/x_m`, `y_m`, `o2_frac`, `eva_elapsed_s`, `dose_event_ugy`, `dose_event_unsheltered_ugy`, only when the value changed), then each module's. The returned state contains every event: `session.last_seq = next_seq + events.length − 1`.

The modules, in `MODULE_ORDER`:

| # | Module function | Concern | Owner |
| --- | --- | --- | --- |
| 1 | `vehicles.vehiclesTick` | Pressurized rover motion, arrival, sheltering | T23.05 |
| 2 | `rovers.roversTick` | Utility rover motion, battery, relay node | T29.03 |
| 3 | `conditions.conditionsTick` | FR-36 conditions feed | T22.16 |
| 4 | `earth.earthTick` | Earth message delivery and forecasts | T26.04 |
| 5 | `tasks.tasksTick` | Simulated crew completes tasks at dwell end | T31.04 |
| 6 | `alerts.radiationTick` | `RADIATION_ALERT` | T22.10 |
| 7 | `alerts.consumablesTick` | `CONSUMABLES_LOW` | T22.10 |
| 8 | `haven.havenTick` | Haven per crew, `HAVEN_TIME_EXCEEDED` | T23.03 |
| 9 | `links.linksTick` | Link graph, `LINK_LOST`/`LINK_RESTORED`, `COMM_SHADOW` | T26.01 (fallback T26.08) |
| 10 | `alerts.buddyTick` | `BUDDY_SEPARATION` | T22.10 |
| 11 | `contingencyOps.contingencyTick` | `OPTIONS_PROPOSED` on a new warning | T23.07 |

Rows 6–10 keep the fixed alert order of 02 §D.14: radiation → consumables → haven time → comm link → buddy distance. The order of rows 1–5 and 11 was proposed by T22.01 and is ratified (BD-70).

Command handlers in the modules: `vehicles.handleSummon`, `contingencyOps.handleApproveOption`, `contingencyOps.handleAbort`, `earth.handleSendMessage`, `tasks.handleUpdateStopTask`, `tasks.handleAddStopTask`. `src/commands.ts` (T23.02) checks roles and dispatches to them; `TASK_ROVER` goes to `src/rover.ts` (T29.01–T29.02). `tasks.ts` also provides `seedTasks` and `onPlanRevised`, which `src/session.ts` (T22.12) calls after `SESSION_LOADED` and after each `PLAN_REVISED`, and the reducer case `reduceTaskEvent`, which `reduce` (T22.06) calls. `vehiclesTick` moves only the pressurized rover and `roversTick` only the utility rover.

## Outside `src/engine/`

| File | API | Owner |
| --- | --- | --- |
| `src/scenario.ts` | `readScenario(dir, site)` → `LoadedScenario`; `ScenarioCheckError` | T22.11 |
| `src/log.ts` | `openLog`, `resumeLog`, `EventLog` (`append`, `after`, `lastSeq`, `hash`, `snapshot`), `canonicalJson` | T22.07 |
| `src/session.ts` | `loadSession`, `resumeSession`, `SessionHandle` (`snapshot`, `apply`, `advance`, `eventsAfter`) | T22.12 |

Changing any signature here after the freeze is a `contract-change:` subtask in TASK-22.
