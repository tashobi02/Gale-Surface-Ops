# Frontend full-run plan — overview

| | |
| --- | --- |
| **Owner** | Orchestrator (Claude), frontend planner, under Sadman Shaharier Mahim's authority |
| **Date** | 2026-11-12 |
| **Status** | Plan for one full agent run; no code in this folder |
| **Related** | [Decisions](decisions.md) · [Needs from backend](01-needs-from-backend.md) · [Harness](01-verification-harness.md) · [Spec changes](02-spec-changes.md) · [Verification](99-verification.md) · [Mockup handoff](../../design/mockup-handoff.md) · [Coordination map](../../tasks/_coordination.md) · [Status](../../tasks/status.md) |

Scope: every subtask not `done` in TASK-02, 07–13, 15–17, 24, 25, 27 (UI), 29 (UI), 30, 31 (UI), 32 (UI), plus the SCR-00, SCR-16 and Earth-widget subtasks T14.04, T18.12, T26.05 and the frontend desirables T18.03, T18.06, T18.07, so that every screen SCR-00…SCR-20 is built to the mockup (04 wins; [decisions](decisions.md) §E). Backend-lane subtasks of those tasks (T27.01, T27.02, T29.01–T29.03, T29.06, T29.07, T31.01–T31.04 (and T31.02's scenario task text, FD-031), T32.01–T32.18, T32.24, T32.25, T32.29–T32.32) are the backend plan's; their outputs are listed in [needs](01-needs-from-backend.md).

## Rules for every implementer agent

- One package = one fresh agent, one branch `fe-NN-<slug>` from the latest `core-frontend`, one PR into `core-frontend`; ≤ ~15 files, ≤ ~3 h.
- `CLAUDE.md` §2 non-negotiables: no internet at runtime; no science outside `packages/compute`/Hab Core (the UI formats and counts, never computes physics or geometry beyond display interpolation in projected metres, FD-082); every displayed value `data-provenance` + `data-source`; "—" for a value not supplied; status colours mean status only; brand orange never in OPS/HUD; Mars CRS rules; no `ol/sphere`, no EPSG:3857.
- Tests first; then the package's named harness check must pass (`make e2e-one CHECK=…`). A check that cannot pass for a missing backend need stays `test.fixme('needs N-nn')` and the status row stays `wip` naming it — never `done` on a skipped check.
- Progress bar: status rows + `make progress` in the same commit (`CLAUDE.md` §6). `docs/AI_USE.md` row for every commit. Explicit `git add` paths.
- Never edit a file another open package owns (see serialisation below). Never change requirement ids or labels outside package 02.
- Reviewers: one `typescript-reviewer` (or `code-reviewer`) pass per package diff (opus, medium effort) before merge; findings fixed in the same branch.

## Packages in order

| # | Package | Subtasks | After | Backend needs |
| --- | --- | --- | --- | --- |
| 01 | [Verification harness (Playwright, Chromium)](01-verification-harness.md) | — (infrastructure) | — | N-01 (soft) |
| 02 | [Spec changes (Proposed, docs only)](02-spec-changes.md) | — | 01 | — |
| 03 | [Visual system: tokens, base styles, status icons, shared patterns](03-visual-system.md) | T13.01, T13.03, T13.04, T13.05 | 01, 02 | — |
| 04 | [Spike page every level, scale-bar check, ADR-003 outcome](04-spike-projection.md) | T02.03, T02.04, T02.05 | 01 | N-13 (README text only) |
| 05 | [Plan store, metric component and number formats](05-plan-store-metric.md) | T08.02, T08.03, T12.01 | 03 | — |
| 06 | [App shell, site loading, worker mock switch, SCR-00 boot error](06-shell-boot-scr00.md) | T07.02, T07.03, T07.04, T14.04 | 05 | — |
| 07 | [SCR-02 workspace layout, map mount, keyboard and debug overlay](07-map-workspace.md) | T07.06, T07.08, T07.13, T13.06 | 06 | — |
| 08 | [Raster, traverse, POI and EZ layers; SCR-03 layers panel; point inspector](08-layers.md) | T07.07, T07.09, T07.10, T07.11, T07.12, T07.18 | 07 | — |
| 09 | [SCR-04 plan panel, inputs form, stops list, haven rule](09-plan-panel.md) | T08.04, T08.05, T08.12 | 05, 07 | N-05 |
| 10 | [Waypoint markers, placement validation, add-stop mode, drag, touch, keyboard move](10-waypoints.md) | T08.06, T08.07, T08.08, T08.09, T08.10 | 09 | N-14 |
| 11 | [Route layer, profile chart, SCR-05, warnings, linking, haven/comm bands](11-results-profile.md) | T09.01, T09.02, T09.03, T09.04, T09.05, T09.09 | 05, 07, 10 | N-28 (soft for T09.09) |
| 12 | [SCR-06 POI detail and SCR-07 conditions](12-poi-conditions.md) | T10.01, T10.02, T10.04 | 08, 11 | N-15 (soft) |
| 13 | [Plan hash, PlanExport and PUBLISH_PLAN](13-export-publish.md) | T11.01, T11.02, T11.07 | 05 | N-05, N-08 |
| 14 | [SCR-08 briefing card, map snapshot, stop tasks](14-briefing-card.md) | T11.03, T11.04, T11.08 | 11, 13 | — |
| 15 | [SCR-01 mission briefing, demo plan, SCR-09 sources and methods content](15-brief-screens.md) | T07.05, T07.14, T12.03, T12.04 | 05, 06 | — |
| 16 | [DOM provenance checks across planner and v2 role views](16-provenance-tests.md) | T12.02, T12.07 | 15, 18, 19 | — |
| 17 | [SCR-12 EVA tablet: view model, landscape layout, mini-map, actions, stop tasks](17-eva-tablet.md) | T24.02, T24.03, T24.04, T24.05, T31.05, T31.07 | 03, 07 | N-02, N-03, N-04, N-08 |
| 18 | [SCR-14 options, SCR-18 link lost, SCR-13 HUD, full-screen map](18-eva-overlays-hud-map.md) | T24.06, T24.07, T24.08, T24.09, T24.10 | 17 | N-19, N-03 |
| 19 | [SCR-11 ops console wiring: layout, clock, alerts, conditions, sound](19-ops-core.md) | T25.01, T25.03, T25.05, T25.07, T25.10 | 17 | N-06, N-27 |
| 20 | [Ops options approval, event log strip and drawer, task progress, Earth link widget](20-ops-panels.md) | T25.04, T27.04, T31.06, T26.05 | 19 | N-08, N-19, N-23 |
| 21 | [Ops map layers, SCR-15 rover tasking, rover queue](21-ops-map-rover.md) | T25.02, T29.04, T29.05 | 19, 17 | N-09, N-11, N-12, N-28 |
| 22 | [SCR-10 join deep links and QR drawer; register #/presenter and #/setup](22-join-routes.md) | T25.06, T32.23 | 19 | N-16, N-18, N-05 |
| 23 | [SCR-19 presenter panel](23-presenter.md) | T32.19, T32.20 | 19 (ClockControl), 22 for routing | N-18, N-05, N-16 |
| 24 | [SCR-20 mission setup](24-mission-setup.md) | T32.21, T32.22 | 19, 22 | N-18, N-22 |
| 25 | [Planner stop-task library, drafts, publish payload, SCR-04 editor](25-planner-task-editing.md) | T32.26, T32.27, T32.28 | 09, 12, 13 | N-07, N-08 |
| 26 | [SCR-17 post-EVA report](26-report.md) | T27.03 | 19 | N-10 |
| 27 | [Replay mode `#/replay` for the public link](27-replay.md) | T27.05 | 19, 26 | N-21 |
| 28 | [Automated verification of the planner subtasks](28-verify-planner.md) | T07.15, T08.11, T09.06, T09.07, T10.03, T11.05, T12.06, T13.09, T13.10 | 03–16 | N-20, N-26 |
| 29 | [Automated verification of the live subtasks](29-verify-live.md) | T24.11, T25.08, T27.06, T31.08 | 17–27 | N-10, N-19, N-21, N-27 |
| 30 | [Usability: automated heuristic run replacing sessions](30-usability.md) | T15.01, T15.02, T15.03 | 28, 29 | — |
| 31 | [Name, README, credits, AI use, hosting, project page, score-sheet points](31-submission.md) | T16.01, T16.02, T16.03, T16.04, T16.05, T16.06, T16.07, T30.01, T30.02, T30.03 | 15, 27, 28 | N-21 |
| 32 | [Demo scripts, storyboards, automated capture and edit](32-videos.md) | T17.01, T17.02, T17.03, T17.04 | 29, 31 | N-20 |
| 33 | [Planner fallbacks as degradation paths](33-fallbacks-planner.md) | T02.06, T07.16, T09.08, T11.06 | 08, 11, 14 | N-25 |
| 34 | [Live fallbacks as degradation paths](34-fallbacks-live.md) | T24.12, T25.09, T27.07, T31.09 | 18, 19, 20, 26 | — |
| 35 | [Coach marks, light theme, plan persistence, REMS and O₂ displays](35-desirables-planner.md) | T13.07, T13.08, T18.03, T18.06, T18.07 | 07, 11, 12, 14 | N-24 |
| 36 | [SCR-16 Earth view](36-earth-view.md) | T18.12 | 20 | N-23 |

## Dependency order and lanes

```text
01 harness ─► 02 spec-changes ─► 03 visual-system ─┬─► 04 spike (any time after 03)
                                                     ├─► Lane P (planner): 05 ─► 06 ─► 07 ─► 08 ─► 09 ─► 10 ─► 11 ─► 12
                                                     │                      05 ─► 13 ; 11+13 ─► 14 ; 05+06 ─► 15
                                                     └─► Lane L (live):    07 ─► 17 ─► 18 ; 17 ─► 19 ─► 20 ─► 21
                                                                           19 ─► 23, 24 ─► 22 (routes, after 23 and 24)
Join: 09+12+13 ─► 25 ; 19 ─► 26 ─► 27 ; 15+18+19 ─► 16
Verify: 03–16 ─► 28 ; 17–27 ─► 29 ; 28+29 ─► 30 ─► 31 ─► 32
Last: 33, 34 (fallbacks) ─► 35, 36 (desirables) ─► 99 end-to-end run
```

Lanes P and L run in parallel after 03 (17 needs 07's map mount). Package 22 merges after 23 and 24 so the routes never point at a placeholder.

### Serialised files (one open package at a time)

| File | Packages, in order |
| --- | --- |
| `apps/web/src/ui/screens/scr11OpsConsole.tsx` | 19 → 20 → 21 |
| `apps/web/src/ui/screens/scr12EvaTablet.tsx` | 17 → 21 (entry only) → 34 |
| `apps/web/src/ui/screens/scr04PlanPanel.tsx` | 09 → 25 |
| `apps/web/src/ui/screens/scr05RouteResults.tsx` | 05 → 11 → 35 |
| `apps/web/src/ui/screens/scr08BriefingCard.tsx` | 14 → 35 |
| `apps/web/src/ui/screens/scr06PoiDetail.tsx` | 12 → 25 |
| `apps/web/src/ui/screens/scr02MapWorkspace.tsx` | 07 → 35 |
| `apps/web/src/ui/router.ts`, `App.tsx` | 06 → 22 → 27 → 36 |
| `apps/web/src/ui/context.ts` | 07 → 08 |
| `apps/web/src/ui/styles/tokens.css` | 03 → 35 |
| `apps/web/e2e/checks/*` | 01 creates; each package removes only its own `fixme` |
| `docs/ops/verification-log.md` | append-only; conflicts resolved by keeping both entries |

## Screens and routes → package

| Screen | Route (03 §A) | Mode | Mockup (prototype hash / source) | Package(s) |
| --- | --- | --- | --- | --- |
| SCR-00 Boot error | (boot failure) | OPS | `#scr-00-single` / `h_misc.js` | 06 |
| SCR-01 Mission briefing | `#/` | BRIEF | `#scr-01-ready` / `h_misc.js` | 15 |
| SCR-02 Map workspace | `#/planner` (`#/map` redirects) | OPS | `#scr-02-*` / `g_planner.js`, `d_map.js` | 07, 10 |
| SCR-03 Layers panel | panel in `#/planner` | OPS | `#scr-03-*` | 08 |
| SCR-04 Plan panel | panel in `#/planner` | OPS | `#scr-04-*` | 09, 25 |
| SCR-05 Route results | panel in `#/planner` | OPS | `#scr-05-*` | 11 |
| SCR-06 POI detail | panel in `#/planner` | OPS | `#scr-06-*` | 12, 25 |
| SCR-07 Conditions | panel in `#/planner` | OPS | `#scr-07-*` | 12, 35 |
| SCR-08 Briefing card | `#/briefing` | PRINT | `#scr-08-*` | 13, 14 |
| SCR-09 Sources & methods | `#/sources` | BRIEF | `#scr-09-default` | 15 |
| SCR-10 Join / role select | `#/join` | BRIEF | `#scr-10-*` | 22 |
| SCR-11 Ops console | `#/ops` | OPS | `#scr-11-*` / `e_ops.js` | 19, 20, 21 |
| SCR-12 EVA tablet | `#/eva/EV1`, `#/eva/EV2` | OPS | `#scr-12-*-landscape` / `f_eva.js`, `o_tasks.js` | 17 |
| SCR-13 HUD | `#/hud/EV1`, `#/hud/EV2` | HUD | `#scr-13-*` | 18 |
| SCR-14 Options sheet / panel | on alert | OPS | `#scr-14-*-landscape` | 18, 20 |
| SCR-15 Rover tasking | from SCR-12 / SCR-11 | OPS | `#scr-15-*` | 21 |
| SCR-16 Earth view | `#/earth` | OPS | `#scr-16-*` | 36 (widget on SCR-11: 20) |
| SCR-17 Post-EVA report | `#/report` | PRINT | `#scr-17-default` | 26 |
| SCR-18 Hab link lost | overlay, all live roles | host's | `#scr-18-*` | 18 |
| SCR-19 Presenter panel | `#/presenter` | OPS | none (FD-219) | 23, 22 |
| SCR-20 Mission setup | `#/setup` | OPS | none (FD-220) | 24, 22 |
| Replay mode | `#/replay` | OPS | — | 27 |

## Subtask → package

| Subtask | Pkg | Subtask | Pkg | Subtask | Pkg |
| --- | --- | --- | --- | --- | --- |
| T02.03 | 04 | T02.04 | 04 | T02.05 | 04 |
| T02.06 | 33 | T07.02 | 06 | T07.03 | 06 |
| T07.04 | 06 | T07.05 | 15 | T07.06 | 07 |
| T07.07 | 08 | T07.08 | 07 | T07.09 | 08 |
| T07.10 | 08 | T07.11 | 08 | T07.12 | 08 |
| T07.13 | 07 | T07.14 | 15 | T07.15 | 28 |
| T07.16 | 33 | T07.18 | 08 | T08.02 | 05 |
| T08.03 | 05 | T08.04 | 09 | T08.05 | 09 |
| T08.06 | 10 | T08.07 | 10 | T08.08 | 10 |
| T08.09 | 10 | T08.10 | 10 | T08.11 | 28 |
| T08.12 | 09 | T09.01 | 11 | T09.02 | 11 |
| T09.03 | 11 | T09.04 | 11 | T09.05 | 11 |
| T09.06 | 28 | T09.07 | 28 | T09.08 | 33 |
| T09.09 | 11 | T10.01 | 12 | T10.02 | 12 |
| T10.03 | 28 | T10.04 | 12 | T11.01 | 13 |
| T11.02 | 13 | T11.03 | 14 | T11.04 | 14 |
| T11.05 | 28 | T11.06 | 33 | T11.07 | 13 |
| T11.08 | 14 | T12.01 | 05 | T12.02 | 16 |
| T12.03 | 15 | T12.04 | 15 | T12.06 | 28 |
| T12.07 | 16 | T13.01 | 03 | T13.03 | 03 |
| T13.04 | 03 | T13.05 | 03 | T13.06 | 07 |
| T13.07 | 35 | T13.08 | 35 | T13.09 | 28 |
| T13.10 | 28 | T14.04 | 06 | T15.01 | 30 |
| T15.02 | 30 | T15.03 | 30 | T16.01 | 31 |
| T16.02 | 31 | T16.03 | 31 | T16.04 | 31 |
| T16.05 | 31 | T16.06 | 31 | T16.07 | 31 |
| T17.01 | 32 | T17.02 | 32 | T17.03 | 32 |
| T17.04 | 32 | T18.03 | 35 | T18.06 | 35 |
| T18.07 | 35 | T18.12 | 36 | T24.02 | 17 |
| T24.03 | 17 | T24.04 | 17 | T24.05 | 17 |
| T24.06 | 18 | T24.07 | 18 | T24.08 | 18 |
| T24.09 | 18 | T24.10 | 18 | T24.11 | 29 |
| T24.12 | 34 | T25.01 | 19 | T25.02 | 21 |
| T25.03 | 19 | T25.04 | 20 | T25.05 | 19 |
| T25.06 | 22 | T25.07 | 19 | T25.08 | 29 |
| T25.09 | 34 | T25.10 | 19 | T26.05 | 20 |
| T27.03 | 26 | T27.04 | 20 | T27.05 | 27 |
| T27.06 | 29 | T27.07 | 34 | T29.04 | 21 |
| T29.05 | 21 | T30.01 | 31 | T30.02 | 31 |
| T30.03 | 31 | T31.05 | 17 | T31.06 | 20 |
| T31.07 | 17 | T31.08 | 29 | T31.09 | 34 |
| T32.19 | 23 | T32.20 | 23 | T32.21 | 24 |
| T32.22 | 24 | T32.23 | 22 | T32.26 | 25 |
| T32.27 | 25 | T32.28 | 25 | | |

131 subtasks in 36 packages. Decision count: see [decisions](decisions.md) (FD rows).
