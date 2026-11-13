# Package 99 A.5 — numbers review, round 2

Reviewed baseline: `251708b` on `fe-numsrev`, 13 Nov 2026. This completes the **narrowed numbers assignment**, not the other outstanding package 99 audit sections. No priority area or file in the six requested areas was left unreached. No current frontend physics formula was found. One invented fallback quantity was found: **0** for missing snapshot counts (crew, vehicles and haven links); fixed in this round. Three further provenance/no-data defects were fixed.

## Displayed values first

The existing `tests/ui/provenance.test.ts` walks digit-bearing **text nodes**, accepts labels on ancestors, and checks six class names plus nonempty sources. It does not inspect native form `.value`, prove that a source actually supplied a value, distinguish an invented zero from a supplied zero, or prove that a labelled formula is legitimate. It omits SCR-02 canvas text and the standalone SCR-15/16/19/20 compositions; compact rover cards in SCR-11 also omit the standalone header. Its allowlist intentionally excludes identifiers, map scale and debug chrome (FD-110). Source review and the existing screen-specific suites covered these gaps; this round adds regressions for the actual findings.

| Surface / renderers inspected | Numeric origin and permitted presentation | Missing value / label result |
| --- | --- | --- |
| SCR-00/01 briefing and errors | Site/manifest, scenario assumptions, demo plan and HTTP/error identifiers; no copied POI coordinates | Values labelled; identifiers excluded; absent start time stays empty with validation |
| SCR-02/03 map workspace, inspector, layers, placement notices | Worker point samples and manifest layers; projected cursor/view coordinates; scenario slope edges, manifest ramp stops/native resolution; opacity is a chosen UI setting | **Fixed:** range `.value` had no labels (FD-547). **Fixed:** absent TI now `— no data`, keeping unavailable/source/class (FD-550). Other missing samples use — |
| SCR-04/05/07/08 plan, stops, results, conditions, briefing | Plan/scenario/worker totals, per-leg profiles, timeline and warnings. LTST calls compute; chart cumulative sums and projected interpolation are display bookkeeping (FD-082). h→min and m→km only change units | Metric/row attributes carry provenance/source; partial/no-route totals, missing bands/conditions/dose/O₂ rate remain —; no client replacement science |
| SCR-06/09 POIs and methods | Manifest POI fields, source/version/constants/ParamSets and explicitly identified equations | Missing fields unavailable; citation ids/equations are identifiers, not invented observations |
| SCR-10 join, QR and role chrome | Server scenario/session state and known role identifiers | Missing server data is —; no measured-looking fallback |
| SCR-11 ops and map layer rows | Snapshot crew/vehicle/conditions; task and queue counts; server event times. O₂ fraction→percent and µGy→mGy are display conversions. Comm masks and haven contours only draw supplied grids/time fields | **Fixed:** no snapshot produced `Crew — 0`, `Vehicles — 0`, `Haven per crew — 0`; now unavailable —. Genuine empty snapshot counts remain 0 (FD-549). Snapshot-present haven-link count is a tally of drawn supplied links |
| SCR-12/13/14/18 EVA, HUD, options, link loss and full map | `crew.haven.minutes`, `o2_frac`, `o2_remaining_min`, `next_stop_*`, elapsed/dose/hops and option values from Snapshot/alerts. Age subtracts supplied sim timestamps; transport age uses the client watchdog only | Selectors guard finite values; absent values remain unavailable —. No flat-speed distance→ETA, eight-hour oxygen reserve, 4-minus-hops bars, or invented target coordinates remain. Full-map metres/pixel is view geometry |
| SCR-15 / standalone rover queue | Snapshot/command-result target, ETA and battery; queue metrics are server supplied. No client preview estimate | Values use sourced rows and unavailable —. **Fixed:** standalone `UR1` header needed the existing identifier hook (FD-548), not a scientific provenance class |
| SCR-16 Earth | Precomputed light time, next relay pass and queue; delayed summary remains explicitly unavailable | Seeded zero light time is already rejected; queue zero is counted from a supplied array; no client orbital geometry |
| SCR-17 report | API report dose/timings/counts. Maximum shelter response selects a supplied duration, then rounds min for display; trace extent is display bounds, not route distance. Trace 30 s comes from `packages/protocol/src/report.ts` and 05 U-24 | Missing report/dose/time values remain — with unavailable attributes; no dose integration, shielding or unit conversion between absorbed and equivalent dose in UI |
| SCR-19/20 presenter/setup | Snapshot clock and mission setup; candidate coordinates/mast/source from manifest; input bounds from 05 MissionScenario | Missing settings/candidate facts stay unavailable. Crew choices intentionally equal scenario crew length (05 Scenario, FD-347); a trial snapshot violating that invariant was discarded, not “fixed” |

## Findings and red-first evidence

| Finding | Verdict and fix | Red test count | Green evidence |
| --- | --- | --- | --- |
| Opacity range value outside text walk | UI CONSTANT value, but missing provenance/source: assumed `user:layer.<id>.opacity` | 1 | `provenance.test.ts`: opacity control's displayed numeric value |
| Standalone rover `UR1` | REAL identifier from `tests/fixtures/ws/rover-queue.json`; missing identifier hook, now `data-identifier` on id only | 1 | `provenance.test.ts`: standalone rover card identifier |
| Missing snapshot crew/vehicle/haven counts | INVENTED 0, now nullable counts → —, `data-unavailable` and `unavailable:` sources; actual supplied zeros retained | 1 | `map/opsLayers.test.ts`: absent snapshot counts before first update, empty snapshot and after reset |
| Missing thermal inertia | No invented numeric literal, but omitted the required —. Now `— no data`, same unavailable attributes | 1 | Strengthened `inspector.test.ts`: TI with no coverage |
| **Total** | Four defects; no backend contract change needed | **4** | All targeted suites: **209 passed**, no failures |

