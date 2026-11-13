# Package 01 — verification harness (first implementation package)

| | |
| --- | --- |
| **Subtasks** | Infrastructure for every `verify` subtask in the frontend scope (FD-190). Closes no subtask by itself; each check is named after the subtask it replaces |
| **Depends on** | Nothing in this plan. Uses what is installed: `@playwright/test` 1.64.1, `@axe-core/playwright` 4.14, Chromium in `~/Library/Caches/ms-playwright` (no install, no download) |
| **Needs from backend** | N-01 (`--scenario-dir`), else the harness copies the fake scenario as described in step 2 |
| **Budget** | 14 files, ≈ 3 h |

## Why first

Every later package ends with "the named harness check passes" instead of a manual browser check. The harness ships with each check written and **skipped with `test.fixme` naming the package that enables it**; that package removes its `fixme` and makes it green. Package 99's end-to-end run fails if any `fixme` is left.

## Files (all new unless marked)

| Path | Purpose |
| --- | --- |
| `apps/web/e2e/playwright.config.ts` | Chromium only; `testDir: apps/web/e2e/checks`; `globalSetup`; `use.baseURL = http://127.0.0.1:8091`; reporter `list` + JSON to `apps/web/e2e/out/results.json`; `projects`: `desktop-1440`, `desktop-1280`, `desktop-1024`, `phone-landscape-844x390`, `phone-portrait-390x844`, `phone-360x740`, `tablet-landscape-1024x768`, `tablet-portrait-768x1024`, `hud-844x390` (touch + DPR from Playwright's built-in device descriptors where one matches, FD-197) |
| `apps/web/e2e/globalSetup.ts` | `npm --workspace @marswalk/web run build` unless `E2E_SKIP_BUILD=1`; start the Hab Core (`npm run hab:start -- --site mock_site --scenario-dir apps/hab-core/tests/fixtures/fake-scenario --port 8091`, FD-198) as a child process; wait for `GET /api/health` 200; teardown kills it. With `E2E_SITE=gale_boxwork` it uses the real site and `scenarios/storm-sol4190` when their files exist, else it reports "skipped: bundle absent" |
| `apps/web/e2e/lib/offline.ts` | `guardNetwork(page)`: `page.route('**/*')` aborts any request whose host is not `127.0.0.1`/`localhost` and records it; `expectNoExternal()` fails the test listing every blocked URL (NFR-01, NFR-08) |
| `apps/web/e2e/lib/a11y.ts` | `axeScan(page, {mode})`: `@axe-core/playwright` with tags `wcag2a, wcag2aa, wcag21aa`; fails on any `serious` or `critical` violation; writes the full result JSON to `out/axe-<route>.json` (FD-151: real Chromium evaluates contrast) |
| `apps/web/e2e/lib/geometry.ts` | `boxes(page, selectors)`, `expectSameBoxes(a, b, tol=0.5)`, `targets(page, scope)` (every `button, a, [role=button], input, select, [tabindex="0"]`), `expectTargetSize(min)` and `expectGaps(min)` |
| `apps/web/e2e/lib/contrast.ts` | Reads computed `color`/`background-color` of every text node's element (walking up for an opaque background) and reuses the WCAG maths of `apps/web/tests/ui/wcag.ts` (import it); `expectContrast(page, {text: 4.5, large: 3, hud: 7})` |
| `apps/web/e2e/lib/grayscale.ts` | Screenshots a locator, decodes the PNG in the page (draw into a canvas, `getImageData`), applies the Rec. 709 luma, returns a 16×16 luma signature; `expectDistinct(signatures, minDelta)` for status icons and bars (U-41, UT-4) |
| `apps/web/e2e/lib/print.ts` | `pdfPages(page, {format, margin})` (format A4 or Letter, margin 12 mm): `page.emulateMedia({media: 'print'})`, `page.pdf()`, counts `/Type /Page` objects (not `/Pages`) in the buffer |
| `apps/web/e2e/lib/provenance.ts` | `unlabelledNumbers(page)`: every text node with a digit whose element and ancestors carry no `data-provenance` + `data-source` and that is not inside an allowlisted element (`[data-identifier]`, scale line, debug overlay, SCR-09 equation blocks; FD-110) |
| `apps/web/e2e/lib/hab.ts` | Helpers to drive the Hab Core over HTTP and a second page: `openRole(context, role)`, `waitForSnapshot(page)`, `sendAsOps(cmd)` through the ops UI only (no direct socket: the point of T25.08 is "no terminal") |
| `apps/web/e2e/checks/*.spec.ts` | One file per check in the table below |
| `apps/web/e2e/README.md` | How to run, what each check replaces, how a package enables its check. (Allowed: it documents a test tool, not a report) |
| `Makefile` (edit) | `e2e:` → `npx playwright test -c apps/web/e2e/playwright.config.ts`; `e2e-one:` with `CHECK=<name>` |
| `.gitignore` (edit) | `apps/web/e2e/out/`, `var/videos/` (FD-164) |

`apps/web/vite.config.ts` already limits Vitest to `tests/**/*.test.ts`, so `e2e/` is never picked up by `make test-web`; add a one-line comment there saying so (no behaviour change).

## Checks (name = file = what it replaces)

| Check (`checks/<name>.spec.ts`) | Replaces | Assertion | Enabled by package |
| --- | --- | --- | --- |
| `offline` | T07.02/T07.03 Verify lines, NFR-01 part of T14.09 | Every route of 03 §A loaded on every project: zero blocked external requests; fonts and icons 200 from the origin (FD-152) | 01 (on the routes that exist), each screen package adds its route |
| `tiles-all-levels` | T02.03 "renders at every level" | Spike page: all five `tile_grid` levels of F4 load with 200 and paint non-empty canvases | 04 |
| `scale-bar` | T02.04 | Scale line metres per pixel equals the view resolution within 1 %; the T01.03 reference crater measured on the map (two rim points in projected metres) matches its DEM-measured size within 2 % at every level where it is visible (`E2E_SITE=gale_boxwork`; on F4 only the resolution check runs) | 04 |
| `viewport360` | 04 §F BRIEF fluid, EVA ≥ 360 px | BRIEF routes and `#/eva/EV1` at 360×740: no horizontal scroll (`scrollWidth ≤ clientWidth`), no clipped text (`scrollWidth` of text boxes) | 03 (BRIEF), 17 (EVA) |
| `keyboard-path` | T13.10 | Keyboard only, from `#/`: Start planning → open demo plan → move stop 2 with the keyboard move (FD-119) → results update → B opens SCR-08 → Export; every focused element shows a visible ring (outline width ≥ 2 px or the wrapper ring) and focus never lands on a hidden element | 28 |
| `axe` | T13.09 | `axeScan` on every built route in its mode and each EVA/ops state fixture: 0 serious/critical | 03 (shell), each screen package for its route |
| `grayscale` | T13.05 grayscale check, U-41, UT-4 | Status icons and alert bars of warning, caution, advisory, nominal, unknown: pairwise distinct signatures in grayscale; each has shape + word in the DOM | 03 |
| `contrast` | T13.12 / NFR-04 measurement | BRIEF/OPS text ≥ 4.5 : 1 (large ≥ 3), non-text ≥ 3 : 1, HUD ≥ 7 : 1 including patterned pills (FD-155) | 03 (tokens), 18 (HUD) |
| `brand-orange` | 04 §A.3 / `CLAUDE.md` §2 | No computed colour equal to the brand-orange primitive in any OPS or HUD route | 03, re-run by every live package |
| `targets` | T24.11 targets, 04 §C.3 | EVA and HUD: every target ≥ 56×56 px, gaps ≥ 8 px; ops ≥ 32 px; planner ≥ 44 px under `pointer: coarse` (FD-153) | 17, 19, 09 |
| `hud-glance` | T24.11 glance, UT-1 | `#/hud/EV1` in every state: ≤ 5 value elements (`[data-hud-value]`), each ≥ 56 px font, HAVEN/O₂/NEXT all inside the top 60 % of the viewport, contrast ≥ 7 : 1, no control | 18 |
| `eva-geometry` | T24.04 fixed geography, UT-5, UT-6 | At 844×390, 1024×768, 390×844, 768×1024 and for Walking, At stop, Undo window, Ops-added task, Alerting, No hab link, To haven: alert slot, HAVEN, O₂, strip and action row boxes identical (±0.5 px); body fits with no scroll; HAVEN top-left; O₂ immediately right of HAVEN on the same row | 17 |
| `rotation` | UT-6 | Same session rotated landscape ↔ portrait mid-alert: HAVEN stays the top-left card, O₂ the card right of it | 17 |
| `fullmap` | T24.09, UT-9, U-60 | Full-screen map opens/closes; landscape map ≥ 80 % of width; HAVEN/O₂ ≥ 40 px (phone) / 48 px (tablet) and still the largest numbers; six labelled controls ≥ 56 px; a warning closes it; synthetic two-touch pinch zooms (FD-030) | 18 |
| `queued-resend` | `habClient.ts` TODO(verify) (FD-088) | Drop the socket during a SUMMON hold, reconnect: exactly one `COMMAND_RESULT`, the button showed "Queued — sends when link returns" | 18 |
| `link-lost` | T24.11 link-lost | Kill the Hab Core child: SCR-18 within 3 s on EVA and ops, cached values with ages, reconnect counter; restart: snapshot resumes | 18 |
| `toggles` | T07.15 | Each SCR-03 toggle repaints within 300 ms (`performance.now()` around the click until the layer's `postrender`); inspector values equal the grid cell read from the manifest grid (05 §E.1 index) at three points | 28 |
| `plan-rules` | T08.11 | 02 §E.3 rules in the UI: each invalid input shows the inline error and keeps the last valid value; outside-AOI and impassable placements are refused or snapped ≤ 50 m; SCR-04 states Empty, Editing, Invalid, Computing | 28 |
| `results-states` | T09.07 | With `?mock_worker=1` and the OK, PARTIAL, OVER_LIMITS fixtures: banner word + shape, metrics, warnings, profile as 03 SCR-05 | 28 |
| `walking-skeleton` | T09.06 | Demo plan on the real worker: all legs routed, NFR-02 time from 02 §F met, result recorded for ADR-004 | 28 |
| `poi-conditions` | T10.03 | POI images show credit, sol, date, camera; a pre-dawn start shows the daylight warning (needs the real worker's DARKNESS warning) | 28 |
| `print` | T11.05, T27.06 pages | SCR-08 = 1 page A4 and Letter for OK, Over limits, Partial; SCR-17 ≤ 2 pages A4 and Letter at 12 mm margins | 28, 29 |
| `plan-hash` | T11.05 reproduction | Export → reload into the store → recompute: identical metrics and identical `plan_hash` (also on a non-secure origin, FD-141) | 28 |
| `provenance` | T12.06 | Demo path (SCR-01 → SCR-02 → SCR-05 → SCR-07 → SCR-08) and every live role: `unlabelledNumbers` is empty; every source id shown resolves in SCR-09 | 28, 29 |
| `credits` | T16.05 | Every manifest DataSource and every image credit appears in SCR-09 and in `README.md` | 31 |
| `ops-no-terminal` | T25.08 | Ops UI alone: load scenario, start EVA, speed 60×, alert, approve option, end → report; the test never calls the API directly | 29 |
| `task-latency` | T31.08 | Tick a task on `#/eva/EV1`; the ops TaskProgress changes within 500 ms (two pages, same browser); abort drops open tasks; report counts equal the log's | 29 |
| `replay` | T27.06 replay | `#/replay` served from a static folder with no Hab Core: the recorded log plays to the end and the report hash matches the recorded one | 29 |
| `usability-*` | T15.02 (UT-1…UT-9 and the 5-min briefing) | See package 30 | 30 |
| `capture` | T17.02/T17.03 footage | Records the demo run to `var/videos/` (context `recordVideo`) | 32 |

## Steps (tests first)

1. Write `lib/*.ts` with unit-level self-tests in `checks/_harness.spec.ts`: a page with one external `<img>` must fail `offline`; a page with a 4.4 : 1 text must fail `contrast`; a two-page HTML must give `pdfPages` = 2; two identical icons must fail `expectDistinct`. These four run green before any product check.
2. `globalSetup`: if N-01 is not merged, copy `apps/hab-core/tests/fixtures/fake-scenario` to `scenarios/e2e-fake/` at setup and delete it at teardown (never committed; add `scenarios/e2e-fake/` to `.gitignore`), and pass `--scenario e2e-fake`.
3. Write every check of the table. Checks for screens that exist today (`offline` on `#/join`, `#/ops`, `#/eva/EV1`, `#/hud/EV1`, `#/report`; `brand-orange`; `grayscale`; `contrast` on tokens) are active; the rest are `test.fixme('enabled by package NN')`.
4. `make e2e` runs locally in < 10 min on F4.
5. Add a CI job only if `.github/workflows/` already runs Node jobs; otherwise document `make e2e` in the README of `e2e/` (CI ownership is T14.02's; no new workflow here).

## Named tests

`_harness.spec.ts`: `offline guard blocks and reports an external request`, `contrast helper fails a 4.4:1 pair`, `pdfPages counts two pages`, `grayscale distinctness fails identical icons`.

## Status row change

None (infrastructure). The first package that enables a check records it.

## Done criteria

- `make e2e` exits 0 with the four self-tests and the active checks green and every other check reported as `fixme` with a package number.
- No file outside the table changed; no dependency installed; `make lint typecheck test-web` green (add `e2e/` to `apps/web/tsconfig.json` `include` only if typecheck needs it, with Playwright types already present).
- `docs/AI_USE.md` row appended.
