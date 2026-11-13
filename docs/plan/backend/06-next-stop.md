# 06 — `JUMP_NEXT_STOP` (Next stop) and `next_stop_target`

| | |
| --- | --- |
| **Subtasks** | T32.09, T32.10 |
| **Depends on** | 04 |
| **Branch** | `be/06-next-stop` |
| **Spec refs** | 02 §D.17, §D.14; 01 FR-51; decisions BD-92, BD-97 (U-63), BD-104 |

## Files

`apps/hab-core/tests/nextStop.test.ts` (new) · `apps/hab-core/src/engine/nextStop.ts` (new) · `apps/hab-core/src/commands.ts` · `apps/hab-core/src/session.ts` (also fills `Snapshot.next_stop_target`)

## Steps (tests first)

1. `nextStop.test.ts`, cases from T32.09 steps 1–5, all five `ended_by` values live (T23.07 has merged, so no `it.todo`), plus: `Snapshot.next_stop_target` equals `nextStopTarget(state)` after every tick and is `null` with no plan or no stop left.
2. `nextStop.ts`: `nextStopTarget(state)` and `jumpEnded(events)` (end conditions of 02 §D.17, warning-level alert first).
3. `commands.ts`: presenter only; `INVALID` / `BUSY` per 01-contract §2; return a session effect like `JUMP_NEXT_EVENT`.
4. `session.ts`: run the normal 1-s ticks without waiting until the target is reached by every EVA crew member or an end event appears, bounded by the plan's maximum EVA duration; append the tick events at their own sim seconds, then `CLOCK_JUMPED` (BD-92). Clock speed and pause untouched.

## Automated verification

- `npm --workspace @marswalk/hab-core test -- nextStop clock engine sessionTick`.
- Equivalence: the test compares O₂, both dose fields and position after Next stop with a run that ticks the same sim seconds one by one (exact equality, same engine).
- Determinism: same command list → same `log_hash` twice. NFR-06 grep as in package 04.

## Status rows

```text
| T32.09 | done | <commit date> | [nextStop.test.ts](../../apps/hab-core/tests/nextStop.test.ts): target, equivalence, five ended_by, rejections, determinism |
| T32.10 | done | <commit date> | [nextStop.ts](../../apps/hab-core/src/engine/nextStop.ts), commands.ts and session.ts; CLOCK_JUMPED after the jump's events (BD-92) |
```

## Done when

The tests pass and Next stop is reachable only by the presenter role.
