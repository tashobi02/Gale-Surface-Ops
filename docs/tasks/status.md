# Task status

| | |
| --- | --- |
| **Owner** | Whoever completes a subtask records it here, in the same commit as the work |
| **Date** | 2026-11-04 |
| **Status** | Live record; the progress bar in the [README](../../README.md#progress) is generated from it |
| **Related** | [Task index](README.md) · [Coordination map](_coordination.md) · `scripts/update_progress.py` |

One row per subtask that is finished (`done`) or started (`wip`). A subtask with no row is not started. Ids come from the register in [_coordination.md](_coordination.md#a3-register); the Evidence column links the file, ADR or commit that shows the acceptance criteria are met.

After editing this file run `make progress`. Do not edit the README progress block by hand.

| Subtask | State | Date | Evidence |
| --- | --- | --- | --- |
| T00.01 | done | 2026-11-04 | Rules page and Participants Guide checked by the team owner; see [rules.md](../ops/rules.md#sources-to-check). The verbatim passages are not copied into the repo |
| T00.02 | done | 2026-11-04 | Local Lead's reply quoted and registration confirmed in [rules.md](../ops/rules.md#answer) |
| T00.03 | done | 2026-11-04 | [rules.md](../ops/rules.md): answer, sources, registration and Track P recorded |
| T00.04 | done | 2026-11-04 | Phase-gate line in [CLAUDE.md](../../CLAUDE.md) and [AGENTS.md](../../AGENTS.md) |
| T00.06 | wip | 2026-11-04 | Roster in [team.md](../ops/team.md); venue (U-14) still `TODO(verify)` |
| T20.01 | wip | 2026-11-06 | FR-50 types added to `runtime.ts` and `ws.ts` (commit `28ff78e`); the field-by-field review against 05 §C.2 and the 7 Nov freeze are still to do ([TASK-20](TASK-20_hab-core-skeleton.md)) |
| T31.01 | done | 2026-11-06 | StopTask types, commands, events, permissions, `SNAPSHOT.tasks`, scenario `stop_tasks`, UI stubs and `it.todo` tests: commits `28ff78e`, `099dc17`, `d43d5b1`, `d39aa0f` ([TASK-31](TASK-31_stop-task-list.md)) |
