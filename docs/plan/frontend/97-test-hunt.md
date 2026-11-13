# Package 97 — exhaustive frontend test hunt

Reviewed **6ed2237** on **fe-hunt**, 13 Nov 2026. QA only; no application, test, harness, decision or status files changed. Findings: **3 major, 5 minor, 1 nit; no blocker established**.

Clean baseline: **106 unit files, 1,968 passed, 2 todo, 0 failed**. Temporary probes outside git: **6 expected failures, 1 passing pointer-control probe**. All **44 registered browser files / 771 listed test instances** were attempted individually on port **8184**; every run stopped in global setup before browser assertions. These are environment failures, not product failures or successful browser checks.

## H-01 — Ops rover target placement has no keyboard path

- **Severity:** major
- **Where:** `apps/web/src/ui/ops/OpsMap.tsx:97`, `:108`; `apps/web/src/ui/screens/scr11OpsConsole.tsx:804`; SCR-11 → SCR-15.
- **What happens:** SCOUT, CARRY and RELAY require a pointer click to supply the target. The ops map disables the shared keyboard layer and invokes `onPick` only from OpenLayers `singleclick`. Enter on its focused viewport does nothing; confirmation remains blocked. No coordinate-entry or use-map-centre alternative is rendered.
- **How to reproduce:** open `openOpsFixture(page, "running", { vehicles: [UTILITY_ROVER] })` at a supported desktop width, open the crew panel, activate Task rover UR1 → SCOUT → Pick on map; try to choose a target using Tab/arrows/Enter. The temporary `keyboard.test.ts` mounted the real OpsMap with only site/map-host doubles: Enter produced **0 onPick calls** (red), while the same host's singleclick delivered its coordinate (control green).
- **Why it is wrong:** NFR-04 in `docs/specs/02_Technical_Requirements_Document.md` requires WCAG 2.2 AA; `docs/specs/04_Design_Brief.md` §F requires keyboard map operation; SCR-15 in `docs/specs/03_App_Flow_and_Diagrams.md` requires target selection.
- **Suggested fix:** add a focusable keyboard crosshair and Enter placement, or an equivalent labelled projected-coordinate control. Test a complete keyboard rover dispatch.

## H-02 — Link-loss overlay leaves keyboard focus behind the full-screen notice

- **Severity:** major
- **Where:** `apps/web/src/ui/live/LiveFrame.tsx:154`, `:162`; SCR-18 over SCR-11, shared with EVA/HUD.
- **What happens:** focus remains on the underlying control when the opaque, fixed full-screen notice appears. The old screen is neither inert nor hidden from assistive technology for link loss; those protections apply only to takeover. Focus can be completely obscured, and covered controls remain in keyboard traversal.
- **How to reproduce:** focus an ops clock control, stop Hab Core, wait for SCR-18, then inspect `document.activeElement`. It remains below `[data-slot="live-screen"]`. The real-client/fake-timer `focus.test.ts` reproduced this with a focused child button: after `LINK_LOST_AFTER_MS + 50`, **activeElement=under-overlay; inert=false**. Asserting focus inside the visible notice failed.
- **Why it is wrong:** `docs/specs/04_Design_Brief.md` §F requires visible focus; NFR-04 includes WCAG 2.2 AA focus-not-obscured. SCR-18 specifies a full-screen ops notice with Retry.
- **Suggested fix:** move focus into the notice, restrict traversal to the visible surface, and restore focus on reconnect while keeping cached content mounted. Add disconnect/reconnect focus assertions to `link-lost`.

## H-03 — Connected EVA and ops fixtures become disconnected during long checks