The final red run for the rover finding used the committed `rover-queue` snapshot and failed on unlabelled `UR1`; earlier fixture-selection errors are excluded from the red count. The invalid crew-count trial is also excluded. Each regression failed on the intended assertion before its fix, so no newly passing test required a mutation substitute. The active browser `provenance` check now explicitly checks opacity range attributes in addition to its text walk. No harness assertion was disabled or weakened.

## Literal and package-history scope

The six areas contain **42 files**. The ledger below records every digit-bearing, non-comment source line in those files at the reviewed baseline: **772 lines / 1,316 token occurrences**, including repeats, CSS/regex/string tokens and identifier digits. This is deliberately a lexical superset of JavaScript numeric literals: metadata/identifier digits are called out as such, not claimed as measurements. Signs are operators and remain visible in the linked source. Files with no numeric tokens are explicitly listed. Every occurrence on a line has the line's verdict; no unexplained default bucket remains.

For priority areas 1–5, reviewed `git log --no-merges --reverse -p 1315bfe^..HEAD -- <paths>` (5,254 diff lines, 698 digit-bearing changed/header lines) and the current files. The lower bound is the parent of package 05, the first full-run package changing these paths; no priority-1–5 path changed between package 03 and that parent. Existing unchanged constants are also covered by the current-source ledger. Shared components include package 03 and package 05 formatting, independently of that history bound. This is a scoped diff review, not a claim about every file in the entire repository history.

Historical replacements were checked as well: the old SCR-01 dose narration `0.19 mSv / 7 h` was REAL text from `docs/specs/01_Product_Requirements_Document.md` §E.2, removed in package 15 so the worker supplies the dose; the old full-map `Slope (>15°)` label used the REAL 05 default, and package 18 removed that static label. Chart constants `170`, `720`, `230`, `460`, `78`, `58`, `40`, `22`, `56`, `106`, gap `24`, marker/line widths, contour case bits and old hatch dimensions are UI CONSTANTS. Former oxygen/bars formulas mentioned in comments are absent from executable reviewed package changes. No invented physics constant remains in the requested areas; the missing-count zero is the only current INVENTED numeric fallback found.

### Package changes examined

| Commit | Package work | Scoped paths |
| --- | --- | --- |
| `1315bfe` | feat(web): T08.02, T08.03, T12.01 plan store, number formats, Metric component; SCR-05 tiles on Metric (FR-05, FR-06, FR-15, FR-54, NFR-05; FD-058, FD-089, FD-090, FD-106, FD-124, FD-222–FD-225) | `apps/web/src/state/planStore.ts` |
| `034574c` | feat(web): T07.06, T07.08, T07.13, T13.06 SCR-02 workspace, map mount, keyboard, debug overlay; boot sends LOAD_GRID (FR-01, FR-03, FR-15, NFR-01; FD-063, FD-080, FD-118, FD-202, FD-228-FD-231; BD-40) | `apps/web/src/ui/context.ts`, `apps/web/src/ui/map/createMap.ts`, `apps/web/src/ui/map/keyboard.ts` |
| `129827e` | feat(web): T07.07, T07.09, T07.10, T07.11, T07.12, T07.18 SCR-03 layers panel, EZ layer, scenario slope classes, layer wiring (FR-02, FR-15, FR-16, FR-17, FR-45; FD-003, FD-065, FD-074, FD-075, FD-076, FD-079, FD-107, FD-111, FD-232-FD-235) | `apps/web/src/ui/context.ts`, `apps/web/src/ui/map/ezLayer.ts`, `apps/web/src/ui/map/inspector.ts`, `apps/web/src/ui/map/poiLayer.ts`, `apps/web/src/ui/map/rasterLayers.ts`, `apps/web/src/ui/map/tokenColors.ts`, `apps/web/src/ui/map/traverseLayer.ts` |
| `eb2bc59` | feat(web): T08.06-T08.10 waypoint markers, placement validation, add-stop, drag, touch, keyboard move (FR-06, NFR-04; FD-001, FD-112, FD-116, FD-117, FD-119, FD-239-FD-243) | `apps/web/src/ui/map/addStopMode.ts`, `apps/web/src/ui/map/keyboard.ts`, `apps/web/src/ui/map/keyboardMove.tsx`, `apps/web/src/ui/map/touchInput.ts`, `apps/web/src/ui/map/waypointDrag.ts`, `apps/web/src/ui/map/waypointLayer.css`, `apps/web/src/ui/map/waypointLayer.ts` |
| `5b4d871` | feat(web): T09.01-T09.05 T09.09 route profile and results (FR-07-FR-12, FR-39, FR-42) | `apps/web/src/ui/map/routeGeometry.ts`, `apps/web/src/ui/map/routeLayer.ts`, `apps/web/src/ui/results/profileChart.ts`, `apps/web/src/ui/results/profileLink.ts`, `apps/web/src/ui/results/warningsList.ts` |
| `5d9c522` | fix(web): T24.03 T24.04 T31.05 read EVA telemetry (FR-32 FR-50) | `apps/web/src/ui/eva/viewModel.ts` |
| `8afec6e` | feat(web): T24.04 T24.05 T31.05 build EVA tablet (FR-32 FR-50) | `apps/web/src/ui/eva/viewModel.ts` |
| `a7b155a` | fix(web): validate POI stops and label missing results (T09.02 / T10.01; FR-06, FR-08, FR-15) | `apps/web/src/ui/results/profileChart.ts`, `apps/web/src/ui/results/warningsList.ts` |
| `3577fe0` | feat(web): SCR-01 mission briefing and SCR-09 sources and methods (T07.05, T12.03) | `apps/web/src/ui/demoPlan.json` |
| `3656580` | fix(web): preserve profile gaps and accessible worker bands (T09.02 / T10.04; FR-08, FR-15, FR-39, FR-42) | `apps/web/src/state/planStore.ts`, `apps/web/src/ui/results/profileChart.ts`, `apps/web/src/ui/results/profileLayout.ts`, `apps/web/src/ui/results/profileLink.ts`, `apps/web/src/ui/results/warningsList.ts` |
| `ca9a4c4` | fix(web): keep the EVA landscape layout inside the height budget (T24.04; FR-32, NFR-04) | `apps/web/src/ui/map/createMap.ts` |
| `e3e7bdd` | feat(web): show the link hops and via, no bars (T24.02 T24.03; FR-32, N-04) | `apps/web/src/ui/eva/viewModel.ts` |
| `536ac05` | fix(web): replay hash result, shared delta applicator, SHA-256 fallback (T27.03 / T27.05; FR-34, FR-46) | `apps/web/src/net/habClient.ts` |
| `2db0c61` | fix(web): the NEXT card names the stop its navigation points at (T24.04; FR-32, FD-047) | `apps/web/src/ui/eva/viewModel.ts` |
| `ad00df7` | fix(web): the EVA mini-map shares the ortho class and tells me from buddy (T24.04; FR-32, FD-003) | `apps/web/src/ui/map/opsLayers.ts`, `apps/web/src/ui/map/rasterLayers.ts` |
| `93d445b` | fix(web): scope the task editor provenance check and label the two numbers outside it (T32.26 / T32.27 / T32.28; FR-54, FR-15) | `apps/web/src/ui/map/keyboardMove.tsx` |
| `55d31ba` | fix(web): map shortcuts act only from the viewport, the body or a map control (T32.26 / T32.27 / T32.28; FR-54) | `apps/web/src/ui/map/keyboard.ts` |
| `bc9b3d2` | feat(web): T25.02 T29.04 T29.05 ops map layers, SCR-15 from the vehicle card, rover queue (FR-39, FR-41, FR-42) | `apps/web/src/ui/map/opsLayers.ts` |
| `cf4578b` | feat(web): T11.03 T11.04 T11.08 add SCR-08 briefing (FR-14/15/50) | `apps/web/src/ui/results/profileChart.ts` |
| `2798bcb` | feat(web): T24.06-T24.10 EVA overlays, HUD and map (FR-32, FR-33) | `apps/web/src/net/habClient.ts`, `apps/web/src/ui/map/FullScreenMap.css`, `apps/web/src/ui/map/FullScreenMap.tsx`, `apps/web/src/ui/map/MapControls.tsx`, `apps/web/src/ui/map/useFullMap.ts` |
| `e9db59e` | feat(web): T02.06 T07.16 ImageStatic degradation when every tile fails (FR-01, FR-02, FR-16) | `apps/web/src/ui/map/imageStatic.ts`, `apps/web/src/ui/map/rasterLayers.ts` |
| `0cb844e` | feat(web): T09.08 manual leg drawing behind ?draw_legs=1 and on all-NO_ROUTE, and SCR-02 fallback wiring (FR-07, FR-08) | `apps/web/src/ui/map/drawLegs.ts` |
| `3db6faf` | feat(web): T18.07 persist compatible plans and source desirables (FR-20, FR-13, FR-19) | `apps/web/src/state/planStore.ts` |
| `6f2eff4` | fix(web): a lost transport is announced at once and a queued command survives a reload (FD-545, FD-546) | `apps/web/src/net/habClient.ts` |

