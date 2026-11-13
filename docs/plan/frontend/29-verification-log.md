# Package 29 live verification — 13 Nov 2026

Branch: `fe-live2`. Scope: T24.11, T25.08, T27.06, T31.08; FD-190, FD-197, FD-520, FD-521.

This lane-local record obeys the explicit writable-file boundary. The orchestrator can append the final browser outcomes to
`docs/ops/verification-log.md` after running the commands below. No browser pass or measured latency is claimed here.

## Tests first and review

The first targeted Vitest run had **7 failures**: five evidence-helper assertions against the throwing scaffold, and two
regressions proving that SCR-12 opened the following stop's tasks instead of the current stop's tasks (including the final
stop). The helper's invalid-input assertion passed against the scaffold; removing its implemented validation produced one
failure. The actual committed recording tests passed at once; disabling hash comparison and disabling advancement each
produced one failure. All mutations were restored. The focused tablet/evidence suites then passed (57 tests, one existing
todo); the recording and replay-route suites passed (13 tests).

Independent read-only review caught three issues before commit: SCR-11 cannot start a storm, ABORT requires an actual active
option and drops only its named future stops, and an idle rover's first accepted task is immediately EN ROUTE. The check
bodies now follow those contracts. The reviewer also identified the missing Galaxy Tab S4 device coverage; both installed
Playwright descriptor orientations were added.

B-01 is addressed by unmounting every replay-route test tree before restoring timers/removing the DOM. B-03 is covered by the
already-active `link-lost` check. The B-04/B-05 planner fixes belong to the parallel stream and are outside this batch.

Final checks: `npm --workspace @marswalk/web test` passed **1,792 tests**, with four existing todos (100 passing files,
one skipped file). `make -s typecheck lint docs-check` passed; Markdown lint reported no issues and all 4,372 relative links
resolved. `python3 scripts/update_progress.py` regenerated the README progress block in this package.

## What the checks prove

| Check | Automated evidence | Outcome in this sandbox |
| --- | --- | --- |
| `ops-no-terminal` | Active LOAD, START EVA, 60×, event stepping, natural ENDED → populated SCR-17 on the real F4 Hab Core; active approval/rover UI fixtures; live utility-rover dispatch skips on F4 with `bundle absent (...)` | Browser blocked. Complete storm/acknowledge/approve mission stays `test.fixme('needs N-200')`: START_EVENT is presenter-only and absent from SCR-11 |
| `task-latency` | Real task at the current stop; 20 tablet DONE/UNDO changes with paused sim time, browser click-to-ops-DOM timestamps, p95 and maximum ≤ 500 ms; presenter-started storm; real ABORT option; both clients receive exactly its dropped tasks; retained tasks unchanged; independent full-log totals/per-stop counts equal the live API and SCR-17 | Browser blocked; no latency measurement claimed |
| `replay` | `scenarios/storm-sol4190/recording.json` exists on merging-core; contiguous complete event log, independent Node SHA-256, browser playback to ENDED with API/socket access refused, identical computed/recorded hash, whole event log and final message position | Recording/replay unit checks pass; browser blocked. N-81 is satisfied in this checkout |
| `print` | Existing populated SCR-17 cases (3/5/6 stops and 1/2/3 alerts), A4 and Letter, CSS 12 mm margin, at most two pages | Already active; browser blocked here |
| `targets` | Existing EVA/HUD/ops dimensions and gaps; SUMMON/ABORT one hold, TASK ROVER RETURN two taps plus confirm with exactly one command | Already active plus action-path assertions; browser blocked |
| `hud-glance` | Existing nominal/caution/warning/no-link states, labelled values, 56 px, top 60%, 7:1, no controls | Already active; browser blocked |
| `link-lost` | Existing simultaneous EVA/ops SCR-18 deadline, cached telemetry, retries, resumed server values; ops companion explicitly uses a desktop viewport | Already active, now on the live device projects; browser blocked |

Live device checks (`targets`, `task-latency`, `link-lost`) run on iPhone 14 landscape/portrait, Pixel 7, iPad Mini
landscape/portrait and Galaxy Tab S4 landscape/portrait, as well as their existing desktop registrations. HUD glance retains
its HUD project. These are Chromium emulations (FD-197), not real-device claims. `--list` discovers 189 tests across the seven
files without starting a browser. Existing unrelated `targets` fixmes for N-29 and Earth N-130/N-31 remain unchanged.

## Orchestrator commands

Run in the foreground with a timeout and let the harness stop its own servers:

```sh
timeout 240s make e2e-one CHECK=ops-no-terminal
timeout 240s make e2e-one CHECK=task-latency
timeout 240s make e2e-one CHECK=replay
timeout 240s make e2e-one CHECK=print
timeout 240s make e2e-one CHECK=targets
timeout 240s make e2e-one CHECK=hud-glance
timeout 240s make e2e-one CHECK=link-lost
```

Each command above was attempted here with `timeout 60s`. Each failed in `globalSetup.ts` before any browser assertion:
`Error: listen EPERM: operation not permitted /tmp/tsx-1000/<pid>.pipe` (`tsx` IPC server, syscall `listen`, errno `-1`).
The first was `/tmp/tsx-1000/336.pipe`; the six following attempts had the same error. No escalation, harness bypass,
disabled assertion or leftover server was used. `git fetch && git merge origin/merging-core` initially hit read-only Git
metadata; the authorized elevated retry completed with “Already up to date.” No push or lane publication was attempted.

The new `task-latency` touch/timing flow and `targets` action sequence, plus accelerated full-recording playback, need their
first browser run and may need a browser fix round. The complete ops storm case needs N-200 before it can be activated.
Real-data checks skip with `bundle absent (...)` when the real bundle is required; F4 uses `?site=mock_site` and the fake
scenario. All four subtask rows stay `wip` until the named automated checks pass. This batch does not run `graphify update .`
because its generated repository graph lies outside the explicit lane file boundary.