- **Severity:** major
- **Where:** `apps/web/e2e/lib/evaFixture.ts:50`, `:58`; `apps/web/e2e/lib/opsFixture.ts:40`; consumers include `apps/web/e2e/checks/axe.spec.ts:214`, `:237`.
- **What happens:** these routed sockets send the initial SNAPSHOT but no heartbeat or periodic traffic. After the real watchdog interval, nominal fixtures become link-lost and SCR-18 covers the intended state. Long axe scans can measure a changed surface; subsequent pointer actions can time out. This defect is independent of sandbox startup failures.
- **How to reproduce:** open the walking EVA fixture, wait `LINK_LOST_AFTER_MS + 1000`, and assert SCR-18 has count zero: expected red. Temporary `fixture.test.ts` connected the real client to this helper's routed socket, advanced fake timers and observed **frames=[SNAPSHOT], linkLost=true** (expected false). The ops helper has the same omission by inspection; no browser timing result is claimed.
- **Why it is wrong:** fixtures promise connected nominal states. `apps/web/e2e/lib/heartbeat.ts` explicitly documents the required heartbeat; FR-32 / SCR-18 require disconnection after three seconds without traffic.
- **Suggested fix:** use the existing heartbeat helper in both fixtures, stop it at teardown, and assert the intended connected state before and after long scans. Reserve deliberate silence for disconnect tests.

## H-04 — The ops task-limit message displays an unlabelled number

- **Severity:** minor
- **Where:** `apps/web/src/ui/ops/AddTaskPopover.tsx:185`; SCR-11 task editor; reproduction setup already exists in `apps/web/tests/ui/ops.test.ts:1267`.
- **What happens:** “Maximum limit of 4 tasks reached for this stop.” has neither data-provenance nor data-source on it or an ancestor. The ordinary ops provenance sweeps do not open this saturated editor state.
- **How to reproduce:** use the existing “maximum four tasks follows the selected crew and stop” setup: give EV2 four tasks at wp-2; open Add task for EV1, then select EV2. Inspect the limit message. Alternatively mount AddTaskPopover with crewId EV1, stopId wp-2, stopNo 2, maxReached true and an onAdd callback. Temporary `hunt.test.ts` asserted the message has a closest `[data-provenance][data-source]`: **received null**, red.
- **Why it is wrong:** FR-15 / NFR-05 and `CLAUDE.md` §2 require provenance and source for displayed values, including rule-derived counts.
- **Suggested fix:** label the cap with the task-limit rule's provenance/source and sweep the saturated editor state.

## H-05 — A null vehicle parameter set renders as an empty assumed selector

- **Severity:** minor
- **Where:** `apps/web/src/ui/screens/scr20MissionSetup.tsx:141`, `:189`; SCR-20.
- **What happens:** settings with vehicle_param_set null, vehicle_available false and no pressurised rover render an empty select labelled assumed, with no dash option or data-unavailable. Presence of the settings object is incorrectly used as availability for every field. The same selector is blank while settings have not arrived.
- **How to reproduce:** clone F7 live-loaded; set `session.mission_setup.vehicle_param_set=null`, `vehicle_available=false`, `vehicles=[]`; mount MissionSetup through recordingClient/storeFromBeat with F4 and no candidates. Inspect the Vehicle parameter set select. Temporary probe: **data-unavailable=null, no selected option** (expected unavailable dash, red).
- **Why it is wrong:** the field rule in `docs/plan/frontend/01-needs-from-backend.md` and `docs/specs/04_Design_Brief.md` §D.1 require “—” with unavailable metadata for missing values. The setup contract permits a null vehicle parameter set.
- **Suggested fix:** evaluate availability per field; show a disabled dash option and unavailable metadata for the absent set. Cover a populated settings object with a null optional value.

## H-06 — Touch-target sweeps omit textareas and native disclosures

- **Severity:** minor
- **Where:** `apps/web/e2e/lib/geometry.ts:16`; `apps/web/e2e/checks/targets.spec.ts:202`, `:194`.
- **What happens:** TARGET_SELECTOR excludes textarea and summary. The Earth composer and task-editor disclosure are never measured by their controls checks. Other controls satisfy the non-empty assertion, so these omissions are silent.
- **How to reproduce:** evaluate `document.createElement("textarea").matches(TARGET_SELECTOR)` and the same for summary: **both false**. The temporary keyboard probe expected true and failed. No claim is made that either control's current rendered dimensions are too small.
- **Why it is wrong:** target requirements in `docs/specs/04_Design_Brief.md` §C.3 / §F and NFR-04 apply to these native interactive controls too.
- **Suggested fix:** include textareas and native summaries, and add a helper regression proving undersized instances fail.

## H-07 — The claimed keyboard-only core path uses a pointer and bypasses tab order