## Occurrence ledger

Line numbers refer to baseline `251708b`; the two modified map files retain those line positions. `REAL` always names a permitted source path. `UI CONSTANT` covers rendering/formatting/interaction/transport and internal algorithm indices, not simulated telemetry. `INVENTED` rows name the fix. The haven-link fake zero came from an empty feature-array length, so its finding above accompanies the literal fallback rows below even though that expression has no numeric literal of its own.

### `apps/web/src/ui/demoPlan.json`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 5 | `6.0` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario, same assumed defaults as the plan store. |
| 6 | `20` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario, same assumed defaults as the plan store. |
| 7 | `15` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario, same assumed defaults as the plan store. |
| 8 | `10` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario, same assumed defaults as the plan store. |
| 9 | `5.0` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario, same assumed defaults as the plan store. |
| 10 | `3.3` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario, same assumed defaults as the plan store. |
| 13 | `30` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario, same assumed defaults as the plan store. |
| 14 | `2` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario, same assumed defaults as the plan store. |
| 19 | `12`, `2026`, `041`, `14`, `07`, `15` | UI CONSTANT | Non-rendered editorial references and stop ordinals in notes; no numeric scenario input or scientific output. |
| 20 | `05` | UI CONSTANT | Non-rendered editorial references and stop ordinals in notes; no numeric scenario input or scientific output. |
| 22 | `1`, `01`, `2`, `3` | UI CONSTANT | Non-rendered editorial references and stop ordinals in notes; no numeric scenario input or scientific output. |
| 23 | `2`, `01`, `1`, `2`, `01`, `2`, `3`, `4`, `5`, `2`, `45` | UI CONSTANT | Non-rendered editorial references and stop ordinals in notes; no numeric scenario input or scientific output. |
| 24 | `3`, `1` | UI CONSTANT | Non-rendered editorial references and stop ordinals in notes; no numeric scenario input or scientific output. |
| 27 | `05_`, `05`, `02`, `3` | UI CONSTANT | Non-rendered editorial references and stop ordinals in notes; no numeric scenario input or scientific output. |
| 29 | `042`, `05`, `05`, `04`, `01`, `1`, `2024`, `05`, `20`, `4190`, `08` | REAL | `scenarios/storm-sol4190/scenario.json` and `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario: scenario date/sol; reference digits are identifiers. |
| 30 | `043`, `6`, `05`, `07`, `01`, `2`, `8` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario: six-hour input; the other digits identify screens/requirements. |

### `apps/web/src/ui/context.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 162 | `10` | UI CONSTANT | Map layer stack order. |
| 163 | `20` | UI CONSTANT | Map layer stack order. |
| 164 | `30` | UI CONSTANT | Map layer stack order. |
| 165 | `40` | UI CONSTANT | Map layer stack order. |
| 166 | `45` | UI CONSTANT | Map layer stack order. |
| 167 | `50` | UI CONSTANT | Map layer stack order. |
| 168 | `55` | UI CONSTANT | Map layer stack order. |
| 170 | `58` | UI CONSTANT | Map layer stack order. |
| 171 | `60` | UI CONSTANT | Map layer stack order. |

