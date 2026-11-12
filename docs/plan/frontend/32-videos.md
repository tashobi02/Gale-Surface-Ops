# Package 32 — Demo scripts, storyboards, automated capture and edit

| | |
| --- | --- |
| **Subtasks** | T17.01, T17.02, T17.03, T17.04 |
| **Depends on packages** | 29, 31 |
| **Needs from backend** | N-20 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-043, FD-162–FD-165, FD-169, FD-213 ([decisions](decisions.md)) |
| **Spec and mockup** | 01 §E.1, §E.2; TASK-17; FD-043, FD-162–FD-165, FD-169, FD-213 |

## Files

- `docs/ops/demo-script.md`
- `docs/ops/storyboard.md (new)`
- `apps/web/e2e/checks/capture.spec.ts (new)`
- `scripts/make_video.sh (new: ffmpeg + say)`
- `docs/ops/verification-log.md (append)`
- `docs/tasks/status.md, README.md`

## Steps

1. Script: narration numbers read from the screen (FD-043), task tick at 1:05 (FD-213), relay beat if green (FD-169), product name (FD-163).
2. capture.spec.ts records each beat with recordVideo at 1440×900 and the EVA/HUD frames; make_video.sh composites, adds `say` narration and burned subtitles, writes MP4 + SRT to var/videos (FD-162, FD-164, FD-165).
3. Dry-run capture is the T17.04 fallback source.

## Named tests (write first)

- `capture.spec.ts`: `each beat reached within its window`

## Automated check replacing manual acceptance

`capture` replaces filming; duration checked by ffprobe (240 s ± 5, 30 s ± 2).

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T17.01 wip → done
- T17.04 add `done`
- T17.02, T17.03 → `done` after upload line in submit-now.md (FD-192)

## Done criteria

- Both MP4s exist with correct durations; no person in frame
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
