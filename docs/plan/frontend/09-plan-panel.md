# Package 09 — SCR-04 plan panel, inputs form, stops list, haven rule

| | |
| --- | --- |
| **Subtasks** | T08.04, T08.05, T08.12 |
| **Depends on packages** | 05, 07 |
| **Needs from backend** | N-05 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-042, FD-113–FD-115 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-04, §C.3, §D; 02 §E.3; 04 Appendix A §D; prototype `#scr-04-empty`, `#scr-04-editing`, `#scr-04-invalid-input`, `#scr-04-computing` |

## Files

- `apps/web/src/ui/screens/scr04PlanPanel.tsx`
- `apps/web/src/ui/screens/scr04PlanPanel.css (new)`
- `apps/web/src/ui/plan/stopsList.ts`
- `apps/web/src/ui/components/Notice.tsx (new)`
- `apps/web/tests/ui/planPanel.test.ts (new)`
- `apps/web/tests/ui/stopsList.test.ts (new)`
- `docs/tasks/TASK-08…, status.md, README.md`

## Steps

1. Inputs of 03 SCR-04 incl. v2 haven rule, crew count, vehicle inputs; start in UTC with LTST preview (FD-113); start default from `GET /api/session` (FD-042), else required.
2. Edited values `assumed`, source `user:scenario.<field>` (FD-114); 'Defaults are assumptions' badge; Reset defaults; invalid value keeps last valid and never recomputes.
3. Stops list: number, name/POI, coordinates, arrival LTST, ↑/↓, delete, Undo; Notice component for 03 §D notices (FD-115).

## Named tests (write first)

- `planPanel.test.ts`: one test per 02 §E.3 rule, `invalid keeps last valid`, `debounce 300 ms`, `start empty without hab core`, `haven rule input`
- `stopsList.test.ts`: `reorder recomputes immediately`, `undo restores`

## Automated check replacing manual acceptance

Enable `targets` (planner coarse pointer) and `axe` on the panel states.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T08.04, T08.05, T08.12 add `done`

## Done criteria

- SCR-04 states all render; checks green
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
