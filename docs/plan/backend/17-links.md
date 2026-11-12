# 17 — Surface links: link graph per tick, `COMM_SHADOW`, `LINK_STATE`, link quality

| | |
| --- | --- |
| **Subtasks** | T26.06, T26.01, T26.02 |
| **Depends on** | 08 (server chain), 04 |
| **Branch** | `be/17-links` |
| **Spec refs** | 01 FR-42, FR-32; 02 §D.11, §A.5; 05 LinkState, Crew; decision BD-103 |

## Files

`apps/hab-core/tests/links.test.ts` (new) · `apps/hab-core/src/engine/links.ts` · `apps/hab-core/src/server.ts` (send `LINK_STATE` to the suit's `eva:` and `hud:` sockets only) · `apps/hab-core/src/commands.ts` (`NO_LINK` for an unlinked suit's commands; check order role → link) · `apps/hab-core/tests/server.test.ts` · `apps/hab-core/src/session.ts` (provenance keys `crew.link_hops`, `crew.link_via`)

## Steps (tests first)

1. `links.test.ts` (fake scenario's wall): lose once, regain once (`LINK_LOST`/`LINK_RESTORED` with `node_id`); `stale` while unlinked; `COMM_SHADOW` warning when a remaining-route segment has no coverage (static `comm_hab` of the selected candidate plus parked relays from state), cleared when a relay covers it; `link_hops`/`link_via` per BD-103 and in `LINK_STATE`; `last_linked_sim_time` (N-03); candidate switch changes coverage.
2. Server test: `LINK_STATE` reaches only that suit's clients; an EVA command while unlinked → `NO_LINK`; after `linked=true` the resent command (`queued_offline: true`) is accepted.
3. Implement with `@marswalk/compute` `linkStates`/`viewshed` (no inline LOS maths).

## Automated verification

`npm --workspace @marswalk/hab-core test -- links server commands tick`; NFR-06 grep.

## Status rows

```text
| T26.06 | done | <commit date> | [links.test.ts](../../apps/hab-core/tests/links.test.ts) |
| T26.01 | done | <commit date> | links.ts: link graph per tick, LINK_LOST/RESTORED, COMM_SHADOW, link_hops/link_via (BD-103) |
| T26.02 | done | <commit date> | LINK_STATE to the suit's sockets only; NO_LINK while unlinked; server.test.ts green |
```

## Done when

The fake scenario's wall produces one loss and one restore, and the rover relay clears the shadow (asserted again in 19).
