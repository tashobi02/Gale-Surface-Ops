# Package 13 — Plan hash, PlanExport and PUBLISH_PLAN

| | |
| --- | --- |
| **Subtasks** | T11.01, T11.02, T11.07 |
| **Depends on packages** | 05 |
| **Needs from backend** | N-05, N-08 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-004, FD-134, FD-140–FD-142 ([decisions](decisions.md)) |
| **Spec and mockup** | 05 §C PlanExport, §F.3; 02 §E.6 PUBLISH_PLAN; schemas/plan-export.schema.json; FR-14, FR-31 |

## Files

- `apps/web/tests/export/planExport.test.ts (new)`
- `apps/web/tests/export/planExport.reload.test.ts (new, FD-142)`
- `apps/web/tests/export/sha256.test.ts (new)`
- `apps/web/src/export/planExport.ts`
- `apps/web/src/export/sha256.ts (new)`
- `apps/web/src/export/jcs.ts (new)`
- `apps/web/src/ui/briefing/publishPlan.ts (new)`
- `apps/web/tests/ui/publishPlan.test.ts (new)`
- `docs/tasks/TASK-11…, status.md, README.md`

## Steps

1. Tests first: JCS canonical JSON (FD-134), SHA-256 NIST vectors (FD-141), schema-valid export (ajv), reproducible hash, versions (FD-140), profile arrays stored (FD-004).
2. publishPlan.ts opens a `planner` connection only on publish, sends `PUBLISH_PLAN {plan, stop_tasks}` (N-08), shows pending/accepted/rejected with reason.

## Named tests (write first)

- `planExport.test.ts`: `canonical numbers`, `schema valid`, `same plan same hash`
- `sha256.test.ts`: `NIST vectors`
- `planExport.reload.test.ts`: `reload reproduces metrics`
- `publishPlan.test.ts`: `rejected shows reason`, `tasks beside plan`

## Automated check replacing manual acceptance

Enable `plan-hash`.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T11.01, T11.02, T11.07 add `done`

## Done criteria

- Export works on a non-secure origin
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
