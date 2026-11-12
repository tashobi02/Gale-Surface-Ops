# 02 — Spec-change package (applied FIRST)

| | |
| --- | --- |
| **Subtasks** | T32.02; the spec halves of T01.07, T04.10, T04.11; Unresolved-row updates for U-02, U-03, U-04, U-11, U-16, U-17, U-18, U-28, U-46, U-62, U-63, U-64, U-65 |
| **Branch** | `be/02-spec-changes` from `merging-core`; merged before [01-contract.md](01-contract.md) |
| **Files** | `docs/specs/01_Product_Requirements_Document.md`, `02_Technical_Requirements_Document.md`, `03_App_Flow_and_Diagrams.md` (U-28 row only), `05_Backend_and_Database_Schema.md`, `06_High_Level_Implementation_Plan.md`, `docs/ops/feasibility/hab-site.md`, `docs/ops/exploration-zone.md`, `docs/tasks/status.md`, `README.md` (progress block via `make progress`), `docs/AI_USE.md` |
| **Effort** | one agent, ≤ 2 h |

## Rules for the implementer

- Every inserted sentence ends with *(Proposed 2026-11-12; decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; BD-nn)*.
- Change no requirement id, no number, no existing Confirmed/Assumed/Proposed/Unresolved label except the status cell of the Unresolved rows listed below. Add text; do not rewrite.
- No number is introduced: every value in this package already exists in a spec, a committed file, or is computed later by a named package.

## Edits

