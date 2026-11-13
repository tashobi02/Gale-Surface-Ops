# 27 — Headless verification on the real scenario (M3/M4 evidence)

| | |
| --- | --- |
| **Subtasks** | T22.14, T23.08, T32.29, T26.07, T29.06, T31.08 (server-level), T20.08 (loopback), T28.05 (server-level) |
| **Depends on** | 26 |
| **Branch** | `be/27-headless-verify` |
| **Spec refs** | NFR-02, NFR-06, NFR-10, NFR-12, NFR-13, NFR-14; 01 §E.1; decisions BD-02, BD-03, BD-77, BD-108 |

## Files

`apps/hab-core/tests/killerDemo.test.ts` (new) · `apps/hab-core/tests/liveSession.test.ts` (new) · `apps/hab-core/tests/realLinks.test.ts` (new: T26.07, T29.06) · `apps/hab-core/tests/latency.test.ts` (new: T20.08, T31.08 with real `ws` clients against a started server on 127.0.0.1 and on the first non-internal IPv4 if any) · `apps/hab-core/tests/resume.test.ts` (new: kill/restart) · `docs/ops/verification-log.md` (append one section per subtask)

All real-scenario tests skip with a printed reason when the bundle is absent; in this run it is present, so 0 skipped is required.

## Checks

| Subtask | Automated check |
| --- | --- |
| T22.14 | `make replay` twice and the reference list twice → equal hashes; a 60× run with one connected ops client completes; engine CPU share measured with `process.cpuUsage()` over the run ≤ 30 % of one core; the reference hash committed in the log |
| T23.08 | reference list: event order alert → options → summon accepted → vehicle arrives → crew sheltered matches 01 §E.1; `log_hash` recorded |
| T32.29 | scripted session: `SELECT_HAB_SITE hab-alternative`, `SET_MISSION_SETUP`, `PUBLISH_PLAN` with tasks, `START_EVA`, `JUMP_NEXT_STOP` ×N, `START_EVENT storm`, alert, summon, approve, `CREW_SHELTERED`, `RESET_SESSION`, second session; export both lists; each replays twice to its live hash; `SELECT_HAB_SITE` time ≤ 2 s (BD-03 line); `earth_link.json` covers the session span (BD-108) |
| T26.07 | the demo shadow appears and clears at recorded sim times; forecast delivery time equals compute's rule for its issue time |
| T29.06 | RELAY on the ridge from the demo plan clears `COMM_SHADOW`; queue ETA and battery present in the SNAPSHOT |
| T31.08 | tap (`UPDATE_STOP_TASK` from an `eva:EV1` client) → the ops client's `EVENT` within 500 ms (p95 of 50); ABORT drops open tasks on every client; report task counts equal counts reduced from `session.jsonl` |
| T20.08 | 3 clients (2 eva, 1 ops): worst event fan-out latency ≤ 500 ms over 300 events; GO line |
| T28.05 | server level: kill and restart the Hab Core → session resumes from disk with the same `last_seq` and hash; reconnecting client gets SNAPSHOT within 2 s; resume time recorded (BD-77) |

## Automated verification

`npm --workspace @marswalk/hab-core test -- killerDemo liveSession realLinks latency resume` with 0 skipped; `make docs-check`.

## Status rows

```text
| T22.14 | done | <commit date> | Equal hashes (replay ×2, list ×2), 60× run, CPU share — verification log |
| T23.08 | done | <commit date> | killerDemo.test.ts: 01 §E.1 0:30–1:10 order headless |
| T32.29 | done | <commit date> | liveSession.test.ts: full live session, export/replay hashes equal, SELECT_HAB_SITE timing |
| T26.07 | done | <commit date> | Shadow appears/clears; forecast at the computed time |
| T29.06 | done | <commit date> | RELAY closes the demo shadow; queue ETA/battery |
| T31.08 | done | <commit date> | Tap → ops p95 < 500 ms headless; abort drops; report counts = log (browser half in package 28) |
| T20.08 | done | <commit date> | Loopback/LAN-IP fan-out ≤ 500 ms (virtual event, BD-02) |
```

T28.05 becomes `done` in package 28 (browser half).

## Done when

Every check passes with the real scenario and the log has one section per row.
