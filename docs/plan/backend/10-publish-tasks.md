# 10 — `PUBLISH_PLAN` with `stop_tasks`; task library in the SNAPSHOT

| | |
| --- | --- |
| **Subtasks** | T32.24, T32.25 |
| **Depends on** | 09 (last of the `commands.ts` / `session.ts` chain) |
| **Branch** | `be/10-publish-tasks` |
| **Spec refs** | 01 FR-54, FR-50; 05 StopTask, TaskLibraryEntry; decisions BD-90, BD-91, BD-109 |

## Files

`apps/hab-core/tests/publishTasks.test.ts` (new) · `commands.ts` · `engine/tasks.ts` · `session.ts` (`Snapshot.task_library` from `LoadedScenario.taskLibrary`, `[]` if none) · `apps/hab-core/tests/stopTasks.test.ts` (enable the U-52 `it.todo` cases per BD-109)

## Steps (tests first)

1. `publishTasks.test.ts`: T32.24 steps 1–5 (transport = SNAPSHOT `task_library` for every role).
2. Validate `args.stop_tasks` against the published plan with the FR-50 rules; seed `TASK_ADDED` through the existing `seedTasks` path; `plan_hash` unchanged.
3. BD-109 in `tasks.ts`: either-tasks completed by the simulated crew member; turn the U-52 `it.todo`s into tests.

## Automated verification

`npm --workspace @marswalk/hab-core test -- publishTasks stopTasks commands` · `make typecheck`.

## Status rows

```text
| T32.24 | done | <commit date> | [publishTasks.test.ts](../../apps/hab-core/tests/publishTasks.test.ts) |
| T32.25 | done | <commit date> | PUBLISH_PLAN {plan, stop_tasks?} seeds TASK_ADDED; SNAPSHOT task_library (BD-90, BD-91) |
```

## Done when

Tasks published with a plan reach the task list of every client, and the library is in every SNAPSHOT.
