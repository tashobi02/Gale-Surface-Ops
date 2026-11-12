# Package 05 — Plan store, metric component and number formats

| | |
| --- | --- |
| **Subtasks** | T08.02, T08.03, T12.01 |
| **Depends on packages** | 03 |
| **Needs from backend** | — (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-058, FD-090, FD-106, FD-124 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 §C.3, §E.3, §E.4; 02 §E.2, §E.3; 04 §C.2 examples; C11 header in planStore.ts |

## Files

- `apps/web/tests/state/planStore.test.ts (new)`
- `apps/web/src/state/planStore.ts`
- apps/web/src/ui/components/metric.ts → keep path; add `Metric.tsx` only if C10 allows (else keep .ts exporting a React component)
- `apps/web/src/ui/components/format.ts (new)`
- `apps/web/tests/ui/metric.test.ts (new)`
- `apps/web/tests/ui/format.test.ts (new)`
- `apps/web/src/ui/screens/scr05RouteResults.tsx (switch tiles to Metric, FD-058)`
- `docs/tasks/TASK-08_plan-panel-and-waypoints.md, TASK-12_sources-methods-provenance.md`
- `docs/tasks/status.md, README.md`

## Steps

1. Write planStore.test.ts first (T08.02): revisions bump on route edits only, 300 ms debounce on scenario edits, stale results dropped by revision, single-level undo restores waypoints and their tasks, stop tasks 1–4 per stop and ≤ 60 chars, tasks never bump revision, retry after Error, status machine of 03 §E.4.
2. Implement createPlanStore against the C11 contract unchanged (FD-090 freezes the hover shape); dispatch through the existing workerClient.
3. format.ts: the FD-124 precision table; `—` for non-finite.
4. Metric component: value + unit + provenance chip (full or glyph mode) from `Sourced`; always writes `data-provenance` and `data-source`.
5. Move SCR-05 tiles to Metric.

## Named tests (write first)

- `planStore.test.ts`: one named test per step-1 rule
- `format.test.ts`: `km two decimals`, `mGy one decimal`, `non-finite is dash`
- `metric.test.ts`: `metric always carries provenance and source`, `unavailable renders dash with unavailable source`

## Automated check replacing manual acceptance

Unit level only (no harness check); `results-states` later uses it.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T08.02 add `done`
- T08.03 add `done`
- T12.01 add `done`

## Done criteria

- createPlanStore no longer throws; PlannerHost builds an AppContext
- `make test-web typecheck` green
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
