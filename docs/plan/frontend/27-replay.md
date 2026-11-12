# Package 27 — Replay mode `#/replay` for the public link

| | |
| --- | --- |
| **Subtasks** | T27.05 |
| **Depends on packages** | 19, 26 |
| **Needs from backend** | N-21 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-160 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 §A replay; FR-34, FR-46; 02 §E.6 client store interface |

## Files

- `apps/web/src/net/replaySource.ts (new)`
- `apps/web/src/ui/live/ReplayRoute.tsx (new)`
- `apps/web/src/ui/App.tsx`
- `apps/web/tests/net/replaySource.test.ts (new)`
- `apps/web/public/replay/README.md (new; the recorded log is copied at build from backend's file, not committed twice)`
- `docs/tasks/TASK-27…, status.md, README.md`

## Steps

1. replaySource implements the HabClient read interface from a recorded log; ops view read-only with clock controls local to playback; verifies log_hash with protocol logHash (N-21).

## Named tests (write first)

- `replaySource.test.ts`: `plays to end`, `hash matches`, `no network`

## Automated check replacing manual acceptance

Enable `replay`.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T27.05 add `done`

## Done criteria

- `#/replay` works from a static folder
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