- **Severity:** minor
- **Where:** `apps/web/e2e/checks/keyboard-path.spec.ts:59`, `:70`, `:76`, `:78`, `:119`, `:128`, `:163`.
- **What happens:** the “steps 1–9 run with the keyboard only” test clicks the Plan tab and repeatedly jumps directly to controls with locator.focus(). It verifies some keyboard activation, but cannot establish tab reachability or traversal order.
- **How to reproduce:** line 76 calls click(); the listed controls use focus() rather than traversal. A control removed from tab order with tabindex=-1 can still be focused this way, leaving this regression undetected at that step. This is a source-confirmed coverage defect; browser execution was blocked.
- **Why it is wrong:** T13.10's keyboard-only acceptance and `docs/specs/04_Design_Brief.md` §F require a usable keyboard path.
- **Suggested fix:** use bounded Tab/Shift+Tab traversal and keyboard tab activation, checking focus throughout. Keep direct-focus component checks separately scoped.

## H-08 — The pending N-29 server acceptance check never contacts the server

- **Severity:** minor
- **Where:** `apps/web/e2e/checks/targets.spec.ts:183`; `apps/web/e2e/lib/evaFixture.ts:50`.
- **What happens:** the check claims it will pass when Hab Core accepts a revised skip reason, but uses openEvaFixture, which intercepts the whole socket without forwarding commands, returning command results or sending authoritative task updates. The final Reason: time assertion cannot establish server acceptance; client overlay text would suffice.
- **How to reproduce:** trace that test into openEvaFixture: HELLO receives a fixed snapshot; COMMAND messages can only be recorded. There is no connectToServer, COMMAND_RESULT or TASK_UPDATED. Backend behavior cannot affect the result. N-29 remains genuinely unimplemented in this baseline (`apps/hab-core/src/engine/tasks.ts:200`); this finding concerns the acceptance design.
- **Why it is wrong:** `docs/plan/frontend/00-overview.md` requires a backend-dependent acceptance to establish the named behavior; the test itself promises an authoritative server snapshot.
- **Suggested fix:** retain the dependency gate, but use a real session and assert the server event/log plus authoritative tablet update once N-29 lands.

## H-09 — The server undo placeholder is stale

- **Severity:** nit
- **Where:** `apps/web/tests/ui/evaSession.test.ts:331`.
- **What happens:** an it.todo still describes server undo as future work although the handler and backend tests implement that acceptance. It contributes one of the two pending unit cases.
- **How to reproduce:** compare the placeholder with `apps/hab-core/src/engine/tasks.ts:181` and `apps/hab-core/tests/stopTasks.test.ts:818` onward: actor-only undo, TASK_UPDATED with undo true, other-role rejection and revision invalidation are present. The web run reports todo; backend tests were inspected, not executed here.
- **Why it is wrong:** package 97 requires reassessing stale pending cases against delivered behavior.
- **Suggested fix:** replace it with an active frontend/handler contract assertion or remove the duplicate placeholder with a reference to backend coverage. Keep the separate N-170 name-migration todo pending.

## Execution evidence and limits

The original branch was worktree-hunt; fe-hunt was created/selected. Initial Git metadata writes failed with HEAD.lock / FETCH_HEAD: Read-only file system. Approved execution allowed the requested fetch/merge, which conflicted in docs/tasks/status.md. Because this QA assignment reserves that file for the orchestrator, git merge --abort restored 6ed2237. No incoming source/status changes are included.

The initial unit command stopped before collection with EROFS writing the parent checkout's node_modules/.vite-temp config cache. The approved command ran; the clean baseline was rerun after merge abort and produced the 1,968-pass result above.

For each check below, the exact command was:

```sh
E2E_PORT=8184 timeout 600s npx playwright test -c apps/web/e2e/playwright.config.ts "checks/<name>\.spec"
```

All 44 runs exited **1 in global setup**, with **0 passed / 0 failed / 0 skipped test bodies**. Each log contains “Hab Core exited with code 1 before it answered” and “Error: listen EPERM: operation not permitted /tmp/tsx-1000/&lt;pid&gt;.pipe” (first: /tmp/tsx-1000/346.pipe). No Chromium/runtime workaround was attempted. Default site: mock_site. Browser output was removed after failures; no server/browser was left running. The list comparison found **zero unregistered spec files**.