### `apps/web/src/ui/eva/viewModel.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 160 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 213 | `1`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 255 | `100` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 283 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 284 | `3`, `2`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 286 | `0`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 287 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 288 | `1`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 289 | `1`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 292 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 323 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 324 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 354 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 388 | `60` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 411 | `1000` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |

### `apps/web/src/ui/results/profileChart.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 12 | `1` | REAL | `data/sites/gale_boxwork/site-manifest.json` sources (dataset-id digits, not telemetry literals). |
| 24 | `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 38 | `0` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 39 | `0`, `0`, `1`, `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 42 | `40`, `78` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 43 | `1`, `22`, `58` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 55 | `0` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 59 | `0`, `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 60 | `0`, `0`, `56`, `106`, `56`, `106` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 63 | `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 65 | `18`, `1`, `2`, `24`, `62` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 66 | `1.5` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 70 | `15`, `43`, `82`, `3`, `2`, `3` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 71 | `12` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 72 | `55`, `99` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 73 | `60`, `20`, `25` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 74 | `60` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 78 | `1`, `0`, `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 80 | `0`, `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 85 | `0`, `1`, `0`, `1`, `1`, `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |

### `apps/web/src/ui/results/profileLayout.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 5 | `720`, `230`, `460`, `24` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 13 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 16 | `0`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 21 | `0`, `0` | UI CONSTANT | Zero origin for cumulative sums of supplied leg distances; gaps reserve pixels, never an invented distance. |
| 31 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 32 | `1`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 33 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |

### `apps/web/src/ui/results/profileLink.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 21 | `6`, `1`, `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 22 | `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 39 | `0`, `0`, `1`, `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 72 | `0`, `0`, `1`, `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 82 | `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 83 | `0` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 85 | `0`, `1`, `0`, `1`, `1`, `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 86 | `0`, `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |

### `apps/web/src/ui/results/warningsList.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 44 | `0`, `1`, `2`, `3` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 61 | `0`, `10`, `11`, `16` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 66 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 76 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 77 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 78 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 86 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 138 | `30` | REAL | `data/sites/gale_boxwork/site-manifest.json` sources (dataset-id digits, not telemetry literals). |
| 140 | `1993` | REAL | `data/sites/gale_boxwork/site-manifest.json` sources (dataset-id digits, not telemetry literals). |
| 141 | `2014` | REAL | `data/sites/gale_boxwork/site-manifest.json` sources (dataset-id digits, not telemetry literals). |
| 142 | `1` | REAL | `data/sites/gale_boxwork/site-manifest.json` sources (dataset-id digits, not telemetry literals). |
| 143 | `1` | REAL | `data/sites/gale_boxwork/site-manifest.json` sources (dataset-id digits, not telemetry literals). |

### `apps/web/src/ui/map/FullScreenMap.css`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 1 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 2 | `100`, `100` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 3 | `0`, `0`, `0`, `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 4 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 8 | `16` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 9 | `0`, `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 10 | `100`, `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 15 | `40` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 16 | `768`, `600` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 17 | `48` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |

### `apps/web/src/ui/map/FullScreenMap.tsx`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 32 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 52 | `1`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 55 | `1`, `0`, `1`, `1`, `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 98 | `0` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 150 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 151 | `1` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 152 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 171 | `100` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 172 | `100` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 174 | `#080A0D` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 175 | `1`, `#ECEFF2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 183 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 184 | `82`, `100` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 185 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 186 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 187 | `100` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 192 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 197 | `56` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 198 | `56` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 199 | `10`, `14` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 200 | `2`, `#1C2128` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 201 | `2`, `#5C6670` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 202 | `1`, `#ECEFF2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 204 | `700` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 205 | `16` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 223 | `48` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 224 | `700` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 230 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 233 | `12` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 237 | `49900` | REAL | `docs/specs/02_Technical_Requirements_Document.md` §C.1: Mars CRS IAU_2015:49900 (identifier, not a measured value). |
| 246 | `18` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 247 | `0`, `0`, `18` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 248 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 252 | `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 253 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 254 | `1`, `#2A313A` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 257 | `8`, `1`, `#14181D` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 258 | `16` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 268 | `8`, `1`, `#14181D` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 269 | `16` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 282 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 286 | `16` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 287 | `0.06` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 288 | `3`, `#8592A0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 292 | `49900` | REAL | `docs/specs/02_Technical_Requirements_Document.md` §C.1: Mars CRS IAU_2015:49900 (identifier, not a measured value). |
| 298 | `16`, `2`, `#A9B3BE` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 300 | `1`, `1` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 310 | `6`, `10` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 311 | `2`, `#1C2128` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 312 | `1`, `#FFB020` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 313 | `#FFB020` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 315 | `16` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 327 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 334 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 335 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 336 | `8`, `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 351 | `50` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 352 | `50` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 356 | `4` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 358 | `16` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 359 | `700` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 369 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 375 | `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 376 | `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 377 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 378 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 382 | `4` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 384 | `16` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 385 | `2`, `#A9B3BE` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 403 | `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 404 | `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 406 | `6` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 413 | `4`, `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 414 | `2`, `#1C2128` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 415 | `1`, `#5C6670` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 417 | `16` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 433 | `72` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 434 | `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 435 | `1`, `#14181D` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 436 | `2`, `#5C6670` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 437 | `12` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 440 | `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 441 | `10` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 444 | `2`, `#A9B3BE`, `16` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 445 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 459 | `8`, `12` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 460 | `2`, `#1C2128` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 463 | `3`, `1`, `#ECEFF2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 464 | `1`, `#2A313A` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 495 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 498 | `100`, `100` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 522 | `1` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |

