# Verification harness (Playwright, Chromium)

| | |
| --- | --- |
| **Owner** | Frontend plan, package 01 ([plan](../../../docs/plan/frontend/01-verification-harness.md)) |
| **Date** | 2026-11-12 |
| **Status** | Infrastructure. Replaces every manual `verify` step of the frontend scope (FD-190) with a named check |
| **Related** | [Frontend plan overview](../../../docs/plan/frontend/00-overview.md) · [Decisions](../../../docs/plan/frontend/decisions.md) · [Router](../src/ui/router.ts) |

Headless Chromium against the built web app, served by a Hab Core on `127.0.0.1:8091`. The browser never leaves localhost: the
`offline` helper aborts and reports any other host (NFR-01, NFR-08). Vitest never picks these files up (`make test-web` runs
only `tests/`).

## Run

| Command | What it does |
| --- | --- |
| `make e2e` | Builds `apps/web`, starts the Hab Core, runs every check on every project, stops the Hab Core. About 2 minutes |
| `make e2e-one CHECK=offline` | One check by file name (without `.spec.ts`) |
| `E2E_SKIP_BUILD=1 make e2e` | Reuses `apps/web/dist` |
| `E2E_SITE=gale_boxwork make e2e` | Real site and `scenarios/storm-sol4190`. When their files are absent it prints `skipped: bundle absent (...)` and runs only the self-tests |
| `E2E_CHROMIUM=/path/to/chrome-headless-shell make e2e` | Use that browser |
| `E2E_PORT=8101 make e2e` | Use that port for the Hab Core instead of 8091, so several git worktrees can run the harness at the same time |

Output goes to `apps/web/e2e/out/` (git-ignored): `results.json`, `axe-<route>.json`, failure artefacts.

Nothing is installed or downloaded. When the Chromium revision Playwright expects is not installed, the config uses the newest
installed `chromium_headless_shell-*` under `PLAYWRIGHT_BROWSERS_PATH` or the default cache folder.

## Data

The Hab Core starts with the committed F4 `mock_site` and the fake scenario of `apps/hab-core/tests/fixtures/fake-scenario`
(FD-198). N-01 (`hab:start --scenario-dir`) is not merged, so `globalSetup` copies the fixture to `scenarios/e2e-fake/`,
points its `data_version` at the site manifest's, recomputes `plan_hash` (05 PlanExport) and deletes the copy at teardown. The
Hab Core verifies the hash itself on load. When N-01 lands, replace the copy with the flag and delete `lib/fakeScenario.ts`.
Teardown also removes the session folder the run created.

## Projects

`desktop-1440`, `desktop-1280`, `desktop-1024`, `phone-landscape-844x390`, `phone-portrait-390x844`, `phone-360x740`,
`tablet-landscape-1024x768`, `tablet-portrait-768x1024`, `hud-844x390`. Touch, device scale and mobile flags come from
Playwright's descriptors (iPhone 14, Pixel 7, iPad Mini) with the viewport set as named (FD-197). `offline` and `axe` run on
every project; each other check runs on the project its assertion needs (see `playwright.config.ts`).

## Checks

Each file in `checks/` is named after the check. A check is **active** (runs and must pass) or `test.fixme` with the package
that enables it in its title. The package removes its own `fixme` and makes it green; package 99's end-to-end run fails if any
`fixme` is left. A check that cannot pass for a missing backend need stays `test.fixme('needs N-nn')`.

| Check | Replaces | State | Enabled by package |
| --- | --- | --- | --- |
| `_harness` | (self-tests: each helper fails when it should) | active | 01 |
| `offline` | T07.02/T07.03 Verify, NFR-01 of T14.09 | active, all routes in the router table | 01, then each screen package |
| `brand-orange` | 04 §A.3, CLAUDE.md §2 | active, OPS and HUD routes | 03, re-run by live packages |
| `grayscale` | T13.05, U-41, UT-4 | active, five statuses in BRIEF and OPS | 03 |
| `contrast` | T13.12, NFR-04 | active on `#/join`, `#/hud/EV1`, `#/ops`, `#/report`, and on `#/planner` (text, plus the rendered slope overlay at 3 : 1); `#/eva/EV1` is `fixme` with the measured failure | 03, 08, 17 |
| `tiles-all-levels`, `scale-bar` | T02.03, T02.04 | fixme | 04 |
| `viewport360` | 04 §F | active on the BRIEF routes; the EVA tablet is `fixme` | 03, 17 |
| `axe` | T13.09 | active on `#/join`, `#/ops`, `#/hud/EV1`, `#/report` (the `BUILT_ROUTES` list); each screen package adds its route | 03, each screen package |
| `targets` | T24.11 targets | planner workspace, plan panel and add-stop/keyboard-move active on the touch projects (07, 09, 10); EVA and ops fixme | 07, 09, 10, 17, 19 |
| `hud-glance`, `eva-geometry`, `rotation`, `fullmap` | T24.11 glance, T24.04, UT-5/6/9 | fixme | 17, 18 |
| `queued-resend`, `link-lost` | FD-088, T24.11 | fixme | 18 |
| `toggles` | T07.15 | 300 ms part active (08); inspector part fixme | 08, 28 |
| `keyboard-path`, `plan-rules`, `results-states`, `walking-skeleton`, `poi-conditions`, `plan-hash` | T13.10, T07.15, T08.11, T09.07, T09.06, T10.03, T11.05 | `plan-rules` placement case and `keyboard-path` "move stop 2" active (10); the rest fixme | 10, 28 |
| `print`, `provenance` | T11.05, T27.06 pages, T12.06 | `provenance` on `#/planner` active (07); the rest fixme | 07, 28, 29 |
| `ops-no-terminal`, `task-latency`, `replay` | T25.08, T31.08, T27.06 | fixme | 29 |
| `usability` (UT-1 to UT-9, 5-minute briefing) | T15.02 | fixme | 30 |
| `credits` | T16.05 | fixme | 31 |
| `capture` | T17.02, T17.03 | fixme | 32 |