| Check | Listed instances | Passed | Failed | Skipped | Outcome |
| --- | --- | --- | --- | --- | --- |
| _harness | 12 | 0 | 0 | 0 | Setup blocked |
| axe | 242 | 0 | 0 | 0 | Setup blocked |
| brand-orange | 5 | 0 | 0 | 0 | Setup blocked |
| capture | 1 | 0 | 0 | 0 | Setup blocked |
| contrast | 17 | 0 | 0 | 0 | Setup blocked |
| credits | 2 | 0 | 0 | 0 | Setup blocked |
| eva-geometry | 1 | 0 | 0 | 0 | Setup blocked |
| eva-portrait | 4 | 0 | 0 | 0 | Setup blocked |
| eva-warning | 2 | 0 | 0 | 0 | Setup blocked |
| fallbacks-live | 10 | 0 | 0 | 0 | Setup blocked |
| fallbacks-planner | 8 | 0 | 0 | 0 | Setup blocked |
| fullmap | 5 | 0 | 0 | 0 | Setup blocked |
| grayscale | 2 | 0 | 0 | 0 | Setup blocked |
| hud-glance | 4 | 0 | 0 | 0 | Setup blocked |
| keyboard-path | 5 | 0 | 0 | 0 | Setup blocked |
| link-lost | 16 | 0 | 0 | 0 | Setup blocked |
| offline | 66 | 0 | 0 | 0 | Setup blocked |
| ops-no-terminal | 5 | 0 | 0 | 0 | Setup blocked |
| plan-hash | 1 | 0 | 0 | 0 | Setup blocked |
| plan-rules | 9 | 0 | 0 | 0 | Setup blocked |
| planner-drawer | 6 | 0 | 0 | 0 | Setup blocked |
| poi-conditions | 3 | 0 | 0 | 0 | Setup blocked |
| print | 8 | 0 | 0 | 0 | Setup blocked |
| provenance | 19 | 0 | 0 | 0 | Setup blocked |
| queued-resend | 2 | 0 | 0 | 0 | Setup blocked |
| release-csp | 5 | 0 | 0 | 0 | Setup blocked |
| release-demo | 1 | 0 | 0 | 0 | Setup blocked |
| release-matrix | 12 | 0 | 0 | 0 | Setup blocked |
| release-network | 6 | 0 | 0 | 0 | Setup blocked |
| release-offline | 1 | 0 | 0 | 0 | Setup blocked |
| release-recovery | 5 | 0 | 0 | 0 | Setup blocked |
| release-roles | 88 | 0 | 0 | 0 | Setup blocked |
| release-timings | 1 | 0 | 0 | 0 | Setup blocked |
| replay | 5 | 0 | 0 | 0 | Setup blocked |
| results-states | 4 | 0 | 0 | 0 | Setup blocked |
| rotation | 1 | 0 | 0 | 0 | Setup blocked |
| scale-bar | 2 | 0 | 0 | 0 | Setup blocked |
| targets | 160 | 0 | 0 | 0 | Setup blocked |
| task-latency | 8 | 0 | 0 | 0 | Setup blocked |
| tiles-all-levels | 1 | 0 | 0 | 0 | Setup blocked |
| toggles | 3 | 0 | 0 | 0 | Setup blocked |
| usability | 10 | 0 | 0 | 0 | Setup blocked |
| viewport360 | 2 | 0 | 0 | 0 | Setup blocked |
| walking-skeleton | 1 | 0 | 0 | 0 | Setup blocked |

## Pending-case inventory

Static counts: **2 it.todo, 16 test.fixme call sites, 24 conditional test.skip call sites, 2 describe.skipIf gates**. No unconditional it.skip, test.todo or describe.skip. The contrast factory's fixme branch is dormant because no current route has pending: **15 concrete test definitions** remain fixme. Browser skips were not observed because setup failed. Both unit skipIf gates were false (no skipped unit tests).

