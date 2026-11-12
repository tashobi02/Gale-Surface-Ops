# storm-sol4190 — stop task text (FR-50, T31.02)

| | |
| --- | --- |
| **Owner** | Sadman Shaharier Mahim (R6 task content) |
| **Date** | 2026-11-09; 2026-11-13 (approved, and re-keyed into `task_library`) |
| **Status** | Approved 13 Nov 2026 (BD-06): the agent draft stands as the task text; `scenario_build.py` copies it into `scenario.json` and re-keys it by POI id into `task_library` |
| **Related** | [TASK-31](../../docs/tasks/TASK-31_stop-task-list.md) · [05 StopTask](../../docs/specs/05_Backend_and_Database_Schema.md#stoptask-fr-50-added-2026-11-05) · [scenario README](README.md) |

`stop_tasks.json` is the one hand-authored file in this folder (the [scenario README](README.md) says every file here is a build output; this file is the exception, and T21.01 owns that README). It holds the `StopTaskSeed` rows (`task_id, stop_id, crew_id, kind, text`; [05 StopTask](../../docs/specs/05_Backend_and_Database_Schema.md#stoptask-fr-50-added-2026-11-05), `StopTaskSeed` in [scenario.schema.json](../../schemas/scenario.schema.json)); T21.08 copies it into `scenario.json` as `stop_tasks`, beside `plan` so `plan_hash` is unchanged (U-48). State, origin and provenance are set by the Hab Core.

| Id | Record | Status |
| --- | --- | --- |
| U-58 | **Who writes the text, and where.** The product & systems lead (Sadman Shaharier Mahim, R6 task content) writes and approves it, in this file. An agent drafted the first version from each POI's `science_objective` and checks only lengths, ids and counts (`apps/hab-core/tests/stopTaskText.test.ts`); no agent computes or invents numbers. Ops may add tasks at run time (`ADD_STOP_TASK`, `origin: ops`); those are never written back to this file. Limit and audit of ops additions stay with T31.03 and T31.06 | **Decided** 13 Nov 2026 (decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 13 Nov 2026; BD-06): the draft is approved, and the automated checks (`stopTaskText.test.ts`, `pipeline/tests/test_scenario_build.py`) replace the second-person read |
| U-52 | **Per-crew task model.** A task belongs to `EV1`, `EV2`, or either (`crew_id: null`) ([05 StopTask](../../docs/specs/05_Backend_and_Database_Schema.md#stoptask-fr-50-added-2026-11-05)). EV1 is the crew member a person drives; EV2 is simulated and completes its open tasks at the end of each dwell ([01 FR-50](../../docs/specs/01_Product_Requirements_Document.md#fr-50--stop-task-list-on-the-eva-tablet-synced-to-ops-t1-m)), so a dwell cut short by the storm leaves EV2's tasks open and a plan revision then drops them. The 1–4 limit counts tasks per stop, as FR-50 and the schema say, not per crew member. An either-task is completed by the simulated crew member (EV2 here) at dwell end, like its own tasks; a task assigned to EV1 is never auto-completed (BD-109, BD-73) | **Decided** 12 Nov 2026 by the orchestrator (Claude) under Sadman Shaharier Mahim's authority (BD-109); follows 01 FR-50 and 05 |

**Stop ids.** `stop_id` is the stop Waypoint id (U-61), not the POI id. `plan.json` (T21.12, written by `build-demo-plan.ts`) numbers its waypoints `wp-<n>` in the order of [`apps/web/src/ui/demoPlan.json`](../../apps/web/src/ui/demoPlan.json) `stops`, with `wp-0` the start: `wp-1` = `poi-boxwork-ridge`, `wp-2` = `poi-sulfate-contact`, `wp-3` = `poi-monte-grande-hollow`. If the demo plan's stop order changes, renumber here; the loader (`checkStopTasks`) rejects an id that is not a stop Waypoint of `plan`, and `stopTaskText.test.ts` compares the file to the demo plan's stops.

**Source of each stop's text.** Every task is written from the POI's `science_objective` in [`pipeline/sites/gale_boxwork/pois/`](../../pipeline/sites/gale_boxwork/pois/); its source ids are the POI's `evidence` entries (the Hab Core labels the text `assumed`, team-authored). The tasks are crew actions (photograph, note, brush, analyse, drill), not rover instrument runs. No task text contains a number, so none needs a citation.

| Stop | POI | Basis in the POI record |
| --- | --- | --- |
| `wp-1` | `poi-boxwork-ridge` | Compare smooth ridge-top bedrock with the more nodular bedrock at the ridge/hollow edge (`nasa-msl-blog-sols-4649-4654`) |
| `wp-2` | `poi-sulfate-contact` | Brush, image and analyse bedrock across the boxwork and sulfate contact (`nasa-msl-blog-sols-4845-4851`). `t-s2-04` is the "analyse" step (in situ, as in the source). The POI's resource framing is assumed |
| `wp-3` | `poi-monte-grande-hollow` | Drill the hollow bedrock for comparison with the adjacent ridge (`nasa-msl-blog-sols-4695-4701`, `nasa-msl-blog-sols-4675-4681`) |

`t-s2-04` (analyse the bedrock just across the contact) follows the source, which analysed the sulfate bedrock "just across the contact" in situ; no sample is collected. The POI's hydrated-sulfate resource framing is itself assumed (no NASA yield figure).

`pipeline/tests/test_scenario_build.py` checks that every `stop_id` is a stop Waypoint of the built plan, that each stop has one to four tasks, and that each task reaches `task_library` under the POI of its stop (T31.02).
