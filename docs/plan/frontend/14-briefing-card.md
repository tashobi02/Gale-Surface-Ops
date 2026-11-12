# Package 14 — SCR-08 briefing card, map snapshot, stop tasks

| | |
| --- | --- |
| **Subtasks** | T11.03, T11.04, T11.08 |
| **Depends on packages** | 11, 13 |
| **Needs from backend** | — (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-133, FD-135, FD-138, FD-139, FD-204 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-08; 04 §E.8, Appendix A §F SCR-08; mockup DV-16/G-45; prototype `#scr-08-ok`, `#scr-08-over-limits`, `#scr-08-partial`, `src/js/h_misc.js` |

## Files

- `apps/web/src/ui/screens/scr08BriefingCard.tsx`
- `apps/web/src/ui/screens/scr08BriefingCard.css (new)`
- `apps/web/src/ui/briefing/mapSnapshot.ts`
- `apps/web/tests/ui/briefingCard.test.ts (new)`
- `apps/web/tests/ui/mapSnapshot.test.ts (new)`
- `docs/tasks/TASK-11…, status.md, README.md`

## Steps

1. Header: site, plan name (FD-133), data version, plan hash, generated time = computed_utc (FD-138); snapshot 235 px, profile 56 px (FD-204); stops table with tasks (T11.08) and notes (FD-138); metrics, warnings, conditions, assumptions, sources, full 01 §F.1 disclaimer (FD-135).
2. Partial banner 'Plan incomplete — not valid for use', totals omitted; Over limits lists limits; no plan → empty banner + Back (FD-139).
3. Actions: Print, Export plan JSON, Publish to Hab Core, Back.
4. mapSnapshot: render the map canvas to PNG data URL at print size.

## Named tests (write first)

- `briefingCard.test.ts`: `partial omits totals`, `over limits lists limits`, `tasks per stop`, `no plan shows empty banner`

## Automated check replacing manual acceptance

Enable `print` for SCR-08 (1 page A4 and Letter, three states).

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T11.03, T11.04, T11.08 add `done`

## Done criteria

- `print` SCR-08 green
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