`contrast` currently measures three real defects, kept as `fixme` so the run stays green and the defect stays named:
`#/ops` 12 px "not included in this build" at 4.42 : 1, `#/report` 12 px "vs" at 4.39 : 1, and `#/eva/EV1` HAVEN and O2 card
text at 1.02 : 1 (ink on the dark card: the `.card` background overrides the `.status-nominal` fill).

## Helpers (`lib/`)

| File | Provides |
| --- | --- |
| `offline.ts` | `guardNetwork`, `expectNoExternal`, `expectLocalAssetsOk`, `routeHashes`, `routeHashesInMode` |
| `a11y.ts` | `axeScan` (wcag2a, wcag2aa, wcag21aa; fails on serious or critical; writes `out/axe-<route>.json`) |
| `geometry.ts` | `boxes`, `expectSameBoxes`, `targets`, `expectTargetSize`, `expectGaps` |
| `contrast.ts` | `textSamples`, `expectContrast` (reuses `tests/ui/wcag.ts`) |
| `grayscale.ts` | `lumaSignatures`, `expectDistinct` (Rec. 709 luma, 16 x 16). The delta floor is the caller's; `grayscale` uses 1 luma level, "not identical", not a perceptual threshold |
| `print.ts` | `pdfPages` (A4 or Letter, 12 mm margins by default) |
| `provenance.ts` | `unlabelledNumbers`, `expectNoUnlabelledNumbers` (FD-110 allowlist; some hooks marked `TODO(verify)`) |
| `hab.ts` | `openRole`, `waitForSnapshot`, `sendAsOps` (UI only), `habHealth`, `killHab`, `restartHab` |
| `fakeScenario.ts`, `siteBundle.ts` | N-01 workaround; which site and scenario a run uses |
| `setupFixture.ts` | `openSetupFixture` (SCR-20 Ready, Computing, Command rejected, Locked: two MOCK candidates in the manifest response and a committed LOADED snapshot over a stubbed socket; FD-344) |
| `presenterFixture.ts` | `openPresenterFixture` (SCR-19 Advancing, Reset confirm, Command rejected, Storm running, Ended: a committed snapshot over a stubbed socket; FD-344) |
| `heartbeat.ts` | `startHeartbeat` (the ping the Hab Core sends every 2 s; a fixture that replaces the server must send it too, or a slow scan trips SCR-18) |

## CI

`.github/workflows/ci.yml` runs Node jobs, but CI ownership is T14.02's and this package adds no workflow. A CI job would run
`make e2e` after `make setup`; it needs a Chromium that Playwright can find.

## Backend release checks (backend package 28)

Backend-owned files in this harness: `checks/release-*.spec.ts` and `lib/release.ts` (decision [BD-152](../../../docs/plan/backend/decisions.md)). They verify
the release on the built app: offline, timings, device matrix, CSP and built files, recovery, roles, network faults and `make demo`.
They run in the same `make e2e`; `release-demo` is its own last project because `make demo` rebuilds `apps/web/dist`.

| Check | Replaces | State | Enabled by |
| --- | --- | --- | --- |
| `release-offline` | T14.06 | active: the planning scenario of 01 §E.2 twice, WAN unplugged, same `plan_hash` | |
| `release-timings` | T14.07 | active: first paint, layer toggle, recompute; long tasks are judged on the real bundle (`E2E_SITE=gale_boxwork`), recorded on F4 (B-02) | |
| `release-matrix` | T14.08 | active on desktop 1280, tablet 768 and phone 390, on F4 (one plan compared across them); the phone drawer tap is `fixme` (B-04) | frontend 07 |
| `release-csp` | T14.09 (browser) | active: no CSP violation on any route, the header, `?debug=1` items; the debug overlay's own violation is `fixme` (B-05) | frontend 07 |
| `release-demo` | T14.09 (files), `make demo` | active: `GET /`, `GET /api/health`, no external URL, gzip and bundle size | |
| `release-recovery` | T14.10 | missing manifest, deleted layer, short grid active; worker failure and dev-build corruption `fixme` | frontend 09, 06 |
| `release-roles` | T28.03 | active: every live role on every project receives a SNAPSHOT | |
| `release-network` | T28.05, T31.08 | socket drop, kill and restart, `hab:local` active; SCR-18 within 3 s (B-03), the killer demo through the UI and the tap latency `fixme` | frontend 17, 18, 29 |

Notes: the app is reached as `http://127.0.0.1:8091` (`E2E_PORT`); `release-demo` starts `make demo` on 8080 and skips when the real
`gale_boxwork` bundle is absent or 8080 answers. The backup recording of `release-offline` is a video when Playwright's ffmpeg is
installed, otherwise a screenshot, in `out/release-offline/`. After the frontend lane merges, run `make e2e` again and remove the
`fixme` of every B- item that is fixed.
