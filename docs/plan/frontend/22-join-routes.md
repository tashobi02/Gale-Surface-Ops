# Package 22 — SCR-10 join deep links and QR drawer; register #/presenter and #/setup

| | |
| --- | --- |
| **Subtasks** | T25.06, T32.23 |
| **Depends on packages** | 19 |
| **Needs from backend** | N-16, N-18, N-05 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-009, FD-177 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 §A, SCR-10; 04 §E.2; prototype `#scr-10-*` |

## Files

- `apps/web/src/ui/screens/scr10Join.tsx`
- `apps/web/src/ui/live/JoinRoute.tsx`
- `apps/web/src/ui/router.ts`
- `apps/web/src/ui/App.tsx`
- `apps/web/src/main.ts`
- `apps/web/src/ui/ops/QrDrawer.tsx (new)`
- `apps/web/tests/ui/router.test.ts`
- `apps/web/tests/ui/liveRoutes.test.ts`
- `apps/web/tests/ui/join.test.ts (new)`
- `docs/tasks/TASK-25…, TASK-32…, status.md, README.md`

## Steps

1. `#/join?role=` auto-selects the tile (FD-177); role availability from N-05; Presenter tile; no guest join (FD-009).
2. Router: presenter role `presenter` (N-18), setup role `ops`; App renders SCR-19/SCR-20 (from packages 23, 24 — this package registers with the not-built boundary until they merge, or merges after them; prefer after).
3. QrDrawer shared by SCR-11 and SCR-19.

## Named tests (write first)

- `join.test.ts`: `deep link selects role`, `presenter tile joins as presenter`
- `router.test.ts`: `setup and presenter roles`

## Automated check replacing manual acceptance

Enable `offline` and `axe` on `#/join`, `#/presenter`, `#/setup`.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T25.06 wip → done
- T32.23 add `done`

## Done criteria

- No NotBuilt for SCR-19/SCR-20
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
