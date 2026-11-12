# Package 12 — SCR-06 POI detail and SCR-07 conditions

| | |
| --- | --- |
| **Subtasks** | T10.01, T10.02, T10.04 |
| **Depends on packages** | 08, 11 |
| **Needs from backend** | N-15 (soft) (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-014, FD-015, FD-126–FD-132 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-06, SCR-07; 04 §E.10 specimen card, §C.5 imagery; FR-04, FR-11–FR-13, FR-45; prototype `#scr-06-image-shown`, `#scr-06-image-missing`, `#scr-07-daylight-warning` |

## Files

- `apps/web/src/ui/screens/scr06PoiDetail.tsx`
- `apps/web/src/ui/screens/scr06PoiDetail.css (new)`
- `apps/web/src/ui/screens/scr07Conditions.tsx`
- `apps/web/src/ui/screens/scr07Conditions.css (new)`
- `apps/web/tests/ui/poiDetail.test.ts (new)`
- `apps/web/tests/ui/conditions.test.ts (new)`
- `docs/tasks/TASK-10…, status.md, README.md`

## Steps

1. SCR-06: specimen card with EZ code (global order, FD-014), stop type + evidence (T10.04), image credit/sol/date/camera (FD-131, FD-132), Add as stop / Remove stop, suggested tasks shown when the library exists (package 25 wires them).
2. SCR-07: MY, L_s, sol only when present (FD-126), LTST start and 'at return' (FD-127), sunrise/sunset, sun elevation per stop, radiation with the 02 §D.4 label (FD-128), Mars24 `modelled` (FD-130), seasonal weather 'not included in this build' until T18.03.

## Named tests (write first)

- `poiDetail.test.ts`: `image missing state stays usable`, `credit and sol labelled`, `stop type shape and word`
- `conditions.test.ts`: `daylight warning for pre-dawn`, `fields absent show dash`, `radiation label text`

## Automated check replacing manual acceptance

Enable `poi-conditions` (needs N-26 for the real DARKNESS warning).

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T10.01, T10.02, T10.04 add `done`

## Done criteria

- Checks green on F4; real-data case in package 28
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
