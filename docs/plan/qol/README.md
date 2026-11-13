# QoL pass after the full run (13 Nov 2026)

Five quality-of-life changes Sadman Shaharier Mahim (product lead) asked for after testing the integrated product on `merging-core`. They are listed in priority order. Start them **after the frontend lane reports complete**. They follow [../README.md](../README.md), except for the lighter process in §3.

Every behaviour below is **decided by Sadman Shaharier Mahim, 13 Nov 2026**. Where a detail was left open, the implementer decides it from the specs and logs it in this folder's `decisions.md` (create it). Label each row "decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 13 Nov 2026".

## 1. The five changes

### Q1 — Remove the map data-source/credits box from every map (high)

- **Problem:** the planner map (SCR-02), the ops map (SCR-11), the EVA mini-map and full map (SCR-12), and the HUD all show the OpenLayers attribution/credits box. It takes space. Crew would not have it in their face. The sources are already credited properly elsewhere.
- **Change:**
  - Remove the attribution control and the credits box from every map view: `createMap.ts`, `MiniMap.tsx`, `OpsMap.tsx`, `FullScreenMap`, `rasterLayers.ts`, `imageStatic.ts` and the related CSS.
  - Keep the credits where they already live: SCR-09 Sources & Methods, the briefing card and the report.
  - Keep `data-provenance`/`data-source` on every displayed value. Only the visual box goes.
  - In the 04/03 spec, add one sentence: map views carry no credits box; credits are in SCR-09 (NFR-07 still met).
- **Test:** no element with the OpenLayers attribution class, or our credits box, is rendered in SCR-02, SCR-11, SCR-12 or SCR-13. SCR-09 still lists every `site.layers[].source_ids` entry. Re-run the harness checks `offline`, `axe` and `targets`.

### Q2 — Crew can hold and resume their own walking: a simulation control (high)

- **Problem:** once ops starts the EVA, crew walk automatically and cannot stop. Without stopping they cannot summon a rover or vehicle.
- **Change (backend):**
  - New command `SET_CREW_MOTION { crew_id, motion: "HOLD" | "RESUME" }`.
  - **Allowed for:** `eva:EVn` for its own crew, and `ops`. Not `hud:*`.
  - **HOLD:** the crew member stops where they are, with a new activity `HOLDING`; position frozen; consumables and dose keep running. Logs `CREW_MOTION_SET { crew_id, motion, actor }`.
  - **RESUME:** walking continues along the plan from the current position.
  - **SUMMON_VEHICLE** is accepted while `HOLDING`.
  - Deterministic: sim time only, no wall clock in the engine.
  - Add it to `packages/protocol` (types, permissions), `commands.ts`, the reducer and the tick.
  - The spec says it is a **simulation control**, not a real EVA function. Add a one-line `spec-change:` to 02 §E.4/§E.6 and 05.
- **Change (tablet, SCR-12):**
  - A button in the **top-right corner**: "HOLD" while walking, "RESUME" while holding, at least 56 px.
  - Marked as a simulation control: a small "SIM" tag, neutral chrome, never a status colour.
  - Shorten the alert bar from the right so the button fits; the bar keeps colour + shape + word.
  - The HUD shows `HOLDING` as the activity.
- **Test:**
  - Engine: walking crew → HOLD → position unchanged over N ticks → RESUME → moves again; replay is deterministic.
  - Permissions: `hud:*` and the other crew member get `FORBIDDEN_ROLE`.
  - Summon is accepted while holding.
  - UI: one test that the button sends the command and flips its label from the snapshot.

### Q3 — Crew can go to a stop by vehicle, not only on foot

