# 04 — Reshaped loader and plan-less session

| | |
| --- | --- |
| **Subtasks** | T32.06, T32.07, T32.08 |
| **Depends on** | 01a, 01b |
| **Branch** | `be/04-loader-plan-optional` |
| **Spec refs** | 05 Scenario, Session, §E.3; 02 §E.7, §D.17; TASK-32 T32.06–T32.08; decisions BD-78, BD-100, BD-101 |

## Files

`apps/hab-core/tests/scenarioLive.test.ts` (new) · `packages/protocol/src/runtime.ts`, `ws.ts` (`Scenario.plan?`, `Scenario.events?`, `Snapshot.plan`/`EngineState.plan` nullable, Session live fields required) · `apps/hab-core/src/scenario.ts` · `session.ts` · `replay.ts` · `engine/reducer.ts` · `engine/tick.ts` · `engine/vehicles.ts` · `engine/contingencyOps.ts`

## Steps (tests first)

1. Write `scenarioLive.test.ts` with one named case per rule of T32.06 steps 1–3 (loader rules, plan-less session lifecycle, reference scenario unchanged). Run: all new cases red.
2. T32.07: types optional/nullable; loader skips plan checks without a plan, `stop_tasks` still needs `plan`, `events` defaults to `[]`; `initialState` puts the crew at the chosen candidate's `default_start` (else the site's) and fills `hab_candidate_id`, `mission_setup` (scenario defaults) and `started_events: []`; `tick.ts` moves no crew without a plan; `vehicles.ts` and `contingencyOps.ts` read the plan from state and do nothing without one; `SESSION_LOADED.plan_hash: null`; `START_EVA` is `INVALID` until a plan is published; `replay.ts` exits with "scenario has no plan; pass --commands with a PUBLISH_PLAN" (exit code 2).
3. T32.08: `mission_setup`, `event_library`, `task_library` checks with named reasons (reuse the loader's reason style); the BD-101 digit rule; the BD-78 TI dimension rule citing `pipeline/src/marswalk_pipeline/grid.py`; `LoadedScenario.eventLibrary`, `.taskLibrary`; `loadCandidateComm(site, candidate_id)` reading one candidate's `comm_hab` grid (`grid-comm-hab` for rank 1, `grid-comm-<candidate_id>` otherwise, T03.37) and mast through the existing `loadSite` checks.
4. Make the Session live fields required (BD-100) and fix every constructor.

## Automated verification

- `npm --workspace @marswalk/hab-core test` (all, incl. `scenarioLive`, `scenario`, `replay`) and `make typecheck`.
- Reference hash unchanged: a test in `scenarioLive.test.ts` replays the fake scenario with plan and compares `log_hash` with the value printed by `main` before the change (captured in step 1 from a run on the base commit and pasted into the test with its provenance comment "hash of `main` at <sha>").
- NFR-06 scan: `grep -rn "Date.now\|new Date()" apps/hab-core/src/engine` returns nothing.

## Status rows

```text
| T32.06 | done | <commit date> | [scenarioLive.test.ts](../../apps/hab-core/tests/scenarioLive.test.ts): loader rules and plan-less session, one named case each |
| T32.07 | done | <commit date> | Optional plan/events end to end; reference log_hash unchanged (test pins it) |
| T32.08 | done | <commit date> | Loader checks for mission_setup, event_library, task_library; loadCandidateComm in [scenario.ts](../../apps/hab-core/src/scenario.ts) |
```

## Done when

All Hab Core tests pass, the reference hash is unchanged, and the plan-less session starts in `LOADED` with `plan: null`.