| Pending definition | Reason and baseline reassessment |
| --- | --- |
| tests/submission/productName.test.ts:32 | N-170: backend/scenario/spec name migration remains pending. |
| tests/ui/evaSession.test.ts:331 | Server undo already implemented; H-09. |
| e2e/checks/axe.spec.ts:275 | N-06 EVA phase: backend contract §7b rejects eva_phase as duplicate session/crew state; UI supplies no phase. Unresolved acceptance, not a newly delivered field to unskip. |
| e2e/checks/provenance.spec.ts:254 | N-24 REMS output unavailable. |
| e2e/checks/provenance.spec.ts:261 | N-24 illustrative O₂ rate unavailable. |
| e2e/checks/fullmap.spec.ts:76 | N-120 transported hab time field unavailable. |
| e2e/checks/fallbacks-planner.spec.ts:198 | N-160 manual-leg validation and authoritative totals missing. |
| e2e/checks/offline.spec.ts:58 | N-90 QR endpoint exists, but server allowlist still excludes presenter, which QrDrawer requests; need incomplete. |
| e2e/checks/ops-no-terminal.spec.ts:12 | N-200 SCR-11-only storm blocked by presenter-only permission/surface contract. |
| e2e/checks/plan-rules.spec.ts:282 | N-70 known task ids rejected on republish; retained-stop replacement missing. |
| e2e/checks/targets.spec.ts:183 | N-29 reason revision still rejected; proposed server check also defective, H-08. |
| e2e/checks/targets.spec.ts:208 | N-130 delayed Earth summary / N-31 available-waiting state missing. |
| e2e/checks/credits.spec.ts:33 | N-30 scenario ParamSets / replay metadata missing from planner transport. |
| e2e/checks/release-network.spec.ts:138 | Empty single-laptop demo placeholder; overlaps open N-200 acceptance. |
| e2e/checks/release-recovery.spec.ts:72 | Retry/error UI exists, active results-states covers it; alternate case lacks proposed __failWorker trigger. Title's “no ... Retry yet” is stale wording, not a missing feature. |
| e2e/checks/release-recovery.spec.ts:79 | Empty dev corruption placeholder; production harness cannot exercise dev-only checksum path (BD-83). |
| e2e/checks/scale-bar.spec.ts:44 | Real crater reference needs T03.19/N-140 and missing real grid/tiles. |
| e2e/checks/contrast.spec.ts:86 | Conditional factory, no pending route activates it. |

Every N-id named by a concrete fixme exists in docs/plan/frontend/01-needs-from-backend.md. None is a nonexistent-id finding. No concrete fixme lacks an explanatory title/comment. The scale reference and dev-build cases use task/decision reasons rather than N-ids.

All 24 conditional skip call sites and reasons:

| Locations in apps/web/e2e/checks/ | Count | Reason |
| --- | --- | --- |
| axe.spec.ts:141,157,168,182,285 | 5 | Planner-width restrictions (threshold 800 px). |
| axe.spec.ts:264 | 1 | Ops requires ≥1024 px. |
| targets.spec.ts:61,73 | 2 | FD-210 ops controls require ≥1024 px. |
| targets.spec.ts:93 | 1 | Larger-screen notice only below 1024 px. |
| targets.spec.ts:129,138,147,159,195,231 | 6 | Touch/coarse-pointer project required; last also FD-197/T24.11. |
| ops-no-terminal.spec.ts:82 | 1 | Ops requires ≥1024 px. |
| ops-no-terminal.spec.ts:107 | 1 | Utility rover needs real Gale scenario; F4 only has PR1. |
| release-network.spec.ts:100 | 1 | Real bundle absent; guard only checks manifest/scenario, not missing grid/tiles (existing N-140 audit limitation). |
| release-demo.spec.ts:38,39 | 2 | Real bundle absent; or its own local-mode port already answers. |
| release-matrix.spec.ts:33,75 | 2 | Exporting/comparing project roles. |
| release-matrix.spec.ts:98 | 1 | One-drawer toggle only below 768 px. |
| scale-bar.spec.ts:45 | 1 | Real bundle required; inside pending crater case. |

Unit gates: tests/e2e/liveRecording.test.ts:12 (recording missing) and tests/ui/evaViewModel.test.ts:161 (selector still a stub). Both suites ran here.

## Screen and state coverage map

This is **source coverage, not browser pass evidence**. The route table is in docs/plan/frontend/00-overview.md §Screens and routes; package 03 cites design-system checks rather than defining another route table. Every SCR-00–SCR-20 has a registered rendering/content or accessibility assertion. No entire screen was found absent. Generic route scans do not establish state completeness.