### `apps/web/src/ui/map/MapControls.tsx`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 26 | `1`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 31 | `1`, `0`, `1`, `1`, `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 47 | `32` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 48 | `44` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 49 | `56` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 53 | `50` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 56 | `1`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 57 | `1`, `0`, `1`, `1`, `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 78 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 79 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 80 | `1`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 81 | `1`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 93 | `4` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 96 | `10`, `14`, `4`, `10` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 100 | `3`, `1`, `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 101 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 103 | `700` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 104 | `16` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 108 | `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 118 | `8`, `100` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 121 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 124 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |

### `apps/web/src/ui/map/addStopMode.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 49 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 54 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 83 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |

### `apps/web/src/ui/map/createMap.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 42 | `150` | UI CONSTANT | Interaction/transport timing, not a mission duration or simulated science. |
| 44 | `24` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 52 | `49900` | REAL | `docs/specs/02_Technical_Requirements_Document.md` §C.1: Mars CRS IAU_2015:49900 (identifier, not a measured value). |
| 65 | `2`, `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 67 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 93 | `0`, `2`, `2`, `1`, `3`, `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 101 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 110 | `8`, `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 115 | `8`, `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 136 | `8`, `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 143 | `8`, `36`, `60` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 151 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 161 | `0`, `0`, `1`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 169 | `0` | UI CONSTANT | Interaction/transport timing, not a mission duration or simulated science. |
| 236 | `0`, `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 258 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 259 | `0`, `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 267 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |

### `apps/web/src/ui/map/drawLegs.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 18 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 46 | `1` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 47 | `1`, `1`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 51 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 71 | `1`, `3`, `8`, `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 76 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 103 | `0`, `0`, `1`, `1`, `1` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 111 | `10_000` | UI CONSTANT | Interaction/transport timing, not a mission duration or simulated science. |
| 113 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 122 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 151 | `0`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 157 | `0`, `0`, `1`, `1`, `0`, `1` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |

### `apps/web/src/ui/map/ezLayer.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 41 | `3`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 42 | `4`, `4` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 43 | `6`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 74 | `7` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 75 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 77 | `22` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 78 | `38` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 80 | `2`, `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 86 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 100 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 106 | `3` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 126 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |

### `apps/web/src/ui/map/imageStatic.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 28 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 31 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 33 | `1`, `2`, `0`, `3`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |

### `apps/web/src/ui/map/inspector.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 52 | `50` | REAL | `docs/specs/03_App_Flow_and_Diagrams.md` §SCR-02 / §D: placement snap at most 50 m. |
| 54 | `12` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 56 | `240` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 66 | `300` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 68 | `12` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 70 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 71 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 79 | `0`, `0` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 101 | `36`, `2`, `0`, `8` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 103 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 104 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 114 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 123 | `0`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 126 | `0`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 127 | `1`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 129 | `0`, `0`, `0`, `0`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 130 | `1`, `0`, `1`, `1`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 131 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 132 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 149 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 151 | `12`, `8`, `1`, `6` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 153 | `2`, `600` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 154 | `4`, `8`, `1`, `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 160 | `4` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 166 | `16` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 167 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 168 | `600` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 178 | `2`, `6`, `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 199 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 202 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 209 | `8`, `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 221 | `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 230 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 232 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 252 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 254 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |

### `apps/web/src/ui/map/keyboard.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 186 | `50` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 225 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 229 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 233 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 237 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 242 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 247 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |

### `apps/web/src/ui/map/keyboardMove.tsx`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 23 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 24 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 25 | `1`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 26 | `1`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 30 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 31 | `1`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 32 | `1`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 33 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 43 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 58 | `0`, `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 66 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 75 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |

### `apps/web/src/ui/map/mapTokens.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 22 | `0`, `9`, `3`, `0`, `9`, `6` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 24 | `1`, `3`, `1`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 25 | `0`, `2`, `4`, `2`, `16` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 29 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 39 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |

