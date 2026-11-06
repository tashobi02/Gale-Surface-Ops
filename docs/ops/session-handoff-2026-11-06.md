# Session handoff — planning chat to Claude Code (6 Nov 2026)

| | |
| --- | --- |
| **Owner** | Sadman Shaharier Mahim, product & systems lead |
| **Date** | 2026-11-06 |
| **Status** | Handoff from the claude.ai planning chat (5–6 Nov) to a Claude Code cloud session; read once, then follow the specs |
| **Related** | [Docs index](../README.md) · [06 Implementation plan](../specs/06_High_Level_Implementation_Plan.md) · [Agentic workflow](agentic-workflow.md) · [Data downloads](data-downloads.md) · [Mockup handoff](../design/mockup-handoff.md) · [AI use](../AI_USE.md) |

This file tells a new coding session everything the planning chat decided and what is left to do. It adds no requirement of its own: if anything here disagrees with specs 01–06, the specs win, and you should say so instead of picking one silently.

## A. Read in this order

1. [`CLAUDE.md`](../../CLAUDE.md) and [`AGENTS.md`](../../AGENTS.md): rules for every agent.
2. This file.
3. [docs/README.md](../README.md), then [06](../specs/06_High_Level_Implementation_Plan.md) §A.2 (who does what), §C (task table) and §F (day-by-day schedule).
4. [01 §E.1](../specs/01_Product_Requirements_Document.md#e1-killer-demo--storm-at-sol-4190-target-90-s-of-the-240-s-video): the killer demo. Everything serves those 90 seconds first.
5. Only the spec sections that your current task links to.

## B. The project in one paragraph

Team CheesySpace's entry for NASA Space Apps 2026, challenge "Interplanetary Survival Guide: Martian Map", Dhaka event 13–14 Nov 2026. Product: **Marswalk Surface Ops** (working title), a habitat-local surface operations system for one Mars Exploration Zone at Gale crater, Mount Sharp. Parts: a planner, a **Hab Core** server on the habitat LAN, an EVA tablet with a HUD mode, and an ops console. The killer demo replays the real 20 May 2024 (sol 4190) solar particle event so the crew shelters in time.

| Date | What |
| --- | --- |
| Fri 6 Nov | Kickoff; coding starts |
| Sat 7 Nov | `packages/protocol` v0 frozen; M1 spike go/no-go |
| Mon 9 Nov | M2: data and scenario tables validated |
| Tue 10 Nov | M3 walking skeleton; evening **M3b first dry run** |
| Wed 11 Nov | **M4 offline dry run ×3** (team target) |
| Thu 12 Nov | M4b buffer; organizer's dry-run deadline |
| Fri 13 Nov 18:30 | 240-s local video due |
| Sat 14 Nov 09:00 | 30-s global video due (hard cut-off 12:00); judging from 11:00 |

## C. Non-negotiables (summary; `AGENTS.md` is authoritative)

- No AI-computed or AI-generated numbers in the product, data or docs. Science lives only in `packages/compute` and `pipeline/`. Unknowns are `TODO(verify)`.
- The Hab Core engine never reads wall-clock time.
- Every displayed value has a provenance class: measured, derived, modelled, assumed, replayed or simulated. Nothing is called "live".
- No internet at runtime: clients talk only to the Hab Core on the LAN. Fonts must be self-hosted (U-27, U-40).
- Mars coordinates: `IAU_2015:49900` sphere, east-positive longitude, local equirectangular projection. Never EPSG:3857, WGS84 or `ol/sphere`.
- Design follows 04 exactly: status colours mean status only; brand orange never in OPS or HUD; every status has colour, shape, word and a fixed position; hold-to-confirm for critical actions. No NASA logos or insignia.
- No under-18 likeness in media. Credit every dataset and image.
- TypeScript strict; pure functions in `packages/compute` with Vitest tests; no new dependency without a stated reason.
- Docs conventions: header table, owner, date, status, related links, valid anchors, markdownlint-clean, an unresolved-items table, and a line in `docs/AI_USE.md` for AI-assisted work. Plain English, units on every number. Avoid in-team jargon such as "lane"; write "your tasks" or "the folders your role owns".

## D. Repository state on 6 Nov

- **Repo:** `github.com/tashobi02/CheesySpace-NasaSpaceAppChallenge` (private). Branch **`v2-surface-ops`**; a PR into `main` was being opened on 6 Nov. Check whether it is merged before branching (`git log origin/main --oneline -3`).
- **Layout:** npm workspaces `apps/web`, `apps/hab-core`, `packages/compute`, `packages/protocol`; Python `pipeline/` with one conda environment (`pipeline/environment.yml`, now including `spiceypy`).
- **Code is stubs only.** Signatures and comments, every test `it.todo` or skipped. Track P allows application code before 13 Nov (`CLAUDE.md` §3), following the task windows in [`docs/tasks/_coordination.md`](../tasks/_coordination.md).
- **Commits on the branch** (oldest first): v2 specs rewrite; monorepo restructure; repo docs, ADR-008–011 and schemas; design language; team roles; design handoff and prototype; Impeccable and multi-agent workflow; Windows `.cmd` line endings; plan re-date, data list and FR-50; prototype update with task list and full-screen map; full-screen map to Tier 1; rover tasking to Tier 1; 06 v2.2 (8–10 h/day); wording fix; plus Sadman's own commit of the last three files.
- **Checks last run (planning sandbox):** markdownlint 0 issues; 1,904 relative links, 0 broken; typecheck passes; Vitest passes (all `it.todo`); `apps/web` build passes; prototype rebuild byte-identical; prototype Chromium tests t3, t6, t9, t12, t18, t26, t27, t28, t31 and the contrast script pass. **Not run:** pytest (no conda in that sandbox) and `make design-check` (needs the Impeccable engine download).
- **Git identity gotcha:** the planning sandbox had written `user.name` / `user.email` into the repo's own `.git/config`, so local commits were labelled "Claude (AI-assisted…)". Sadman is removing it on his laptop. Do not write repo-local git identity.

## E. Decisions made in the planning chat (5–6 Nov)

All are **Proposed** until the 6 Nov kickoff signs them off, except where marked.

### E.1 Schedule and capacity (06 v2.2)

- The team's dry run (M4) is **11 Nov**, with a first dry run on the evening of **10 Nov** (M3b) and **12 Nov** as buffer (M4b).
- The team committed to **8–10 h/day each** (Sadman's decision). Capacity over the 6 build days is 288–360 person-hours; pre-event work assigned in 06 §A.2 is 145–223, so there is about 65–215 person-hours of slack before the buffer. Hours are no longer the limit; the dependencies are (DEM and AOI choice, protocol freeze on 7 Nov, scenario data on 9 Nov, all-hands integration).
- **No scope cuts** (Sadman's decision). 06 §D.4 is a contingency list only.

### E.2 Who does what (06 §A.2)

| Person | Position | Pre-event tasks |
| --- | --- | --- |
| Obidit Islam | Team lead · R1 Data & GIS | TASK-01, TASK-03, TASK-21 (data), TASK-30; event: TASK-16, TASK-17 (helper) |
| Mishkat Ahmed Khan | R2 Compute lead · R1 support | TASK-05, TASK-06, TASK-05b (half), TASK-04 (data half), TASK-12, TASK-29 (compute + engine) |
| Anjim Hossain | R2/R4 float · integration lead | TASK-05b (half), TASK-23 (compute half), TASK-26, TASK-28, TASK-14 (lead), TASK-31 (engine) |
| Sadman Shaharier Mahim | Product & systems lead · R4 Hab Core · demo story | TASK-20, TASK-22, TASK-23 (Hab Core half), TASK-21 (script), TASK-04 (content half), TASK-31 (task text); event: TASK-17 |
| Saba Atharique | R3 Map & Planner UI | TASK-02, TASK-07, TASK-08, TASK-09, TASK-11, TASK-29 (UI); event: TASK-10, TASK-27 (half) |
| Ridita Alam | R5 EVA & Ops UI · design system | TASK-13, TASK-24, TASK-25, TASK-31 (UI), TASK-15; event: TASK-27 (half) |

Each person's coding agent (Claude Code, Codex, Gemini CLI) is still to be filled in (U-50).

### E.3 Scope changes

| Change | Where it is written |
| --- | --- |
| **FR-50 stop task list** (new, Tier 1): 1–4 tasks per stop; tick done or skip with a 5-s undo on the EVA tablet; `UPDATE_STOP_TASK` and `ADD_STOP_TASK` commands; `TASK_ADDED`, `TASK_UPDATED`, `TASK_DROPPED` events; open tasks at dropped stops become DROPPED; simulated EV2 completes tasks at the end of each dwell; briefing card lists tasks; post-EVA report counts them. New TASK-31 | 01 FR-50, 02 §E.6, 03 SCR-11/SCR-12, 04 §E.5, 05 StopTask, 06 TASK-31 |
| **Full-screen EVA map** (Tier 1, Sadman's decision): button controls +, −, FIT, FOLLOW, LAYERS, CLOSE (≥ 56 px, labelled); at most two scientific layers; a warning closes it; fixed geography holds. Ops and planner maps get + / − / FIT. Adds effort to TASK-07 and TASK-24 | 01 FR-32, 04 §E.5, 06 |
| **Rover tasking FR-41** moved from Tier 2 to **Tier 1** (Sadman's decision), so the relay that closes the comm shadow is in the dry run and the 240-s video. TASK-29 is now pre-event (9–10 Nov) | 01, 02, 03, 04, 06, docs index |
| **Briefing card** (the v1 "exploration card", FR-14, SCR-08) stays Tier 0; TASK-11 moved from the event to 10–11 Nov | 01 FR-14, 06 |
| **Usability test** TASK-15 moved from the event to 10–11 Nov | 06 |
| **Tier 2** is now only TASK-18 (terrain refuge, Earth view, CRISM, REMS, dust), allowed only after M3 passes | 01 §C.3, 06 |

### E.4 Data

- The full shopping list with exact URLs is [data-downloads.md](data-downloads.md): DEM (3.6 GB), colour HiRISE COG, THEMIS TI, traverse, POI images, RAD dose series, DONKI, SPICE kernels for MRO, MAVEN and ESA TGO, and offline fonts.
- **U-15 (RAD sol-4190 series) is close to resolved:** a CC BY 4.0 dataset from the RAD team at Kiel on Zenodo has a `sol` column; PDS also holds RAD data well past sol 4190. Coverage of sol 4190 is still to verify on download.
- `spiceypy` was added to `pipeline/environment.yml` (required by 02 L10, was missing).

### E.5 Design prototype

- It lives in `docs/design/prototype/` with the handoff at [mockup-handoff.md](../design/mockup-handoff.md). Every number in it is a cited spec example or a visible `PLACEHOLDER`, so it stays within the no-AI-numbers rule.
- It shows SCR-00 to SCR-18, the FR-50 task list and the full-screen map. Rebuild with `python3 build.py`; tests in `test/` (Chromium via `@sparticuz/chromium` + `playwright-core`).
- Known stale label: the prototype still shows "TASK ROVER (T2)"; rover tasking is Tier 1 now. Fix it in the next prototype pass.

### E.6 Coding agents and tools

- [agentic-workflow.md](agentic-workflow.md) is the single guide. `AGENTS.md` is the shared rule set; Codex reads it natively and Gemini through `.gemini/settings.json`.
- **spec-kit** (vendored subset): `/speckit.analyze`, `/speckit.clarify`, `/speckit.checklist` for spec quality only. Do not generate `specs/NNN-*` folders.
- **ECC**: the gated pipeline for implementation (`/orch-add-feature`, `/orch-fix-defect`).
- **Impeccable 4.8.0**: vendored for Claude, Codex and Gemini with hooks. 04 wins over its defaults; `.impeccable/config.json` allows Inter and Helvetica. Set `IMPECCABLE_LIVE_COPY_AGENT=chat` before `/impeccable live`.
- `make agent-skills` mirrors `.claude/skills/` into `.agents/skills/` and `.gemini/skills/` (git-ignored).

## F. What this session should do

Work on a branch from the latest `v2-surface-ops` (or `main` if the PR is merged), never on `main` directly. Follow the ECC pipeline: plan, wait for Sadman's approval, write tests first, then implement, review and run the checks. Commit in small, labelled commits and push the branch so Sadman can pull it on his laptop.

### F.1 First: stubs for the 5–6 Nov additions (before the 7 Nov protocol freeze)

Stubs and `it.todo` tests only; no behaviour. These exist so that Ridita, Anjim and Saba build against agreed shapes.

1. **FR-50 in `packages/protocol`:**
   - `src/runtime.ts`: add a `StopTask` interface exactly as in 05 StopTask (`task_id`, `stop_id`, `crew_id`, `kind`, `text`, `state`, `reason`, `origin`, `updated_sim_time`, `updated_by`, `provenance`). Add `UPDATE_STOP_TASK` and `ADD_STOP_TASK` to `CommandKind`, and `TASK_ADDED`, `TASK_UPDATED`, `TASK_DROPPED` to `LogEventKind`.
   - `src/ws.ts`: `PERMISSIONS` gives both EVA roles `UPDATE_STOP_TASK` (own tasks; the Hab Core checks "own") and ops both commands (02 §E.6 table).
2. **FR-50 in `schemas/scenario.schema.json`:** optional `tasks` array on each plan stop, matching StopTask's authored fields (`task_id`, `kind`, `text`, `crew_id`). U-48 proposes `scenario.json`, not `pois.geojson`.
3. **FR-50 in `apps/hab-core`:** `it.todo` cases in `tests/commands.test.ts` and `tests/engine.test.ts` for each acceptance criterion in 01 FR-50 (permission rejections, event emitted, DROPPED on plan revision, simulated crew auto-complete at dwell end, report counts equal log counts).
4. **FR-50 in `apps/web`:** empty `StopTaskList` and `TaskProgress` components with props from the mockup handoff's component inventory, and `it.todo` tests.
5. **Full-screen map:** an empty shared `MapControls` component (+, −, FIT, FOLLOW, LAYERS, CLOSE) and a full-screen map stub for SCR-12, with `it.todo` tests for 04 §E.5 (fixed geography, warning closes it, two-layer cap).
6. **Rover tasking (TASK-29):** a rover command handler stub in `apps/hab-core` for `TASK_ROVER` (SCOUT, CARRY, RELAY, RETURN) with `it.todo` tests: "RELAY closes the demo comm shadow" and "queue shows ETA and battery". Rover routing reuses `packages/compute` `route.ts`; relay coverage reuses `viewshed.ts` and `linkGraph.ts`. Do not add a new compute module unless 02 calls for one.
7. Run `make lint typecheck test-web docs-check` and `npm run build`; report results honestly. Add one `docs/AI_USE.md` line.

### F.2 Next: atomize tasks (Sadman's priority 2)

Write subtask files for TASK-05b and TASK-20 to TASK-31 in `docs/tasks/`, following the format and numbering in [`_coordination.md`](../tasks/_coordination.md) and the existing TASK files. Each subtask names its owner from 06 §A.2, its paths, its Verify line and its spec links. The v1 task files still carry v1 milestone windows; re-date them to 06 v2.2 while doing this.

### F.3 Then: team startup prompts

Sadman will ask for one startup prompt per teammate, for the coding agent each one uses (Claude Code, Codex or Gemini CLI), built from 06 §A.2 and [agentic-workflow.md](agentic-workflow.md) §B–§D.

### F.4 Small follow-ups (do when touching the file anyway)

- 01 §E.1 and [demo-script.md](demo-script.md): add the rover relay beat to the 240-s video plan. This is Sadman's call as story owner; ask first.
- The claude.ai Project knowledge still holds the 4 Nov copies of 00–10. Remind Sadman to re-upload `docs/specs/01–06`, `docs/README.md` and `docs/decisions/` after the PR merges.
- Next free unresolved-item id is **U-61** (U-44 to U-60 are in use across 01, 04, 05, `docs/ops/` and the mockup handoff).

## G. Open decisions for the 6 Nov kickoff

| ID | Decision | Blocks |
| --- | --- | --- |
| U-46 | FR-50 sign-off as Tier 1 | TASK-31 |
| U-50 | Each person's coding agent | Startup prompts |
| U-51 | TASKS button and where the list sits on phone landscape vs tablet/portrait | TASK-24 (7 Nov) |
| U-52 | Per-crew task model (EV1/EV2; storm-cut dwell leaves EV2 tasks open then dropped) | TASK-31 |
| U-53 | Product computes task counts from the list (prototype uses lookups) | TASK-31 |
| U-54 | Task count on the HUD as a sixth value, or in the STOP sub-label | TASK-15 |
| U-55 | Skip-reason capture with gloves | Usability test |
| U-56 | Do open tasks at the current stop become DROPPED on abort or rendezvous? | TASK-31 |
| U-57 | Full-screen map: scope decided (Tier 1); layer set and a pinch test still open | TASK-07 / TASK-24 |
| U-58 | Who writes the final task text, in which file; limits on ops-added tasks | TASK-31 (7 Nov) |
| U-59 | Task list collapse rules during an alert | TASK-24 |
| U-60 | Landscape full-screen map: HAVEN/O₂ at 40/48 px vs the 56 px rule | TASK-24, usability test UT-9 |
| U-44 | DONKI date window (proposed 13–24 May 2024) | TASK-21 |
| U-45 | Which RAD dose product matches NASA's published event total | TASK-21 |
| U-49 | Hook and skill paths Codex and Gemini actually load | Agent setup |
| U-15, U-18 | RAD sol-4190 coverage; exact SPICE SPK files | TASK-21 (8 Nov) |
| U-30 to U-43 | Prototype layout and design questions (see mockup handoff) | TASK-13, TASK-24, TASK-25 |

## Unresolved items owned by this document

| ID | Item | Owner | Due |
| --- | --- | --- | --- |
| — | None of its own: every open item above is owned by the file that defines it | — | — |
