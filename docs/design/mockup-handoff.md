# Mockup handoff — Marswalk Surface Ops prototype

| | |
| --- | --- |
| **Owner** | Sadman Shaharier Mahim, product & systems lead |
| **Date** | 2026-11-05 |
| **Status** | Draft for review |
| **Related** | [Docs index](../README.md) · [04 §A.3](../specs/04_Design_Brief.md#a3-mission-critical-principles-non-negotiable) · [04 §C.1](../specs/04_Design_Brief.md#c1-colour-tokens) · [04 §E.5](../specs/04_Design_Brief.md#e5-scr-12-eva-tablet-ops-phonetablet-portrait--360-px) · [04 §F](../specs/04_Design_Brief.md#f-accessibility-and-responsive-behavior) · [03 §B](../specs/03_App_Flow_and_Diagrams.md#b-screen-specification) · [01 §E](../specs/01_Product_Requirements_Document.md#e-core-demonstration-scenario) · [02 §E.6](../specs/02_Technical_Requirements_Document.md#e6-websocket-protocol-ws) · [05 §C.2](../specs/05_Backend_and_Database_Schema.md#c2-runtime-entities-hab-core-v2) · [AI use](../AI_USE.md) |

Specs 01–06 are frozen at Draft v2 (2026-11-04). This file is the design handoff for frontend (R3) and EVA/HUD (R5): what the clickable prototype shows, what it deviates from, and what must be decided. Labels follow the docs: **Confirmed** (measured or cited), **Assumed**, **Proposed**, **Unresolved**.

## Summary

- **Prototype:** [Marswalk Surface Ops design handoff prototype](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt) — one self-contained HTML page (`docs/design/prototype/marswalk-prototype.html`), all 19 screens (SCR-00 to SCR-18), a state switcher on every screen, device frames per 04 §F, flows, a demo player and a three-device Stage.
- **Honesty rules held:** every displayed number is `{v, unit, prov, src}` from a spec example or a `PLACEHOLDER` (shown as `##.#` with a dotted underline); nothing is computed; nothing is called live; coordinates are the IAU_2015:49900 sphere, east-positive; no external tiles or images; no logos or photos.
- **Scale:** 162 fixture numbers, 50 of them `PLACEHOLDER`; 19 screens; 219 screen × state × frame combinations.
- **Open decision for the team:** the EVA landscape layout is a **Proposed** deviation (DV-01). Ratify it as U-30 before TASK-24 starts.
- **Hosting note:** the artifact host only passes plain `#name` hashes, so prototype links look like `#scr-12-alerting-landscape`; the prototype also accepts the 03 §A forms (`#/planner`, `#/ops`, `#/eva/EV1`, `#/hud/EV1`, `#/report`).

## Screen inventory

Modes and routes follow 03 §A and 04 §B.2. States are copied from each 03 §B "States" row; additions are listed in the gaps table (G-10).

| SCR | Route (03 §A) | Mode | States | FRs | Tier |
| --- | --- | --- | --- | --- | --- |
| SCR-11 Ops console | `#/ops` | OPS | No session · Loaded · Running · Paused · Alerting · Ended | FR-30–38, 40, 42–46 | T1 |
| SCR-12 EVA tablet | `#/eva/EV1` | OPS | Waiting for EVA start · Walking · At stop · Alerting · To haven · Sheltered · No hab link · EVA ended | FR-32, 35, 39, 40, 44 | T1 |
| SCR-13 HUD | `#/hud/EV1` | HUD | Nominal · Caution · Warning · No link | FR-33 | T1 |
| SCR-14 Options sheet / panel | `(on alert)` | OPS | Computing options · Ready · Executing · Superseded · Ops approval pending · No rendezvous | FR-40, 44 | T1 |
| SCR-02 Map workspace | `#/planner` | OPS | Loading tiles · Idle · Add-stop mode · Computing · Results OK · Results partial · Error (worker) | FR-01–10, 16, 17 | T0 |
| SCR-03 Layers panel | `(panel in #/planner)` | OPS | Default · Loading · Unavailable · Out of range | FR-02, 15–18 | T0 |
| SCR-04 Plan panel | `(panel in #/planner)` | OPS | Empty · Editing · Invalid input · Computing | FR-05, 06, 09 | T0 |
| SCR-05 Route results | `(panel in #/planner)` | OPS | Empty · Computing · OK · Over limits · Partial · Error | FR-07–12 | T0 |
| SCR-06 POI detail | `(panel in #/planner)` | OPS | Image shown · Image loading · Image missing | FR-04, 45 | T0 |
| SCR-07 Conditions panel | `(panel in #/planner)` | OPS | Computed · Daylight warning · Not available | FR-11–13 | T0 |
| SCR-00 Boot error | `(boot failure only)` | OPS | Single | FR-16, NFR-10 | T0 |
| SCR-01 Mission briefing | `#/` | BRIEF | Loading · Ready | FR-01, 15 | T0 |
| SCR-09 Sources & methods | `#/sources` | BRIEF | Default | FR-15 | T0 |
| SCR-10 Join / role select | `#/join` | BRIEF | Connecting · Ready · Role taken · Hab Core unreachable | FR-30, 31 | T1 |
| SCR-08 Briefing card | `#/briefing` | PRINT | OK · Over limits · Partial | FR-14, 15 | T0 |
| SCR-17 Post-EVA report | `#/report` | PRINT | Default | FR-46 | T1 |
| SCR-18 Hab link lost / connecting | `(overlay, all live roles)` | OPS | Connecting at load · Lost mid-EVA (EVA) · Lost (ops) · Reconnected | FR-16, 32, NFR-13 | T1 |
| SCR-15 Rover tasking | `(from SCR-12 / SCR-11)` | OPS | Choosing · Confirm · Queued · En route · Done · Failed | FR-41 | T2 (T2 SCOPE tag) |
| SCR-16 Earth view | `#/earth` | OPS | Link available · Waiting for relay pass · Conjunction blackout | FR-43, 48 | T2 (T2 SCOPE tag) |

Frames: projector 1440×900 (ops, planner) with 1280 and 1024 previews and a 900 px "use a larger screen" notice; EVA phone landscape 844×390, tablet landscape 1024×768, phone portrait 390×844, tablet portrait 768×1024; HUD 844×390; A4 794×1123 px (two pages for the report); BRIEF fluid at 360, 768 and 1440 px.

## State matrix

Each state links to the prototype ([open the prototype](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt)). EVA screens open in landscape; add `-portrait` to the hash for portrait.

| Screen | State | Prototype hash |
| --- | --- | --- |
| SCR-11 | No session | [`#scr-11-no-session`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-11-no-session) |
| SCR-11 | Loaded | [`#scr-11-loaded`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-11-loaded) |
| SCR-11 | Running | [`#scr-11-running`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-11-running) |
| SCR-11 | Paused | [`#scr-11-paused`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-11-paused) |
| SCR-11 | Alerting | [`#scr-11-alerting`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-11-alerting) |
| SCR-11 | Ended | [`#scr-11-ended`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-11-ended) |
| SCR-12 | Waiting for EVA start | [`#scr-12-waiting-for-eva-start-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-12-waiting-for-eva-start-landscape) |
| SCR-12 | Walking | [`#scr-12-walking-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-12-walking-landscape) |
| SCR-12 | At stop | [`#scr-12-at-stop-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-12-at-stop-landscape) |
| SCR-12 | Alerting | [`#scr-12-alerting-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-12-alerting-landscape) |
| SCR-12 | To haven | [`#scr-12-to-haven-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-12-to-haven-landscape) |
| SCR-12 | Sheltered | [`#scr-12-sheltered-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-12-sheltered-landscape) |
| SCR-12 | No hab link | [`#scr-12-no-hab-link-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-12-no-hab-link-landscape) |
| SCR-12 | EVA ended | [`#scr-12-eva-ended-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-12-eva-ended-landscape) |
| SCR-13 | Nominal | [`#scr-13-nominal`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-13-nominal) |
| SCR-13 | Caution | [`#scr-13-caution`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-13-caution) |
| SCR-13 | Warning | [`#scr-13-warning`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-13-warning) |
| SCR-13 | No link | [`#scr-13-no-link`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-13-no-link) |
| SCR-14 | Computing options | [`#scr-14-computing-options-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-14-computing-options-landscape) |
| SCR-14 | Ready | [`#scr-14-ready-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-14-ready-landscape) |
| SCR-14 | Executing | [`#scr-14-executing-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-14-executing-landscape) |
| SCR-14 | Superseded | [`#scr-14-superseded-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-14-superseded-landscape) |
| SCR-14 | Ops approval pending | [`#scr-14-ops-approval-pending-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-14-ops-approval-pending-landscape) |
| SCR-14 | No rendezvous | [`#scr-14-no-rendezvous-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-14-no-rendezvous-landscape) |
| SCR-02 | Loading tiles | [`#scr-02-loading-tiles`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-02-loading-tiles) |
| SCR-02 | Idle | [`#scr-02-idle`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-02-idle) |
| SCR-02 | Add-stop mode | [`#scr-02-add-stop-mode`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-02-add-stop-mode) |
| SCR-02 | Computing | [`#scr-02-computing`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-02-computing) |
| SCR-02 | Results OK | [`#scr-02-results-ok`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-02-results-ok) |
| SCR-02 | Results partial | [`#scr-02-results-partial`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-02-results-partial) |
| SCR-02 | Error (worker) | [`#scr-02-error-worker`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-02-error-worker) |
| SCR-03 | Default | [`#scr-03-default`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-03-default) |
| SCR-03 | Loading | [`#scr-03-loading`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-03-loading) |
| SCR-03 | Unavailable | [`#scr-03-unavailable`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-03-unavailable) |
| SCR-03 | Out of range | [`#scr-03-out-of-range`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-03-out-of-range) |
| SCR-04 | Empty | [`#scr-04-empty`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-04-empty) |
| SCR-04 | Editing | [`#scr-04-editing`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-04-editing) |
| SCR-04 | Invalid input | [`#scr-04-invalid-input`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-04-invalid-input) |
| SCR-04 | Computing | [`#scr-04-computing`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-04-computing) |
| SCR-05 | Empty | [`#scr-05-empty`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-05-empty) |
| SCR-05 | Computing | [`#scr-05-computing`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-05-computing) |
| SCR-05 | OK | [`#scr-05-ok`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-05-ok) |
| SCR-05 | Over limits | [`#scr-05-over-limits`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-05-over-limits) |
| SCR-05 | Partial | [`#scr-05-partial`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-05-partial) |
| SCR-05 | Error | [`#scr-05-error`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-05-error) |
| SCR-06 | Image shown | [`#scr-06-image-shown`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-06-image-shown) |
| SCR-06 | Image loading | [`#scr-06-image-loading`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-06-image-loading) |
| SCR-06 | Image missing | [`#scr-06-image-missing`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-06-image-missing) |
| SCR-07 | Computed | [`#scr-07-computed`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-07-computed) |
| SCR-07 | Daylight warning | [`#scr-07-daylight-warning`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-07-daylight-warning) |
| SCR-07 | Not available | [`#scr-07-not-available`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-07-not-available) |
| SCR-00 | Single | [`#scr-00`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-00) |
| SCR-01 | Loading | [`#scr-01-loading`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-01-loading) |
| SCR-01 | Ready | [`#scr-01-ready`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-01-ready) |
| SCR-09 | Default | [`#scr-09`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-09) |
| SCR-10 | Connecting | [`#scr-10-connecting`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-10-connecting) |
| SCR-10 | Ready | [`#scr-10-ready`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-10-ready) |
| SCR-10 | Role taken | [`#scr-10-role-taken`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-10-role-taken) |
| SCR-10 | Hab Core unreachable | [`#scr-10-hab-core-unreachable`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-10-hab-core-unreachable) |
| SCR-08 | OK | [`#scr-08-ok`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-08-ok) |
| SCR-08 | Over limits | [`#scr-08-over-limits`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-08-over-limits) |
| SCR-08 | Partial | [`#scr-08-partial`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-08-partial) |
| SCR-17 | Default | [`#scr-17`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-17) |
| SCR-18 | Connecting at load | [`#scr-18-connecting-at-load`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-18-connecting-at-load) |
| SCR-18 | Lost mid-EVA (EVA) | [`#scr-18-lost-mid-eva-eva`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-18-lost-mid-eva-eva) |
| SCR-18 | Lost (ops) | [`#scr-18-lost-ops`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-18-lost-ops) |
| SCR-18 | Reconnected | [`#scr-18-reconnected`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-18-reconnected) |
| SCR-15 | Choosing | [`#scr-15-choosing-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-15-choosing-landscape) |
| SCR-15 | Confirm | [`#scr-15-confirm-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-15-confirm-landscape) |
| SCR-15 | Queued | [`#scr-15-queued-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-15-queued-landscape) |
| SCR-15 | En route | [`#scr-15-en-route-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-15-en-route-landscape) |
| SCR-15 | Done | [`#scr-15-done-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-15-done-landscape) |
| SCR-15 | Failed | [`#scr-15-failed-landscape`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-15-failed-landscape) |
| SCR-16 | Link available | [`#scr-16-link-available`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-16-link-available) |
| SCR-16 | Waiting for relay pass | [`#scr-16-waiting-for-relay-pass`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-16-waiting-for-relay-pass) |
| SCR-16 | Conjunction blackout | [`#scr-16-conjunction-blackout`](https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt#scr-16-conjunction-blackout) |

## Component inventory

Proposed React components in `apps/web` (names and paths are suggestions; props mirror what the prototype renders).

| Component | Proposed path | Props | States | Tokens | Spec |
| --- | --- | --- | --- | --- | --- |
| StatusIcon / StatusLabel | ui/status/StatusIcon.tsx | level: warning\|caution\|advisory\|nominal\|unknown; word?; slot | all five levels | warning, caution, advisory, nominal, unknown | A.3 #2; shape + pattern + word + slot |
| ProvenanceChip | ui/ProvenanceChip.tsx | prov; mode: full\|glyph; src? | full, glyph-only (EVA/HUD) | text-2, edge, raised | FR-15 |
| Value | ui/Value.tsx | num {v, unit, prov, src}; size; stale?; grey? | default, loading, disabled (—), stale (age), error, placeholder (##.#) | text-1, text-3, Plex Mono tabular slashed-zero | FR-15; data-provenance required |
| Panel / SpecimenCard | ui/Panel.tsx | code; mod; title; selected; loading | default, selected, loading, stale, error | panel, raised, edge, route, livery stripe | P1–P3 |
| Button / ToggleSwitch / Segmented | ui/Button.tsx | kind: primary\|critical-warn\|critical-caution\|ghost; size; pressed; disabledReason | default, pressed, loading, disabled, error | btn-fill, edge, text-3, cut-s | P8 |
| HoldButton | ui/HoldButton.tsx | label; icon; kind; onConfirm; outcome; disabledReason; tapConfirm | idle, holding (0–800 ms), cancelled, done (300 ms), confirm (5 s), disabled | warning-fill, caution-fill, text-1 | D.3; keyboard hold Enter/Space |
| AlertBar / AlertList / AlertCounter | ui/alerts/AlertBar.tsx | alerts[]; onAck; onOpenList; device | none (slot reserved), warning (flash ×2), caution (pulse ×1), advisory (10 s), acked, +N | warning-fill, caution-fill, raised, advisory | D.2; aria-live assertive/polite |
| PhaseTimeline | ui/ops/PhaseTimeline.tsx | phases[]; current; unlinked | past, current (■ + bold + ▼), future, dashed | text-1, text-3 | P4 |
| CrewCard / VehicleCard | ui/ops/CrewCard.tsx | crew; selected; stale | default, selected, stale (dashed, grey, age), sheltered | panel, route, text-3 | D.1 |
| LinkIndicator | ui/LinkIndicator.tsx | linked; bars; age? | linked, NO LINK + age (dashed) | caution, text-1 | D.5 |
| EarthLinkWidget | ui/ops/EarthLinkWidget.tsx | lightTime; nextPass; queue; state | link, waiting, conjunction | unknown, advisory | FR-43 |
| ClockControl | ui/ops/ClockControl.tsx | speed; paused; onSpeed; onNext | default, active speed | text-1 fill when active | FR-34; keys Space 1/2/3 N |
| EventLogRow / EventLog | ui/ops/EventLog.tsx | event; onJump | default, active | hairline, text-2 | FR-46; scroll count (P11) |
| OpsConsole (SCR-11) | ui/screens/scr11/OpsConsole.tsx | session; world | no session, loaded, running, paused, alerting, ended; w1280, w1024, notice | void, panel, hairline | 04 §E.4 |
| EvaTablet (SCR-12) | ui/screens/scr12/EvaTablet.tsx | orientation: portrait\|landscape; crew | waiting, walking, at stop, alerting, to haven, sheltered, no hab link, ended | text-1, panel, caution-fill, warning-fill | 04 §E.5 + landscape (Proposed) |
| Hud (SCR-13) | ui/screens/scr13/Hud.tsx | crew; alert | nominal, caution, warning, no link | hud-* tokens | FR-33; hold 2 s to exit |
| OptionsSheet / OptionsPanel (SCR-14) | ui/screens/scr14/OptionsSheet.tsx | options[]; selected; orientation; role | computing, ready, executing, superseded, approval pending, no rendezvous | raised, route | FR-40, 44 |
| OptionCard | ui/OptionCard.tsx | option; selected; disabledReason | default, selected, loading, disabled | raised, route | D.1 |
| MapView | map/MapView.tsx (OpenLayers) | layers; route; crew; vehicles; overlays | loading, idle, add-stop, error | route, text-1, void casing | TASK-02/07; schematic SVG replaced by real tiles (U-39) |
| DoseChart | ui/ops/DoseChart.tsx | series; cursor | placeholder shape (until U-15), replayed | text-1, text-2 | FR-37; label "replayed — Curiosity RAD, 20 May 2024" |
| LayerRow / LayersPanel (SCR-03) | ui/planner/LayersPanel.tsx | layer; on; opacity | default, loading, unavailable, out of range | raised, edge | FR-02; max two scientific overlays |
| PlanPanel (SCR-04) | ui/planner/PlanPanel.tsx | scenario; stops; errors | empty, editing, invalid, computing | raised, warning outline | FR-05, 06; 300 ms debounce |
| ResultsPanel / ProfileChart (SCR-05) | ui/planner/ResultsPanel.tsx | plan; status | empty, computing, OK, over limits, partial, error | nominal, caution, warning | FR-07–12 |
| PoiDetail (SCR-06) | ui/planner/PoiDetail.tsx | poi; imageState | image shown, loading, missing | panel | FR-04, 45 |
| ConditionsPanel (SCR-07) | ui/planner/ConditionsPanel.tsx | conditions | computed, daylight warning, not available | caution | FR-11–13 |
| BriefingCard (SCR-08) / PostEvaReport (SCR-17) | ui/print/BriefingCard.tsx | plan; status | OK, over limits, partial; report pages 1–2 | print tokens | FR-14, 46 |
| SourcesPage (SCR-09) | ui/brief/SourcesPage.tsx | sources; paramSets | default; anchors layer-* | brief tokens | FR-15 |
| JoinPage (SCR-10) / BriefingPage (SCR-01) | ui/brief/JoinPage.tsx | roles; hab status | connecting, ready, role taken, unreachable | brief tokens | FR-30, 31 |
| LinkOverlay (SCR-18) / BootError (SCR-00) | ui/overlays/LinkOverlay.tsx | state; cached values | connecting, lost (EVA), lost (ops), restored | caution, advisory | FR-16, NFR-13 |
| RoverTasking (SCR-15, T2) / EarthView (SCR-16, T2) | ui/t2/RoverTasking.tsx | task; target; state | choosing … failed; link, waiting, blackout | caution, unknown | FR-41, 43, 48 |

## Token table

Tokens follow [04 §C.1](../specs/04_Design_Brief.md#c1-colour-tokens): `:root` primitives plus `[data-mode="brief|ops|hud|print"]` semantic layers; components use semantic tokens only ([04 §G](../specs/04_Design_Brief.md#g-implementation-notes)). Token names are the contract; TASK-13 freezes them.

### Semantic tokens per mode

| Token | BRIEF | OPS | HUD | PRINT |
| --- | --- | --- | --- | --- |
| `bg` | `#F7F5F0` | `#0B0D10` | `#000000` | `#fff` |
| `panel` | `#E8E6E1` | `#14181D` | `#000000` | `#fff` |
| `raised` | `#E8E6E1` | `#1C2128` | `#000000` | `#fff` |
| `hairline` | `#CFCBC2` | `#2A313A` | `#2A313A` | `#D1D5DB` |
| `edge` | `#5A5A5A` | `#5C6670` | `#A9B3BE` | `#6B7280` |
| `text-1` | `#1A1A1A` | `#ECEFF2` | `#FFFFFF` | `#111827` |
| `text-2` | `#5A5A5A` | `#A9B3BE` | `#A9B3BE` | `#4B5563` |
| `text-3` | `#5A5A5A` | `#8592A0` | `#A9B3BE` | `#4B5563` |
| `route` | `#1A1A1A` | `#4CC9F0` | `#4CC9F0` | `#111827` |
| `nominal` | `#0E7A4F` | `#3DDC84` | `#3DDC84` | `#0E7A4F` |
| `caution` | `#9A5B00` | `#FFB020` | `#FFB020` | `#9A5B00` |
| `warning` | `#B42318` | `#FF4D4D` | `#FF6B6B` | `#B42318` |
| `advisory` | `#1D4ED8` | `#4CC9F0` | `#4CC9F0` | `#1D4ED8` |
| `unknown` | `#6D28D9` | `#B8A9FF` | `#B8A9FF` | `#6D28D9` |
| `warning-fill` | `#B42318` | `#B3261E` | `#B3261E` | `#B42318` |
| `on-warning-fill` | `#fff` | `#fff` | `#fff` | `#fff` |
| `caution-fill` | `#E7553D` | `#FFB020` | `#FFB020` | `#fff` |
| `on-caution-fill` | `#1A1A1A` | `#000` | `#000` | `#111827` |
| `btn-fill` | `#E7553D` | `#ECEFF2` | `#FFFFFF` | `#111827` |
| `btn-text` | `#1A1A1A` | `#0B0D10` | `#000000` | `#fff` |
| `focus` | `#1A1A1A` | `#fff` | `#fff` | `#000` |

BRIEF-only: `signal` `#E7553D`, `signal-ink` `#C2401F`, `charcoal` `#282828`, `charcoal-text-2` `#A3A3A3`. PRINT neutrals marked PROPOSED in the contrast table are additions (G-15, U-33).

### Measured contrast

Computed with the WCAG relative-luminance formula in `docs/design/prototype/test/contrast.mjs` and live on the Design system page. "Spec" is the value stated in 04 §C.1.

| Mode | Pair | Foreground | Background | Spec | Measured | Result |
| --- | --- | --- | --- | --- | --- | --- |
| BRIEF | ink on paper | `#1A1A1A` | `#F7F5F0` | 15.97 | 15.97 : 1 | matches |
| BRIEF | ink on concrete | `#1A1A1A` | `#E8E6E1` | 13.95 | 13.95 : 1 | matches |
| BRIEF | ink on steel | `#1A1A1A` | `#CFCFCF` | 11.17 | 11.17 : 1 | matches |
| BRIEF | ink-2 on paper | `#5A5A5A` | `#F7F5F0` | 6.33 | 6.33 : 1 | matches |
| BRIEF | paper on charcoal | `#F7F5F0` | `#282828` | 13.53 | 13.53 : 1 | matches |
| BRIEF | charcoal-text-2 on charcoal | `#A3A3A3` | `#282828` | 5.84 | 5.84 : 1 | matches |
| BRIEF | ink on signal | `#1A1A1A` | `#E7553D` | 4.78 | 4.78 : 1 | matches |
| BRIEF | white on signal (large text only) | `#FFFFFF` | `#E7553D` | 3.64 | 3.64 : 1 | matches |
| BRIEF | signal-ink on paper | `#C2401F` | `#F7F5F0` | 4.76 | 4.76 : 1 | matches |
| BRIEF | signal on charcoal (large/graphics) | `#E7553D` | `#282828` | 4.05 | 4.05 : 1 | matches |
| OPS | edge on panel (non-text) | `#5C6670` | `#14181D` | 3.05 | 3.05 : 1 | matches |
| OPS | text-1 on panel | `#ECEFF2` | `#14181D` | 15.44 | 15.44 : 1 | matches |
| OPS | text-2 on panel | `#A9B3BE` | `#14181D` | 8.38 | 8.38 : 1 | matches |
| OPS | text-3 on panel | `#8592A0` | `#14181D` | 5.62 | 5.62 : 1 | matches |
| OPS | text-3 on raised | `#8592A0` | `#1C2128` | 5.1 | 5.10 : 1 | matches |
| OPS | route on panel | `#4CC9F0` | `#14181D` | 9.27 | 9.27 : 1 | matches |
| OPS | nominal on panel | `#3DDC84` | `#14181D` | 9.99 | 9.99 : 1 | matches |
| OPS | caution on panel | `#FFB020` | `#14181D` | 9.75 | 9.75 : 1 | matches |
| OPS | warning on panel | `#FF4D4D` | `#14181D` | 5.45 | 5.45 : 1 | matches |
| OPS | warning on raised | `#FF4D4D` | `#1C2128` | 4.95 | 4.95 : 1 | matches |
| OPS | advisory on panel | `#4CC9F0` | `#14181D` | 9.27 | 9.27 : 1 | matches |
| OPS | unknown on panel | `#B8A9FF` | `#14181D` | 8.62 | 8.62 : 1 | matches |
| OPS | white on warning-fill | `#FFFFFF` | `#B3261E` | 6.54 | 6.54 : 1 | matches |
| OPS | black on caution-fill | `#000000` | `#FFB020` | 11.48 | 11.48 : 1 | matches |
| HUD | hud-text on black | `#FFFFFF` | `#000000` | 21 | 21.00 : 1 | matches |
| HUD | hud-text-2 on black | `#A9B3BE` | `#000000` | 9.88 | 9.88 : 1 | matches |
| HUD | hud-nominal on black | `#3DDC84` | `#000000` | 11.77 | 11.77 : 1 | matches |
| HUD | hud-caution on black | `#FFB020` | `#000000` | 11.48 | 11.48 : 1 | matches |
| HUD | hud-warning on black | `#FF6B6B` | `#000000` | 7.57 | 7.57 : 1 | matches |
| HUD | hud-advisory on black | `#4CC9F0` | `#000000` | 10.92 | 10.92 : 1 | matches |
| PRINT | text on white | `#111827` | `#FFFFFF` | 17.7 | 17.74 : 1 | matches |
| PRINT | caution on white | `#9A5B00` | `#FFFFFF` | 5.43 | 5.43 : 1 | matches |
| PRINT | warning on white | `#B42318` | `#FFFFFF` | 6.57 | 6.57 : 1 | matches |
| PRINT | nominal on white | `#0E7A4F` | `#FFFFFF` | 5.36 | 5.36 : 1 | matches |
| PRINT | text-2 on white (PROPOSED) | `#4B5563` | `#FFFFFF` | none stated | 7.56 : 1 | new value |
| PRINT | edge on white (PROPOSED, non-text) | `#6B7280` | `#FFFFFF` | none stated | 4.83 : 1 | new value |
| PRINT | advisory on white (PROPOSED) | `#1D4ED8` | `#FFFFFF` | none stated | 6.70 : 1 | new value |
| PRINT | unknown on white (PROPOSED) | `#6D28D9` | `#FFFFFF` | none stated | 7.10 : 1 | new value |

All 34 stated ratios reproduce; the only difference is PRINT text on white (17.74 measured vs 17.7 stated, rounding). The four PRINT additions are above the 4.5 : 1 text and 3 : 1 non-text thresholds. High-contrast EVA alert bars use an outlined variant because white on `warning-fill` is 6.54 : 1, below the HUD 7 : 1 rule (DV-05, U-37).

### tokens.css (as built in the prototype)

```css
/* ============ TOKENS (04 §C.1, §G) — primitives on :root, semantic layers per [data-mode] ============ */
:root{
  /* BRIEF primitives */
  --p-paper:#F7F5F0; --p-concrete:#E8E6E1; --p-steel:#CFCFCF; --p-ink:#1A1A1A; --p-ink-2:#5A5A5A;
  --p-charcoal:#282828; --p-charcoal-text-2:#A3A3A3; --p-signal:#E7553D; --p-signal-ink:#C2401F;
  /* OPS primitives */
  --p-void:#0B0D10; --p-panel:#14181D; --p-raised:#1C2128; --p-hairline:#2A313A; --p-edge:#5C6670;
  --p-text-1:#ECEFF2; --p-text-2:#A9B3BE; --p-text-3:#8592A0; --p-route:#4CC9F0;
  --p-nominal:#3DDC84; --p-caution:#FFB020; --p-warning:#FF4D4D; --p-advisory:#4CC9F0; --p-unknown:#B8A9FF;
  --p-warning-fill:#B3261E; --p-caution-fill:#FFB020;
  /* HUD primitives */
  --p-black:#000000; --p-white:#FFFFFF; --p-hud-warning:#FF6B6B;
  /* PRINT primitives (04 §C.1 lists four; the neutral three are PROPOSED — see handoff G-15) */
  --p-print-text:#111827; --p-print-caution:#9A5B00; --p-print-warning:#B42318; --p-print-nominal:#0E7A4F;
  --p-print-text-2:#4B5563; --p-print-edge:#6B7280; --p-print-hairline:#D1D5DB; --p-print-advisory:#1D4ED8; --p-print-unknown:#6D28D9;
  /* type stacks (04 §C.2). Product self-hosts WOFF2 (U-27); prototype loads Google Fonts */
  --f-display:"Chakra Petch","Arial Narrow",Arial,sans-serif;
  --f-ui:Inter,system-ui,"Segoe UI",Roboto,Arial,sans-serif;
  --f-mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --f-serif:"Source Serif 4",Georgia,"Times New Roman",serif;
  /* spacing / chamfer (04 §C.3) */
  --u:4px; --cut-s:8px; --cut-m:16px; --cut-l:48px;
}

/* ---- OPS ---- */
[data-mode="ops"]{
  --bg:var(--p-void); --panel:var(--p-panel); --raised:var(--p-raised); --hairline:var(--p-hairline); --edge:var(--p-edge);
  --text-1:var(--p-text-1); --text-2:var(--p-text-2); --text-3:var(--p-text-3); --route:var(--p-route);
  --nominal:var(--p-nominal); --caution:var(--p-caution); --warning:var(--p-warning); --advisory:var(--p-advisory); --unknown:var(--p-unknown);
  --warning-fill:var(--p-warning-fill); --on-warning-fill:#fff; --caution-fill:var(--p-caution-fill); --on-caution-fill:#000;
  --btn-fill:var(--p-text-1); --btn-text:var(--p-void); --focus:#fff; --gap:var(--p-void);
  --slab:var(--p-raised); --on-slab:var(--p-text-1); --slab-2:var(--p-text-2);
  color-scheme:dark;
}
/* ---- BRIEF ---- */
[data-mode="brief"]{
  --bg:var(--p-paper); --panel:var(--p-concrete); --raised:var(--p-concrete); --hairline:#CFCBC2; --edge:var(--p-ink-2);
  --text-1:var(--p-ink); --text-2:var(--p-ink-2); --text-3:var(--p-ink-2); --route:var(--p-ink);
  --nominal:#0E7A4F; --caution:#9A5B00; --warning:#B42318; --advisory:#1D4ED8; --unknown:#6D28D9;
  --warning-fill:#B42318; --on-warning-fill:#fff; --caution-fill:var(--p-signal); --on-caution-fill:var(--p-ink);
  --btn-fill:var(--p-signal); --btn-text:var(--p-ink); --accent:var(--p-signal); --accent-text:var(--p-signal-ink);
  --focus:var(--p-ink); --gap:var(--p-paper);
  --slab:var(--p-charcoal); --on-slab:var(--p-paper); --slab-2:var(--p-charcoal-text-2);
  --signal:var(--p-signal); --on-signal:var(--p-ink);
  color-scheme:light;
}
/* ---- HUD ---- */
[data-mode="hud"]{
  --bg:var(--p-black); --panel:var(--p-black); --raised:var(--p-black); --hairline:#2A313A; --edge:var(--p-text-2);
  --text-1:var(--p-white); --text-2:var(--p-text-2); --text-3:var(--p-text-2); --route:var(--p-advisory);
  --nominal:var(--p-nominal); --caution:var(--p-caution); --warning:var(--p-hud-warning); --advisory:var(--p-advisory); --unknown:var(--p-unknown);
  --warning-fill:var(--p-warning-fill); --on-warning-fill:#fff; --caution-fill:var(--p-caution-fill); --on-caution-fill:#000;
  --btn-fill:var(--p-white); --btn-text:var(--p-black); --focus:#fff; --gap:var(--p-black);
  --slab:var(--p-black); --on-slab:var(--p-white); --slab-2:var(--p-text-2);
  color-scheme:dark;
}
/* ---- PRINT ---- */
[data-mode="print"]{
  --bg:#fff; --panel:#fff; --raised:#fff; --hairline:var(--p-print-hairline); --edge:var(--p-print-edge);
  --text-1:var(--p-print-text); --text-2:var(--p-print-text-2); --text-3:var(--p-print-text-2); --route:var(--p-print-text);
  --nominal:var(--p-print-nominal); --caution:var(--p-print-caution); --warning:var(--p-print-warning); --advisory:var(--p-print-advisory); --unknown:var(--p-print-unknown);
  --warning-fill:var(--p-print-warning); --on-warning-fill:#fff; --caution-fill:#fff; --on-caution-fill:var(--p-print-text);
  --btn-fill:var(--p-print-text); --btn-text:#fff; --focus:#000; --gap:#fff;
  --slab:#111827; --on-slab:#fff; --slab-2:#D1D5DB;
  color-scheme:light;
}
/* HC toggle on EVA: switches to the HUD palette (04 §F "Glare") */
[data-mode="ops"][data-hc="1"]{
  --bg:#000; --panel:#000; --raised:#000; --text-1:#fff; --text-2:var(--p-text-2); --text-3:var(--p-text-2); --edge:var(--p-text-2);
  --nominal:var(--p-nominal); --caution:var(--p-caution); --warning:var(--p-hud-warning); --advisory:var(--p-advisory);
  --btn-fill:#fff; --btn-text:#000; --gap:#000; --slab:#000; --route:var(--p-advisory);
}
```

Fonts: Chakra Petch (display), Inter (UI), IBM Plex Mono (all numbers, tabular, slashed zero), Source Serif 4 (long-form). The prototype loads them from Google Fonts with fallback stacks. **The product self-hosts WOFF2 (offline), and the licences of Chakra Petch, Source Serif 4 and Lucide are still unverified (U-27, U-40).** Icons in the prototype are an own 1.5 px square-cap set; Lucide is the product set.

## Interaction specs

| Interaction | Spec | Behaviour |
| --- | --- | --- |
| Hold-to-confirm | 04 §D.3 | Press and hold 800 ms; a progress line runs along the chamfered edge; releasing early cancels ("Released early — hold 0.8 s"); on completion a 300 ms outcome state ("PR1 dispatched — ETA 14 min") then the command is issued. Keyboard: hold Enter/Space. Accessibility fallback (toggle): tap, then a Confirm button replaces it for 5 s. |
| Alert bar | 04 §D.2, §C.6 | One bar slot, highest level wins, "+N" counter opens the alert list. Warning flashes twice (2 Hz, < 3 Hz) then holds; caution pulses once; advisory auto-dismisses after 10 s and stays in the log. Acknowledge silences and marks seen; it does not clear the condition; warnings and cautions latch until acknowledged and cleared. |
| EVA status line | DV-03 | With no active alert the 64 px alert slot on the EVA tablet shows STATUS plus a word: NOMINAL (nominal icon), STANDBY or EVA ENDED (advisory icon), with a detail text and the current EVA phase on the right (portrait: word and phase only). The alert bar replaces it in the same slot when an alert is raised and the line returns when the alert is acknowledged and cleared. It is not a live region, so it never announces itself. Ops and HUD keep the slot empty. |
| Same words everywhere | 04 §D.2 | One alert store drives ops, EVA and HUD; the Stage page reads the text from each frame and shows IDENTICAL or DIFFER. |
| Staleness and link loss | 04 §D.5 | Values older than 5 s turn text-3 with an age stamp. Unlinked: EVA shows the caution bar "No hab link — operating on cached plan"; ops shows the crew card dashed with last-known values and age; commands show "Queued — sends when link returns" and are resent on reconnection. |
| HUD exit | 03 SCR-13 | Tap and hold anywhere for 2 s; a thin progress line appears at the bottom edge; release cancels. |
| EVA high contrast | 04 §F Glare | Switches the EVA frame to the HUD palette; alert bars become outlined (DV-05). |
| Ops mute | 04 §C.7 | Toggle with a visible SOUND OFF / SOUND ON indicator; warning two-tone repeats every 5 s until acknowledged; vibration pattern 3 × 200 ms where the Vibration API exists. |
| Ops keys | 04 §F | Space pause · 1/2/3 speed · N next event · K acknowledge · O focus options. |
| Planner | 04 §F, App. A | A add-stop mode · Enter place at crosshair · Delete remove selected · B briefing · ? sources · arrows pan · +/− zoom. Drag stops; on drop validate → snap offer (≤ 50 m) or refuse; max two scientific overlays (a third dims the oldest and says so); inputs recompute after a 300 ms debounce and an invalid value is never sent. |
| Demo player | 01 §E.1, §E.2, 10 | Beats hold between keyframes; markers tween visually only; 60× plays at the pace of the recorded table, 10× and 1× are slower; next event, previous, scrub. Commands from the Stage (hold Summon) advance the replay. |

## EVA orientation spec

**Status: Proposed deviation (DV-01), tested in the prototype; ratification is U-30.** Portrait follows 04 §E.5 exactly. Landscape (default) keeps the fixed geography of 04 §A.3 #4: alert bar on top, HAVEN top-left, O₂ beside it, actions at the bottom.

### Layouts

Portrait follows 04 §E.5 and is repeated in the draft patch text below. Landscape v2 (default):

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ALERT BAR, or STATUS: NOMINAL when none                  fixed 64 px │
├────────────────┬────────────────┬────────────────────────────────────┤
│ HAVEN 14 MIN   │ O₂ 71 %        │                                    │
│ via PR1  ○     │ 5:41 left ◇    │   MINI-MAP                         │
├────────────────┴────────────────┤   the whole right column:          │
│ NEXT  Stop 3 · Boxwork ridge    │   route, me, buddy, shadow, PR1    │
│ ↗ 040°  0.42 km  9 min          │                                    │
├─────────────────────────────────┴────────────────────────────────────┤
│ EVA 2:14 · DOSE 0.1 mGy · LINK ▮▮▮                       strip 24 px │
├──────────────────────────────────────────────────────────────────────┤
│ [ SUMMON ROVER ] [ ABORT TO HAB ] [ TASK ROVER (T2) ] [ HUD ]  72 px │
└──────────────────────────────────────────────────────────────────────┘
```

Landscape history: the first landscape layout split the screen into four parts (HAVEN | O₂ across the top, NEXT | map below). Team feedback on 2026-11-05 called that a waste of space, so landscape v2 puts HAVEN and O₂ in two compact cards top-left, NEXT under them, and gives the map the whole right column. The measurements below are for v2.

### Height budget (measured in Chromium, 844×390)

| BAND | HEIGHT (MEASURED) | RULE |
| --- | --- | --- |
| Alert slot | 64 px | 64 px fixed (04 §E.5) |
| Body (left column + map) | 230 px | map = the whole right column |
| cards row (HAVEN \| O₂) | 100 px | values ≥ 56 px Plex Mono; here 56 px (64 px on tablets) |
| NEXT card | 110 px | values ≥ 32 px |
| Metadata strip | 24 px | 24 px (04 §C.3) |
| Action row | 72 px | targets ≥ 56 px + 8 px padding/gaps |
| Total | 390 px | frame 390 px — ✓ fits, no scrolling |

Measured for all 8 EVA states on all 4 device sizes (32 combinations): no scrolling and no overflow; HAVEN, O₂, NEXT and the map never overlap one another; HAVEN is top-left and O₂ is immediately right of it on the same row in every combination; in landscape the map starts right of both cards and spans the full body height; HAVEN and O₂ values are 56 px on phones and 64 px on tablets (limit ≥ 56 px); NEXT values are 32 px on phones and 48 px on tablets (limit ≥ 32 px); every action target is ≥ 56 px high with ≥ 8 px gaps.

### Rotation behaviour (measured on the Orientation compare page)

| ZONE | PORTRAIT (QUADRANT · CENTRE) | LANDSCAPE (QUADRANT · CENTRE) | RESULT |
| --- | --- | --- | --- |
| Alert slot (top, full width) | TC (50%, 4%) | TC (50%, 8%) | ✓ same quadrant |
| HAVEN | TL (26%, 16%) | TL (12%, 31%) | ✓ same quadrant |
| O₂ | TR (74%, 16%) | TL (35%, 31%) | ⚠ moves from top-right to beside HAVEN (landscape cards are compact, top-left); see the same-row check below |
| NEXT stop | TC (50%, 31%) | BL (24%, 60%) | ⚠ reflows: under the two cards in landscape, under the safety row in portrait |
| Mini-map | BC (50%, 60%) | MR (73%, 46%) | ⚠ reflows: whole right column in landscape, band below NEXT in portrait |
| Metadata strip | BC (50%, 82%) | BC (50%, 78%) | ✓ same quadrant |
| Action row | BC (50%, 92%) | BC (50%, 91%) | ✓ same quadrant |
| O₂ immediately right of HAVEN, same row | yes | yes | ✓ holds in both orientations |

"Quadrant" is the zone of the frame centre (L/C/R × T/M/B; C = spans the middle). The alert slot, HAVEN (top-left), the metadata strip and the action row stay put exactly. **O₂ no longer keeps its quadrant:** it is top-right in portrait and sits beside HAVEN in landscape, but it is immediately right of HAVEN on the same row in both. NEXT and the mini-map also change place. This is the price of the compact-card layout; whether it is acceptable is part of U-30, and UT-6 tests it with people.

### SCR-14 options sheet

- **Portrait:** bottom sheet, 70 % of the height ([04 §E.7](../specs/04_Design_Brief.md#e7-scr-14-alert-options-sheet-eva)); alert bar, HAVEN and O₂ stay visible above it.
- **Landscape:** right-side panel over the map column (about 53 % of the width, not the 60 % first proposed), below the alert bar. HAVEN, O₂ and NEXT stay visible in the left column, so no echo is needed (G-22 superseded). One hold-to-confirm "Go — option N" at the panel bottom. The panel body fits three option cards at 844×390 without scrolling.

### Keeping the EVA tablet distinct from the HUD

The HUD (SCR-13) is pure black, read-only, shows at most five values (haven, bearing + distance, O₂, alert line, link), no map, values 56–72 px, exit by a 2 s hold. The landscape EVA tablet is OPS mode with a map and four actions. They share the geography (haven top-left) but never the layout: the HUD has no actions, no strip and no map.

## Fixture schema

One `<script type="application/json" id="fixture">` block in the page (also `docs/design/prototype/fixture.json`). Every number is `{v, unit, prov, src}`; `src` is a spec section or `PLACEHOLDER` (which carries `unblocks`). Wire messages carry raw numbers plus a provenance map; the fixture wraps each number so the prototype can audit it (U-42).

| Fixture key | Maps to | Notes |
| --- | --- | --- |
| meta | — | Prototype banner, disclaimer (01 §F.1), CRS string, data version |
| nums | 02 §E.6 `provenance` map; 05 Crew / Vehicle / PlanResult fields | Every displayed number as {v, unit, prov, src}; src is a spec section or PLACEHOLDER |
| site | 05 §C.1 Site, Layer, RoutingGrid, EnvConstant | Subset: layers with legends, default start, hab mast, env constants |
| pois | 05 §C.1 POI (+ v2 stop_type, ez_theme, evidence) | Three EZ POIs with catalogue codes |
| param_sets | 05 §C.1 ParamSet | Suit, PR1, UR1, link, alert, shielding |
| scenario | 05 §C.2 Scenario, ScenarioEvent; 02 §E.7 | storm-sol4190 with events e1 (DONKI) and e2 (Earth message) |
| dose_series | 05 §C.2 DoseSeries | Shape placeholder until U-15; integral check expected 8,100 µGy |
| earth_link | 05 §C.2 EarthLinkTable | Rows and passes PLACEHOLDER until U-18 |
| options | 05 §C.2 ContingencyOption | Rendezvous, abort, continue-skip |
| alerts | 05 §C.2 Alert (code, level, message) | Copy for each alert code; sources cited |
| log | 05 §C.2 LogEvent | Eight events with seq, kind, actor, provenance |
| snapshot_example | 02 §E.6 SNAPSHOT | Same shape; numbers wrapped for the audit |
| sources | 05 §C.1 DataSource | Ten dataset records with DS codes |

[02 §E.6](../specs/02_Technical_Requirements_Document.md#e6-websocket-protocol-ws) messages (`HELLO`, `SNAPSHOT`, `STATE_DELTA`, `EVENT`, `COMMAND`, `COMMAND_RESULT`) and [05 §C.2](../specs/05_Backend_and_Database_Schema.md#c2-runtime-entities-hab-core-v2) entities are reflected in `snapshot_example`, `log`, `options`, `alerts` and `scenario`; field names are the 05 names so they can be bound to real data later.

### Placeholder inventory

Every `PLACEHOLDER` and what unblocks it (counts are fixture numbers):

| Unblocked by | Count | Fixture keys |
| --- | --- | --- |
| TASK-02 | 2 | `coord_ph`, `coord_ph2` |
| TASK-05 | 2 | `p_over_a`, `p_over_b` |
| TASK-05b | 4 | `p_t_haven`, `rdv_eta_ph`, `pr_eta`, `sev_dist_ph` |
| TASK-05b / TASK-21 | 3 | `opt3_eta`, `opt_dose`, `opt_drops` |
| TASK-05b / TASK-22 | 2 | `haven_ev2`, `haven_ph1` |
| TASK-06 | 4 | `p_sunel`, `p_ltst_start`, `p_ls`, `p_my` |
| TASK-06 (Mars24) | 1 | `sun_elev` |
| TASK-21 | 2 | `ltst_ph`, `asof_ph` |
| TASK-22 | 21 | `plan_rev_new`, `o2_ev2`, `o2_left_ev2`, `dose_ev2`, `eva_ev2`, `dist_ev2`, `bearing_ev2`, `eta_ev2`, `r_tshel`, `r_stops`, `r_resp`, `o2_ph1`, `o2left_ph1`, `eva_ph1`, `dose_ph1`, `bearing_ph1`, `dist_ph1`, `eta_ph1`, `dwell_ph`, `ack_t`, `rev_ph` |
| TASK-22 (NFR-06) | 1 | `log_hash` |
| TASK-22 / TASK-21 | 2 | `r_recv`, `r_unsh` |
| TASK-24 | 1 | `reconn` |
| TASK-29 | 2 | `ur_battery`, `ur_eta` |
| U-15 (RAD sol-4190 series) | 2 | `rate_now`, `rate_bg` |
| not modelled for PR1 (02 §D.9) | 1 | `pr_bat` |

Text placeholders (not numbers): the EZ—ENG 01 name, dataset versions and licences marked `TODO(verify)`, the Hab Core join address, the QR codes (real ones come from `GET /api/join-qr?role=`).

## Accessibility notes

- Contrast: BRIEF/OPS text ≥ 4.5 : 1, non-text ≥ 3 : 1, HUD ≥ 7 : 1; the Design system page computes every pair live and compares it with the 04 §C.1 value.
- The EVA status line is a status like any other: nominal icon (circle with check), the word NOMINAL, and the fixed alert slot; it is not an aria-live region so nothing is announced while it is idle.
- Four cues per status: colour + shape + word + fixed slot. The Grayscale toggle applies a grayscale filter and the badge counts statuses that have all four cues.
- Focus: white 2 px ring with a 2 px void gap on every control; chamfered controls draw the ring on a wrapper because clip-path clips outlines.
- Targets: EVA ≥ 56 px with ≥ 8 px gaps (measured in Chromium for all 32 EVA state × device combinations); ops mouse ≥ 32 px.
- Live regions: warnings role=alert + aria-live=assertive; cautions and advisories role=status + polite; crew cards and options are lists with full text.
- No hamburger menus, no hover-only actions, no gesture-only paths in OPS/EVA; hidden content shows a count (alert "+N", log "n / m").
- Reduced motion: no flashes (static bar) and no marker interpolation; animations and transitions are disabled.
- Never colour alone for focus, selection or current step (P10): ring + outline + marker + label.

## Deviations from spec

| ID | Item | Spec says | Prototype / proposal | Status |
| --- | --- | --- | --- | --- |
| DV-01 | EVA tablet orientation | 04 §E.5 portrait only; 04 §F "EVA 360–1024 px portrait"; 01 FR-32 "in portrait" | Portrait **or** landscape; default landscape. Landscape v2: HAVEN and O₂ are two compact cards top-left, NEXT sits under them, and the mini-map takes the whole right column. Budget at 844×390: alert 64 · body 230 · strip 24 · one action row 72 = 390 px. | Proposed — ratify via U-30 |
| DV-02 | SCR-14 in landscape | 04 §E.7 "bottom sheet covering 70 % of the screen" | Right-side panel over the map column (about 53 % of the width, not 60 %, so that both cards and NEXT stay visible), below the alert bar; "Go — option N" hold button at the panel bottom. No O₂ echo is needed (G-22 superseded). | Proposed |
| DV-03 | EVA alert slot when there is no alert | 04 §D.1 "Hidden (dark cockpit)"; 04 §A.3 "nominal is quiet" | The 64 px slot stays reserved and shows a quiet status line on the EVA tablet: status icon + word (NOMINAL, STANDBY, EVA ENDED) + detail + current phase. The alert bar replaces it in the same slot the moment an alert is raised. Ops and HUD still leave the slot empty (G-02). | Proposed — U-43 |
| DV-04 | HUD alert casing | 04 §E.6 uppercase | Sentence case, identical words on ops, EVA and HUD (G-26). | Proposed |
| DV-05 | High-contrast alert bars | 04 §F: HC switches to the HUD palette | White on warning-fill is 6.54 : 1 (< 7 : 1), so HC bars are black with a 4 px status-colour outline and status-colour text. | Proposed — U-37 |
| DV-06 | EVA high-contrast toggle location | 04 §F requires the toggle; §E.5 has no slot | Frame-chrome toggle in the prototype (G-29). | Unresolved — U-31 |
| DV-07 | PRINT neutral tokens | 04 §C.1 lists four PRINT colours | Added text-2 #4B5563, edge #6B7280, hairline #D1D5DB, advisory #1D4ED8, unknown #6D28D9 (G-15). | Proposed — U-33 |
| DV-08 | Comm-shadow layer in the prototype | 02 §C.5 L11 / §D.11 viewshed | Hand-placed schematic polygons; the real layer comes from comm_hab.u8 (TASK-03). | Prototype only |
| DV-09 | Route hash forms | 03 §A `#/planner` … | Plain `#name` forms accepted and used in links (G-18). | Prototype only |
| DV-10 | Sound default | 04 §C.7 mute toggle with SOUND OFF indicator | Prototype starts muted so many frames do not alarm; toggle shows SOUND ON / SOUND OFF. | Prototype only — U-38 |
| DV-11 | Fonts and icons | 04 §G self-hosted WOFF2; Lucide | Google Fonts with fallback stacks and an own icon set in the prototype (G-19). | Prototype only — U-27, U-40 |

### Draft patch text

The text below is a **Proposal** for the owners of the specs. It does not edit them.

#### Replacement for 04 §E.5 (adds the landscape layout) and the SCR-14 landscape variant

##### E.5 SCR-12 EVA tablet (OPS, phone/tablet, portrait or landscape, short side ≥ 360 px)

**Portrait** (unchanged):

```text
┌──────────────────────────────┐
│ ALERT BAR / STATUS LINE      │  fixed, 64 px
├──────────────┬───────────────┤
│ HAVEN        │ O₂            │  the two biggest numbers
│ 14 MIN       │ 71 %          │  56 px Plex Mono
│ via PR1  ○   │ 5:41 left ◇   │
├──────────────┴───────────────┤
│ NEXT  Stop 3 · Boxwork ridge │
│ ↗ 040°  ·  0.42 km · 9 min   │
├──────────────────────────────┤
│ MINI-MAP                     │
├──────────────────────────────┤
│ EVA 2:14 · DOSE 0.1 mGy · ▮▮▮│  metadata strip
├──────────────────────────────┤
│ [ SUMMON ROVER ] [ ABORT ]   │  56–72 px, hold-to-confirm
│ [ TASK ROVER (T2) ]  [ HUD ] │
└──────────────────────────────┘
```

**Landscape** (new; default). Fixed geography kept: alert bar at the top, HAVEN top-left with O₂ immediately to its right, the metadata strip above the actions, the actions at the bottom. The mini-map takes the whole right column.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ALERT BAR, or STATUS: NOMINAL when none                  fixed 64 px │
├────────────────┬────────────────┬────────────────────────────────────┤
│ HAVEN 14 MIN   │ O₂ 71 %        │                                    │
│ via PR1  ○     │ 5:41 left ◇    │   MINI-MAP                         │
├────────────────┴────────────────┤   the whole right column:          │
│ NEXT  Stop 3 · Boxwork ridge    │   route, me, buddy, shadow, PR1    │
│ ↗ 040°  0.42 km  9 min          │                                    │
├─────────────────────────────────┴────────────────────────────────────┤
│ EVA 2:14 · DOSE 0.1 mGy · LINK ▮▮▮                       strip 24 px │
├──────────────────────────────────────────────────────────────────────┤
│ [ SUMMON ROVER ] [ ABORT TO HAB ] [ TASK ROVER (T2) ] [ HUD ]  72 px │
└──────────────────────────────────────────────────────────────────────┘
```

Height budget at 844 × 390: 64 + 230 + 24 + 72 = 390 px, no scrolling. The body is 230 px: cards row 100 px, 8 px gap, NEXT card 110 px, 12 px padding. The left column is 46 % of the width. HAVEN and O₂ values are at least 56 px (56 px on phones, 64 px on tablets); NEXT values are at least 32 px (48 px on tablets, stacked). On rotation the alert bar stays at the top, HAVEN stays top-left, the strip stays above the actions and the actions stay at the bottom; O₂ stays immediately right of HAVEN on the same row, and NEXT and the mini-map change place.

**SCR-14 in landscape:** a right-side panel over the map column (about 53 % of the width) below the alert bar replaces the 70 %-height bottom sheet. HAVEN, O₂ and NEXT stay visible in the left column; the "Go — option N" hold button sits at the bottom of the panel.

#### Replacement for the 04 §F "Responsive" row

```text
| Responsive | BRIEF fluid 360–1920 px. Planner/ops ≥ 1280 three-column; 1024–1279 one drawer at a time; ops < 1024 shows a "use a larger screen" notice. **EVA: phone or tablet, portrait (360–1024 px wide) or landscape (≥ 844 × 390 px); default landscape; the same fixed geography in both.** HUD landscape ≥ 640 px |
```

#### Replacement for the first acceptance bullet of 01 FR-32

```text
- Works on a phone/tablet ≥ 360 px wide in portrait **or ≥ 844 × 390 px in landscape**; touch targets ≥ 56 px (glove use, **Assumed**); the alert bar, HAVEN (top-left), O₂, metadata strip and action row keep their positions in both orientations.
```

Also change the `Content` line of 03 §B SCR-12 ("Entry `#/eva/EV1`") to say "portrait or landscape", and the 04 §D.1 "Alert bar" row to "slot always reserved; the EVA tablet shows a status line (NOMINAL, STANDBY, EVA ENDED) while there is no alert, ops and HUD leave it empty" (DV-03).

## Conflicts and gaps

Every conflict or gap found while building, with how it was handled. None was resolved silently.

| ID | Where | Conflict or gap | How it was handled |
| --- | --- | --- | --- |
| G-01 | 04 §E.5, §F Responsive row; 01 FR-32 | EVA is portrait-only in the specs; the team now wants landscape. | Added as a **Proposed** deviation with draft patch text (see Deviations) and Unresolved U-30. |
| G-02 | 04 §D.1 vs §A.3 #4 / §E.5 | Alert bar is "hidden" when nominal, but fixed geography says top and "fixed, 64 px". | The 64 px slot is always reserved. On the EVA tablet it shows a quiet status line when there is no alert (team feedback 2026-11-05, DV-03); ops and HUD keep it empty. The alert bar replaces the line in the same slot, so nothing shifts. |
| G-03 | 02 §E.6 EVENT; 05 Warning.severity vs 04 §C.1 | `severity:"blocked"` and `caution\|blocked\|unknown` versus the rename `blocked → warning`; 05 Alert.level uses warning/caution/advisory. | Runtime alerts use 05 `level`; planner warnings keep 05's enum and render as the ⬣ warning icon. |
| G-04 | 05 §F.6 vs 04 §D.2 | Log example "Radiation surge — shelter now" vs the action — reason grammar. | 04 wins: "Shelter now — radiation surge". 05 §F.6 should be corrected. |
| G-05 | 04 §E.4/E.5 vs 05 Crew, 02 §C.5 L9 | Dose shown in mGy; the schema stores µGy and forbids Sv conversion. | Literal example strings in the prototype; the unit formatter is a TASK-24 item. |
| G-06 | 04 §E.4 vs §E.5 | EV1 dose 0.0 mGy vs 0.1 mGy at apparently the same moment. | 0.0 before the alert, 0.1 from the alert; both cited. |
| G-07 | 04 §D.3 vs 01 §E.1 | Confirmation copy says "ETA 12 min"; the rendezvous option is 14 min. | 14 min used. |
| G-08 | 04 §D.2 vs 03 §C.6 step 7 | "Comm shadow in 120 m — stay with EV2" vs "Comm shadow ahead — …". | First is the caution-bar text; second is the journey label. |
| G-09 | 03 §B, 04 §B.2 | No mode named for SCR-00 or SCR-18. | SCR-00 = OPS (**Proposed**); SCR-18 inherits the host mode. |
| G-10 | 03 §B SCR-05 | States row omits Over limits although the content and 03 §E.4 include it. | Added. |
| G-11 | 04 §E.10 vs team codes | "Number is the POI's order in pois.geojson" vs codes SCI 01 / RES 02 / ENG 01 that look per-type. | The three codes used as given. Unresolved U-34. |
| G-12 | 01 §E.1 + 04 §E.5 | Only stop 2 (resource) and stop 3 (Boxwork ridge) are fixed. | Stop 1 = EZ—ENG 01 with a placeholder name (**Proposed**). |
| G-13 | 02 §E.2 / §E.6 vs 05 §F.1–F.3 | Illustrative coordinates disagree (boxwork at 2410/−1875 vs 410/325; hab −1800/−1500). | Map is schematic; metre coordinates only for the 02 §E.2 sample and the 05 §F.1 hab. |
| G-14 | 02 §E.6 vs 04 | Snapshot haven 18.4 min vs 14 min; `sim_time` 13:05Z vs LTST 13:05 (different clocks). | 14 min used; UTC and LTST kept separate and labelled. |
| G-15 | 04 §C.1 | PRINT defines only four colours. | Neutral print tokens added as **Proposed** (text-2, edge, hairline, advisory, unknown). Unresolved U-33. |
| G-16 | 04 §C.1 | "⬣ octagon": U+2B23 is a hexagon. | An octagon is drawn, per the word. |
| G-17 | 03 SCR-13 vs 04 §E.6 | "Five values" vs a diagram that also shows STOP 3, 5:41 LEFT, SIM. | Those are sub-labels of the five values (**Proposed** reading). |
| G-18 | Artifact host vs 03 §A | The host only passes plain `#name` hashes, not `#/path`. | Router accepts both; links use `#scr-12-walking-landscape`; the UI shows the 03 §A route. |
| G-19 | 04 §G vs prototype brief | Google Fonts in a prototype vs offline self-hosted WOFF2 in product. | Prototype only. Product self-hosts WOFF2; licences pending (U-27, U-40). |
| G-20 | 04 §F | "ops < 1024 shows a notice" vs a requested 1024 preview. | 1024 shows one-drawer mode; a 900 px frame shows the notice. |
| G-21 | 04 §C.6 / §D.5 | The brief's own prose says "live values". | Documentation wording only; UI copy says replayed / simulated / computed. |
| G-22 | 04 §E.7 vs landscape SCR-14 | A right panel at 60 % width would have covered the O₂ block (first landscape layout). | Superseded by landscape v2: the panel covers only the map column (about 53 %), so HAVEN, O₂ and NEXT stay visible and no echo is used. |
| G-23 | Unresolved numbering | 04's last ID is U-27, but U-28 and U-29 are used by 03. | New items start at U-30. |
| G-24 | EVA landscape "quadrant" invariance | With the two compact cards top-left and the map on the whole right column, strict screen quadrants cannot hold for O₂, NEXT and the mini-map. | Exact for alert slot, HAVEN (top-left), metadata strip and action row. O₂ moves from top-right (portrait) to beside HAVEN (landscape) but stays immediately right of HAVEN on the same row in both; NEXT and the map reflow. Measured on the Orientation compare page. U-30. |
| G-25 | 03 §C.6 steps 7–8 vs 04 §D.2 | Crew are said to see the caution and the advisory, but there is one bar slot and the highest level wins. | A latched warning hides them behind "+N"; the demo auto-opens the alert list. Unresolved U-32. |
| G-26 | 04 §E.6 vs §D.2 / §C.2 | HUD alert shown in uppercase; alerts are sentence case and must read the same on every device. | Sentence case. **Proposed**. |
| G-27 | 04 §C.1 | Advisory and unknown share the dotted diamond. | They differ by inner glyph (i vs ?) and word. Check in TASK-15 (U-41). |
| G-28 | 04 §C.2 | Microcopy is 11 px but the rule says minimum 12 px anywhere. | 11 px for chips and module labels only; values and body never below 12 px (EVA 16 px). |
| G-29 | 04 §F vs §E.5 | An EVA high-contrast toggle is required but the layout has no slot for it. | Prototype: toggle in the frame chrome. Product placement Unresolved U-31. |

## Unresolved items

IDs continue after U-29 (04 ends at U-27, but U-28 and U-29 are used in 03).

| ID | Item | Owner | Due |
| --- | --- | --- | --- |
| U-30 | Ratify the EVA landscape layout (compact HAVEN and O₂ cards top-left, NEXT below, map on the whole right column) and the SCR-14 right panel over the map column (04 §E.5, §E.7, §F; 01 FR-32); confirm that O₂, NEXT and the mini-map may change place between orientations while HAVEN, alert, strip and actions do not (G-24). | Sadman / Obidit | Before 10 Nov (TASK-24 start) |
| U-31 | Where does the EVA high-contrast toggle live on the real tablet? Proposal: a fifth compact action-row button or a system quick-setting. | Design (R6) + R5 | TASK-13 |
| U-32 | Should lower-level alerts interrupt a latched warning bar briefly, or stay behind "+N" (03 §C.6 steps 7–8 vs 04 §D.2)? | Sadman | TASK-24 |
| U-33 | Ratify the added PRINT neutral tokens (G-15). | Design (R6) | TASK-13 |
| U-34 | EZ code numbering: global order in pois.geojson or per stop type (04 §E.10)? | R1 + R6 | TASK-04 |
| U-35 | Final content for stop 1 (EZ—ENG 01): name, objective, image. | R1 + R6 | TASK-04 |
| U-36 | Dose display unit rule (mGy in 04 §E.4/E.5; µGy in 05; no Sv for the event). | R2 + R5 | TASK-24 |
| U-37 | High-contrast alert bars: confirm the outlined variant (white on warning-fill is 6.54 : 1). | Design (R6) | TASK-13 |
| U-38 | Product sound default (prototype starts muted). | R5 | TASK-25 |
| U-39 | Replace the schematic map with the real basemap, slope, TI and comm_hab layers; recheck all overlay contrast on real imagery. | R1 + R3 | TASK-03 / TASK-07 |
| U-40 | Self-host WOFF2 and verify Chakra Petch, Inter, IBM Plex Mono, Source Serif 4 and Lucide licences (extends U-27). | R6 | TASK-13 |
| U-41 | Usability check that advisory (i) and unknown (?) are distinguishable in grayscale (G-27). | R6 | TASK-15 |
| U-42 | Wire messages carry raw numbers plus a provenance map; the fixture wraps every number as {v, unit, prov, src}. Decide the production adapter. | R4 + R5 | TASK-20 |
| U-43 | Ops and HUD still leave the idle alert slot empty. Decide whether ops should also show a status line, and whether an always-on NOMINAL line on the EVA tablet is compatible with "nominal is quiet" (04 §A.3); check with UT-7. | Design (R6) + R5 | TASK-15 |

## Usability test script for TASK-15

Extends [04 §F.1](../specs/04_Design_Brief.md#f1-mission-critical-usability-checks-task-15) with the landscape-vs-portrait glove test. Three non-team users; thick gloves on a touchscreen phone; the prototype's Alerting state; do not explain the controls.

| ID | Task | Pass | Source |
| --- | --- | --- | --- |
| UT-1 | 3-s glance: from the HUD read haven, O₂ and next stop (Warning state). | ≥ 2 of 3 users read all three within 3 s | 04 §F.1; 01 §B.2 |
| UT-2 | Summon rover with gloves, no instruction, on the EVA tablet in **landscape**. | ≥ 2 of 3 users, < 15 s | 04 §F.1 |
| UT-3 | Ops: identify who is in danger and approve an option. | ≥ 2 of 3 users, < 20 s | 04 §F.1 |
| UT-4 | Grayscale screenshots of warning, caution, advisory, nominal, unknown: name each level. | 100 % of alert levels | 04 §F.1 |
| UT-5 | **Added:** glove test, landscape vs portrait. Each tester summons the rover and aborts on the same phone in both orientations (order alternated), gloves on, in the Alerting state. | Record time and mis-taps per orientation; target: landscape no worse than portrait by more than 2 s and ≤ 1 mis-tap per run. Result decides U-30. | New |
| UT-6 | **Added:** rotate the phone mid-alert; point to haven and O₂ before and after rotating. | Both found again without searching (≥ 2 of 3): HAVEN is top-left in both, O₂ is the card right of it | New (G-24) |
| UT-7 | **Added:** Nominal state on the EVA tablet with and without the status line in the alert slot: read haven, O₂ and next stop, then say what the top line means. | Reading time no worse than without the line by more than 0.5 s; ≥ 2 of 3 testers say what the line means | New (DV-03, U-43) |

Procedure for UT-5: alternate the starting orientation between testers; record time to a completed hold and the number of mis-taps; repeat for Abort. If landscape is worse than portrait by more than the margin, keep landscape optional and fix the layout before adopting it (U-30).

## Verification

Run with headless Chromium and the real fonts (local copies), using real pointer events. Scripts are in `docs/design/prototype/test/`.

| Check | Result |
| --- | --- |
| Every screen × state × frame size renders (219 combinations) | pass, 0 errors, 0 missing fixture keys |
| EVA layout: 8 states × 4 devices | pass, 32 of 32 (no scroll, no overflow, ≥ 56 px values and targets, ≥ 8 px gaps) |
| Provenance on every displayed value, all 219 frames | pass, 2,802 values, 0 without provenance (856 are placeholders) |
| Four cues (word + shape + slot) on every status, all 219 frames | pass, 378 statuses, 0 failing |
| Interactions (hold-to-confirm, tap fallback, alerts, stale, queued, HUD exit, high contrast, mute, keys, planner, drag-to-failure, Stage, player) | pass, 42 of 42 |
| EVA status line (swap with the alert bar in the same slot, 3 devices, return after acknowledge + clear, standby / ended / no-link / sheltered) | pass, 17 of 17 |
| Review toggles (annotations, grayscale, reduced motion, placeholders) | pass, 7 of 7 |
| Token contrast | pass, 34 stated ratios reproduce (PRINT text 17.74 vs 17.7) |
| markdownlint on this file | pass, 0 issues (markdownlint-cli2 0.24, default rules with MD013 line length disabled because the tables need long lines; the repo config was not available) |
| Spec links in this file | pass, every link into 01–06 resolves to an existing heading (checked against the spec files) |

**Not verified:** behaviour in the hosted artifact (hash links, Google Fonts), other browsers (only Chromium), real devices and gloves, screen readers, print output, the demo player pacing at 1×/10×/60× over a full run, and prose or alert strings that embed numbers (for example "ETA 14 min"): those carry their source in `fixture.alerts[].src`, but the numbers inside the strings have no chip. The audit counts only values rendered through the value component.

## Prototype source and rebuild

```text
docs/design/prototype/
  marswalk-prototype.html      built page (self-contained)
  fixture.json                 the fixture block
  build.py                     assembles CSS + fixture + JS into the page
  src/fixture.py               fixture generator (numbers with src / PLACEHOLDER)
  src/handoff_data.py          single source for the tables in this file
  src/css/, src/js/            tokens, components, screens
  test/                        Chromium tests and the contrast script
```

Rebuild: `python3 build.py`. Run tests: `cd test && npm install && node t3.mjs` (and `t6`, `t9`, `t12`, `t18`, `t26`). The fixture and the prototype are design artefacts: they are not part of the product build, and no value in them is computed.

## Credits

Data credit shown in the prototype (SCR-09 and SCR-17): NASA/JPL-Caltech (MSL RAD, Curiosity), NASA CCMC (DONKI), NASA NAIF (SPICE), USGS Astrogeology (Gale merged DEM, orthophoto, THEMIS), ESA (Mars Express HRSC inside the DEM; ExoMars TGO kernels). No NASA or other agency logos or insignia are used. The prototype and this file were produced with an AI coding assistant; see [AI use](../AI_USE.md).
