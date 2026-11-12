# Package 36 — SCR-16 Earth view

| | |
| --- | --- |
| **Subtasks** | T18.12 |
| **Depends on packages** | 20 |
| **Needs from backend** | N-23 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-194 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-16; FR-43, FR-48; prototype `#scr-16-link-available`, `#scr-16-waiting-for-relay-pass`, `#scr-16-conjunction-blackout` |

## Files

- `apps/web/src/ui/screens/scr16EarthView.tsx`
- `apps/web/src/ui/screens/scr16EarthView.css (new)`
- `apps/web/src/ui/router.ts (earth role)`
- `apps/web/tests/ui/earthView.test.ts (new)`
- `docs/tasks/TASK-18…, status.md, README.md`

## Steps

1. Delayed summary with 'as of HH:MM (X min ago)' from sim time, composer sending SEND_MESSAGE, queue with delivery estimates from the Hab Core.

## Named tests (write first)

- `earthView.test.ts`: three states, `as-of stamp from sim time`

## Automated check replacing manual acceptance

Enable `offline`, `axe`, `brand-orange` on `#/earth`.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T18.12 add `done`

## Done criteria

- No RouteBoundary placeholder on `#/earth`
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
