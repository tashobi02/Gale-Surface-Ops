# 08 — `RESET_SESSION`, `SELECT_HAB_SITE`, `SET_MISSION_SETUP`, role matrix, fresh SNAPSHOT

| | |
| --- | --- |
| **Subtasks** | T32.13, T32.14, T32.15 (server half; the client half merged in 01a) |
| **Depends on** | 05, 07 |
| **Branch** | `be/08-reset-site-setup` |
| **Spec refs** | 02 §D.17, §E.4, §E.6; 01 FR-51, FR-53, FR-31; NFR-02, NFR-13 |

## Files

`apps/hab-core/tests/liveSetup.test.ts` (new) · `apps/hab-core/src/engine/liveSetup.ts` (new) · `commands.ts` · `session.ts` · `server.ts` · `apps/hab-core/tests/server.test.ts`

## Steps (tests first)

1. `liveSetup.test.ts`: T32.13 steps 1–4 on the two-candidate fixture site; the role matrix covers every command kind × every role (19 × 8) from `PERMISSIONS`, each forbidden pair logged as `COMMAND_REJECTED FORBIDDEN_ROLE`.
2. `liveSetup.ts`: validators and event builders; `SELECT_HAB_SITE` swaps the comm grid and mast (package 04's `loadCandidateComm`), calls `invalidateHavenCache()` (package 05) and recomputes the haven field; `SET_MISSION_SETUP` merges; `RESET_SESSION` effect.
3. `session.ts`: reset appends `SESSION_RESET` as the last line of the old log, starts `s-<n+1>` of the same scenario and seed in `LOADED`, clears accepted-command memory; old log untouched on disk.
4. `server.ts` + `server.test.ts`: after a command that replaces the session (reset, `LOAD_SCENARIO`) every client receives a fresh SNAPSHOT of the new session; ordinary reconnect unchanged (NFR-13 cases still pass).

## Automated verification

- `npm --workspace @marswalk/hab-core test -- liveSetup commands server session`.
- Haven differs between the two candidates (assert field inequality); headless run of each candidate twice → identical hash.
- The old session's `session.jsonl` bytes are identical before and after the reset (SHA-256 compare in the test).

## Status rows

```text
| T32.13 | done | <commit date> | [liveSetup.test.ts](../../apps/hab-core/tests/liveSetup.test.ts): reset, site, setup and the full 02 §E.4 matrix |
| T32.14 | done | <commit date> | [liveSetup.ts](../../apps/hab-core/src/engine/liveSetup.ts); haven recomputed on SELECT_HAB_SITE |
| T32.15 | done | <commit date> | server.ts sends a fresh SNAPSHOT after a session replace; habClient reset test (01a) and server.test.ts green |
```

## Done when

All listed tests pass; the full role matrix is enforced.