### `apps/web/src/ui/map/opsLayers.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 61 | `10`, `20`, `30` | REAL | `docs/specs/04_Design_Brief.md` §C.1: 10/20/30-minute contour levels, applied to supplied time fields only. |
| 70 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 71 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 72 | `3` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 73 | `8` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 74 | `10` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 75 | `12` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 79 | `500` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 81 | `28` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 82 | `22` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 83 | `26` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 84 | `10` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 85 | `8` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 139 | `0`, `0`, `0` | UI CONSTANT | Internal empty-state sentinels; opsLayerRows(null) already hides these. Changed to null for consistency with FD-549. |
| 153 | `0`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 220 | `0` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §RoutingGrid: comm bytes 0/1; no client viewshed. |
| 226 | `1` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §RoutingGrid: comm bytes 0/1; no client viewshed. |
| 255 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 257 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 286 | `0.5` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 287 | `0.5` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 289 | `2` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 293 | `0`, `1` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 294 | `0`, `1` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 296 | `1` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 297 | `1`, `1` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 298 | `1` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 299 | `8`, `0`, `4`, `0`, `2`, `0`, `1`, `0` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 300 | `0`, `15` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 301 | `1` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 302 | `1`, `1` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 303 | `1`, `1` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 304 | `1` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 306 | `1`, `14` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 307 | `2`, `13` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 308 | `3`, `12` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 309 | `4`, `11` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 310 | `5` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 311 | `6`, `9` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 312 | `7`, `8` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 313 | `10` | UI CONSTANT | Contour drawing indices, half-cell positions and marching-squares cases over supplied seconds (FD-082); no time field is solved here. |
| 324 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 328 | `600`, `12` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 330 | `3` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 342 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 345 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 348 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 349 | `0.7`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 350 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 351 | `0.7`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 353 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 354 | `0.75` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 355 | `0`, `0.45` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 356 | `0.75` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 359 | `3`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 360 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 361 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 362 | `4`, `3` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 373 | `2`, `4` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 377 | `0`, `0`, `0`, `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 378 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 379 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 390 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 391 | `0.4` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 403 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 419 | `0`, `0`, `0`, `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 420 | `1.6`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 421 | `1.6`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 422 | `0`, `1.6` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 423 | `0`, `1.6` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 424 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 425 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 438 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 443 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 444 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 453 | `0`, `0`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 454 | `3` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 459 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 465 | `3` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 467 | `2`, `3` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 474 | `0`, `0`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 481 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 493 | `0.22` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 507 | `1`, `0.08` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 509 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 533 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 536 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 537 | `2`, `8`, `3`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 543 | `3`, `2`, `1.5`, `4`, `4` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 544 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 555 | `1`, `1`, `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 556 | `2`, `8` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 559 | `1`, `2`, `2`, `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 560 | `1`, `2`, `6`, `6`, `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 561 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 573 | `2`, `1.5`, `6`, `4` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 575 | `14`, `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 582 | `2`, `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 583 | `0`, `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 641 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 670 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 671 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 672 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 689 | `1000` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 704 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 727 | `60` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 728 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 737 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 776 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 787 | `60` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 788 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 790 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 793 | `0`, `0`, `1`, `0`, `2`, `0`, `1`, `1`, `1`, `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 820 | `0` | INVENTED | Absent snapshot was replaced by literal 0. Fixed to null; rows render — with unavailable source/flag (FD-549). |
| 821 | `0` | INVENTED | Absent snapshot was replaced by literal 0. Fixed to null; rows render — with unavailable source/flag (FD-549). |
| 835 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |

### `apps/web/src/ui/map/poiLayer.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 74 | `24` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 75 | `2` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 76 | `2` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 78 | `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 80 | `2` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 81 | `2` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 82 | `6` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 84 | `25` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 86 | `2`, `0`, `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 88 | `1`, `1`, `1`, `0`, `0`, `0`, `0`, `0`, `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 91 | `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 92 | `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 93 | `10` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 94 | `0` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 95 | `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 98 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 99 | `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 109 | `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 119 | `3` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 121 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 122 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 139 | `0`, `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 166 | `0`, `0`, `1`, `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 192 | `4`, `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 194 | `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 195 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 265 | `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 267 | `0`, `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 270 | `0`, `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |

### `apps/web/src/ui/map/projection.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 53 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 65 | `5` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 66 | `0`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 101 | `360`, `360`, `360` | UI CONSTANT | Full-turn normalization of an inverse-projected longitude; no Earth radius/datum. |

### `apps/web/src/ui/map/rasterLayers.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 164 | `5` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §F.1: five class entries in the slope legend. |
| 165 | `5` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §F.1: five class entries in the slope legend. |
| 169 | `2`, `2` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 170 | `3`, `2` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 175 | `8`, `4` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 178 | `4` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §RoutingGrid: slope degrees × 4, no-data 255. |
| 179 | `255` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §RoutingGrid: slope degrees × 4, no-data 255. |
| 188 | `0`, `1` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 189 | `0`, `1` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 190 | `4` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 192 | `3`, `0` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 204 | `0` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 205 | `1`, `1` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 206 | `2`, `2` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 207 | `3`, `255`, `255` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 218 | `0`, `1` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 222 | `10`, `15`, `10`, `15` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 223 | `15`, `25`, `15`, `25` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 255 | `2` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 256 | `2` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 257 | `0`, `0` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 258 | `0`, `0` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 265 | `2` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 266 | `2` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 267 | `0`, `0` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 286 | `0` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 370 | `0` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 371 | `0` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 372 | `0` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 374 | `0` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 381 | `0`, `0`, `0` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 385 | `0` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 423 | `1` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 427 | `0`, `1` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 428 | `1` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 435 | `1` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 436 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 446 | `2`, `0` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 453 | `0`, `0`, `0` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 458 | `0`, `0` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 480 | `0`, `1` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 481 | `1` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 518 | `0` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |
| 519 | `0` | UI CONSTANT | Tile/RGBA index, opacity, tile address or load counter; class limits come from the scenario and ramps from the manifest. |

### `apps/web/src/ui/map/routeGeometry.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 15 | `2` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 18 | `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 19 | `0`, `0`, `1`, `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 21 | `0` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 22 | `0`, `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 24 | `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 27 | `0` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 38 | `2` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 46 | `0` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 47 | `0` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 48 | `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 55 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 56 | `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 57 | `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 58 | `0`, `0`, `1`, `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 59 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 61 | `0`, `0`, `0`, `1`, `1`, `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |
| 65 | `1` | UI CONSTANT | Display interpolation, array/focus indices and chart geometry; source metrics are worker values (FD-082). |

### `apps/web/src/ui/map/routeLayer.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 29 | `4` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 30 | `6` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 31 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 32 | `3` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 33 | `6` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 36 | `8`, `8` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 38 | `10`, `6` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 39 | `10`, `4`, `2`, `4` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 40 | `1`, `6` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 74 | `2`, `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 75 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 81 | `3` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 88 | `4` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 90 | `5` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 99 | `0`, `0`, `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 100 | `1`, `0`, `1` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 102 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 121 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 150 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |

