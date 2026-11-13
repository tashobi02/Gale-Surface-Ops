# Package 24 — SCR-20 mission setup

| | |
| --- | --- |
| **Subtasks** | T32.21, T32.22 |
| **Depends on packages** | 19, 22 |
| **Needs from backend** | N-18, N-22 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-220 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-20; 01 FR-53; 05 HabCandidate; 04 §E.10; FD-220 |

## Files

- `apps/web/tests/ui/setup.test.ts (new)`
- `apps/web/src/ui/screens/scr20MissionSetup.tsx (new)`
- `apps/web/src/ui/screens/scr20MissionSetup.css (new)`
- `apps/web/src/ui/setup/commPreview.ts (new)`
- `apps/web/tests/ui/commPreview.test.ts (new)`
- `docs/tasks/TASK-32…, status.md, README.md`

## Steps

1. Tests first: the five T32.21 steps.
2. Cards from `hab_candidates` (single default when none); commPreview draws the u8 grid to a small canvas (no computation beyond display), provenance from the candidate; settings via SET_MISSION_SETUP; locked after publish.

## Named tests (write first)

- `setup.test.ts`: one test per T32.21 step
- `commPreview.test.ts`: `renders grid without resampling science`

## Automated check replacing manual acceptance

Enable `axe`, `brand-orange` on `#/setup`.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T32.21, T32.22 add `done`

## Done criteria

- Selecting the other candidate sends SELECT_HAB_SITE and shows Computing
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
