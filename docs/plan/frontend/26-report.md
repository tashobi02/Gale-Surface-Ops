# Package 26 — SCR-17 post-EVA report

| | |
| --- | --- |
| **Subtasks** | T27.03 |
| **Depends on packages** | 19 |
| **Needs from backend** | N-10 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-053, FD-078, FD-087, FD-093, FD-167, FD-179, FD-180 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-17; 04 §E.8; 05 PostEvaReport; prototype `#scr-17-default` |

## Files

- `apps/web/src/ui/screens/scr17PostEvaReport.tsx`
- `apps/web/src/ui/report/reportAdapter.ts`
- `apps/web/src/ui/live/ReportRoute.tsx`
- `apps/web/tests/ui/postEvaReport.test.ts`
- `apps/web/tests/ui/reportRoute.test.ts`
- `docs/tasks/TASK-27…, status.md, README.md`

## Steps

1. Import the protocol report type (FD-087); trace from N-10 (FD-053); slabs per crew + max (FD-179); background dose '—' if null (FD-180); Export log JSON from /api/log; remove the two `it.todo` (FD-093).

## Named tests (write first)

- `postEvaReport.test.ts`: `trace from decimated positions`, `dose per crew`, `export downloads log`

## Automated check replacing manual acceptance

Enable `print` SCR-17 (≤ 2 pages A4/Letter, 12 mm).

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T27.03 wip → done

## Done criteria

- No `it.todo`, no TODO marker
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