### `apps/web/src/ui/map/tokenColors.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 21 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 22 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 23 | `3` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 69 | `0`, `9`, `2`, `0`, `9`, `2`, `0`, `9`, `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 71 | `0`, `1`, `0`, `.1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 72 | `1`, `2`, `3`, `16` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |

### `apps/web/src/ui/map/touchInput.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 13 | `500` | UI CONSTANT | Interaction/transport timing, not a mission duration or simulated science. |
| 15 | `10` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 17 | `14` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 43 | `0`, `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 57 | `0`, `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 58 | `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 68 | `0`, `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |

### `apps/web/src/ui/map/traverseLayer.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 105 | `25` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 107 | `10` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 110 | `1.5` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 111 | `6`, `6` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 112 | `4` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 113 | `12` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 115 | `0.6` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 118 | `2`, `0`, `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 147 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 151 | `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 152 | `3` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 165 | `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 195 | `2` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 216 | `0`, `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 217 | `0`, `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 263 | `0`, `0`, `1`, `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 291 | `0`, `0` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 317 | `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 319 | `0`, `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 322 | `0`, `1` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 340 | `0` | UI CONSTANT | Pointer hit tolerance, display precision, marker styling, array indexing or interaction fallback; never a terrain measurement. |
| 367 | `0`, `5`, `5` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 369 | `1` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |

### `apps/web/src/ui/map/useFullMap.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 45 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 102 | `55`, `4` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 157 | `1`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |

### `apps/web/src/ui/map/waypointDrag.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 23 | `14` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 25 | `4` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 79 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 95 | `0`, `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 100 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 102 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 103 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 104 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 110 | `0`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 112 | `0`, `1`, `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 123 | `0`, `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |

### `apps/web/src/ui/map/waypointLayer.css`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 5 | `50` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 6 | `50` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 7 | `44` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 8 | `44` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 9 | `22`, `0`, `0`, `22` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 11 | `9` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 19 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 20 | `0`, `0`, `0`, `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 24 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 25 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 26 | `50` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 27 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 28 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 32 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 33 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 34 | `50` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 35 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 36 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 41 | `48` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 42 | `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 43 | `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 44 | `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 45 | `520` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |

### `apps/web/src/ui/map/waypointLayer.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 84 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 85 | `0`, `1`, `0`, `40` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 92 | `36`, `2`, `0`, `8` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 93 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 94 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 124 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 136 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 195 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 196 | `02`, `3` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 206 | `0`, `40` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 212 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 232 | `0`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 242 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 264 | `28` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 265 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 266 | `12` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 267 | `2` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 274 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 278 | `700` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 306 | `0`, `0`, `1`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 316 | `3` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 319 | `8`, `8` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 334 | `4`, `4`, `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 335 | `12` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 337 | `4` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 340 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 344 | `1`, `3` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 345 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 346 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 353 | `3`, `6`, `0`, `8`, `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |

### `apps/web/src/state/planStore.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 158 | `300` | UI CONSTANT | Interaction/transport timing, not a mission duration or simulated science. |
| 161 | `4` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §StopTask and `docs/specs/02_Technical_Requirements_Document.md` FR-54 task-input limits. |
| 164 | `60` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §StopTask and `docs/specs/02_Technical_Requirements_Document.md` FR-54 task-input limits. |
| 173 | `6` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario: assumed defaults, not measured results. |
| 174 | `20` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario: assumed defaults, not measured results. |
| 175 | `15` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario: assumed defaults, not measured results. |
| 176 | `10` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario: assumed defaults, not measured results. |
| 177 | `5` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario: assumed defaults, not measured results. |
| 178 | `3.3` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario: assumed defaults, not measured results. |
| 181 | `30` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario: assumed defaults, not measured results. |
| 182 | `2` | REAL | `docs/specs/05_Backend_and_Database_Schema.md` §MissionScenario: assumed defaults, not measured results. |
| 257 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 260 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 262 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 269 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 283 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 295 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 302 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 325 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 330 | `4`, `0` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 383 | `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 418 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 464 | `0`, `1` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 538 | `0`, `0`, `1`, `1` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |
| 556 | `0` | UI CONSTANT | Selection/ranking, array/coordinate indices, count/revision origin, string/id syntax or drawing transform; not a scientific default. |

### `apps/web/src/net/habClient.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 89 | `1` | UI CONSTANT | Transport state/backoff, queue or event indexing, retry counts and id encoding; wall time is a watchdog only. |
| 90 | `500` | UI CONSTANT | Transport state/backoff, queue or event indexing, retry counts and id encoding; wall time is a watchdog only. |
| 92 | `1000` | UI CONSTANT | Transport state/backoff, queue or event indexing, retry counts and id encoding; wall time is a watchdog only. |
| 126 | `16`, `2`, `0` | UI CONSTANT | Transport state/backoff, queue or event indexing, retry counts and id encoding; wall time is a watchdog only. |
| 134 | `4` | UI CONSTANT | Transport state/backoff, queue or event indexing, retry counts and id encoding; wall time is a watchdog only. |
| 138 | `0` | UI CONSTANT | Transport state/backoff, queue or event indexing, retry counts and id encoding; wall time is a watchdog only. |
| 141 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 149 | `0` | UI CONSTANT | Transport state/backoff, queue or event indexing, retry counts and id encoding; wall time is a watchdog only. |
| 152 | `4` | UI CONSTANT | Transport state/backoff, queue or event indexing, retry counts and id encoding; wall time is a watchdog only. |
| 182 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 221 | `0` | UI CONSTANT | Transport state/backoff, queue or event indexing, retry counts and id encoding; wall time is a watchdog only. |
| 240 | `2` | UI CONSTANT | Transport state/backoff, queue or event indexing, retry counts and id encoding; wall time is a watchdog only. |
| 246 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 314 | `0` | UI CONSTANT | Transport state/backoff, queue or event indexing, retry counts and id encoding; wall time is a watchdog only. |
| 317 | `0` | UI CONSTANT | Transport state/backoff, queue or event indexing, retry counts and id encoding; wall time is a watchdog only. |
| 345 | `0` | UI CONSTANT | Transport state/backoff, queue or event indexing, retry counts and id encoding; wall time is a watchdog only. |
| 359 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 484 | `0`, `1` | UI CONSTANT | Transport state/backoff, queue or event indexing, retry counts and id encoding; wall time is a watchdog only. |
| 486 | `0` | UI CONSTANT | Transport state/backoff, queue or event indexing, retry counts and id encoding; wall time is a watchdog only. |
| 513 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 514 | `0`, `0` | UI CONSTANT | Transport state/backoff, queue or event indexing, retry counts and id encoding; wall time is a watchdog only. |
| 524 | `0` | UI CONSTANT | Transport state/backoff, queue or event indexing, retry counts and id encoding; wall time is a watchdog only. |

