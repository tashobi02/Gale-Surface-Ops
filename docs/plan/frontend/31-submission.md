# Package 31 — Name, README, credits, AI use, hosting, project page, score-sheet points

| | |
| --- | --- |
| **Subtasks** | T16.01, T16.02, T16.03, T16.04, T16.05, T16.06, T16.07, T30.01, T30.02, T30.03 |
| **Depends on packages** | 15, 27, 28 |
| **Needs from backend** | N-21 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-006, FD-007, FD-147, FD-159–FD-161, FD-170, FD-192, FD-195, FD-196 ([decisions](decisions.md)) |
| **Spec and mockup** | TASK-16, TASK-30; FD-006, FD-159–FD-161, FD-192, FD-195, FD-196 |

## Files

- `docs/decisions/ADR-013-product-name.md (new)`
- `README.md`
- `docs/AI_USE.md`
- `docs/ops/hosting.md`
- `docs/ops/submission-checklist.md`
- `docs/ops/project-page.md (new)`
- `docs/ops/submit-now.md (new)`
- `CLAUDE.md, AGENTS.md, docs/README.md, docs/specs/01 header, apps/web/index.html, apps/web/src/boot/app.ts (name only)`
- `docs/specs/02 (U-02/U-03/U-04 labels), docs/specs/04 (U-09)`
- `docs/tasks/status.md`

## Steps

1. Re-run the name search; write ADR-013; rename the working title (FD-159).
2. T16.02 sync labels (FD-196).
3. README: run instructions, credits, licence, challenge named; `credits` check green.
4. AI_USE sweep, append-only (FD-161); hosting per FD-160; project page text; submit-now.md lists the external acts (FD-192).

## Named tests (write first)

- Harness `credits`; a grep test that the working title remains only in history files

## Automated check replacing manual acceptance

`credits` replaces T16.05 manual check.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T16.01–T16.05, T16.07, T30.02 add/→ `done`
- T16.06, T30.01, T30.03 `wip` → `done` only after submit-now.md is filled (FD-192)

## Done criteria

- submit-now.md exists and every artefact it names exists
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