| Screen / route | Existing rendering assertions | Limits / gaps |
| --- | --- | --- |
| SCR-00 boot failure | release-recovery, axe, offline | Missing manifest, Retry, corrupt grid covered; dev checksum pending. |
| SCR-01 #/ | keyboard-path, offline, axe, provenance | Keyboard reachability overstated, H-07. |
| SCR-02 #/planner | planner-drawer, walking-skeleton, release-matrix, toggles | Empty/degraded map cases exist. |
| SCR-03 Layers | toggles, fallbacks-planner, contrast | Layer loss/fallback/overlay limit covered. |
| SCR-04 Plan | plan-rules, axe, keyboard-path | Empty/editing/invalid/tasks exist; republish N-70. |
| SCR-05 Results | results-states, plan-rules, plan-hash | OK/Partial/Over limits/error/Retry covered; alternate live failure trigger missing. |
| SCR-06 POI | poi-conditions, plan-rules | Image metadata/missing image covered; long-content pixel layout unverified here. |
| SCR-07 Conditions | poi-conditions, axe, provenance | Computed/daylight/unavailable exist; REMS N-24. |
| SCR-08 #/briefing | print, plan-hash, provenance | Partial/over-limit/no-route/export failure covered; O₂ N-24. |
| SCR-09 #/sources | credits, provenance, axe | Dataset links covered; ParamSet/replay display N-30. |
| SCR-10 #/join | release-roles, offline, axe | Takeover also covered by fallbacks-live; no all-state keyboard path. |
| SCR-11 #/ops | ops-no-terminal, task-latency, axe, provenance | Empty/loaded/running/paused/ended/alert exist; fixture loss H-03, task-cap provenance H-04, full storm N-200. |
| SCR-12 #/eva/EV1, EV2 | eva-geometry, eva-portrait, targets, axe | Walking/task/undo/alert/no-hab-link/to-haven exist; unintended transport loss H-03. |
| SCR-13 #/hud/EV1, EV2 | hud-glance, fullmap, brand-orange | Nominal/caution/warning/no-link covered. |
| SCR-14 Options | eva-warning, fullmap, targets, axe | Warning with/without options, approval/hold covered. |
| SCR-15 Rover | targets, axe, ops-no-terminal | Choosing/placement scanned; keyboard placement absent H-01. Queued/en-route/done/rejected/null metrics have roverTask/roverQueue unit coverage. |
| SCR-16 #/earth | axe, provenance, targets | Primarily default scans; delayed feed/link pending N-130/N-31. Textarea omitted H-06. No browser send/reject/queue-state interaction check found. |
| SCR-17 #/report | print, axe, fallbacks-live | Populated multi-stop/alert/trace and report/log failure covered. |
| SCR-18 overlay | link-lost, release-network, contrast | Loss/reconnect timing/values covered; obscured focus omitted until H-02. |
| SCR-19 #/presenter | axe, contrast, provenance, keyboard-path | Pending/reset/rejected/storm/ended and QR focus restoration exist; all-role QR N-90. |
| SCR-20 #/setup | axe, contrast, provenance, targets | Ready/computing/rejected/locked exist; partial/null field H-05. |
| Replay #/replay | replay, axe, provenance, fallbacks-live | Paused/step/ended/missing recording covered. |

Disconnected, reconnected, taken-over, empty, error and degraded states all have some active coverage. The gaps are state-specific. Zero-stop/empty results already have unit coverage in planPanel.test.ts, scr05RouteResults.test.ts and briefing tests; no new zero-stop crash was reproduced. Long-string visual robustness cannot be certified without the browser; no overflow finding is invented. Existing status icons/grayscale checks retain shape and word; no additional confirmed colour-only status defect was established. H-04 fails provenance even though its message states the limit in words.

## Probe evidence and external reruns

Temporary files outside git at /tmp/fe-hunt-probes/: hunt.test.ts (H-04/H-05), keyboard.test.ts (H-01/H-06 plus passing singleclick control), fixture.test.ts (H-03), focus.test.ts (H-02). They import real components/helpers and explicit test fixtures without editing them. Re-run:

```sh
npx vitest run --config /tmp/fe-hunt-probes/vitest.config.mjs
```