### `apps/web/src/ui/components/Notice.css`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 6 | `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 7 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 14 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 18 | `6`, `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 19 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 20 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 24 | `1`, `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 25 | `0` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 30 | `0`, `8` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 31 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 32 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 33 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |

### `apps/web/src/ui/components/Notice.tsx`

No numeric tokens.

### `apps/web/src/ui/components/format.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 29 | `2` | UI CONSTANT | Display precision, units, compass arrow bins, padding and validity guards; missing inputs stay —. |
| 30 | `0` | UI CONSTANT | Display precision, units, compass arrow bins, padding and validity guards; missing inputs stay —. |
| 31 | `1` | UI CONSTANT | Display precision, units, compass arrow bins, padding and validity guards; missing inputs stay —. |
| 32 | `2` | UI CONSTANT | Display precision, units, compass arrow bins, padding and validity guards; missing inputs stay —. |
| 33 | `1` | UI CONSTANT | Display precision, units, compass arrow bins, padding and validity guards; missing inputs stay —. |
| 34 | `0` | UI CONSTANT | Display precision, units, compass arrow bins, padding and validity guards; missing inputs stay —. |
| 35 | `0` | UI CONSTANT | Display precision, units, compass arrow bins, padding and validity guards; missing inputs stay —. |
| 47 | `0`, `.0`, `1` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 58 | `1000` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |

### `apps/web/src/ui/components/metric.css`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 5 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 9 | `3` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 17 | `4` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 21 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 28 | `3` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 32 | `3` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 39 | `0`, `4` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 40 | `1` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 41 | `2` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |
| 43 | `11` | UI CONSTANT | Layout, style/token name, target size, colour/alpha, drawing geometry or stack order; no scientific quantity. |

### `apps/web/src/ui/components/metric.ts`

No numeric tokens.

### `apps/web/src/ui/components/patterns.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 27 | `8`, `4`, `0.22` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 28 | `6`, `3`, `0.28` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 29 | `8`, `22`, `0.35` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 45 | `30`, `0` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 46 | `70`, `0` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 47 | `100`, `30` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 48 | `100`, `70` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 49 | `70`, `100` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 50 | `30`, `100` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 51 | `0`, `70` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 52 | `0`, `30` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 56 | `100` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 57 | `100` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 73 | `0`, `100`, `2` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 75 | `2`, `2` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 79 | `1` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 80 | `0`, `0` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 81 | `0`, `0` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 83 | `45` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 112 | `2` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 117 | `0`, `100`, `2` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 119 | `2`, `2`, `0`, `2` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 122 | `1` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 123 | `0`, `0` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 124 | `0`, `0` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 129 | `45` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |

### `apps/web/src/ui/components/provenance.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 74 | `0` | UI CONSTANT | Display precision, units, compass arrow bins, padding and validity guards; missing inputs stay —. |
| 95 | `0` | UI CONSTANT | Display precision, units, compass arrow bins, padding and validity guards; missing inputs stay —. |
| 96 | `60` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 97 | `60` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 98 | `2`, `0` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 103 | `0` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 104 | `3600` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 105 | `3600`, `60` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 106 | `60` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 107 | `0`, `2`, `0`, `2`, `0` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 108 | `2`, `0` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 113 | `3`, `0` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 122 | `360`, `360`, `360`, `45`, `8` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |
| 128 | `1000`, `2` | UI CONSTANT | Formatting precision, string/index operation, unit conversion or timestamp age; no new physical estimate. |

### `apps/web/src/ui/components/statusIcon.ts`

| Line | Tokens (each occurrence, in order) | Verdict | Reason / source |
| --- | --- | --- | --- |
| 76 | `2000` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |
| 77 | `0`, `0`, `100`, `100` | UI CONSTANT | SVG namespace/viewBox or icon/pattern geometry; status is shape plus word plus colour. |

## Verification and external checks

All changes remain in the frontend lane. No new backend need is required; existing N-24 and N-100/N-120 missing values remain unavailable. B-01/B-03/B-04/B-05 already have implemented resolutions in the current checkout; B-02 is a performance observation and no new timing claim is made.

Browser/server execution is prohibited by the assignment's sandbox note (tsx listener / Chromium). No server or browser was started. The orchestrator must run, foreground with a timeout:

```sh
timeout 600s make e2e-one CHECK=provenance
timeout 600s make e2e-one CHECK=toggles
timeout 600s make e2e-one CHECK=ops-no-terminal
```

The source Impeccable detector returned `[]` for the inspector, layers panel and rover queue. Rendered browser verification remains external. Fetch stopped before merge: `error: cannot open '/home/obidit/secondBrain/coding/CheesySpace-NasaSpaceAppChallenge/.git/worktrees/fb/FETCH_HEAD': Read-only file system`. No integrated-branch or browser pass is claimed. Final unit/static/docs results are recorded beside the A.5 resolution and in the AI log.
