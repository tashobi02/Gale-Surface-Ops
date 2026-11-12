# Package 16 — DOM provenance checks across planner and v2 role views

| | |
| --- | --- |
| **Subtasks** | T12.02, T12.07 |
| **Depends on packages** | 15, 18, 19 |
| **Needs from backend** | — (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-110, FD-217 ([decisions](decisions.md)) |
| **Spec and mockup** | 01 FR-15, NFR-05; FD-110 allowlist |

## Files

- `apps/web/tests/ui/provenance.test.ts`
- `apps/web/tests/ui/provenanceAllowlist.ts (new)`
- `docs/tasks/TASK-12…, status.md, README.md`

## Steps

1. Mount every planner screen and SCR-11–SCR-14, SCR-17 on fixtures; assert every digit-bearing element has `data-provenance` + `data-source` or is allowlisted; no text says 'live' (FD-217).

## Named tests (write first)

- `provenance.test.ts`: one `it.each` per screen × state, `no live wording`

## Automated check replacing manual acceptance

Harness `provenance` stays the browser-level twin (package 28/29).

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T12.02, T12.07 add `done`

## Done criteria

- Green on all screens
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