| # | File and section | Edit | Decision |
| --- | --- | --- | --- |
| 1 | 05 LogEvent `data` by kind, `CLOCK_JUMPED` | `ended_by` lists the five 02 §D.17 values; add "logged after the events of the jump" | BD-92 |
| 2 | 05 LogEvent `SESSION_LOADED` | `plan_hash` nullable (null for a plan-less session) | BD-96 |
| 3 | 05 LogEvent `MISSION_SETUP_SET` | add `vehicle_param_set` | BD-96 |
| 4 | 05 Snapshot field list (new short table under Session or ClientConnection) and 02 §E.6 SNAPSHOT example | add `task_library`, `event_library` (summaries), `next_stop_target`, `conditions` | BD-90, BD-104, BD-75 |
| 5 | 05 Crew table; 02 §E.6 example | add `o2_remaining_min`, `next_stop_bearing_deg`, `next_stop_distance_m`, `next_stop_eta_s`, `link_hops`, `link_via` with units, convention and provenance as in BD-95, BD-103; per-crew next stop for the HUD, crew-wide target for `JUMP_NEXT_STOP` | BD-95, BD-103 |
| 6 | 05 Vehicle table; 05 LogEvent `VEHICLE_DISPATCHED`; 01 FR-41 Behaviour (one sentence) | `task_id`, `queue` (QueuedRoverTask), FIFO rule, battery check | BD-102 |
| 7 | 02 §E.6 COMMAND and 05 Command | `PUBLISH_PLAN {plan, stop_tasks?}`; seeding of `TASK_ADDED` at publish | BD-91 |
| 8 | 02 §D.17 "Headless run" paragraph; 05 Command note; 05 §B persistence | `commands.jsonl` beside `session.jsonl` (not hashed); export = that file per session; `--commands <file>`; `reference_commands.json` shape; replace the `TODO(verify)` | BD-93 |
| 9 | 02 §D.17 `START_EVENT`; 05 EventLibraryEntry `series_start_utc` and `inputs` | the `series_start_utc` rule; simulated input offsets from the record they answer (`payload.answers`); replace both `TODO(verify)`/`TODO(decision)` | BD-98, BD-99 |
| 10 | 05 EventLibraryEntry note "`earth_link.json` covers the whole EVA day" | replace `TODO(verify)` with "checked by the headless live-session verification; the SPICE window is widened if not" | BD-108 |
| 11 | 02 §E.2 | `LOAD_GRID` / `GRID_LOADED`; cancellation by cooperative yield every 50,000 expansions | BD-40, BD-41 |
| 12 | 05 Leg | metric definitions (horizontal distance, decoded max slope, NO_ROUTE fields); profile "every 5 m and at the leg end" | BD-43, BD-44 |
| 13 | 02 §E.3 | "ranges are inclusive at both ends" | BD-52 |
| 14 | 02 §D.2 / §D.8 | no-data slope code is impassable for suit and vehicle; hab ingress lives in the suit ParamSet as `hab_ingress_min` (value 02 §D.8 `t_ingress`, assumed) | BD-57 |
| 15 | 02 §D.10 | the second meeting of a two-crew summon is driven after the first shelters | BD-58 |
| 16 | 02 §D.14 | the non-alert module order of `MODULE_ORDER` | BD-70 |
| 17 | 05 PostEvaReport | field table (from `packages/protocol/src/report.ts` of 01-contract) incl. `planned_background_ugy` and `trace`; U-24 → Resolved | BD-76 |
| 18 | 05 RoutingGrid | TI sidecar dimension rule = the pipeline grid writer's formula | BD-78 |
| 19 | 05 Asset | static image path `images/<layer_id>.png` | BD-23 |
| 20 | 05 EarthLinkTable | sampled-pass convention sentence | BD-24 |
| 21 | 02 §C.2 L1 | ortho outside-mask pixels use the map background colour; limitation stated in the layer record; no coverage polygon field | BD-18 |
| 22 | 01 §G U-62, U-63, U-64 | → Resolved with BD-97's answers | BD-97 |
| 23 | 01 §G U-46; 03 U-28 | → Resolved (BD-81) | BD-81 |
| 24 | 01 §G U-16; U-17; FR-49 header | U-16 Resolved (exploration-zone.md); U-17 Resolved "no usable record"; FR-49 gets the line "Not built in this release: no usable dust record for the window (U-17)" | BD-28, BD-29 |
| 25 | 02 Unresolved U-02, U-03, U-04, U-18 | U-02 Resolved (dem-label.md); U-03 Resolved (ti-threshold.md, 10 Nov); U-04 Resolved (PLACES, data lead 10 Nov); U-18 Resolved (kernels.lock.json) | BD-27, BD-30 |
| 26 | 05 U-11 | Resolved: store | BD-64 |
| 27 | 06 §C.2 and U-65 | setup screen owner Sadman Shaharier Mahim; U-65 registered | BD-94, BD-05 |
| 28 | 06 §A.2 | one line: from 12 Nov every open subtask is assigned to Sadman Shaharier Mahim, executed by agents | BD-00 |
| 31 | 02 §E.5 | add `GET /api/session/summary`, `GET /api/relay-coverage/<vehicle_id>`, `GET /api/log` without `after` = whole log, `?download=1` | BD-112 |
| 32 | 05 Crew, 05 PlanResult `conditions` | `last_linked_sim_time` (simulated); `PlanResult.conditions.sol` and SNAPSHOT `conditions.sol` (MSL sol, derived) | BD-112 |
| 33 | 05 §F.6 | RADIATION_ALERT example message "Shelter now — radiation surge" (04 §D.4) | BD-112 |
| 29 | `docs/ops/feasibility/hab-site.md` | section "Decision (12 Nov)": hab site = `hab-first` (rank 1), alternative selectable; the pending hillshade check is replaced by package 23's automated passability check | BD-10 |
| 30 | `docs/ops/exploration-zone.md` | close its open markers per BD-29 (URL check runs in package 22; this edit only records the decision) | BD-29 |

## Tests first / automated verification

- `make lint docs-check` green (markdownlint, links and anchors, progress freshness).
- `git diff --stat docs/specs` lists only the five spec files; `git diff -U0 docs/specs | grep '^-' | grep -v '^---'` shows only Unresolved status cells and the replaced `TODO(...)` sentences (reviewer checks this list; no other removed line).
- `grep -n "TODO(verify)\|TODO(decision)" docs/specs/05_Backend_and_Database_Schema.md docs/specs/02_Technical_Requirements_Document.md` no longer shows the markers named in rows 8–10.

## Status rows (same commit, then `make progress`)

```text
| T32.02 | done | <commit date> | Spec gaps decided in 02 §D.17/§E.2/§E.6 and 05 (Proposed 12 Nov, BD-90…BD-99) — [02-spec-changes](../plan/backend/02-spec-changes.md) |
| T01.07 | done | <commit date> | Hab site = rank-1 `hab-first` (BD-10) in [hab-site.md](../ops/feasibility/hab-site.md) |
| T04.11 | done | <commit date> | U-17 resolved: no usable dust record; FR-49 not built (BD-28) |
```

T04.10 is marked `done` by package 22 after the URL check.

## Done when

All 33 edits are in, every inserted sentence carries the attribution and its BD id, and the checks above pass.