- **Problem:** crew walk from the hab to stops far away. Riding the vehicle is more practical.
- **Change (backend):**
  - New command `RIDE_VEHICLE { crew_id, vehicle_id, to_stop_id }`, allowed for `eva:EVn` (own crew) and `ops`.
  - **When allowed:** the crew member must be at the vehicle (same cell, or within the boarding distance from the vehicle's ParamSet), or the vehicle is summoned first.
  - **Ride:** the vehicle drives to the stop along a vehicle route from compute, at the vehicle's ParamSet speed (`scenarios/storm-sol4190/param_sets/pr1-assumed.json` / `ur1-assumed.json`). Nothing is hand-typed. The crew position follows the vehicle (activity `RIDING`).
  - **On arrival:** the crew member dismounts `AT_STOP`.
  - **Logs:** `CREW_BOARDED`, the existing `VEHICLE_DISPATCHED`/`VEHICLE_ARRIVED`, and `CREW_DISMOUNTED`.
  - **Only a pressurized rover** (`kind` per 05) can carry crew. A utility rover is rejected `INVALID`.
  - Deterministic.
  - One `spec-change:` sentence in 02/05.
- **Change (tablet):**
  - On the next-stop card: "GO BY ROVER" next to walking, enabled only when a pressurized rover is available.
  - Shows the ride ETA from the snapshot, `simulated`, or "—".
- **Test:**
  - Engine: board → ride → arrive → `AT_STOP` at the stop, with time equal to the route length over the ParamSet speed.
  - A utility rover is rejected.
  - Replay is deterministic.
  - UI: one test for the button state.

### Q4 — EVA mini-map is zoomed to the crew, with controls

- **Problem:** the non-full-screen mini-map on SCR-12 shows the whole AOI, which is useless at that size.
- **Change:**
  - **Default view:** centred on this crew member, with an extent that fits the crew member and the next stop plus padding. Choose a minimum width from the specs, or decide and log it.
  - **Follows the crew** as they move.
  - **Controls:** zoom +/− and a "recentre" button, each at least 56 px, using the shared `MapControls`.
  - Tapping still opens the full-screen map.
- **Test:** the initial view centre equals the crew position; the extent contains crew and next stop; zoom changes the resolution; recentre restores the follow view.

### Q5 — Ops can send messages to the crew (low)

- **Problem:** ops cannot message the astronauts. `SEND_MESSAGE` is the delayed **Earth** link, not this.
- **Change (backend):**
  - New command `OPS_MESSAGE { to: "EV1" | "EV2" | "all", body }`, allowed for `ops` only, body ≤ 280 characters.
  - Delivered at once over the habitat LAN, with no Earth delay.
  - Logs `OPS_MESSAGE_SENT { message_id, to, body }`. The snapshot keeps the last few per crew member, with a read flag.
  - New command `ACK_OPS_MESSAGE { message_id }` for the recipient crew member.
- **Change (UI):**
  - **Ops console:** a small compose box (recipient + text + SEND).
  - **Tablet:** a message banner or inbox below the top bar, with ACK.
  - **HUD:** an "MSG" indicator only, never the full text, to keep within the ≤ 5 values rule.
- **Test:** ops send → the recipient's snapshot has it → ack clears the indicator; crew and HUD cannot send; the body length is enforced.

## 2. Who does what (two parallel agents, no shared files)

| Agent | Items | Branch | Files |
| --- | --- | --- | --- |
| **A — UI** | Q1, Q4 | `core-frontend` | `apps/web/src/ui/**` map and EVA mini-map files, CSS, their tests, and the 03/04 sentence |
| **B — sim** | Q2, Q3, then Q5 | `core-backend` | `packages/protocol/**`, `apps/hab-core/**`, `packages/compute/**` (vehicle route only), plus `scr12EvaTablet.tsx`/`scr11OpsConsole.tsx`/`scr13Hud.tsx` and their small new components for Q2/Q3/Q5, and the 02/05 sentences |

- **A** must not touch `scr12EvaTablet.tsx`'s top bar or alert bar. **B** owns those for Q2. A works only inside the mini-map component that the tablet embeds.
- If A needs a change in B's files, or the reverse, add a line to the other side's needs file (as in [../README.md](../README.md) §5) and publish.

## 3. Lighter process (for speed)

1. `git fetch && git merge origin/merging-core` into your branch.
2. **One** `spec-change:` commit with all your sentences (Proposed 2026-11-13, decided by Sadman Shaharier Mahim).
3. **Tests first** for new engine, protocol and permission logic. Run them red, then green. For UI, one focused test per change is enough.
4. **While working:** run only the targeted tests. **Once at the end:** `make lint typecheck test-web docs-check`, plus `make e2e-one CHECK=offline`, `CHECK=axe` and `CHECK=targets`.
5. **No status-row bookkeeping** (these are not subtasks). Add **one** `docs/AI_USE.md` row per agent.
6. **Non-negotiables unchanged:**
   - no internet at runtime;
   - no `Date.now` in `apps/hab-core/src/engine`;
   - no invented numbers (speeds and distances come from ParamSets or compute);
   - provenance on every value;
   - status colour = colour + shape + word;
   - no brand orange in OPS/HUD.
7. Commit (conventional, with the `Co-Authored-By:` of your agent), push, then `bash scripts/publish_lane.sh`.
