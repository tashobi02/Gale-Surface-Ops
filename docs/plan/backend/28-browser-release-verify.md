# 28 — Browser release verification and `make demo` (after the frontend merges)

| | |
| --- | --- |
| **Subtasks** | T14.06, T14.07, T14.08, T14.09, T14.10, T28.03, T28.05 (browser half), T31.08 (browser half) |
| **Depends on** | 27 and the frontend plan merged into `merging-core` (SCR-00 T14.03–T14.05, SCR-11, SCR-12, SCR-13, SCR-17, SCR-18, SCR-19) |
| **Branch** | `be/28-browser-verify` |
| **Spec refs** | 01 §E; 02 §F (NFR-01 … NFR-11); 06 §D.6; decisions BD-02, BD-03, BD-83 |

## Files

`e2e/playwright.config.ts` (new; Chromium; projects: desktop 1366×768, tablet 768×1024, phone; `webServer`: `make demo` on port 8080) · `e2e/offline.spec.ts` · `e2e/timings.spec.ts` · `e2e/matrix.spec.ts` · `e2e/release.spec.ts` · `e2e/recovery.spec.ts` · `e2e/network.spec.ts` · `e2e/README.md` · `docs/ops/verification-log.md`

If the frontend plan already ships an `e2e/` harness, add these specs to it instead and reuse its config (no second config).

## Checks (each a Playwright spec)

| Subtask | Spec |
| --- | --- |
| T14.06 | `context.setOffline(true)` after load; core scenario steps 1–9 of 01 §E twice in a row; `page.on('request')` asserts every URL is `127.0.0.1`/`localhost`; no console error; both exports have the same `plan_hash`; a video of run 1 kept as the backup recording |
| T14.07 | first map paint, layer toggle, 3-stop recompute, long tasks (PerformanceObserver) vs NFR-02, with the BD-03 machine line |
| T14.08 | the three projects: core scenario on desktop, add/delete on tablet, view-only below 768 px; exports JSON-normalised and compared; Firefox project added when the browser installs within the free disk (BD-02), else logged "not tested" |
| T14.09 | built `index.html` and response header carry the CSP; `securitypolicyviolation` listener sees none; no absolute external URL in `apps/web/dist` (grep); gzipped JS ≤ 500 KB; bundle ≤ 250 MB; `?debug=1` shows its four items |
| T14.10 | on a scratch copy: renamed manifest → SCR-00 names it, Retry boots; deleted TI tiles → layer unavailable and routing works; worker throw (injected via the dev hook the frontend plan provides) → "Computation failed — Retry"; corrupted grid in a dev build → SCR-00 names it; production behaviour recorded (BD-83); keyboard-only reach of Retry |
| T28.03 | each role view opens in each project and receives a SNAPSHOT (CSP `connect-src 'self'`) |
| T28.05 | offline toggle of an EVA page → correct state within 2 s of reconnect; Hab Core kill → SCR-18, restart → resumes; single-laptop mode (`npm run hab:local`) runs the killer demo end to end |
| T31.08 | tap on the EVA page → ops page DOM updates within 500 ms (p95 of 20) |
| `make demo` | `make demo` builds and serves; `GET /` 200 and `/api/health` 200 |

## Automated verification

`make e2e` green; `bash scripts/demo-preflight.sh` green; verification-log sections appended.

## Status rows

```text
| T14.06 | done | <commit date> | e2e/offline.spec.ts: two clean offline runs, same plan_hash, localhost only |
| T14.07 | done | <commit date> | e2e/timings.spec.ts: NFR-02 values with machine line (BD-03) |
| T14.08 | done | <commit date> | e2e/matrix.spec.ts: device matrix and cross-project determinism |
| T14.09 | done | <commit date> | e2e/release.spec.ts: CSP, network, sizes, ?debug=1 |
| T14.10 | done | <commit date> | e2e/recovery.spec.ts: SCR-00 and worker-crash recovery |
| T28.03 | done | <commit date> | Role views in every project (Playwright device descriptors, BD-02) |
| T28.05 | done | <commit date> | Network faults and single-laptop mode (server + browser) |
```

## Done when

`make e2e` passes on `merging-core` with the real bundle.

## Done (13 Nov 2026)

Built as `apps/web/e2e/checks/release-*.spec.ts` in the frontend harness (no second config), with the decisions of
[BD-152](decisions.md). Parts that need frontend screens that are not merged are `test.fixme` and name the package and the
B- item in [01-needs-from-frontend.md](01-needs-from-frontend.md): B-03 (SCR-18 never
appears), B-04 (phone top bar covers the drawer buttons), B-05 (`?debug=1` breaks the CSP); B-02 is an observation on the F4 fixture only, the worker-failure and dev-build corruption hooks (frontend 09, 06), the
killer demo through the UI and the tap latency (frontend 17, 29). **Package 28 must be run again after the frontend lane has
completed** (`make e2e`, then `E2E_SITE=gale_boxwork make e2e`), and the `fixme` of every fixed item removed; the status rows of
T14.10, T28.05 and T31.08 stay `wip` until then. Results and figures are in the
[verification log](../../ops/verification-log.md#t1406t1410-t2803-t2805-t3108-make-demo--browser-release-verification-backend-package-28).
