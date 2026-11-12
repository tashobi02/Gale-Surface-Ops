# 11 — Command journal, command-list replay, CLI and the Pages recording

| | |
| --- | --- |
| **Subtasks** | T32.16, T32.17, T22.13; server half of T27.05 (recording) |
| **Depends on** | 08 (the commands a list uses); may run in parallel with 09–10 if it does not edit `commands.ts` (it edits `session.ts` only to write `commands.jsonl`: take it after 10 to keep the chain) |
| **Branch** | `be/11-command-replay` |
| **Spec refs** | 02 §D.17 headless run (after package 02); NFR-06, NFR-14; decisions BD-93, BD-105 |

## Files

`apps/hab-core/tests/replayCommands.test.ts` (new) · `apps/hab-core/tests/recording.test.ts` (new) · `apps/hab-core/src/replay.ts` · `apps/hab-core/src/cli.ts` · `apps/hab-core/src/session.ts` (append one `CommandJournalLine` to `commands.jsonl` per evaluated command, after the log write) · `apps/hab-core/src/log.ts` (open/close the journal beside the log) · `apps/hab-core/src/recording.ts` (new: collects the message stream of a headless run)

## Steps (tests first)

1. `replayCommands.test.ts`: T32.16 steps 1–6. Step 6 is exact: a live session driven through `session.ts` (fake clients, mixed accepted and rejected commands, one `RESET_SESSION`) exports one list per session from `commands.jsonl`; each list replays to its session's `log_hash`.
2. `recording.test.ts`: the recording's first message is a SNAPSHOT; `seq` strictly increases; at most one STATE_DELTA per sim second; replaying the same list twice gives byte-identical JSON (canonical key order); `label` is `"replayed recording"`.
3. `replay.ts`: `replayHeadless(scenarioDir, seed, {commands, record?})` applies the list in list order before the tick at each `sim_time`; runs until ENDED or the plan's maximum EVA duration; without a list the old behaviour and hash.
4. `cli.ts`: `start --scenario-dir <path>` (N-01); `server.ts` gets `GET /api/session/summary` (N-05, one server test); `packages/protocol/src/logHash.ts` is used by `log.ts` and a test proves node:crypto and WebCrypto give the same hash (N-21). Also in `cli.ts`: `replay <scenarioDir> [--commands <file>] [--record <file>]`, `export-commands <sessionDir> <outDir>`; header documents both.
5. Close T22.13: `make replay` prints a hash; `make hab` serves on `0.0.0.0:8080` (smoke below).

## Automated verification

- `npm --workspace @marswalk/hab-core test -- replayCommands recording replay`.
- CLI smoke (script in the test or the commit body): `make replay` twice → same hash; `timeout 15 make hab & sleep 5; curl -sf http://127.0.0.1:8080/api/health` returns JSON with `session_id`; kill.
- The real-scenario run of `make record` happens in package 26 (needs the real scenario and list).

## Status rows

```text
| T32.16 | done | <commit date> | [replayCommands.test.ts](../../apps/hab-core/tests/replayCommands.test.ts) incl. exact export from commands.jsonl (BD-93) |
| T32.17 | done | <commit date> | replay --commands/--record and export-commands in [cli.ts](../../apps/hab-core/src/cli.ts) |
| T22.13 | done | <commit date> | make replay prints a stable hash twice; make hab serves /api/health on 0.0.0.0:8080 (smoke in commit body) |
```

## Done when

Any live session can be exported and replayed headless to the same hash, and a recording can be written.
