# Needs from the frontend

| | |
| --- | --- |
| **Owner** | Backend lane (Claude) for Sadman Shaharier Mahim |
| **Date** | 2026-11-13 |
| **Status** | Cross-lane list: the frontend lane's agent reads this file at the start of every batch ([plan README §5](../README.md)) |
| **Related** | [Needs from the backend](../frontend/01-needs-from-backend.md) · [Overview](00-overview.md) |

| ID | Need | Owner |
| --- | --- | --- |
| B-01 | `apps/web/tests/ui/replayRoute.test.ts` is flaky in CI (once: "window is not defined" — a timer fires after jsdom teardown). Clear timers and unmount in `afterEach`. | frontend lane |
| B-02 | (observation, not blocking the demo) On the F4 fixture `mock_site` the planning scenario shows five main-thread long tasks of 55 to 206 ms while stops are placed (`apps/web/e2e/out/release-timings.json`, `long_tasks_by_phase`), although the worker answers in 1 to 6 ms; on `gale_boxwork` the same scenario has none (first map paint 154 ms, recompute 231 to 265 ms). NFR-02 "UI never blocks > 100 ms" is therefore asserted on the real bundle only (`E2E_SITE=gale_boxwork`). If the frontend lane wants the F4 fixture inside the budget too, the time is in the route, results and profile rendering of `apps/web`. | frontend lane |
| B-03 | SCR-18 never appears when the link is lost: with the Hab Core process gone for 15 s, and with the socket closed for 3.5 s, no element with `data-screen="SCR-18"` shows on `#/eva/EV1` or `#/ops` (the tablet keeps its last values, NOMINAL). FR-32 and 03 SCR-18 say "no heartbeat for 3 s". `apps/web/e2e/checks/release-network.spec.ts` has the `fixme` that passes when it works. **Resolved 13 Nov 2026** (frontend lane): it reproduced only on a `merging-core` without frontend package 18 and FD-545; after the `f1ed1fe` publish, `release-network` asserts SCR-18 on EVA and ops for the killed Hab Core and the refused socket, and `link-lost` passes 16/16 ([QD-B03-01](../qol/decisions.md)). | frontend lane |
| B-04 | On a 390 px phone the SCR-02 top bar covers its own drawer buttons: the site name and the data-version chip lie over "Layers · Plan" (and "POI · Conditions") and receive the pointer events, so neither drawer can be opened by a tap or a click (Playwright: "<span class=scr02-site-name> intercepts pointer events", `phone-portrait-390x844`). The `fixme` in `apps/web/e2e/checks/release-matrix.spec.ts` passes when it is fixed. **Resolved 13 Nov 2026:** fixed by FD-425; `release-matrix` checks both toggles and their overlap on `phone-portrait-390x844` (2/2), see [QoL B04-01](../qol/decisions.md). | frontend lane |
| B-05 | `?debug=1` breaks the page's own Content-Security-Policy: the diagnostics overlay (`apps/web/src/ui/debug.ts`, `DebugPanel`) renders an inline `<style>` element for its print rule, which `default-src 'self'` blocks (`securitypolicyviolation`, `style-src-elem inline`, two reports per page). Put the rule in a stylesheet file. The `fixme` in `apps/web/e2e/checks/release-csp.spec.ts` passes when it is fixed (and `release-offline` can drop its set-aside). | frontend lane |