Expected baseline result: **6 failed, 1 passed**. These are deliberately failing reproductions, not green repository acceptance. Output: /tmp/fe-hunt-probes/results-final.log. Durable steps/observations are in each finding above.

The orchestrator must run the following outside the sandbox, sequentially and foreground. These remain unverified; axe may require more than 600 seconds externally, as the existing audit records. Keep port 8184 for this agent:

```sh
E2E_PORT=8184 timeout 600s make e2e-one CHECK=_harness
E2E_PORT=8184 timeout 600s make e2e-one CHECK=axe
E2E_PORT=8184 timeout 600s make e2e-one CHECK=brand-orange
E2E_PORT=8184 timeout 600s make e2e-one CHECK=capture
E2E_PORT=8184 timeout 600s make e2e-one CHECK=contrast
E2E_PORT=8184 timeout 600s make e2e-one CHECK=credits
E2E_PORT=8184 timeout 600s make e2e-one CHECK=eva-geometry
E2E_PORT=8184 timeout 600s make e2e-one CHECK=eva-portrait
E2E_PORT=8184 timeout 600s make e2e-one CHECK=eva-warning
E2E_PORT=8184 timeout 600s make e2e-one CHECK=fallbacks-live
E2E_PORT=8184 timeout 600s make e2e-one CHECK=fallbacks-planner
E2E_PORT=8184 timeout 600s make e2e-one CHECK=fullmap
E2E_PORT=8184 timeout 600s make e2e-one CHECK=grayscale
E2E_PORT=8184 timeout 600s make e2e-one CHECK=hud-glance
E2E_PORT=8184 timeout 600s make e2e-one CHECK=keyboard-path
E2E_PORT=8184 timeout 600s make e2e-one CHECK=link-lost
E2E_PORT=8184 timeout 600s make e2e-one CHECK=offline
E2E_PORT=8184 timeout 600s make e2e-one CHECK=ops-no-terminal
E2E_PORT=8184 timeout 600s make e2e-one CHECK=plan-hash
E2E_PORT=8184 timeout 600s make e2e-one CHECK=plan-rules
E2E_PORT=8184 timeout 600s make e2e-one CHECK=planner-drawer
E2E_PORT=8184 timeout 600s make e2e-one CHECK=poi-conditions
E2E_PORT=8184 timeout 600s make e2e-one CHECK=print
E2E_PORT=8184 timeout 600s make e2e-one CHECK=provenance
E2E_PORT=8184 timeout 600s make e2e-one CHECK=queued-resend
E2E_PORT=8184 timeout 600s make e2e-one CHECK=release-csp
E2E_PORT=8184 timeout 600s make e2e-one CHECK=release-demo
E2E_PORT=8184 timeout 600s make e2e-one CHECK=release-matrix
E2E_PORT=8184 timeout 600s make e2e-one CHECK=release-network
E2E_PORT=8184 timeout 600s make e2e-one CHECK=release-offline
E2E_PORT=8184 timeout 600s make e2e-one CHECK=release-recovery
E2E_PORT=8184 timeout 600s make e2e-one CHECK=release-roles
E2E_PORT=8184 timeout 600s make e2e-one CHECK=release-timings
E2E_PORT=8184 timeout 600s make e2e-one CHECK=replay
E2E_PORT=8184 timeout 600s make e2e-one CHECK=results-states
E2E_PORT=8184 timeout 600s make e2e-one CHECK=rotation
E2E_PORT=8184 timeout 600s make e2e-one CHECK=scale-bar
E2E_PORT=8184 timeout 600s make e2e-one CHECK=targets
E2E_PORT=8184 timeout 600s make e2e-one CHECK=task-latency
E2E_PORT=8184 timeout 600s make e2e-one CHECK=tiles-all-levels
E2E_PORT=8184 timeout 600s make e2e-one CHECK=toggles
E2E_PORT=8184 timeout 600s make e2e-one CHECK=usability
E2E_PORT=8184 timeout 600s make e2e-one CHECK=viewport360
E2E_PORT=8184 timeout 600s make e2e-one CHECK=walking-skeleton
```

Final documentation validation: `make -s typecheck lint docs-check` passed; 4,520 relative links checked, zero broken. `git diff --check` passed. Only the three requested documentation paths are included.
