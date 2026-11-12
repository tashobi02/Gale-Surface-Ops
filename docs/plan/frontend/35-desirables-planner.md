# Package 35 — Coach marks, light theme, plan persistence, REMS and O₂ displays

| | |
| --- | --- |
| **Subtasks** | T13.07, T13.08, T18.03, T18.06, T18.07 |
| **Depends on packages** | 07, 11, 12, 14 |
| **Needs from backend** | N-24 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-002, FD-061, FD-149, FD-194 ([decisions](decisions.md)) |
| **Spec and mockup** | TASK-18; 04 §C.1 PRINT; FD-002, FD-061, FD-194 |

## Files

- `apps/web/src/ui/coachMarks.ts (new)`
- `apps/web/src/ui/screens/scr02MapWorkspace.tsx/.css`
- `apps/web/src/ui/styles/light.css`
- `apps/web/src/ui/styles/tokens.css (append)`
- `apps/web/src/state/persist.ts (new)`
- `apps/web/src/state/planStore.ts (load hook)`
- `apps/web/src/ui/screens/scr07Conditions.tsx`
- `apps/web/src/ui/screens/scr05RouteResults.tsx, scr08BriefingCard.tsx`
- `apps/web/tests/ui/desirables.test.ts (new)`
- `docs/tasks/TASK-13…, TASK-18…, status.md, README.md`

## Steps

1. Light theme opt-in `?theme=light` (FD-002); harness `contrast` in light.
2. Coach marks dismissible, keyboard reachable.
3. persist: last PlanExport in localStorage wrapped in try/catch.
4. T18.03/T18.06 only when N-24 exists; O₂ labelled 'illustrative'.

## Named tests (write first)

- `desirables.test.ts`: `light theme only by param`, `persist restore`, `coach marks dismiss`

## Automated check replacing manual acceptance

Harness `contrast` and `axe` with `?theme=light`.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T13.07, T13.08, T18.07 add `done`
- T18.03, T18.06 add `done` (or `wip` naming N-24)

## Done criteria

- No change to the default dark theme
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
