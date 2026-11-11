# Task plans — index

| | |
| --- | --- |
| **Owner** | Delivery — the coordination map owns ids, paths and dependencies |
| **Date** | 2026-11-03; v2 atomization and re-dating 2026-11-06 |
| **Status** | Plan complete: 32 task files, 342 subtasks, `scripts/check_tasks.py` clean. v2 packages atomized and v1 packages re-dated to 06 v2.2 on 2026-11-06 (session handoff §F.2) |
| **Related** | [Coordination map](_coordination.md) · [06 Implementation plan](../specs/06_High_Level_Implementation_Plan.md) · [Docs index](../README.md) |

The work packages of [06 §C](../specs/06_High_Level_Implementation_Plan.md#c-work-packages), split into subtasks of 0.5–3 h that people and agents can take in parallel: the 19 v1 packages (TASK-00…TASK-18, planner and Tier 0) and the 13 v2 packages (TASK-05b, TASK-20…TASK-31, surface ops and Tier 1). Read [`_coordination.md`](_coordination.md) first: it fixes subtask ids, path owners, contracts, fixtures, the dependency graph and the branch and PR rules. Each task file expands its subtasks with an Owner, steps, acceptance criteria, a verify command and an agent brief.

> **v2 update (2026-11-06).** The v2 packages are atomized, and the v1 packages are re-dated to [06](../specs/06_High_Level_Implementation_Plan.md) v2.2: milestones from 06 §B v2, windows under Track P, the v2 cut list, and an Owner (from 06 §A.2, *Proposed* until the kickoff signs it off) on every subtask. v1 packages also gained the v2 scope that 06 §C.1 gives them (for example the hab site T01.07, the `comm_hab` grid T03.28–T03.30, map controls T07.17, `PUBLISH_PLAN` T11.07, HUD tokens T13.12).

## Tasks

| Task | Title | Lane | Milestone | Window | Subtasks | Estimate (h) |
| --- | --- | --- | --- | --- | --- | --- |
| TASK-00 | [Resolve rules + register](TASK-00_resolve-rules-and-register.md) | story — R6: Obidit Islam (team lead); T00.04 integration | M0 (done 4 Nov); T00.06 runs to M2 (venue, U-14) | pre-event-allowed | 6 | 3–4 |
| TASK-01 | [Feasibility: AOI, DEM quality, coverage checks](TASK-01_feasibility.md) | data — R1 Data & GIS: Obidit Islam | M0 (kickoff 6 Nov: AOI and hab position proposed); 06 §C.1 *When*: P 6–7 Nov | pre-event-allowed | 7 | 9–14.5 |
| TASK-02 | [Spike: OpenLayers custom Mars projection + custom tile grid](TASK-02_projection-spike.md) | frontend — R3 Map & Planner UI: Saba Atharique | M1 (spike go/no-go Sat 7 Nov; 06 §C.1 *When*: P 6–7 Nov) | T02.01, T02.05 pre-event-allowed; the code subtasks pre-event-if-permitted (Track P) | 6 | 5–7 |
| TASK-03 | [Preprocessing pipeline](TASK-03_preprocessing-pipeline.md) | data — R1 Data & GIS: Obidit Islam | M1 (contracts, mock site) · M2 (pipeline, bundle v1, `comm_hab`, clean re-run; by Mon 9 Nov) · M4 (candidate hab sites, F4 tile levels, rank-1 asset id) | pre-event-allowed | 37 | 50.5–76 |
| TASK-04 | [Vectors, POIs and images](TASK-04_vectors-pois-images.md) | data — R1 support: Mishkat Ahmed Khan (data half); story — R6: Sadman Shaharier Mahim (content half) | M2 (06 §C.1 *When*: P 6–9 Nov) | pre-event-allowed | 11 | 13.5–22.5 |
| TASK-05 | [Compute core: grid loader, sampling, A*, profile, time model, walkback, warnings](TASK-05_compute-core.md) | compute — R2 Compute: Mishkat Ahmed Khan | M1 (contracts, fixtures) · M2 (everything else; 06 §C.1 *When*: P 6–9 Nov) | pre-event-if-permitted (Track P code); T05.01, T05.03 and T05.29 are pre-event-allowed | 32 | 39–58.5 |
| TASK-05b | [Compute v2: haven, rendezvous, viewshed, link graph, Earth delivery, event dose, consumables, contingency](TASK-05b_compute-v2.md) | compute — R2 Compute: Mishkat Ahmed Khan (haven, rendezvous, contingency, benchmarks) and Anjim Hossain (viewshed, link graph, Earth delivery, event dose, consumables) | M1 (Dijkstra benchmark go/no-go Sat 7 Nov) → M3 (real-grid checks, 10 Nov) | pre-event-if-permitted (T05b.01 and T05b.02 are pre-event-allowed) | 21 | 20–28.5 |
| TASK-06 | [Mars24 solar functions + radiation estimate](TASK-06_mars24-and-radiation.md) | compute — R2 Compute: Mishkat Ahmed Khan | M1 (contract, fixture, records) · M2 (code; 06 §C.1 *When*: P 7–9 Nov) | pre-event-if-permitted (Track P code); T06.01, T06.02 and T06.10 are pre-event-allowed | 11 | 12–20 |
| TASK-07 | [App shell + map workspace + layers panel + inspector](TASK-07_app-shell-and-map-workspace.md) | frontend — R3 Map & Planner UI: Saba Atharique (T07.14 story: Sadman Shaharier Mahim) | M1 (contract T07.01, demo plan T07.14) · M2 (everything else, incl. T07.17) · M3 (T07.18); 06 §C.1 *When*: P 7–9 Nov | pre-event-if-permitted; T07.01 and T07.14 are pre-event-allowed | 18 | 26–38.5 |
| TASK-08 | [Plan panel + waypoint editing](TASK-08_plan-panel-and-waypoints.md) | frontend — R3 Map & Planner UI: Saba Atharique | M2 (contract T08.01) · M3 (everything else; 06 §C.1 *When*: P 8–10 Nov) | pre-event-if-permitted; T08.01 is pre-event-allowed | 12 | 18.5–27.5 |
| TASK-09 | [Results panel + profile](TASK-09_results-panel-and-profile.md) | frontend — R3 Map & Planner UI: Saba Atharique (T09.06 integration: Anjim Hossain) | M3 (06 §C.1 *When*: P 9–10 Nov / E) | pre-event-if-permitted | 9 | 12.5–19.5 |
| TASK-10 | [POI detail + Conditions panel](TASK-10_poi-detail-and-conditions.md) | frontend — R3 Map & Planner UI: Saba Atharique | M5 (at the event, Day 1 by 12:30; 06 §C.1 *When*: E) · T10.04 in M7 | event-only | 4 | 4–6.5 |
| TASK-11 | [Briefing card + JSON export](TASK-11_briefing-card-and-export.md) | frontend and design — R3 Map & Planner UI: Saba Atharique | M4 (06 §C.1 *When*: P 10–11 Nov, moved from the event) | pre-event-if-permitted | 8 | 10–13 |
| TASK-12 | [Sources & Methods + provenance attributes](TASK-12_sources-methods-provenance.md) | story — an R6 task done by Mishkat Ahmed Khan (06 §A.2) | M2 (records, metric component) · M3–M4 (DOM tests) · M4b (SCR-09 verify); 06 §C.1 *When*: P/E | pre-event-if-permitted; T12.04 and T12.05 are pre-event-allowed | 7 | 9–13.5 |
| TASK-13 | [Visual system + accessibility](TASK-13_visual-system-accessibility.md) | design — R6 design system: Ridita Alam | M1 (tokens, fonts, wireframes) · M2 (components, HUD tokens) · M4 (accessibility checks); 06 §C.1 *When*: P 6–9 Nov | pre-event-if-permitted; T13.01–T13.03, T13.11–T13.13 are pre-event-allowed | 13 | 14–22 |
| TASK-14 | [Integration + offline hardening + fault tests](TASK-14_integration-offline-hardening.md) | integration — Integration lead: Anjim Hossain (the dry runs are all-hands) | M1 (dependency batch, CI) · M4 (hardening and fault tests, 11 Nov dry run); 06 §C.1 *When*: P 10–12 Nov / E | pre-event-if-permitted; T14.01 and T14.02 are pre-event-allowed | 11 | 13.5–22 |
| TASK-15 | [Usability test](TASK-15_usability-test.md) | design — R6 design system: Ridita Alam | M3 (script, 10 Nov) · M3b–M4 (sessions and fixes, 10–11 Nov; moved from the event in 06 v2.2) | pre-event-allowed | 4 | 3.5–5.5 |
| TASK-16 | [Submission package](TASK-16_submission-package.md) | story — R6: Obidit Islam (submission); T16.02 spec sync: Sadman Shaharier Mahim | M2 (skeleton: T16.01, T16.02, T16.07) · M8 (final, Day 2 06:00 → 09:00) | pre-event-allowed, except T16.06 (event-only) | 7 | 7–12.5 |
| TASK-17 | [Videos](TASK-17_videos.md) | story — R6: Sadman Shaharier Mahim (Obidit Islam helps) | M3 (scripts and storyboard, 10 Nov) · M6 (240-s video, Day 1 18:30) · M8 (30-s video, Day 2 09:00) | pre-event-allowed (T17.01); event-only (T17.02–T17.04) | 4 | 5–9 |
| TASK-18 | [Desirables (only after freeze criteria met early)](TASK-18_desirables.md) | data, compute, frontend — unassigned: whoever finishes their own tasks, only after M3 passes (06 §A.2) | M4b–M7: only after M3 passes on 10 Nov, cheapest first (06 §C.1 *When*: P 10–12 Nov, otherwise E after the M7 gate); T18.08 caching in M2 | pre-event-if-permitted (T18.08, T18.13 pre-event-allowed) | 13 | 15–21.5 |
| TASK-20 | [Hab Core skeleton: server, protocol v0, LAN spike](TASK-20_hab-core-skeleton.md) | hab-core — R4 Hab Core: Sadman Shaharier Mahim (Anjim Hossain supports) | M1 (protocol v0 frozen and LAN spike go/no-go on Sat 7 Nov); client and reconnect by M3 | pre-event-if-permitted (T20.01 and T20.02 are pre-event-allowed) | 9 | 9.5–14.5 |
| TASK-21 | [Scenario builder: SPICE, DONKI and RAD tables, `scenario.json`, demo numbers](TASK-21_scenario-builder.md) | data — R1 Data & GIS: Obidit Islam (tables); story — R6: Sadman Shaharier Mahim (script and demo numbers) | M2 (scenario tables validated, Mon 9 Nov) | pre-event-allowed (T21.11 is pre-event-if-permitted) | 14 | 15–21.5 |
| TASK-22 | [Simulation engine: clock, crew motion, consumables, alerts, event log, replay](TASK-22_simulation-engine.md) | hab-core — R4 Hab Core: Sadman Shaharier Mahim (Anjim Hossain supports) | M1 (contract and fake scenario 7 Nov) → M3 (headless replay stable, 10 Nov) | pre-event-if-permitted (T22.01 and T22.02 are pre-event-allowed) | 16 | 16–23 |
| TASK-23 | [Safety ops in the Hab Core: commands, haven per tick, summon and rendezvous, contingency options, abort](TASK-23_safety-ops.md) | hab-core — R4 Hab Core: Sadman Shaharier Mahim (commands, summon, options); compute — R2: Anjim Hossain (haven per tick) | M3 (killer demo steps 0:30–1:10 headless, 10 Nov) | pre-event-if-permitted | 9 | 10–13 |
| TASK-24 | [EVA client and HUD: SCR-12 tablet, SCR-13 HUD, SCR-14 options sheet, SCR-18 link lost, full-screen map](TASK-24_eva-client-and-hud.md) | frontend — R5 EVA & Ops UI: Ridita Alam (Saba Atharique supports on the shared map) | M2 (screens on mock fixtures, 7–9 Nov) → M3 (connected to the Hab Core, 10 Nov) → M4 (dry run, 11 Nov) | pre-event-if-permitted (T24.01 is pre-event-allowed) | 12 | 14.5–19.5 |
| TASK-25 | [Ops console: SCR-11 with the shared map, alerts, options approval, clock control, SCR-10 join](TASK-25_ops-console.md) | frontend — R5 EVA & Ops UI: Ridita Alam; R3: Saba Atharique (map layers) | M2 (on mock fixtures, 8–9 Nov) → M3 (connected, 10 Nov) → M4 (dry run, 11 Nov) | pre-event-if-permitted | 10 | 11–15 |
| TASK-26 | [Links: surface link graph and `LINK_STATE`, comm-shadow warnings, Earth link widget and delayed queue](TASK-26_links.md) | compute — R2/R4: Anjim Hossain (Mishkat Ahmed Khan supports) | M3 (9–11 Nov) | pre-event-if-permitted | 8 | 6–9 |
| TASK-27 | [Event log view, post-EVA report, replay mode for GitHub Pages](TASK-27_report-and-replay.md) | frontend — R5: Ridita Alam (report, log view); R3: Saba Atharique (replay mode) | Report view on 11 Nov (06 §F); the rest at the event (M7) | event-only (T27.01, T27.02 and T27.04 are pre-event-if-permitted) | 7 | 6–8.5 |
| TASK-28 | [Network kit and rehearsal: router, static IP, QR join, device matrix, venue checklist](TASK-28_network-kit.md) | integration — Integration lead: Anjim Hossain | M1 (router ready for the LAN spike, 7 Nov) → M4 (dry run, 11 Nov) | pre-event-allowed (T28.02 is pre-event-if-permitted) | 5 | 3–4.5 |
| TASK-29 | [Robotic rover tasking: SCOUT, CARRY, RELAY, RETURN](TASK-29_rover-tasking.md) | compute — R2: Mishkat Ahmed Khan (handler, routing, relay coverage, engine module); frontend — R3: Saba Atharique (SCR-15, queue display) | M3 (9–10 Nov; moved to Tier 1 on 5 Nov) | pre-event-if-permitted | 7 | 5.5–8.5 |
| TASK-30 | [Score-sheet single points: challenge named, repo public, page drafted, AI use current](TASK-30_score-sheet-points.md) | story — R6: Obidit Islam (submission and project page) | M0 (5–6 Nov), then continuous to M8 | pre-event-allowed | 3 | 1.5–2 |
| TASK-31 | [Stop task list (FR-50): protocol, engine, EVA list, ops progress, task text](TASK-31_stop-task-list.md) | hab-core — R4: Anjim Hossain (engine); frontend — R5: Ridita Alam (UI); story — R6: Sadman Shaharier Mahim (task text) | M1 (contract, done 6 Nov) → M3 (engine and UI, 8–10 Nov) | pre-event-if-permitted (T31.01 and T31.02 are pre-event-allowed) | 9 | 9–11.5 |
| TASK-32 | [Live operations session: presenter panel, event on demand, mission setup, stop task library](TASK-32_live-session.md) | hab-core — R4 Hab Core: Sadman Shaharier Mahim (all subtasks, including the SCR-19, SCR-20 and planner task editing UI) | M4 (offline dry run 11 Nov); planner task editing M4b; `TODO(decision)` in 06 §C.2 | pre-event-allowed (contract, spec-change, fixture, data); pre-event-if-permitted (code) | 32 | 50–68 |

Estimates are the sums of the subtasks' low and high estimates, computed by `scripts/check_tasks.py --summary`; they include fallbacks and desirables that may never run.

## Hours per group and window

| Lane | Milestone | Window | Subtasks | Estimate (h) |
| --- | --- | --- | --- | --- | --- | --- |
| TASK-00 | [Resolve rules + register](TASK-00_resolve-rules-and-register.md) | story — Design & story lead (06 §C owner: Story lead); T00.04 is integration — Compute engineer | M0 (done 4 Nov); T00.06 runs to M2 (venue, U-14) | pre-event-allowed | 6 | 3–4 |
| TASK-01 | [Feasibility: AOI, DEM quality, coverage checks](TASK-01_feasibility.md) | data — Data/GIS lead (06 §C owner: Data lead) | M0 (kickoff 6 Nov: AOI and hab position proposed); 06 §C.1 *When*: P 6–7 Nov | pre-event-allowed | 7 | 9–14.5 |
| TASK-02 | [Spike: OpenLayers custom Mars projection + custom tile grid](TASK-02_projection-spike.md) | frontend — Frontend engineer | M1 (spike go/no-go Sat 7 Nov; 06 §C.1 *When*: P 6–7 Nov) | T02.01, T02.05 pre-event-allowed; the code subtasks pre-event-if-permitted (Track P) | 6 | 5–7 |
| TASK-03 | [Preprocessing pipeline](TASK-03_preprocessing-pipeline.md) | data — Data/GIS lead | M1 (contracts, mock site) · M2 (pipeline, bundle v1, `comm_hab`, clean re-run; by Mon 9 Nov) · M4 (candidate hab sites, F4 tile levels, rank-1 asset id) | pre-event-allowed | 37 | 50.5–76 |
| TASK-04 | [Vectors, POIs and images](TASK-04_vectors-pois-images.md) | data — Data/GIS lead (T04.01–T04.03, T04.07–T04.09); story — Design & story lead (T04.04–T04.06). 06 §C owner: Story lead + Data lead | M2 (06 §C.1 *When*: P 6–9 Nov) | pre-event-allowed | 11 | 13.5–22.5 |
| TASK-05 | [Compute core: grid loader, sampling, A*, profile, time model, walkback, warnings](TASK-05_compute-core.md) | compute — Compute engineer | M1 (contracts, fixtures) · M2 (everything else; 06 §C.1 *When*: P 6–9 Nov) | pre-event-if-permitted (Track P code); T05.01, T05.03 and T05.29 are pre-event-allowed | 32 | 39–58.5 |
| TASK-05b | [Compute v2: haven, rendezvous, viewshed, link graph, Earth delivery, event dose, consumables, contingency](TASK-05b_compute-v2.md) | compute — R2 Compute: Mishkat Ahmed Khan (haven, rendezvous, contingency, benchmarks) and Anjim Hossain (viewshed, link graph, Earth delivery, event dose, consumables) | M1 (Dijkstra benchmark go/no-go Sat 7 Nov) → M3 (real-grid checks, 10 Nov) | pre-event-if-permitted (T05b.01 and T05b.02 are pre-event-allowed) | 21 | 20–28.5 |
| TASK-06 | [Mars24 solar functions + radiation estimate](TASK-06_mars24-and-radiation.md) | compute — Compute engineer | M1 (contract, fixture, records) · M2 (code; 06 §C.1 *When*: P 7–9 Nov) | pre-event-if-permitted (Track P code); T06.01, T06.02 and T06.10 are pre-event-allowed | 11 | 12–20 |
| TASK-07 | [App shell + map workspace + layers panel + inspector](TASK-07_app-shell-and-map-workspace.md) | frontend — Frontend engineer (T07.14: story — Design & story lead) | M1 (contract T07.01, demo plan T07.14) · M2 (everything else, incl. T07.17) · M3 (T07.18); 06 §C.1 *When*: P 7–9 Nov | pre-event-if-permitted; T07.01 and T07.14 are pre-event-allowed | 18 | 26–38.5 |
| TASK-08 | [Plan panel + waypoint editing](TASK-08_plan-panel-and-waypoints.md) | frontend — Frontend engineer | M2 (contract T08.01) · M3 (everything else; 06 §C.1 *When*: P 8–10 Nov) | pre-event-if-permitted; T08.01 is pre-event-allowed | 12 | 18.5–27.5 |
| TASK-09 | [Results panel + profile](TASK-09_results-panel-and-profile.md) | frontend — Frontend engineer (06 §C owner: Frontend + Compute); T09.06 is integration — Compute engineer | M3 (06 §C.1 *When*: P 9–10 Nov / E) | pre-event-if-permitted | 9 | 12.5–19.5 |
| TASK-10 | [POI detail + Conditions panel](TASK-10_poi-detail-and-conditions.md) | frontend — Frontend engineer | M5 (at the event, Day 1 by 12:30; 06 §C.1 *When*: E) · T10.04 in M7 | event-only | 4 | 4–6.5 |
| TASK-11 | [Briefing card + JSON export](TASK-11_briefing-card-and-export.md) | frontend (T11.01, T11.02, T11.04, T11.06) — Frontend engineer; design (T11.03, T11.05) — Design & story lead. 06 §C owner: Design lead + Frontend | M4 (06 §C.1 *When*: P 10–11 Nov, moved from the event) | pre-event-if-permitted | 8 | 10–13 |
| TASK-12 | [Sources & Methods + provenance attributes](TASK-12_sources-methods-provenance.md) | story — Design & story lead (06 §C owner: Story lead) | M2 (records, metric component) · M3–M4 (DOM tests) · M4b (SCR-09 verify); 06 §C.1 *When*: P/E | pre-event-if-permitted; T12.04 and T12.05 are pre-event-allowed | 7 | 9–13.5 |
| TASK-13 | [Visual system + accessibility](TASK-13_visual-system-accessibility.md) | design — Design & story lead (06 §C: Design lead) | M1 (tokens, fonts, wireframes) · M2 (components, HUD tokens) · M4 (accessibility checks); 06 §C.1 *When*: P 6–9 Nov | pre-event-if-permitted; T13.01–T13.03, T13.11–T13.13 are pre-event-allowed | 13 | 14–22 |
| TASK-14 | [Integration + offline hardening + fault tests](TASK-14_integration-offline-hardening.md) | integration — Compute engineer (06 §C names Compute as TASK-14 owner) | M1 (dependency batch, CI) · M4 (hardening and fault tests, 11 Nov dry run); 06 §C.1 *When*: P 10–12 Nov / E | pre-event-if-permitted; T14.01 and T14.02 are pre-event-allowed | 11 | 13.5–22 |
| TASK-15 | [Usability test](TASK-15_usability-test.md) | design — Design & story lead (06 §C owner: Design lead) | M3 (script, 10 Nov) · M3b–M4 (sessions and fixes, 10–11 Nov; moved from the event in 06 v2.2) | pre-event-allowed | 4 | 3.5–5.5 |
| TASK-16 | [Submission package](TASK-16_submission-package.md) | story — Design & story lead (06 §C owner: Story lead); T16.02 is integration — Compute engineer | M2 (skeleton: T16.01, T16.02, T16.07) · M8 (final, Day 2 06:00 → 09:00) | pre-event-allowed, except T16.06 (event-only) | 7 | 7–12.5 |
| TASK-17 | [Videos](TASK-17_videos.md) | story — Design & story lead (06 §C owner: Story lead) | M3 (scripts and storyboard, 10 Nov) · M6 (240-s video, Day 1 18:30) · M8 (30-s video, Day 2 09:00) | pre-event-allowed (T17.01); event-only (T17.02–T17.04) | 4 | 5–9 |
| TASK-18 | [Desirables (only after freeze criteria met early)](TASK-18_desirables.md) | Any (06 §C). Per subtask: data — Data/GIS lead (T18.01, T18.02); compute — Compute engineer (T18.04, T18.05); frontend — Frontend engineer (T18.03, T18.06, T18.07) | M4b–M7: only after M3 passes on 10 Nov, cheapest first (06 §C.1 *When*: P 10–12 Nov, otherwise E after the M7 gate); T18.08 caching in M2 | pre-event-if-permitted (T18.08, T18.13 pre-event-allowed) | 13 | 15–21.5 |
| TASK-20 | [Hab Core skeleton: server, protocol v0, LAN spike](TASK-20_hab-core-skeleton.md) | hab-core — R4 Hab Core: Sadman Shaharier Mahim (Anjim Hossain supports) | M1 (protocol v0 frozen and LAN spike go/no-go on Sat 7 Nov); client and reconnect by M3 | pre-event-if-permitted (T20.01 and T20.02 are pre-event-allowed) | 9 | 9.5–14.5 |
| TASK-21 | [Scenario builder: SPICE, DONKI and RAD tables, `scenario.json`, demo numbers](TASK-21_scenario-builder.md) | data — R1 Data & GIS: Obidit Islam (tables); story — R6: Sadman Shaharier Mahim (script and demo numbers) | M2 (scenario tables validated, Mon 9 Nov) | pre-event-allowed (T21.11 is pre-event-if-permitted) | 14 | 15–21.5 |
| TASK-22 | [Simulation engine: clock, crew motion, consumables, alerts, event log, replay](TASK-22_simulation-engine.md) | hab-core — R4 Hab Core: Sadman Shaharier Mahim (Anjim Hossain supports) | M1 (contract and fake scenario 7 Nov) → M3 (headless replay stable, 10 Nov) | pre-event-if-permitted (T22.01 and T22.02 are pre-event-allowed) | 16 | 16–23 |
| TASK-23 | [Safety ops in the Hab Core: commands, haven per tick, summon and rendezvous, contingency options, abort](TASK-23_safety-ops.md) | hab-core — R4 Hab Core: Sadman Shaharier Mahim (commands, summon, options); compute — R2: Anjim Hossain (haven per tick) | M3 (killer demo steps 0:30–1:10 headless, 10 Nov) | pre-event-if-permitted | 9 | 10–13 |
| TASK-24 | [EVA client and HUD: SCR-12 tablet, SCR-13 HUD, SCR-14 options sheet, SCR-18 link lost, full-screen map](TASK-24_eva-client-and-hud.md) | frontend — R5 EVA & Ops UI: Ridita Alam (Saba Atharique supports on the shared map) | M2 (screens on mock fixtures, 7–9 Nov) → M3 (connected to the Hab Core, 10 Nov) → M4 (dry run, 11 Nov) | pre-event-if-permitted (T24.01 is pre-event-allowed) | 12 | 14.5–19.5 |
| TASK-25 | [Ops console: SCR-11 with the shared map, alerts, options approval, clock control, SCR-10 join](TASK-25_ops-console.md) | frontend — R5 EVA & Ops UI: Ridita Alam; R3: Saba Atharique (map layers) | M2 (on mock fixtures, 8–9 Nov) → M3 (connected, 10 Nov) → M4 (dry run, 11 Nov) | pre-event-if-permitted | 10 | 11–15 |
| TASK-26 | [Links: surface link graph and `LINK_STATE`, comm-shadow warnings, Earth link widget and delayed queue](TASK-26_links.md) | compute — R2/R4: Anjim Hossain (Mishkat Ahmed Khan supports) | M3 (9–11 Nov) | pre-event-if-permitted | 8 | 6–9 |
| TASK-27 | [Event log view, post-EVA report, replay mode for GitHub Pages](TASK-27_report-and-replay.md) | frontend — R5: Ridita Alam (report, log view); R3: Saba Atharique (replay mode) | Report view on 11 Nov (06 §F); the rest at the event (M7) | event-only (T27.01, T27.02 and T27.04 are pre-event-if-permitted) | 7 | 6–8.5 |
| TASK-28 | [Network kit and rehearsal: router, static IP, QR join, device matrix, venue checklist](TASK-28_network-kit.md) | integration — Integration lead: Anjim Hossain | M1 (router ready for the LAN spike, 7 Nov) → M4 (dry run, 11 Nov) | pre-event-allowed (T28.02 is pre-event-if-permitted) | 5 | 3–4.5 |
| TASK-29 | [Robotic rover tasking: SCOUT, CARRY, RELAY, RETURN](TASK-29_rover-tasking.md) | compute — R2: Mishkat Ahmed Khan (handler, routing, relay coverage, engine module); frontend — R3: Saba Atharique (SCR-15, queue display) | M3 (9–10 Nov; moved to Tier 1 on 5 Nov) | pre-event-if-permitted | 7 | 5.5–8.5 |
| TASK-30 | [Score-sheet single points: challenge named, repo public, page drafted, AI use current](TASK-30_score-sheet-points.md) | story — R6: Obidit Islam (submission and project page) | M0 (5–6 Nov), then continuous to M8 | pre-event-allowed | 3 | 1.5–2 |
| TASK-31 | [Stop task list (FR-50): protocol, engine, EVA list, ops progress, task text](TASK-31_stop-task-list.md) | hab-core — R4: Anjim Hossain (engine); frontend — R5: Ridita Alam (UI); story — R6: Sadman Shaharier Mahim (task text) | M1 (contract, done 6 Nov) → M3 (engine and UI, 8–10 Nov) | pre-event-if-permitted (T31.01 and T31.02 are pre-event-allowed) | 9 | 9–11.5 |

**Capacity.** 06 §A v2.2 gives 288–360 person-hours over the 6 build days and ≈ 100 at the event. Without fallbacks and desirables the subtasks sum to 341.5–511 h: above 06 §C's own 160–245 h for the same work, and above pre-event capacity at the high end. The subtask estimates are planning guesses written while atomizing (splitting each package into tests, implementation and checks adds overhead), not measurements. **Re-check them at the kickoff** before relying on the slack in 06 §A; if the real pace is near the high end, the dependencies in 06 §D.3 and the contingency cut list ([map §h.6](_coordination.md#h6-cut-list--subtasks-06-d4)) decide what moves.

## Start here

Subtasks with no hard dependency, by group (fallbacks excluded). Soft dependencies still need their contract or fixture merged.

- story: T00.01, T00.02, T00.06, T12.01, T12.05, T16.01, T16.07, T17.01, T30.01, T30.02
- data: T01.01, T01.02, T03.01, T03.02, T03.03, T03.04, T03.05, T03.06, T03.12, T03.15, T03.28, T04.11, T21.01, T21.02, T21.03, T21.06
- frontend: T02.01, T02.02, T07.01, T07.02, T07.04, T08.01, T09.01, T09.03, T09.04, T10.01, T10.02, T24.01, T24.02, T24.10, T25.07, T27.02, T31.07
- compute: T05.01, T05.02, T05.03, T05.04, T05.05, T05.06, T05.07, T05.08, T05.09, T05.10, T05.11, T05.12, T05.13, T05.14, T05.15, T05b.01, T05b.02, T05b.03, T05b.06, T05b.08, T05b.10, T05b.12, T05b.14, T05b.16, T05b.18, T06.01, T06.03, T06.04, T06.05, T06.10, T26.03, T26.06, T29.01
- design: T13.01, T13.02, T13.03, T13.05, T13.06, T13.08, T13.11, T15.01
- integration: T14.01, T14.02, T28.01
- hab-core: T20.01, T20.03, T20.05, T22.01, T22.02, T22.03, T22.05, T22.08, T22.11, T23.01, T23.04, T23.06, T31.01, T31.03

First wave, startable today (no dependency at all, `pre-event-allowed`, not `test` or `implement`):

- story: T00.01, T00.02, T00.06, T16.01, T16.07, T17.01, T30.01, T30.02
- data: T01.01, T01.02, T03.01, T04.11, T21.02, T21.06
- frontend: T02.01
- design: T13.01, T13.03, T15.01
- integration: T14.01, T14.02, T28.01
- hab-core: T31.01

## How to claim a subtask

1. Pick an unclaimed row in the claims table below whose dependencies have merged.
2. Open a one-line PR that writes your name or agent id into its *Claimed by* cell, and only that cell. Merge it before you start.
3. Work on branch `<id>-<slug>` (e.g. `t05.18-astar-core`) in your own worktree, following [map §h](_coordination.md#h-working-conventions).
4. Clear the cell if you stop. If the team moves to GitHub issues, the issue title starts with the subtask id and replaces the cell.

## Checking the plan

```sh
python3 scripts/check_tasks.py              # every rule; exit 1 on a problem
python3 scripts/check_tasks.py --summary    # tables above, start-here list, cross-task edges
python3 scripts/check_tasks.py --file docs/tasks/TASK-05_compute-core.md   # one file
```

## Claims

| ID | Subtask | Lane | Window | M | Claimed by |
| --- | --- | --- | --- | --- | --- |
| T00.01 | Check the Space Apps rules page and Participants Guide for the pre-event code rule | story | pre-event-allowed | M0 | |
| T00.02 | Ask the Dhaka Local Lead; confirm every member is registered (NASA site + Bangladesh form) | story | pre-event-allowed | M0 | |
| T00.03 | Record the answer, registration status and Track S or P in `docs/ops/rules.md` | story | pre-event-allowed | M0 | |
| T00.04 | Update the phase-gate line in `CLAUDE.md` and `AGENTS.md` for the recorded track | integration | pre-event-allowed | M0 | |
| T00.05 | Fallback — start only if no answer by 4 Nov (U-12 due date): declare Track S | story | pre-event-allowed | M0 | |
| T00.06 | Record team roster and skills (U-13) and venue type (U-14) | story | pre-event-allowed | M0–M2 | |
| T01.01 | Download the 1 m Gale DEM; record its PDS3 label datum and no-data value | data | pre-event-allowed | M0 | |
| T01.02 | Propose AOI bounds from Curiosity's 2025 traverse, inside the DEM extent | data | pre-event-allowed | M0 | |
| T01.03 | Judge DEM quality in the AOI from a hillshade; measure one reference feature | data | pre-event-allowed | M0 | |
| T01.04 | Check THEMIS TI tile, colour HiRISE COG and CRISM coverage of the AOI by window reads | data | pre-event-allowed | M0 | |
| T01.05 | Decide D-01; write the feasibility summary and ADR-001 | data | pre-event-allowed | M0 | |
| T01.06 | Fallback — start only if T01.05 finds the AOI DEM is not HiRISE-quality: spec-change to Jezero and re-plan | data | pre-event-allowed | M0 | |
| T01.07 | Choose the hab site inside the AOI (v2) | data | pre-event-allowed | M0 | |
| T02.01 | Write the tile-grid and tile-encoding contract v1 | frontend | pre-event-allowed | M1 | |
| T02.02 | Implement the Mars projection module with a web CRS-guard test | frontend | pre-event-if-permitted | M1 | |
| T02.03 | Build the spike page: mock-site tiles in the Mars projection with a metric scale bar | frontend | pre-event-if-permitted | M1 | |
| T02.04 | Verify the scale bar against a DEM-measured feature within 2 % on real AOI tiles | frontend | pre-event-if-permitted | M1 | |
| T02.05 | Record the spike outcome in ADR-003 (D-03) | frontend | pre-event-allowed | M1 | |
| T02.06 | Fallback — start only if the spike fails within 2 h: ImageStatic layer factory in the Mars projection | frontend | pre-event-if-permitted | M1 | |
| T03.01 | Freeze data contracts v1: 05 entity mirror, grid binary layout, site-config input layout | data | pre-event-allowed | M1 | |
| T03.02 | Fixture: mock site bundle (manifest, placeholder tiles, tiny grid, sample POI and traverse GeoJSON) | data | pre-event-allowed | M1 | |
| T03.03 | Tests: projection and raster handling (02 §C.1, §C.4) | data | pre-event-allowed | M2 | |
| T03.04 | Tests: slope, hillshade, aggregation and hazard flags | data | pre-event-allowed | M2 | |
| T03.05 | Tests: routing-grid encoding | data | pre-event-allowed | M2 | |
| T03.06 | Tests: manifest integrity, sampled values, bundle size | data | pre-event-allowed | M2 | |
| T03.07 | Implement config (working projection for the AOI) and source acquisition | data | pre-event-allowed | M2 | |
| T03.08 | Implement clip/reproject and DEM no-data → NaN | data | pre-event-allowed | M2 | |
| T03.09 | Implement Horn slope, hillshade and p90/max aggregation | data | pre-event-allowed | M2 | |
| T03.10 | Implement the hazard-flag bitfield | data | pre-event-allowed | M2 | |
| T03.11 | Implement the routing-grid writer (u8 slope encoding, little-endian arrays, TI sidecar) | data | pre-event-allowed | M2 | |
| T03.12 | Implement tile rendering per the tile-grid contract | data | pre-event-allowed | M2 | |
| T03.13 | Implement the manifest writer from site-config records and assets | data | pre-event-allowed | M2 | |
| T03.14 | Implement `validate-manifest` | data | pre-event-allowed | M2 | |
| T03.15 | Implement the pipeline entry point (`python -m marswalk_pipeline`) | data | pre-event-allowed | M2 | |
| T03.16 | Write the site record (AOI, default start, data version) | data | pre-event-allowed | M2 | |
| T03.17 | Write DataSource and Layer records for the DEM, ortho and THEMIS layers | data | pre-event-allowed | M2 | |
| T03.18 | Digitise HARD_HAZARD features and LOW_RES_DEM coverage | data | pre-event-allowed | M2 | |
| T03.19 | Run the pipeline; commit bundle v1 (manifest, vectors, lock file) | data | pre-event-allowed | M2 | |
| T03.20 | Verify DEM hillshade vs ortho alignment; record the offset | data | pre-event-allowed | M2 | |
| T03.21 | Fixture: real-grid sample cells from a `rasterio` readout | data | pre-event-allowed | M2 | |
| T03.22 | Verify a clean-checkout re-run reproduces checksums; bundle ≤ 250 MB | data | pre-event-allowed | M2 | |
| T03.23 | Fallback — start only if tiling is too slow: lower the max zoom | data | pre-event-allowed | M2 | |
| T03.24 | Fallback — start only if the 5 m grid is too big or slow: 10 m cells | data | pre-event-allowed | M2 | |
| T03.25 | Fallback — start only if the T02 spike fails: one PNG per 2 m layer for ImageStatic | data | pre-event-allowed | M2 | |
| T03.26 | Fallback — start only if the colour COG misses the AOI: grayscale 25 cm window or cached Mars Trek HiRISE tiles | data | pre-event-allowed | M2 | |
| T03.27 | Fallback — start only if quantitative TI misses the AOI: THEMIS Day IR 100 m (qualitative) | data | pre-event-allowed | M2 | |
| T03.28 | Tests: `comm_hab` viewshed grid (v2) | data | pre-event-allowed | M2 | |
| T03.29 | Implement the `comm_hab` viewshed grid and its layer record (v2) | data | pre-event-allowed | M2 | |
| T03.30 | Verify `comm_hab` against `gdal_viewshed` at 5 points (v2) | data | pre-event-allowed | M2 | |
| T03.31 | contract-change: C1, C2 and C5 v2 — optional `hab_candidates` (HabCandidate) in the site manifest | data | pre-event-allowed | M4 | |
| T03.32 | Candidate hab site records: the first choice and the alternative | data | pre-event-allowed | M4 | |
| T03.33 | Tests: per-candidate `comm_hab` grids, the manifest `hab_candidates` list and its validator rules | data | pre-event-allowed | M4 | |
| T03.34 | follow-up: build a `comm_hab` grid and a default start for each hab candidate; manifest and validator | data | pre-event-allowed | M4 | |
| T03.35 | Verify both hab candidates on the real site: validator passes, alternative `comm_hab` against `gdal_viewshed` | data | pre-event-allowed | M4 | |
| T03.36 | follow-up: F4 mock site ships placeholder tiles for every `tile_grid` level | data | pre-event-allowed | M4 | |
| T03.37 | spec-change: 05 rank-1 hab candidate keeps `grid-comm-hab`; other candidates `grid-comm-<candidate_id>` | data | pre-event-allowed | M4 | |
| T04.01 | Choose and cache the traverse source (U-04); write its DataSource and Layer records | data | pre-event-allowed | M2 | |
| T04.02 | Tests: traverse and POI packaging | data | pre-event-allowed | M2 | |
| T04.03 | Implement traverse and POI packaging | data | pre-event-allowed | M2 | |
| T04.04 | Curate POIs 1–4 with images, credits and position sources; write the POI layer record | story | pre-event-allowed | M2 | |
| T04.05 | Curate POIs 5–8 (at least one, to reach the 5-POI minimum) | story | pre-event-allowed | M2 | |
| T04.06 | Write the dataset and image credits list | story | pre-event-allowed | M2 | |
| T04.07 | Resolve U-03: TI "loose fines" threshold from the AOI histogram and literature | data | pre-event-allowed | M2 | |
| T04.08 | Verify traverse alignment with HiRISE tracks at the checkpoints; record the offset | data | pre-event-allowed | M2 | |
| T04.09 | Fallback — start only if PLACES parsing is too slow: MMGIS JSON cached once, labelled unofficial | data | pre-event-allowed | M2 | |
| T04.10 | Write the Exploration Zone framing and the stop-type list (v2, FR-45, U-16) | story | pre-event-allowed | M2 | |
| T04.11 | Check the dust-record source for the scenario window (v2, U-17) | data | pre-event-allowed | M2 | |
| T05.01 | Freeze compute contracts v1: worker protocol and compute module layout | compute | pre-event-allowed | M1 | |
| T05.02 | Fixture: synthetic routing grids | compute | pre-event-if-permitted | M1 | |
| T05.03 | Fixture: canned PLAN_RESULT messages (OK, PARTIAL, OVER_LIMITS) | compute | pre-event-allowed | M1 | |
| T05.04 | Fixture: mock worker answering from the canned fixtures | compute | pre-event-if-permitted | M1 | |
| T05.05 | Tests: grid loader and addressing | compute | pre-event-if-permitted | M2 | |
| T05.06 | Tests: point and profile sampling | compute | pre-event-if-permitted | M2 | |
| T05.07 | Tests: A* core (gap, re-sample, determinism, TIMEOUT) | compute | pre-event-if-permitted | M2 | |
| T05.08 | Tests: no-route reasons and nearest reachable cell | compute | pre-event-if-permitted | M2 | |
| T05.09 | Tests: snapping | compute | pre-event-if-permitted | M2 | |
| T05.10 | Tests: leg assembly (metrics, simplification, profile) | compute | pre-event-if-permitted | M2 | |
| T05.11 | Tests: walking-time model | compute | pre-event-if-permitted | M2 | |
| T05.12 | Tests: walkback | compute | pre-event-if-permitted | M2 | |
| T05.13 | Tests: warnings and plan status | compute | pre-event-if-permitted | M2 | |
| T05.14 | Tests: input validation (02 §E.3) | compute | pre-event-if-permitted | M2 | |
| T05.15 | Tests: worker handler and cancellation | compute | pre-event-if-permitted | M2 | |
| T05.16 | Implement the grid loader | compute | pre-event-if-permitted | M2 | |
| T05.17 | Implement point and profile sampling | compute | pre-event-if-permitted | M2 | |
| T05.18 | Implement the A* least-time search | compute | pre-event-if-permitted | M2 | |
| T05.19 | Implement no-route reasons and nearest reachable cell | compute | pre-event-if-permitted | M2 | |
| T05.20 | Implement snapping | compute | pre-event-if-permitted | M2 | |
| T05.21 | Implement leg assembly | compute | pre-event-if-permitted | M2 | |
| T05.22 | Implement the walking-time model | compute | pre-event-if-permitted | M2 | |
| T05.23 | Implement walkback | compute | pre-event-if-permitted | M2 | |
| T05.24 | Implement warnings and plan status | compute | pre-event-if-permitted | M2 | |
| T05.25 | Implement input validation | compute | pre-event-if-permitted | M2 | |
| T05.26 | Implement the worker handler, minimum slice: SAMPLE_POINT and legs-only PLAN_RESULT | compute | pre-event-if-permitted | M2 | |
| T05.27 | Implement the worker entry: grid initialisation, latest-revision cancellation | compute | pre-event-if-permitted | M2 | |
| T05.28 | Verify on the real grid: 10 sampled cells; 20 pairs p50/p95; 3-stop loop ≤ 2 s | compute | pre-event-if-permitted | M2 | |
| T05.29 | Record D-02 from the benchmark in ADR-002 | compute | pre-event-allowed | M2 | |
| T05.30 | Fallback — start only if T09.06 says no-go: manual polyline validation (compute side) | compute | pre-event-if-permitted | M2 | |
| T05.31 | Fallback — start only if T05.29 records p95 > 2 s: FastAPI `/route` with a scikit-image least-cost path | compute | pre-event-if-permitted | M2 | |
| T05.32 | follow-up: complete PLAN_RESULT assembly (totals, timeline, warnings, status, conditions) | compute | pre-event-if-permitted | M2 | |
| T06.01 | Freeze the conditions interface; move the solar functions to `sun.ts` | compute | pre-event-allowed | M1 | |
| T06.02 | Fixture: Mars24 reference values generated with `marstime` | compute | pre-event-allowed | M1 | |
| T06.03 | Tests: Mars24 time and sun functions vs `marstime` | compute | pre-event-if-permitted | M2 | |
| T06.04 | Tests: radiation estimate | compute | pre-event-if-permitted | M2 | |
| T06.05 | Tests: conditions assembly | compute | pre-event-if-permitted | M2 | |
| T06.06 | Implement the Mars24 time functions (MSD, L_s, LTST, east → west longitude) | compute | pre-event-if-permitted | M2 | |
| T06.07 | Implement solar position and flat-horizon sunrise/sunset | compute | pre-event-if-permitted | M2 | |
| T06.08 | Implement the radiation estimate | compute | pre-event-if-permitted | M2 | |
| T06.09 | Implement conditions assembly (timeline LTST, sun elevation, radiation) | compute | pre-event-if-permitted | M2 | |
| T06.10 | Write the RAD EnvConstant and DataSource records (05 §C values verbatim) | compute | pre-event-allowed | M1 | |
| T06.11 | Fallback — start only if Mars24 tests fail: precomputed sun table for the demo dates | compute | pre-event-if-permitted | M2 | |
| T07.01 | Freeze UI contracts v1: app context, screen interface, map handle, layer order, provenance attributes; create UI module stubs | frontend | pre-event-allowed | M1 | |
| T07.02 | Implement site loading (manifest fetch, `?site=` override, lookup maps) | frontend | pre-event-if-permitted | M2 | |
| T07.03 | Implement the app shell: hash router, boot sequence, CSP meta tag | frontend | pre-event-if-permitted | M2 | |
| T07.04 | Implement the worker client (request ids, latest revision, crash → retry) | frontend | pre-event-if-permitted | M2 | |
| T07.05 | Implement SCR-01 Mission Briefing | frontend | pre-event-if-permitted | M2 | |
| T07.06 | Implement the map: view, metric scale bar, north arrow, coordinate readout | frontend | pre-event-if-permitted | M2 | |
| T07.07 | Implement tiled raster layers with slope classes that follow the current limits | frontend | pre-event-if-permitted | M2 | |
| T07.08 | Implement the SCR-02 workspace layout (top bar, drawers, toolbar, responsive) | frontend | pre-event-if-permitted | M2 | |
| T07.09 | Implement SCR-03 Layers panel | frontend | pre-event-if-permitted | M2 | |
| T07.10 | Implement the Curiosity traverse layer | frontend | pre-event-if-permitted | M2 | |
| T07.11 | Implement the POI layer and POI selection | frontend | pre-event-if-permitted | M2 | |
| T07.12 | Implement the point-inspector popover | frontend | pre-event-if-permitted | M2 | |
| T07.13 | Implement `?debug=1` diagnostics | frontend | pre-event-if-permitted | M2 | |
| T07.14 | Author the demo plan (three POI stops) | story | pre-event-allowed | M1 | |
| T07.15 | Verify SCR-01, SCR-02, SCR-03: toggles ≤ 300 ms, inspector values match the grid | frontend | pre-event-if-permitted | M2 | |
| T07.16 | Fallback — start only if projection issues persist: ImageStatic layers | frontend | pre-event-if-permitted | M2 | |
| T07.17 | Implement the shared map controls (+, −, FIT for planner and ops; EVA full-screen set) (v2) | frontend | pre-event-if-permitted | M2 | |
| T07.18 | Implement the Exploration Zone layer: POI stop types on the map (v2, FR-45) | frontend | pre-event-if-permitted | M3 | |
| T08.01 | Freeze the plan-store contract v1 (state, status, actions, selection) | frontend | pre-event-allowed | M2 | |
| T08.02 | Tests: plan store (revisions, undo, debounce, stale results) | frontend | pre-event-if-permitted | M3 | |
| T08.03 | Implement the plan store | frontend | pre-event-if-permitted | M3 | |
| T08.04 | Implement the SCR-04 panel and mission-inputs form | frontend | pre-event-if-permitted | M3 | |
| T08.05 | Implement the stops list (reorder buttons, delete, undo) | frontend | pre-event-if-permitted | M3 | |
| T08.06 | Implement waypoint markers and placement validation with a snap offer | frontend | pre-event-if-permitted | M3 | |
| T08.07 | Implement Add-stop mode (free placement, `A`, crosshair `Enter`) | frontend | pre-event-if-permitted | M3 | |
| T08.08 | Implement desktop drag: waypoints on the map, rows in the stops list | frontend | pre-event-if-permitted | M3 | |
| T08.09 | Implement tablet touch: long-press placement and drag | frontend | pre-event-if-permitted | M3 | |
| T08.10 | Fallback — start only if T08.08 is not working at the Day 1 17:30 checkpoint: buttons-only stop move | frontend | pre-event-if-permitted | M3 | |
| T08.11 | Verify the 02 §E.3 rules and SCR-04 states in the UI | frontend | pre-event-if-permitted | M3 | |
| T08.12 | follow-up: haven rule input in the plan panel (v2, FR-39) | frontend | pre-event-if-permitted | M3 | |
| T09.01 | Implement the route layer (cased legs, dashed NO_ROUTE line, hazard hatch) | frontend | pre-event-if-permitted | M3 | |
| T09.02 | Implement the elevation/slope profile chart | frontend | pre-event-if-permitted | M3 | |
| T09.03 | Implement SCR-05: status banner and metrics row | frontend | pre-event-if-permitted | M3 | |
| T09.04 | Implement the warnings list with click-to-zoom | frontend | pre-event-if-permitted | M3 | |
| T09.05 | Implement profile ↔ map linking (06 fallback: ship the profile without it) | frontend | pre-event-if-permitted | M3 | |
| T09.06 | Run the M3 walking-skeleton check; decide auto-routing go/no-go in ADR-004 | integration | pre-event-if-permitted | M3 | |
| T09.07 | Verify SCR-05 states against the OK, PARTIAL and OVER_LIMITS fixtures | frontend | pre-event-if-permitted | M3 | |
| T09.08 | Fallback — start only if T09.06 says no-go: draw legs by hand on the map | frontend | pre-event-if-permitted | M3 | |
| T09.09 | follow-up: haven and comm bands in the results panel and profile (v2, FR-39, FR-42) | frontend | pre-event-if-permitted | M3 | |
| T10.01 | Implement SCR-06 POI Detail | frontend | event-only | M5 | |
| T10.02 | Implement SCR-07 Conditions | frontend | event-only | M5 | |
| T10.03 | Verify POI images with credits and the daylight warning for a pre-dawn start | frontend | event-only | M5 | |
| T10.04 | follow-up: stop types on the POI detail (v2, FR-45) | frontend | event-only | M7 | |
| T11.01 | Tests: plan hash and export (canonical JSON, schema-valid, reproducible) | frontend | pre-event-if-permitted | M4 | |
| T11.02 | Implement the plan hash and PlanExport assembly | frontend | pre-event-if-permitted | M4 | |
| T11.03 | Implement the SCR-08 layout and print CSS | design | pre-event-if-permitted | M4 | |
| T11.04 | Implement the route map snapshot | frontend | pre-event-if-permitted | M4 | |
| T11.05 | Verify one-page print in Chrome and plan_hash reproduction | design | pre-event-if-permitted | M4 | |
| T11.06 | Fallback — start only if the map snapshot cannot be made to work: static AOI thumbnail with the route as SVG | frontend | pre-event-if-permitted | M4 | |
| T11.07 | Implement `PUBLISH_PLAN` from the briefing card to the Hab Core (v2) | frontend | pre-event-if-permitted | M4 | |
| T11.08 | follow-up: the briefing card lists each stop's tasks (v2, FR-50) | frontend | pre-event-if-permitted | M4 | |
| T12.01 | Implement the metric and provenance-chip component | story | pre-event-if-permitted | M3 | |
| T12.02 | Tests: DOM provenance check across screens | story | pre-event-if-permitted | M4 | |
| T12.03 | Implement SCR-09 Sources & Methods | story | pre-event-if-permitted | M4 | |
| T12.04 | Write the methods, models and limitations content from 02 §C–§D | story | pre-event-allowed | M2 | |
| T12.05 | Write DataSource records for the models (Tobler, Apollo 17, Mars24) | story | pre-event-allowed | M2 | |
| T12.06 | Verify no unlabelled metric on the demo path and every credited source in SCR-09 | story | pre-event-if-permitted | M4b | |
| T12.07 | follow-up: provenance DOM checks on the v2 role views (SCR-11–SCR-14, SCR-17) | story | pre-event-if-permitted | M3–M4 | |
| T13.01 | Freeze CSS token and status-class names v1 against 04 §C | design | pre-event-allowed | M1 | |
| T13.02 | Self-host Inter and IBM Plex Mono; verify their licences | design | pre-event-allowed | M1 | |
| T13.03 | Sketch SCR-02 and SCR-08 wireframes on paper (04 §F) | design | pre-event-allowed | M1 | |
| T13.04 | Implement base styles: typography, focus ring, reduced motion | design | pre-event-if-permitted | M4 | |
| T13.05 | Implement status icons and patterns | design | pre-event-if-permitted | M2 | |
| T13.06 | Implement keyboard map controls (04 §E) | design | pre-event-if-permitted | M4 | |
| T13.07 | follow-up: first-run coach marks | design | pre-event-if-permitted | M4 | |
| T13.08 | Implement the light theme (U-08) | design | pre-event-if-permitted | M4 | |
| T13.09 | Verify the axe scan: 0 serious issues | design | pre-event-if-permitted | M4 | |
| T13.10 | Verify a keyboard-only run of the core scenario | design | pre-event-if-permitted | M4 | |
| T13.11 | Self-host the outline icon set and verify its licence | design | pre-event-allowed | M1 | |
| T13.12 | HUD tokens: contrast ≥ 7 : 1 (v2) | design | pre-event-allowed | M2 | |
| T13.13 | follow-up: self-host Chakra Petch 500 and Source Serif 4 400; verify their licences | design | pre-event-allowed | M4 | |
| T14.01 | Integrate dependencies and build wiring (one dependency batch, `make data`) | integration | pre-event-allowed | M1 | |
| T14.02 | Integrate CI and the PR template (subtask id, `check_tasks.py`) | integration | pre-event-allowed | M1 | |
| T14.03 | Implement boot validation (schema major version, dev-build SHA-256) | integration | pre-event-if-permitted | M4 | |
| T14.04 | Implement SCR-00 Boot error | integration | pre-event-if-permitted | M4 | |
| T14.05 | Tests: fault injection (02 §F.1 Recovery) | integration | pre-event-if-permitted | M4 | |
| T14.06 | Verify two clean offline rehearsals of the core scenario | integration | pre-event-if-permitted | M4 | |
| T14.07 | Verify NFR-02 timings on the weakest team laptop | integration | pre-event-if-permitted | M4 | |
| T14.08 | Verify the browser/device matrix and cross-browser determinism | integration | pre-event-if-permitted | M4 | |
| T14.09 | Verify release checks: CSP, network log, bundle sizes, `?debug=1` | integration | pre-event-if-permitted | M4 | |
| T14.10 | Verify SCR-00 and worker-crash recovery by hand | integration | pre-event-if-permitted | M4 | |
| T14.11 | follow-up: refresh the `CLAUDE.md` command rows after the pipeline entry point lands | integration | pre-event-allowed | M1 | |
| T15.01 | Write the usability-test script (3 non-team users, briefing in ≤ 5 min) | design | pre-event-allowed | M3 | |
| T15.02 | Run three sessions; record times and issues | design | pre-event-allowed | M3b–M4 | |
| T15.03 | Triage the findings into follow-up subtasks | design | pre-event-allowed | M3b–M4 | |
| T15.04 | follow-up: add the v2 criteria to the usability script (HUD glance, summon, landscape cards) | design | pre-event-allowed | M3 | |
| T16.01 | Decide the final product name (D-08); record ADR-008 | story | pre-event-allowed | M2 | |
| T16.02 | spec-change: sync spec status rows and the docs index with the M0–M1 outcomes | integration | pre-event-allowed | M2 | |
| T16.03 | Finalize the README: run instructions, data credits, licence | story | pre-event-allowed | M8 | |
| T16.04 | Complete the AI-use disclosure | story | pre-event-allowed | M8 | |
| T16.05 | Verify every dataset and image is credited in SCR-09 and the README | story | pre-event-allowed | M8 | |
| T16.06 | Fill the NASA project page fields; complete the submission checklist | story | event-only | M8 | |
| T16.07 | Implement the release-asset fetch route and decide what the public link shows; test the link in a private window | story | pre-event-allowed | M2–M8 | |
| T17.01 | Draft the 240-s and 30-s demo scripts | story | pre-event-allowed | M3 | |
| T17.02 | Record and submit the 240-s video by Day 1 18:30 (dry-run capture first) | story | event-only | M6 | |
| T17.03 | Record and upload the 30-s video by Day 2 09:00 | story | event-only | M8 | |
| T17.04 | Fallback — start only if the live demo fails on camera: cut the 240-s video from the dry-run capture | story | event-only | M6 | |
| T18.01 | follow-up: CRISM layer and bundle re-release (only if T01.04 finds MTRDR coverage) | data | pre-event-if-permitted | M4b–M7 | |
| T18.02 | Build REMS L_s-bin temperature and pressure context from named RDR files | data | pre-event-if-permitted | M4b–M7 | |
| T18.03 | follow-up: seasonal-weather section in SCR-07 | frontend | pre-event-if-permitted | M4b–M7 | |
| T18.04 | follow-up: tests for the planner's illustrative O₂ estimate (02 §D.6) | compute | pre-event-if-permitted | M4b–M7 | |
| T18.05 | follow-up: implement the planner's illustrative O₂ estimate | compute | pre-event-if-permitted | M4b–M7 | |
| T18.06 | follow-up: show the O₂ estimate labelled "illustrative" | frontend | pre-event-if-permitted | M4b–M7 | |
| T18.07 | follow-up: save and restore the last plan in browser storage | frontend | pre-event-if-permitted | M4b–M7 | |
| T18.08 | Cache the CRISM and REMS source files before 13 Nov | data | pre-event-allowed | M2 | |
| T18.09 | Tests: sky-view factor and refuge dose factor (v2, FR-47) | compute | pre-event-if-permitted | M4b–M7 | |
| T18.10 | Implement the sky-view factor (v2, FR-47) | compute | pre-event-if-permitted | M4b–M7 | |
| T18.11 | follow-up: terrain refuge as a contingency option (v2, FR-47) | compute | pre-event-if-permitted | M4b–M7 | |
| T18.12 | Implement SCR-16 Earth support view (v2, FR-48) | frontend | pre-event-if-permitted | M4b–M7 | |
| T18.13 | follow-up: dust advisory replay events (v2, FR-49; only if T04.11 found a record) | data | pre-event-allowed | M4b–M7 | |

<!-- v2-claims:begin -->
| T05b.01 | Freeze the v2 compute signatures | compute | pre-event-allowed | M1 | |
| T05b.02 | Fixture: synthetic v2 grids | compute | pre-event-allowed | M1 | |
| T05b.03 | Tests: time to haven (02 §D.8 cases) | compute | pre-event-if-permitted | M1 | |
| T05b.04 | Implement haven fields (reverse Dijkstra, bounded Dijkstra, live and planning forms) | compute | pre-event-if-permitted | M1 | |
| T05b.05 | Verify the full-grid Dijkstra benchmark on the weakest laptop (M1 go/no-go) | compute | pre-event-if-permitted | M1 | |
| T05b.06 | Tests: rendezvous (02 §D.10 cases) | compute | pre-event-if-permitted | M2 | |
| T05b.07 | Implement the rendezvous search | compute | pre-event-if-permitted | M2 | |
| T05b.08 | Tests: line of sight, curvature and dynamic viewshed (02 §D.11) | compute | pre-event-if-permitted | M2 | |
| T05b.09 | Implement line of sight and the 20 m dynamic viewshed | compute | pre-event-if-permitted | M2 | |
| T05b.10 | Tests: surface link graph | compute | pre-event-if-permitted | M2 | |
| T05b.11 | Implement the surface link graph | compute | pre-event-if-permitted | M2 | |
| T05b.12 | Tests: Earth delivery rule | compute | pre-event-if-permitted | M2 | |
| T05b.13 | Implement the Earth delivery rule | compute | pre-event-if-permitted | M2 | |
| T05b.14 | Tests: radiation trigger and event dose integral | compute | pre-event-if-permitted | M2 | |
| T05b.15 | Implement the radiation trigger and event dose integral | compute | pre-event-if-permitted | M2 | |
| T05b.16 | Tests: suit consumables (02 §D.14) | compute | pre-event-if-permitted | M2 | |
| T05b.17 | Implement suit consumables | compute | pre-event-if-permitted | M2 | |
| T05b.18 | Tests: contingency options and ranking (02 §D.15) | compute | pre-event-if-permitted | M3 | |
| T05b.19 | Implement contingency options and ranking | compute | pre-event-if-permitted | M3 | |
| T05b.20 | Verify on the real grid: haven, rendezvous and viewshed vs independent checks; NFR-02 timings | compute | pre-event-if-permitted | M3 | |
| T05b.21 | Fallback — start only if T05b.05 says no-go: 10 m grid for all fields; `T_hab` precomputed in the pipeline | compute | pre-event-if-permitted | M1–M2 | |
| T20.01 | Freeze `packages/protocol` v0: runtime entities, wire messages, permissions | hab-core | pre-event-allowed | M1 | |
| T20.02 | Fixture: mock WebSocket message sequences for the demo beats | hab-core | pre-event-allowed | M1 | |
| T20.03 | Tests: server handshake, fan-out, reconnect and heartbeat | hab-core | pre-event-if-permitted | M1 | |
| T20.04 | Implement the HTTP + WebSocket server | hab-core | pre-event-if-permitted | M1 | |
| T20.05 | Tests: web client handshake, ordering, reconnect and link-lost | hab-core | pre-event-if-permitted | M2 | |
| T20.06 | Implement the web client for the Hab Core | hab-core | pre-event-if-permitted | M2 | |
| T20.07 | Build the LAN spike page and script | hab-core | pre-event-if-permitted | M1 | |
| T20.08 | Verify the LAN spike: 2 phones + 1 laptop ≤ 500 ms on the router (M1 go/no-go) | hab-core | pre-event-if-permitted | M1 | |
| T20.09 | Fallback — start only if T20.08 says no-go: single-laptop multi-window mode | hab-core | pre-event-if-permitted | M1–M3 | |
| T21.01 | Freeze the scenario folder layout and the table formats | data | pre-event-allowed | M1 | |
| T21.02 | Download the SPICE kernels for 18–22 May 2024; record exact files (U-18) | data | pre-event-allowed | M2 | |
| T21.03 | Tests: SPICE table, DONKI extraction and RAD series | data | pre-event-allowed | M2 | |
| T21.04 | Implement the SPICE Earth-link table | data | pre-event-allowed | M2 | |
| T21.05 | Decide the DONKI window (U-44); implement DONKI extraction | data | pre-event-allowed | M2 | |
| T21.06 | Download the RAD series; verify sol-4190 coverage (U-15) and the product (U-45) | data | pre-event-allowed | M2 | |
| T21.07 | Implement the RAD dose-series extraction | data | pre-event-allowed | M2 | |
| T21.08 | Assemble `scenario.json` with checksums and initial stop tasks | data | pre-event-allowed | M2 | |
| T21.09 | spec-change: choose the EVA start time; write the final demo numbers into 01 §E.1 and the demo script | story | pre-event-allowed | M2 | |
| T21.10 | Verify: the timeline table reproduces source times (M2) | data | pre-event-allowed | M2 | |
| T21.11 | Fixture: real-scenario excerpt for engine tests | data | pre-event-if-permitted | M2 | |
| T21.12 | Build the demo `PlanExport` headlessly from the demo plan stops | compute | pre-event-allowed | M2 | |
| T21.13 | Fallback — start only if T21.06 finds no sol-4190 series: digitised dose curve | data | pre-event-allowed | M2 | |
| T21.14 | Fallback — start only if T21.02 cannot get the kernels: fixed light time for the date | data | pre-event-allowed | M2 | |
| T22.01 | Freeze engine interfaces; create the engine-module stubs | hab-core | pre-event-allowed | M1 | |
| T22.02 | Fixture: fake scenario with a straight-line route and a stepped dose curve | hab-core | pre-event-allowed | M1 | |
| T22.03 | Tests: mission clock | hab-core | pre-event-if-permitted | M2 | |
| T22.04 | Implement the mission clock | hab-core | pre-event-if-permitted | M2 | |
| T22.05 | Tests: reducer, event log, `log_hash`, snapshots and determinism | hab-core | pre-event-if-permitted | M2 | |
| T22.06 | Implement the reducer | hab-core | pre-event-if-permitted | M2 | |
| T22.07 | Implement the append-only event log, `log_hash` and snapshots | hab-core | pre-event-if-permitted | M2 | |
| T22.08 | Tests: tick — crew motion, dwell, consumables, dose and alert order | hab-core | pre-event-if-permitted | M2 | |
| T22.09 | Implement tick: crew motion, dwell, consumables and dose | hab-core | pre-event-if-permitted | M3 | |
| T22.10 | Implement alert evaluation: radiation, consumables, buddy distance | hab-core | pre-event-if-permitted | M3 | |
| T22.11 | Implement the scenario loader and its checks | hab-core | pre-event-if-permitted | M2 | |
| T22.12 | Implement the session manager: load, commands, persistence, resume | hab-core | pre-event-if-permitted | M3 | |
| T22.13 | Implement headless replay and the CLI (`make replay`, `make hab`) | hab-core | pre-event-if-permitted | M3 | |
| T22.14 | Verify: two runs give the same hash; 60× full run; tick cost (M3) | hab-core | pre-event-if-permitted | M3 | |
| T22.15 | Fallback — start only if consumables slip past M3: O₂ only | hab-core | pre-event-if-permitted | M3 | |
| T22.16 | Implement the conditions feed values in the engine (FR-36) | hab-core | pre-event-if-permitted | M3 | |
| T23.01 | Tests: command validation and rejections | hab-core | pre-event-if-permitted | M2 | |
| T23.02 | Implement command validation and dispatch | hab-core | pre-event-if-permitted | M2 | |
| T23.03 | Implement haven per tick and `HAVEN_TIME_EXCEEDED` | compute | pre-event-if-permitted | M3 | |
| T23.04 | Tests: summon, rendezvous, vehicle motion and sheltering | hab-core | pre-event-if-permitted | M2 | |
| T23.05 | Implement summon, rendezvous dispatch and vehicle motion | hab-core | pre-event-if-permitted | M3 | |
| T23.06 | Tests: contingency options, approval and abort | hab-core | pre-event-if-permitted | M2 | |
| T23.07 | Implement contingency options, `APPROVE_OPTION` and `ABORT` | hab-core | pre-event-if-permitted | M3 | |
| T23.08 | Verify: killer demo steps 0:30–1:10 run headless (M3) | hab-core | pre-event-if-permitted | M3 | |
| T23.09 | Fallback — start only if exact rendezvous fails by M3 or cut 6 is called: drive to the nearest vehicle-passable cell | hab-core | pre-event-if-permitted | M3 | |
| T24.01 | Freeze the EVA view model and component props | frontend | pre-event-allowed | M1 | |
| T24.02 | Tests: EVA view model on the mock fixtures | frontend | pre-event-if-permitted | M2 | |
| T24.03 | Implement the EVA view model | frontend | pre-event-if-permitted | M2 | |
| T24.04 | Implement SCR-12 EVA tablet layout with fixed geography | frontend | pre-event-if-permitted | M2 | |
| T24.05 | Implement hold-to-confirm and wire SUMMON, ABORT and TASK ROVER | frontend | pre-event-if-permitted | M2 | |
| T24.06 | Implement SCR-14 options sheet (EVA) | frontend | pre-event-if-permitted | M3 | |
| T24.07 | Implement SCR-18 hab-link-lost overlay with cached, stale-labelled values | frontend | pre-event-if-permitted | M2 | |
| T24.08 | Implement SCR-13 HUD | frontend | pre-event-if-permitted | M3 | |
| T24.09 | Implement the full-screen EVA map with its controls | frontend | pre-event-if-permitted | M3 | |
| T24.10 | Tests: EVA DOM tests (fixed geography, targets, hold-to-confirm, HUD, link lost, full-screen map) | frontend | pre-event-if-permitted | M2 | |
| T24.11 | Verify on phones: ≤ 2 taps + confirm, link-lost, glance check, device matrix (M3–M4) | frontend | pre-event-if-permitted | M3b–M4 | |
| T24.12 | Fallback — start only if SCR-12 is not usable by M3b: HUD only, no map | frontend | pre-event-if-permitted | M3b | |
| T25.01 | Implement the SCR-11 layout: crew and vehicle cards, metadata strip, slots | frontend | pre-event-if-permitted | M2 | |
| T25.02 | Implement the ops map layers: crew, vehicles, coverage, haven bands | frontend | pre-event-if-permitted | M2 | |
| T25.03 | Implement the alert stack with acknowledgement | frontend | pre-event-if-permitted | M3 | |
| T25.04 | Implement the ops options panel with `APPROVE_OPTION` | frontend | pre-event-if-permitted | M3 | |
| T25.05 | Implement clock control and scenario load | frontend | pre-event-if-permitted | M3 | |
| T25.06 | Implement SCR-10 join / role select | frontend | pre-event-if-permitted | M3 | |
| T25.07 | Tests: ops and join DOM tests | frontend | pre-event-if-permitted | M2 | |
| T25.08 | Verify: ops runs the whole demo without a terminal (M3b–M4) | frontend | pre-event-if-permitted | M3b–M4 | |
| T25.09 | Fallback — start only if clock control is not ready by M3: keyboard shortcuts | frontend | pre-event-if-permitted | M3 | |
| T25.10 | Implement the ops conditions panel and the EVA conditions strip values (FR-36) | frontend | pre-event-if-permitted | M3 | |
| T26.01 | Implement the link graph per tick, link events and `COMM_SHADOW` on the remaining route | compute | pre-event-if-permitted | M3 | |
| T26.02 | follow-up: send `LINK_STATE` to the suit's device; queue its commands while unlinked | compute | pre-event-if-permitted | M3 | |
| T26.03 | Tests: Earth messages, forecasts and blackout in the engine | compute | pre-event-if-permitted | M3 | |
| T26.04 | Implement Earth messages and forecasts in the engine | compute | pre-event-if-permitted | M3 | |
| T26.05 | Implement the Earth link widget on ops | compute | pre-event-if-permitted | M3 | |
| T26.06 | Tests: link graph per tick and comm-shadow warnings | compute | pre-event-if-permitted | M3 | |
| T26.07 | Verify: the demo shadow appears and clears; the forecast arrives at the computed time | compute | pre-event-if-permitted | M3–M4 | |
| T26.08 | Fallback — start only if cut 5 is called: static hab coverage and a fixed delay | compute | pre-event-if-permitted | M3 | |
| T27.01 | follow-up: report builder and `GET /api/report` | frontend | pre-event-if-permitted | M3–M4 | |
| T27.02 | Tests: report values equal the counts reduced from the log | frontend | pre-event-if-permitted | M3 | |
| T27.03 | Implement SCR-17 post-EVA report (print, ≤ 2 pages) | frontend | event-only | M7 | |
| T27.04 | Implement the event log view on ops | frontend | pre-event-if-permitted | M4 | |
| T27.05 | Implement replay mode for GitHub Pages (`#/replay`, recorded log, no Hab Core) | frontend | event-only | M7 | |
| T27.06 | Verify: report ≤ 2 pages; the Pages link replays the recorded log | frontend | event-only | M7 | |
| T27.07 | Fallback — start only if SCR-17 is not ready by M7: report = printed log table | frontend | event-only | M7 | |
| T28.01 | Set up the travel router: SSID, WPA2, no WAN, fixed address for the Hab Core laptop (U-21) | integration | pre-event-allowed | M1 | |
| T28.02 | follow-up: join QR endpoint `/api/join-qr` | integration | pre-event-if-permitted | M3 | |
| T28.03 | Device matrix: Android Chrome, iOS Safari, laptops | integration | pre-event-allowed | M3–M4 | |
| T28.04 | follow-up: write the venue checklist and pack list | integration | pre-event-allowed | M4b | |
| T28.05 | Verify network faults: Wi-Fi toggle, Hab Core kill and restart, single-laptop mode | integration | pre-event-if-permitted | M4 | |
| T29.01 | Tests: `TASK_ROVER` handler, queue, battery and relay | compute | pre-event-if-permitted | M3 | |
| T29.02 | Implement the `TASK_ROVER` handler and queue | compute | pre-event-if-permitted | M3 | |
| T29.03 | Implement rover motion, battery and the relay node | compute | pre-event-if-permitted | M3 | |
| T29.04 | Implement SCR-15 rover tasking on the map | frontend | pre-event-if-permitted | M3 | |
| T29.05 | Implement the rover queue display (ETA and battery) | frontend | pre-event-if-permitted | M3 | |
| T29.06 | Verify: RELAY closes the demo shadow; queue shows ETA and battery | compute | pre-event-if-permitted | M3–M4 | |
| T29.07 | Fallback — start only if cut 2 is called: RELAY only | compute | pre-event-if-permitted | M3 | |
| T30.01 | Name the challenge on the project page and in the README; draft the page; decide when the repo goes public | story | pre-event-allowed | M0 | |
| T30.02 | Keep `docs/AI_USE.md` current (weekly sweep) | story | pre-event-allowed | M0–M8 | |
| T30.03 | Verify the three single points and record the evidence | story | pre-event-allowed | M8 | |
| T31.01 | Contract: FR-50 types, scenario schema field and the 6 Nov UI stubs | hab-core | pre-event-allowed | M1 | |
| T31.02 | Write the task text for each stop of the demo plan (U-58) | story | pre-event-allowed | M2 | |
| T31.03 | Tests: stop task commands, events and engine behaviour | hab-core | pre-event-if-permitted | M2 | |
| T31.04 | Implement the task engine: commands, seeding, DROPPED on revision, auto-complete | hab-core | pre-event-if-permitted | M3 | |
| T31.05 | Implement the EVA task list and TASKS button | frontend | pre-event-if-permitted | M3 | |
| T31.06 | Implement ops task progress and the add-task popover | frontend | pre-event-if-permitted | M3 | |
| T31.07 | Tests: EVA list and ops progress DOM tests | frontend | pre-event-if-permitted | M2 | |
| T31.08 | Verify: tap on tablet shows on ops ≤ 500 ms; abort drops open tasks; report counts match the log | integration | pre-event-if-permitted | M3b–M4 | |
| T31.09 | Fallback — start only if TASK-31 runs late at M3: ops view-only, no `ADD_STOP_TASK` | frontend | pre-event-if-permitted | M3 | |
| T32.01 | contract-change: live-session protocol — `presenter` role, five commands, five log events, Session and library types (C13) | hab-core | pre-event-allowed | M4 | |
| T32.02 | spec-change: record the live-session gaps — planner task-library transport, `PUBLISH_PLAN` task payload, `ended_by` values, command-list export, 06 §C.2 owners | hab-core | pre-event-allowed | M4 | |
| T32.03 | follow-up: F7 fixtures for the live-session beats | hab-core | pre-event-allowed | M4 | |
| T32.04 | contract-change: scenario schema v2 — `mission_setup`, `event_library`, `task_library`; `plan` and `events` optional | hab-core | pre-event-allowed | M4 | |
| T32.05 | follow-up: fake scenario in the live shape, a plan-less variant and a two-candidate site | hab-core | pre-event-allowed | M4 | |
| T32.06 | Tests: reshaped loader and plan-less session | hab-core | pre-event-if-permitted | M4 | |
| T32.07 | follow-up: optional `plan` and `events` across the loader and the engine | hab-core | pre-event-if-permitted | M4 | |
| T32.08 | follow-up: loader checks for `mission_setup`, `event_library` and `task_library` | hab-core | pre-event-if-permitted | M4 | |
| T32.09 | Tests: `JUMP_NEXT_STOP` (Next stop) | hab-core | pre-event-if-permitted | M4 | |
| T32.10 | follow-up: implement `JUMP_NEXT_STOP` (fast-forward to the next stop) | hab-core | pre-event-if-permitted | M4 | |
| T32.11 | Tests: `START_EVENT` and the time-shifted storm | hab-core | pre-event-if-permitted | M4 | |
| T32.12 | follow-up: implement `START_EVENT` (event on demand, time-shifted dose series) | hab-core | pre-event-if-permitted | M4 | |
| T32.13 | Tests: `RESET_SESSION`, `SELECT_HAB_SITE`, `SET_MISSION_SETUP` and the role matrix | hab-core | pre-event-if-permitted | M4 | |
| T32.14 | follow-up: implement `RESET_SESSION`, `SELECT_HAB_SITE` and `SET_MISSION_SETUP` | hab-core | pre-event-if-permitted | M4 | |
| T32.15 | follow-up: server sends a fresh `SNAPSHOT` to every client after the session is replaced | hab-core | pre-event-if-permitted | M4 | |
| T32.16 | Tests: headless replay of a recorded command list | hab-core | pre-event-if-permitted | M4 | |
| T32.17 | follow-up: replay and CLI apply a recorded command list; export from the log | hab-core | pre-event-if-permitted | M4 | |
| T32.18 | Write the reference command list for the 01 §E.1 reference run (U-62) | hab-core | pre-event-allowed | M4 | |
| T32.19 | Tests: SCR-19 presenter panel | frontend | pre-event-if-permitted | M4 | |
| T32.20 | Implement SCR-19 presenter panel | frontend | pre-event-if-permitted | M4 | |
| T32.21 | Tests: SCR-20 mission setup | frontend | pre-event-if-permitted | M4 | |
| T32.22 | Implement SCR-20 mission setup | frontend | pre-event-if-permitted | M4 | |
| T32.23 | follow-up: register `#/presenter` and `#/setup`; Presenter tile on SCR-10 | frontend | pre-event-if-permitted | M4 | |
| T32.24 | Tests: `PUBLISH_PLAN` carries `stop_tasks`; the planner receives the task library | hab-core | pre-event-if-permitted | M4 | |
| T32.25 | follow-up: Hab Core seeds published tasks and delivers the task library to the planner | hab-core | pre-event-if-permitted | M4 | |
| T32.26 | Tests: planner stop-task drafts, publish payload and the SCR-04 editor | frontend | pre-event-if-permitted | M4b | |
| T32.27 | follow-up: planner stop-task drafts and the publish payload | frontend | pre-event-if-permitted | M4b | |
| T32.28 | follow-up: SCR-04 stop-task editor | frontend | pre-event-if-permitted | M4b | |
| T32.29 | Verify: a full live session headless — next stop ×N, start storm, shelter, reset, replay hash identical | hab-core | pre-event-if-permitted | M4 | |
| T32.30 | Tests: per-crew O₂ time left, bearing, distance and ETA to the next stop | hab-core | pre-event-if-permitted | M4 | |
| T32.31 | follow-up: implement per-crew O₂ time left, bearing, distance and ETA to the next stop | hab-core | pre-event-if-permitted | M4 | |
| T32.32 | follow-up: `scenario.json` in the live shape — `mission_setup`, `event_library`, `task_library` | hab-core | pre-event-allowed | M4 | |
<!-- v2-claims:end -->
