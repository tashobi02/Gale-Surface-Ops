# Package 15 — SCR-01 mission briefing, demo plan, SCR-09 sources and methods content

| | |
| --- | --- |
| **Subtasks** | T07.05, T07.14, T12.03, T12.04 |
| **Depends on packages** | 05, 06 |
| **Needs from backend** | — (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-041–FD-043, FD-109, FD-128, FD-136, FD-143–FD-148 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-01, SCR-09; 04 §E.1, §E.9; 01 §F.1; prototype `#scr-01-ready`, `#scr-09-default`, `src/js/h_misc.js` |

## Files

- `apps/web/src/ui/screens/scr01MissionBriefing.tsx`
- `apps/web/src/ui/screens/scr01MissionBriefing.css (new)`
- `apps/web/src/ui/content/briefing.json (new)`
- `apps/web/src/ui/demoPlan.json`
- `apps/web/src/ui/screens/scr09SourcesMethods.tsx`
- `apps/web/src/ui/screens/scr09SourcesMethods.css (new)`
- `apps/web/src/ui/content/methods.json`
- `apps/web/src/ui/content/provenanceMap.json (new, FD-136)`
- `apps/web/tests/ui/missionBriefing.test.ts (new)`
- `apps/web/tests/ui/sourcesMethods.test.ts (new)`
- `apps/web/tests/ui/methods.test.ts (new)`
- `docs/tasks/TASK-07…, TASK-12…, status.md, README.md`

## Steps

1. SCR-01 BRIEF: site name, coarsest ortho tile as thumbnail, objective and 'what this tool does' from briefing.json (no numbers, FD-109), data badges from manifest sources, disclaimer; Start planning, Open demo plan, Run demo (→ SCR-10), Sources.
2. demoPlan.json: remove TODO markers (FD-041, FD-042, FD-043).
3. SCR-09: datasets table (fields `measured`, FD-143), processing steps, models with equations and labels, limitations, AI statement (FD-147), ParamSets and replay sources, diagnostics; anchors FD-144; paper placeholders FD-146.
4. methods.test.ts replaces the T12.04 manual checklist (FD-148); radiation label FD-128.

## Named tests (write first)

- `missionBriefing.test.ts`: `open demo plan loads three stops`, `badges from manifest`
- `sourcesMethods.test.ts`: `anchor scrolls to layer`, `every manifest source listed`
- `methods.test.ts`: `every entry cites an existing 02/03 heading`, `every source id resolves`

## Automated check replacing manual acceptance

Enable `offline`, `axe`, `viewport360` on `#/` and `#/sources`; `credits` SCR-09 half.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T07.05, T12.03 add `done`
- T07.14, T12.04 wip → done

## Done criteria

- No not-built placeholders on BRIEF routes
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
