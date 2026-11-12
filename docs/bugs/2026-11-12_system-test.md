# System test — implemented work, 12 November 2026

| Field | Value |
| --- | --- |
| Owner | Team CheesySpace; test execution and report by Codex |
| Date | 2026-11-12 (Asia/Dhaka) |
| Status | System-test execution complete; blocked areas recorded; six confirmed findings; no fixes applied |
| Related | [Task status](../tasks/status.md) · [Coordination](../tasks/_coordination.md) · [Specs](../README.md) · [Command ledger](2026-11-12_commands.md) · [Reproduction probes](2026-11-12_reproduce.mjs) · [AI use](../AI_USE.md) |

## 1. Summary

**NO-GO for the real §E.1 demonstration.** The Gale bundle and real scenario are missing, and the web entry point mounts no screens. These are unfinished work, not newly discovered product bugs. Independent defects also affect completed session management and the event-log component.

| Severity | Confirmed bugs |
| --- | ---: |
| S1 | 0 |
| S2 | 3 |
| S3 | 2 |
| S4 | 1 |
| Total | 6 |

Zero S1 findings does **not** establish science or demo readiness. The real route, haven, storm-to-options-to-shelter sequence and multi-device operation could not be exercised. All six findings were reproduced at least twice. Documentation discrepancies and expected incomplete features are counted separately.

The five highest risks are:

1. **Missing integrated demo:** `scenario.json`, the Gale manifest and mounted role screens are absent. No complete §E.1 run is possible.
2. **Session load crash:** the committed, validated fixture with stop tasks crashes in `seedTasks` (BUG-001), despite T22.12 being done.
3. **Repeated command side effects:** the same accepted `LOAD_SCENARIO` creates another session (BUG-002).
4. **Event-log crash and misleading presentation:** prop-only mounting loops indefinitely (BUG-003); stable-client mounting exposes missing source/value labels and status-coloured decoration (BUG-004–005).
5. **False confidence from green units:** tests replace unfinished integration seams; normal gates also collect ignored scratch content (BUG-006). Component success is not system acceptance.

After allowing loopback sockets, **1,087 active TypeScript tests pass**: compute 516, Hab Core 361, web 210. There are also 4 skipped and 66 todo cases. The targeted pipeline suite has **225 passed, 6 skipped**. Full `make test` fails during collection of a pre-existing scratch test. No failing product assertion was observed in the existing active suites; the new probes expose failures those suites do not cover.

The current status inventory is **117 done / 56 wip**, across **347 registered subtasks**. It differs from the estimate in the request; the actual checkout is used throughout.

## 2. Environment and commit

| Item | Observed |
| --- | --- |
| Tested HEAD | `c35283947a7c181af26c3087d7741634f225f6c8` |
| Current branch | `main`; local commit only, no push or PR |
| Initial tracked working tree | Clean (`git status --short`, exit 0, no output) |
| Node | `v26.13.0` |
| PATH Python | `Python 3.13.15` |
| Conda | `conda 26.7.1`, `/home/obidit/miniconda3/bin/conda` |
| Pipeline environment | `/home/obidit/miniconda3/envs/marswalk-pipeline`, Python `3.12.16` |
| Geo stack | GDAL `3.13.3`; rasterio `1.5.2`; pyproj `3.8.0`; PROJ `9.9.0`; Mars radius check passed |
| Dependencies | `npm ci` exit 0; 281 packages installed; esbuild postinstall blocked by npm policy, but build succeeded |
| Browser | Installed Playwright Chromium, headless, isolated localhost server |
| Scratch evidence | `/tmp/marswalk-system-test/`; logs, browser screenshots, synthetic session files and production build |

Initial server tests failed with `listen EPERM: operation not permitted 127.0.0.1`; initial tsx CLI attempts failed opening `/tmp/tsx-1000/*.pipe`. Retried with approved socket access: server tests passed and replay/start reached the real missing-data checks. These initial failures are **environment restrictions**, not product bugs.

Conda and its environment are present: pipeline pytest and `make validate` were **not blocked by missing conda**. `make validate SITE=mock_site` passes. Gale validation is **BLOCKED by the unfinished bundle**, with a missing-manifest error. The full pipeline test target is blocked by collection of an ignored scratch test importing unavailable `cdflib`; the intended `pipeline/tests` suite was run independently. No system packages were installed and no ignored files were moved or repaired.

## 3. Coverage matrix

“Tested” means the implemented acceptance surface was exercised, not that the whole TASK is finished. “Partly tested” includes unit coverage with missing system integration or manual acceptance. The per-done-subtask disposition follows in §10. Tasks without status rows are not promoted to implemented merely because a stub or unclaimed file exists.

| TASK | Done | Wip | Coverage | Evidence / limit |
| --- | ---: | ---: | --- | --- |
| [TASK-00](../tasks/TASK-00_resolve-rules-and-register.md) | 5 | 0 | partly tested | Recorded permissions and roster reviewed; historical source quotes not independently verifiable. |
| [TASK-01](../tasks/TASK-01_feasibility.md) | 5 | 1 | partly tested | Feasibility notes and source records reviewed; acquisition, GIS judgments and human sign-off not repeated. |
| [TASK-03](../tasks/TASK-03_preprocessing-pipeline.md) | 22 | 1 | partly tested | 225-test pipeline run, mock validator, schemas, projection, raster and grid tests; Gale bundle missing. |
| [TASK-04](../tasks/TASK-04_vectors-pois-images.md) | 2 | 4 | partly tested | JSON records parse; traverse/TI decision evidence reviewed; images and GIS overlay remain unfinished. |
| [TASK-05](../tasks/TASK-05_compute-core.md) | 22 | 8 | partly tested | 516-test compute run covers implemented routing/sampling/time/input behavior; real-grid and UI acceptance unavailable. |
| [TASK-05b](../tasks/TASK-05b_compute-v2.md) | 11 | 2 | partly tested | Haven/rendezvous/dose/consumables/contingency suites pass; link graph, Earth-link runtime and real-grid benchmark incomplete. |
| [TASK-06](../tasks/TASK-06_mars24-and-radiation.md) | 3 | 5 | partly tested | Radiation and implemented solar tests run; reference/human verification and conditions integration incomplete. |
| [TASK-07](../tasks/TASK-07_app-shell-and-map-workspace.md) | 0 | 1 | partly tested | Browser loads empty shell; only T07.14 has a wip row. |
| [TASK-12](../tasks/TASK-12_sources-methods-provenance.md) | 1 | 0 | partly tested | Model-source JSON records parsed and checked against schema fields; source publication claims not externally reverified. |
| [TASK-13](../tasks/TASK-13_visual-system-accessibility.md) | 6 | 1 | partly tested | Local fonts/icons/licences and tokens inspected; contrast script run; keyboard/focus/glove behavior not exercised in mounted app. |
| [TASK-14](../tasks/TASK-14_integration-offline-hardening.md) | 1 | 1 | partly tested | Task checker and build run; full offline integrated acceptance unavailable. |
| [TASK-15](../tasks/TASK-15_usability-test.md) | 2 | 0 | partly tested | Usability script reviewed; no participant sessions performed. |
| [TASK-16](../tasks/TASK-16_submission-package.md) | 0 | 2 | partly tested | Documentation work only; submission and public release not exercised. |
| [TASK-20](../tasks/TASK-20_hab-core-skeleton.md) | 10 | 1 | partly tested | Server/client suites, real loopback WS handshake and malformed input; no multi-device router test. |
| [TASK-21](../tasks/TASK-21_scenario-builder.md) | 6 | 1 | partly tested | RAD/DONKI/SPICE tests and schemas; required-kernel test passes; real scenario absent. |
| [TASK-22](../tasks/TASK-22_simulation-engine.md) | 13 | 1 | partly tested | Clock/reducer/log/tick/resume suites; direct session and synthetic replay probes; BUG-001–002. |
| [TASK-23](../tasks/TASK-23_safety-ops.md) | 5 | 1 | partly tested | Commands/summon/contingency suites; wrong-state WS command rejected; real storm flow unavailable. |
| [TASK-27](../tasks/TASK-27_report-and-replay.md) | 1 | 3 | partly tested | Event-log mounting probes fail; report components tested only through existing suites. |
| [TASK-24](../tasks/TASK-24_eva-client-and-hud.md) | 1 | 9 | partly tested | Existing component tests run; application mounting, full map and real session view remain incomplete. |
| [TASK-30](../tasks/TASK-30_score-sheet-points.md) | 0 | 2 | partly tested | AI-disclosure and project-page work remain wip; no publication action. |
| [TASK-31](../tasks/TASK-31_stop-task-list.md) | 1 | 4 | partly tested | Types/build checked; seedTasks crashes a done session path; task engine tests still todo. |
| [TASK-25](../tasks/TASK-25_ops-console.md) | 0 | 7 | partly tested | Existing component tests run; ops route is not mounted. |
| [TASK-17](../tasks/TASK-17_videos.md) | 0 | 1 | partly tested | Narration draft only; filming and timing not exercised. |
| [TASK-02](../tasks/TASK-02_projection-spike.md) | 0 | 0 | not started | No status rows; outside executed-work scope. |
| [TASK-08](../tasks/TASK-08_plan-panel-and-waypoints.md) | 0 | 0 | not started | No status rows; outside executed-work scope. |
| [TASK-09](../tasks/TASK-09_results-panel-and-profile.md) | 0 | 0 | not started | No status rows; outside executed-work scope. |
| [TASK-10](../tasks/TASK-10_poi-detail-and-conditions.md) | 0 | 0 | not started | No status rows; outside executed-work scope. |
| [TASK-11](../tasks/TASK-11_briefing-card-and-export.md) | 0 | 0 | not started | No status rows; outside executed-work scope. |
| [TASK-18](../tasks/TASK-18_desirables.md) | 0 | 0 | not started | No status rows; outside executed-work scope. |
| [TASK-26](../tasks/TASK-26_links.md) | 0 | 0 | not started | No status rows; outside executed-work scope. |
| [TASK-28](../tasks/TASK-28_network-kit.md) | 0 | 0 | not started | No status rows; outside executed-work scope. |
| [TASK-29](../tasks/TASK-29_rover-tasking.md) | 0 | 0 | not started | No status rows; outside executed-work scope. |
| TASK-19 / TASK-32 | 0 | 0 | not started | No task file or registered status row at this HEAD. |

TASK-02, 08–11, 18, 26, 28 and 29 have no status rows. TASK-16, 17 and 30 do have wip rows; they are not classified as wholly unstarted, contrary to examples in the request. No changes were made to status or progress.

## 4. Command results

Every recorded shell check, including reads, retries and helper invocations, is listed with exit status in the [command ledger](2026-11-12_commands.md). The table below summarises gates. A wrapper returning zero does not turn a caught product exception into PASS; BUG-003's probe deliberately prints the caught error and exits zero.

| Command | Exit | Result |
| --- | ---: | --- |
| `node -v` | 0 | v26.13.0 |
| `npm ci` | 0 | Installed; npm warnings recorded above |
| `command -v conda`, `conda --version`, `conda env list` | 0 each | Pipeline environment found |
| `make lint` | 2 | 78 issues in 28 ignored scratch/dependency files, BUG-006 |
| `make typecheck` | 0 | All workspace type checks pass |
| `make test-web` | 2 | Initial socket sandbox: all 10 server tests fail before exercising behavior |
| `make docs-check` | 2 | Stops at the same lint failure; link/progress steps subsequently run separately |
| `make test` (sandbox) | 2 | Same socket failure; pytest not reached |
| `make test` (socket access allowed) | 2 | All JS suites pass; pytest scratch collection error |
| `$(make -s pipeline-python) -m pytest -q pipeline/tests` | 0 | 225 passed, 6 skipped; 25 rasterio fixture warnings |
| `$(make -s pipeline-python) -m pytest -q pipeline` | 2 | Reproduces scratch collection failure |
| `MARSWALK_REQUIRE_SPICE=1 $(make -s pipeline-python) -m pytest -q pipeline/tests/test_spice_tables.py` | 0 | Kernel-dependent checks exercised; 31 passed |
| `make validate SITE=mock_site` | 0 | Valid mock bundle |
| `make validate SITE=gale_boxwork` | 2 | Missing manifest; unfinished T03.19 |
| `make replay` twice, after socket retry | 2 both | Missing real `scenario.json`; no real event-log hash produced |
| `make hab`, after socket retry | 2 | Missing Gale site bundle |
| `npm --workspace @marswalk/hab-core run demo-numbers` | 1 | Missing script; not a failed science result |
| `npm --workspace @marswalk/web run build -- --outDir /tmp/marswalk-system-test/web-dist` | 0 | Production build succeeds, five modules; app remains empty |
| `python3 scripts/update_progress.py --check` | 0 | Progress fresh |
| `python3 scripts/check_tasks.py` | 0 | 32 task files, 347 subtasks, 0 problems |
| `python3 scripts/check_links.py docs README.md CLAUDE.md AGENTS.md` | 0 | 3,288 relative links checked before report, 0 broken |
| `cd apps/web && npx --no-install vitest run tests/compute/grid.test.ts` twice | 1 both | Stale Verify path: no test files found; actual package test passes |
| `node docs/design/prototype/test/contrast.mjs` | 0 | HUD pairs ≥7:1; PRINT text reports 17.74 versus table's 17.7 |

Per-task targeted commands also passed: Hab Core `server`, `engine`, `sessionTick`, `commands`, `tick`, `scenario`, `summon`, `contingencyOps`, `fixture`; web `habClient`; compute `haven`, `rendezvous`, `eventDose`, `consumables`, `contingency`. Exact runs and outputs' test summaries are in the ledger. Some filters match multiple suites. Passing a suite with todo/skipped tests does not establish those cases.

### 4.1 Final artifact validation

The report, command ledger and AI-use log pass targeted markdownlint (0 issues) and link checks (182 relative links, 0 broken). `git diff --check` passes. The requested `make lint docs-check` was rerun in the original checkout and still exits 2 on pre-existing ignored scratch files (BUG-006).

A separate `/tmp/marswalk-system-test/tracked-check` copy made with `git archive HEAD`, overlaid with only the allowed documentation artifacts and using the installed dependencies, passes **`make lint docs-check`, exit 0**: 104 Markdown files, 0 issues, 3,461 links, 0 broken, progress check clean. This validates the submitted artifacts without claiming the original contaminated checkout's full gate passed. No source files or ignored scratch files were changed to obtain the clean result.

### 4.2 Exact initial failing server cases

All are in `apps/hab-core/tests/server.test.ts`; each had the same `listen EPERM` error. All ten passed with socket access:

- HELLO with last_seq 0 returns exactly one SNAPSHOT whose seq equals the session's last_seq.
- Two clients receive every EVENT in seq order; semantic events are sent immediately.
- Reconnect with last_seq gets a fresh SNAPSHOT first, then the EVENTs after it.
- Reconnect with a gap above MAX_REPLAY_GAP gets the SNAPSHOT only.
- Server sends PING every HEARTBEAT_MS.
- COMMAND gets exactly one COMMAND_RESULT with its command_id.
- A second HELLO cannot change client_id.
- COMMAND uses its connection's HELLO client_id for deduplication.
- GET /api/health returns the specified fields.
- GET /api/report returns PostEvaReport.

The subsequent pytest collection failure was `pipeline/work/rad/u45/test_rad_recommendation.py`, importing `build_rad_recommendation.py:22`: `ModuleNotFoundError: No module named 'cdflib'`. It is not a failure of `pipeline/tests/test_rad.py`.

### 4.3 System sequence and faults

An isolated server used the real `startServer` and `loadSession`, a scratch copy of the committed fake scenario with `stop_tasks=[]` explicitly removing the BUG-001 trigger, and the production build in `/tmp`. No product code was replaced. This fixture is synthetic and is not the real demo.

| Probe | Observed |
| --- | --- |
| Malformed JSON, JSON null, wrong protocol version | Ignored; subsequent HELLO receives SNAPSHOT |
| COMMAND before HELLO | `INVALID`, `send HELLO first` |
| START_EVA | Accepted, event_seq 2 |
| Second START_EVA, different command id | `BUSY`, `Starting the EVA is not possible while the session is RUNNING` |
| SET_CLOCK paused | Accepted |
| Repeat accepted LOAD_SCENARIO | New session created, BUG-002 |
| Missing/corrupt manifest in scratch sites | Both reject through site check; no successful load |
| `/?site=mock_site` | Empty body, zero `#app` children, no page/console errors |
| `/?site=does_not_exist`, `/?site=../../etc` | Same empty body; site query is not processed yet |
| `/?site=mock_site#/ops` | Same empty body; no role screen |

For each browser navigation only the local document, JS and CSS were requested. No manifest, tile or font request was made because the app mounts no content. Screenshots are retained under `/tmp/marswalk-system-test/integration-*/browser-*.png`; network URLs and errors are recorded in the scratch integration output. This is a PASS for the observed shell's local requests, **not** a complete NFR-01/NFR-08 offline demo certification.

Two real-engine headless runs of the synthetic no-task variant produced:

```text
ac0eabac8c11cbb43a296139285fa16400610771afb226bef981f923c8a1c603
ac0eabac8c11cbb43a296139285fa16400610771afb226bef981f923c8a1c603
```

The paired result repeated in a second integration run. The existing replay unit test mocks tick; this separate experiment uses the actual tick. Neither establishes the missing real scenario's hash. Storm trigger → options → summon → rendezvous was tested only in its existing isolated suites; the complete real sequence is **BLOCKED** by missing scenario, bundle and UI integration. No simulated success is substituted for that result.

### 4.4 Requested demo numbers

The `demo-numbers` npm script does not exist. A scratch script instead ran the real `triggerState` over the committed RAD samples and read the stored Earth-link row at or before that trigger time:

```text
zero_based_row: 41
alert: 2024-05-20T05:50:32Z
earth_row: 2024-05-20T05:50:00Z
light_time_min: 15.836510733333334
next_pass: 2024-05-20T08:50:00Z
next_pass_min: 179.46666666666667
```

Rounded values match the request's **15.84 min** and **179.5 min**. “Row 41” means zero-based sample index 41 (the 42nd sample). The checkout's [01 §E.1](../specs/01_Product_Requirements_Document.md#e1-killer-demo--storm-at-sol-4190-target-90-s-of-the-240-s-video) still says light time X and next relay Y, and labels its ETAs illustrative. These numbers are therefore checked against the supplied target and stored tables, not claimed to be final §E.1 values. The runtime Earth-link functions remain stubs.

## 5. Invariant checks

| Rule | Outcome | Evidence and scope |
| --- | --- | --- |
| Engine reads no wall clock / unseeded randomness | PASS | `rg` over engine TypeScript for Date.now, Math.random, performance.now and timers returns no matches; clock static guard passes. Date.now in server/client is outside engine. |
| Science deterministic | PASS, limited | Existing deterministic compute tests and synthetic paired hashes agree; real scenario replay NOT RUN. |
| No Earth-coordinate paths | PASS, static scope | No executable ol/sphere, EPSG:3857, EPSG:4326 or WGS84 matches in web/compute/pipeline source. FullScreenMap match is a prohibition comment. Projection tests pass. |
| Byte-identical pipeline/UI projection | NOT RUN for UI | Mock manifest equals `PROJ4_BY_SITE['mock_site']` byte-for-byte; Gale manifest and UI projection implementation absent. No claim of UI equality. |
| East-positive longitude / Mars24 conversion | PASS, implemented functions | `mars24.ts:198–240` normalises `(360-east) mod 360`; compute tests run. T06 reference acceptance still wip. |
| Row 0 north; DEM no-data becomes NaN before slope | PASS | `test_clip_reproject.py`, `test_derive.py`, `test_grid.py` in passing pipeline suite; no real Gale bundle validation. |
| No runtime internet / local assets | PASS for observed shell; full app NOT RUN | Source scan and browser requests local only; local font/icon files exist. Empty shell does not exercise screen assets or LAN devices. |
| Every value has provenance and source | FAIL | BUG-004: event counts, sim time and revision unlabelled; no source id in event log. Other component suites do not prove all screens. |
| Nothing labelled “live” as actual Mars telemetry | PASS, static scope | Matches are comments, accessibility aria-live, or API names; no observed misleading telemetry label. Real screens unmounted. |
| Status colour + shape + word + fixed position; no OPS/HUD brand orange | FAIL / partly checked | BUG-005 uses cyan for decoration/filter selection. Existing cue component tests pass; pixel positions and full composed views NOT RUN. No orange use observed in tested shell. |
| Media: no under-18 likeness | NOT RUN | No person-media collection or video review performed; no media added. |
| Licence and credits | PASS for presence; full attribution NOT RUN | Apache-2.0 LICENSE and local font/icon licences present; source/credit fields exist; credits curation wip and Sources UI unmounted. Publisher licences not externally reverified. |
| No LLM-generated numbers (ADR-006) | NOT RUN as universal audit | Fixtures declare synthetic inputs; selected demo values obtained from code/tables and tests. Static grep cannot prove authorship of every numeric literal or historical source. TODO(verify): human/source audit for all numeric provenance. |
| AI change disclosure | PASS | One row added to AI_USE.md for this test/report; no science/data values changed. |
| No downloaded data / large binaries committed | PASS for this change | No tracked pipeline/work files; changed artifacts are report, ledger, small reproduction source and disclosure only. |

## 6. Bugs

| ID | Severity | Finding | Owning ids |
| --- | --- | --- | --- |
| BUG-001 | S2 | Valid scenario with stop tasks crashes session load | T22.12, T31.04, FR-30, FR-34, FR-50 |
| BUG-002 | S2 | Accepted LOAD_SCENARIO is executed again on retry | T23.02, T22.12, FR-30, FR-31, NFR-06 |
| BUG-003 | S2 | EventLog prop-only rendering loops and crashes | T27.04, FR-46, SCR-11 |
| BUG-004 | S3 | EventLog values lack provenance/source association | T27.04, FR-15, NFR-05, SCR-11 |
| BUG-005 | S3 | EventLog uses status cyan as decoration and selection | T27.04, T13.01, NFR-04, SCR-11 |
| BUG-006 | S4 | Gates traverse ignored pipeline scratch files | T14.01, TASK-03, TASK-14; CLAUDE §4 gates |

### BUG-001 — Valid scenario with stop tasks crashes session load

- **Location:** `apps/hab-core/src/session.ts:222`; `apps/hab-core/src/engine/tasks.ts:13`.
- **Classification:** product integration bug; unfinished T31.04 breaks the done T22.12 session path. This is separate from the missing real data bundle.
- **Expected:** a validated scenario loads into a usable session, including seeded tasks. [05 §C.2 Scenario / Session](../specs/05_Backend_and_Database_Schema.md#scenario), [T22.12](../tasks/TASK-22_simulation-engine.md#t2212--implement-the-session-manager-load-commands-persistence-resume) and FR-30/34. Invalid scenarios should be rejected at the loader boundary.
- **Reproduce from repo root, twice:**

```sh
node --import tsx docs/bugs/2026-11-12_reproduce.mjs session
node --import tsx docs/bugs/2026-11-12_reproduce.mjs session
```

The probe calls the real `readScenario` on the committed fake scenario, then real `loadSession`; no mocks or fixture edits.

```text
VALIDATED scenario fake-straight-line
Error: TODO(TASK-31): T31.04 not implemented
    at seedTasks (.../engine/tasks.ts:13:9)
    at startSession (.../session.ts:222:56)
```

**Actual:** exit 1 both times. Existing session/replay tests replace `seedTasks`, hiding this seam. **Frequency:** always, 2/2 delivered-probe runs (also 2/2 scratch runs). **Suggested direction:** complete or explicitly gate task seeding before allowing session startup; test the actual validated scenario through the unmocked session boundary.

### BUG-002 — Retrying accepted LOAD_SCENARIO creates another session

- **Location:** `apps/hab-core/src/session.ts:120–129`; `apps/hab-core/src/commands.ts:128–131` (recording only outcomes with events).
- **Expected:** same client plus accepted command_id returns the first result without another side effect, including after reconnection. [02 §E.6 Command dedupe](../specs/02_Technical_Requirements_Document.md#e6-websocket-protocol-ws), [05 Command](../specs/05_Backend_and_Database_Schema.md#command), T23.02/T22.12.
- **Reproduce twice:**

```sh
node --import tsx docs/bugs/2026-11-12_reproduce.mjs dedupe
node --import tsx docs/bugs/2026-11-12_reproduce.mjs dedupe
```

This declared fixture variant sets `stop_tasks=[]` in memory solely to isolate BUG-001. It sends identical LOAD_SCENARIO commands as `same-client`.

```text
LOAD_DEDUPE 1 {"v":1,"type":"COMMAND_RESULT","command_id":"reload-once","ok":true,"event_seq":1} s-0002 [null]
LOAD_DEDUPE 2 {"v":1,"type":"COMMAND_RESULT","command_id":"reload-once","ok":true,"event_seq":1} s-0003 [null]
```

**Actual:** both accepted, but the session changes again; generated load events carry null command_ref, so this command cannot be reconstructed in accepted-command memory from those events. **Frequency:** always, 2/2 delivered-probe runs and both network-harness runs. **Suggested direction:** preserve accepted session effects and their command references across session replacement; cover retries and restart reconstruction. JUMP_NEXT_EVENT has a similar unrecorded effect path by inspection, but was not separately reproduced and is only TODO(verify).

### BUG-003 — EventLog crashes when passed events without a client

- **Location:** `apps/web/src/ui/ops/EventLog.tsx:174–179`.
- **Expected:** supported `events` prop renders supplied events in seq order with sim time, as claimed by [T27.04](../tasks/TASK-27_report-and-replay.md#t2704--implement-the-event-log-view-on-ops), FR-46 and [03 SCR-11](../specs/03_App_Flow_and_Diagrams.md#scr-11--ops-console-v2).
- **Reproduce twice:**

```sh
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx docs/bugs/2026-11-12_reproduce.mjs event-log
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx docs/bugs/2026-11-12_reproduce.mjs event-log
```

```text
The result of getSnapshot should be cached to avoid an infinite loop
MOUNT FAILED: Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits the number of nested updates to prevent infinite loops.
```

**Actual:** hook creates a new fallback array every read even though propEvents is supplied. The probe catches and prints the exception (process exit 0), then mounts a stable client to inspect BUG-004/005. **Frequency:** always, 2/2 delivered-probe runs, also repeated in scratch. **Suggested direction:** provide a stable snapshot for the prop-only mode and add a real DOM mount test without a client.

### BUG-004 — EventLog provides a glyph but no source id or per-value provenance

- **Location:** `apps/web/src/ui/ops/EventLog.tsx:273–274`, `:379–439`.
- **Expected:** every displayed value associates a valid provenance and source id; [01 FR-15](../specs/01_Product_Requirements_Document.md#fr-15--provenance-and-methods), [02 NFR-05](../specs/02_Technical_Requirements_Document.md#f-nonfunctional-requirements-and-validation), CLAUDE §2 and [04 §A.3 item 8](../specs/04_Design_Brief.md#a3-mission-critical-principles-non-negotiable).
- **Reproduction:** run the BUG-003 `event-log` command twice. Its second mount supplies a stable client so the first crash does not prevent inspection.

```text
STABLE ROW: #100:00:00opsPlan revised to Rev 7◇
SOURCE ATTRIBUTES: 0 PROVENANCE: 1
```

**Actual:** count, seq, time and revision spans lack data-provenance; the sole provenance attribute is on a separate glyph. No source-id attribute, source text or source link exists in this component. A glyph does not establish the source of the values. **Frequency:** always, 2/2 delivered-probe runs. **Suggested direction:** carry and render a source association and provenance on each displayed value; test populated rows and counts.

### BUG-005 — EventLog uses status cyan for non-status chrome

- **Location:** `apps/web/src/ui/ops/EventLog.tsx:263`, `:314–315`, `:405`.
- **Expected:** OPS status hues are never decoration; cyan is the route, not a navigation accent. [04 §A.3.1](../specs/04_Design_Brief.md#a3-mission-critical-principles-non-negotiable), [04 §B.2](../specs/04_Design_Brief.md#b2-modes); T27.04/SCR-11.
- **Reproduction:** same `event-log` command twice; inspect the stable mount's inline DOM styles.

```text
DECORATION height: 2px; width: 100%; background: linear-gradient(90deg, var(--route, #4CC9F0) 0%, var(--hairline, #2A313A) 100%);
ACTIVE FILTER ... background-color: var(--route, #4CC9F0); border: 1px solid var(--route, #4CC9F0); ...
```

**Actual:** decorative stripe and selected ALL filter use the cyan route/advisory hue; ops actor text does too. None indicates route geometry or status. **Frequency:** always, 2/2 delivered-probe runs. **Suggested direction:** use neutral instrument chrome and reserve status colours for the specified status cues.

### BUG-006 — Normal gates collect ignored scratch files

- **Location:** `package.json:7` (`lint:md`), `Makefile:30–31` (`pytest -q pipeline`), `pipeline/pyproject.toml:26–28`.
- **Classification:** reproducible tooling-scope defect exposed by pre-existing local scratch content; not a science/runtime regression. A clean tracked snapshot does not reproduce the contamination.
- **Expected:** [CLAUDE §4](../../CLAUDE.md#4-commands) describes Markdown and project pipeline gates; [TASK-03](../tasks/TASK-03_preprocessing-pipeline.md) keeps acquisition/work products ignored. Local downloaded/experimental dependency trees should not become the project test suite. In particular, passing `pipeline` explicitly overrides the configured pytest `testpaths=["tests"]` scope.
- **Reproduce in this checkout:**

```sh
make lint
make docs-check
$(make -s pipeline-python) -m pytest -q pipeline
$(make -s pipeline-python) -m pytest -q pipeline
```

```text
Summary: 78 issues in 28 files
pipeline/work/images/SOURCES.md:15:31 error MD034/no-bare-urls Bare URL used
pipeline/work/rad/u45/report.md:1 error MD041/first-line-heading/first-line-h1
ERROR collecting work/rad/u45/test_rad_recommendation.py
E   ModuleNotFoundError: No module named 'cdflib'
```

**Actual:** lint exits 2 through make; pytest collection exits 2. `make test` with socket access reproduces the same collection failure after all JS tests pass. `git ls-files pipeline/work` is empty. `pytest -q pipeline/tests` passes. **Frequency:** always with this scratch tree: lint observed twice via independent gates, collection observed twice. **Suggested direction:** scope the gates to owned project files/tests and exclude ignored pipeline work without altering user scratch content or adding unrelated dependencies.

## 7. Known gaps and doc drift

### 7.1 Known gaps (wip and unstarted integration)

- **T03.19 wip:** no Gale site-manifest; final bundle, validator, vectors/images, visual alignment and offline-load checks remain open. `make data` was not run against the real inputs because it would write outside the permitted report paths and the task records an unresolved vector step. Pipeline tests use temporary directories.
- **T21.08/T21.12 unstarted:** scenario.json and demo PlanExport missing. T22.13 is wip and expressly waits for the scenario and task seeding. Missing real replay hashes are not nondeterminism findings.
- **T07.14 wip; boot/router subtasks unstarted:** `apps/web/src/main.ts:14` only imports CSS. No map, site validation, roles or HabClient lifecycle mounts. Bad ?site values and corrupt-manifest UI error screens cannot be exercised; backend manifest rejection was tested separately.
- **T05b link/Earth modules unstarted:** `earthLink.ts`, `linkGraph.ts` and viewshed runtime functions remain stubs; their todo cases do not count as completed compute behavior. Static comm-grid and SPICE preprocessing are tested separately.
- **T05/T06 wip:** real-grid performance, complete planner totals/conditions/warnings and independent solar references have outstanding acceptance; no assertion of flight-valid science is made.
- **T23.07 wip:** CONTINUE_SKIP terrain metrics still carry assumed zeros as explicitly recorded. The existing 24 fixture and real-compute tests are useful but do not finish that acceptance.
- **T24/T25 wip:** real session delivery, alert lifecycle, glove UX, HUD exit, map composition and role routing unfinished. Component tests are not a rendered end-to-end app.
- **T27 report wip:** planned/actual timing, dose context, route/source export and print pagination incomplete.
- **TASK-31:** task text/UI tests are wip; task engine not started. Ordinary missing task functionality is a gap; its crash into a done session path is BUG-001.
- **TASK-16/17/30 wip:** submission, media, final script and publishing need humans; no submissions, messages, PRs or public assets were created.

### 7.2 Documentation and schema drift

| ID | Severity | Evidence / conclusion |
| --- | --- | --- |
| DOC-001 | S4 | `README.md:11` still says “no functional code yet” and v2 tasks “not yet atomized”; 117 done rows, implemented code and task checker contradict it. Lead confirmed. |
| DOC-002 | S4 | `CLAUDE.md:48–60` calls validate/hab/replay stubs and data unimplemented. Makefile implements these targets; some underlying data/integration remains unfinished. Lead confirmed, with that distinction. |
| DOC-003 | S4 | TASK-05/06 Verify lines point to `apps/web/tests/compute/*.test.ts`; the active tests are under packages/compute/tests. Exact grid command failed twice with “No test files found”; relocated suite passes. |
| DOC-004 | Observation | Candidate T07.02 done/devtools note is absent at this HEAD; only T07.14 has a status row. Lead refuted for this checkout. Browser empty-shell result does not certify that future task. |
| DOC-005 | S4 / TODO(decision) | Schema comments explicitly permit export fields omitted by the fake scenario: computed_utc, timing_ms, cell_path_length and optional profile (U-11), while schema.ts describes worker output as required. 05 needs the already-recorded spec sync; this is not silently classified as a new numerical defect. |
| DOC-006 | S4 / TODO(verify) | All done-row Markdown evidence links resolve, but T00.01's linked rules note explicitly says the exact URL and quotes were not recorded. Its acceptance asks for verbatim quotes, source/page and date. External historical handover cannot be verified from this repo; do not treat the link as proof of that criterion. This does not revoke recorded Track P. |
| DOC-007 | S4 / TODO(verify) | T03.20 calls for a human measurement; evidence says delegated tool confirmation, not GIS-checked. T03.30 documents its mismatch with GDAL and explanation. Neither human GIS check was repeated; preserve the recorded decisions and resolve acceptance wording with the owner. |
| DOC-008 | Observation | Requested demo-numbers script absent and supplied final numbers not yet written to §E.1. Stored tables and trigger independently reproduce them; do not report a numeric mismatch. |
| DOC-009 | S4 | Prototype contrast script prints PRINT text 17.74 versus its stored 17.7 (DIFF 0.04); HUD contrast passes. Rounding/reference discrepancy, not a failed contrast threshold. |

All six JSON Schemas pass `Draft202012Validator.check_schema`; committed dose and Earth-link tables validate. The pipeline flag bits, row order, slope encoding and required static entity names were compared to schema.ts and 05. DataSource required fields and static layer provenance restrictions align. Conditional/export differences documented in schema comments are retained as drift/open decisions, not changed. An exhaustive runtime validator for every TypeScript contract is not claimed.

Done evidence resolution: **117 rows checked, no broken linked paths**; the repository link checker also validates anchors. Ten rows link only a TASK document (with code paths or commit ids in prose): T20.01, T20.03–06, T20.12–13, T22.03–04, T31.01. Existing code/test evidence was used where available; human review, historical red-test runs, external PR sign-off and source authenticity were not independently established. A resolving link alone is not a PASS for acceptance.

## 8. Not tested and why

- Full real §E.1 sequence, real replay hash, full-grid route/science and Gale bundle size: missing unstarted/wip scenario and site outputs.
- UI site selection, fetch failures, route navigation, keyboard-only app workflow and mobile layouts: no mounted app. Local browser availability was not the blocker.
- Physical LAN latency, router unplug/reconnect, two phones, projector, gloves, 3-second HUD glance, weakest laptop benchmark, print pagination and non-team usability sessions: physical/human acceptance not reproducible in this environment.
- Acquisition downloads, regenerate-in-place fixtures, real pipeline rebuild, graph rebuild, publication and human sign-offs: avoided writes outside allowed paths and/or external effects. Existing generator/test coverage is reported instead; no byte-identical regeneration claim is made by this run.
- Exhaustive numeric authorship/source audit and every image's licence/age: cannot be inferred by code tests. No LLM-origin allegation is made from a numeric literal alone.
- Browser screenshots show the empty shell only; they do not certify visual design of unmounted components. Component DOM probes isolate specific defects, not complete visual acceptance.
- SSR failure observed in an early EventLog probe was excluded: the product is client-rendered. Early tsx JSX configuration errors were also probe setup errors, corrected with the web tsconfig before reporting product findings.

The six pipeline skips are recorded below directly from pytest's skip report:

```text
SKIPPED [1] pipeline/tests/test_manifest.py:407: data/sites/gale_boxwork/site-manifest.json absent until T03.19
SKIPPED [1] pipeline/tests/test_manifest.py:412: data/sites/gale_boxwork/site-manifest.json absent until T03.19
SKIPPED [1] pipeline/tests/test_manifest.py:450: data/sites/gale_boxwork/site-manifest.json absent until T03.19
SKIPPED [1] pipeline/tests/test_rad.py:527: cdflib is not in pipeline/environment.yml until T14.01
SKIPPED [1] pipeline/tests/test_rad.py:545: scenarios/storm-sol4190/scenario.json does not exist yet (assembled by T21.08)
SKIPPED [1] pipeline/tests/test_spice_tables.py:730: scenarios/storm-sol4190/scenario.json does not exist yet (assembled by T21.08)
```

## 9. Suggested fix order

1. Resolve BUG-001 at the real session/task boundary, then rerun an unmocked validated scenario load and resume.
2. Resolve BUG-002 command-effect deduplication before reconnect/retry rehearsals.
3. Complete the already-planned scenario, Gale bundle and application composition; then run the real §E.1 sequence and compare two real hashes.
4. Resolve BUG-003, then BUG-004/005 together in the event log; mount the real populated component and audit its values and status cues.
5. Isolate gates from scratch data (BUG-006), correct Verify/doc drift and finish human/physical acceptance. Keep all current wip rows until their actual criteria are met.

No fixes, schema/spec edits, status changes or README progress regeneration were performed. Final artifact checks and commit scope are recorded in the command ledger.

## 10. Per-done-subtask acceptance disposition

All 117 done acceptance/Verify blocks were inventoried. Shared full-suite runs cover repeated test commands; they are not claimed as 117 independent full system passes. Historical “red before implementation” checks and commands that overwrite owned artifacts were not replayed. For manual tasks, evidence review is only partial acceptance. Exact stale Verify paths are called out as DOC-003.

| Subtask | Acceptance / Verify disposition |
| --- | --- |
| [T00.01](../tasks/TASK-00_resolve-rules-and-register.md) | PARTLY / unsupported evidence: required historical exact URL/quotes absent from linked note (DOC-006). |
| [T00.02](../tasks/TASK-00_resolve-rules-and-register.md) | PARTLY: acceptance and linked evidence reviewed; historical/human/source/GIS verification not repeated. |
| [T00.03](../tasks/TASK-00_resolve-rules-and-register.md) | PARTLY: acceptance and linked evidence reviewed; historical/human/source/GIS verification not repeated. |
| [T00.04](../tasks/TASK-00_resolve-rules-and-register.md) | PARTLY: acceptance and linked evidence reviewed; historical/human/source/GIS verification not repeated. |
| [T00.06](../tasks/TASK-00_resolve-rules-and-register.md) | PARTLY: acceptance and linked evidence reviewed; historical/human/source/GIS verification not repeated. |
| [T01.01](../tasks/TASK-01_feasibility.md) | PARTLY: acceptance and linked evidence reviewed; historical/human/source/GIS verification not repeated. |
| [T01.02](../tasks/TASK-01_feasibility.md) | PARTLY: acceptance and linked evidence reviewed; historical/human/source/GIS verification not repeated. |
| [T01.03](../tasks/TASK-01_feasibility.md) | PARTLY: acceptance and linked evidence reviewed; historical/human/source/GIS verification not repeated. |
| [T01.04](../tasks/TASK-01_feasibility.md) | PARTLY: acceptance and linked evidence reviewed; historical/human/source/GIS verification not repeated. |
| [T01.05](../tasks/TASK-01_feasibility.md) | PARTLY: acceptance and linked evidence reviewed; historical/human/source/GIS verification not repeated. |
| [T03.01](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.02](../tasks/TASK-03_preprocessing-pipeline.md) | PARTLY: mock validator passes; generator reruns skipped to preserve files outside docs/bugs. |
| [T03.03](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.04](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.05](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.06](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.07](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.08](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.09](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.10](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.11](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.12](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.13](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.14](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.15](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.16](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.17](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.18](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.20](../tasks/TASK-03_preprocessing-pipeline.md) | PARTLY: verification record reviewed; independent GIS measurement not repeated (DOC-007). |
| [T03.28](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.29](../tasks/TASK-03_preprocessing-pipeline.md) | PASS automated portion: pipeline/tests, mock validation and schema/record checks; real-bundle and manual portions not run. |
| [T03.30](../tasks/TASK-03_preprocessing-pipeline.md) | PARTLY: verification record reviewed; independent GIS measurement not repeated (DOC-007). |
| [T04.01](../tasks/TASK-04_vectors-pois-images.md) | PARTLY: acceptance and linked evidence reviewed; historical/human/source/GIS verification not repeated. |
| [T04.07](../tasks/TASK-04_vectors-pois-images.md) | PARTLY: acceptance and linked evidence reviewed; historical/human/source/GIS verification not repeated. |
| [T05.01](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.02](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.03](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.04](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.05](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.06](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.07](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.08](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.09](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.10](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.11](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.12](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.14](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.16](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.17](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.19](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.20](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.21](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.22](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.23](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.25](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05.26](../tasks/TASK-05_compute-core.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05b.02](../tasks/TASK-05b_compute-v2.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05b.03](../tasks/TASK-05b_compute-v2.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05b.04](../tasks/TASK-05b_compute-v2.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05b.06](../tasks/TASK-05b_compute-v2.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05b.07](../tasks/TASK-05b_compute-v2.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05b.14](../tasks/TASK-05b_compute-v2.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05b.15](../tasks/TASK-05b_compute-v2.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05b.16](../tasks/TASK-05b_compute-v2.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05b.17](../tasks/TASK-05b_compute-v2.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05b.18](../tasks/TASK-05b_compute-v2.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T05b.19](../tasks/TASK-05b_compute-v2.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T06.01](../tasks/TASK-06_mars24-and-radiation.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T06.04](../tasks/TASK-06_mars24-and-radiation.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T06.08](../tasks/TASK-06_mars24-and-radiation.md) | PASS active automated cases in compute suite; stale apps/web Verify paths for TASK-05/06 (DOC-003). No real-grid/browser claim. |
| [T12.05](../tasks/TASK-12_sources-methods-provenance.md) | PARTLY: JSON/source fields inspected and parsed; external publication identity/licence verification not repeated. |
| [T13.01](../tasks/TASK-13_visual-system-accessibility.md) | PARTLY: build/types, local assets/tokens and contrast checked as applicable; mounted-app keyboard, focus and physical acceptance not run. |
| [T13.02](../tasks/TASK-13_visual-system-accessibility.md) | PARTLY: build/types, local assets/tokens and contrast checked as applicable; mounted-app keyboard, focus and physical acceptance not run. |
| [T13.04](../tasks/TASK-13_visual-system-accessibility.md) | PARTLY: build/types, local assets/tokens and contrast checked as applicable; mounted-app keyboard, focus and physical acceptance not run. |
| [T13.06](../tasks/TASK-13_visual-system-accessibility.md) | PARTLY: build/types, local assets/tokens and contrast checked as applicable; mounted-app keyboard, focus and physical acceptance not run. |
| [T13.11](../tasks/TASK-13_visual-system-accessibility.md) | PARTLY: build/types, local assets/tokens and contrast checked as applicable; mounted-app keyboard, focus and physical acceptance not run. |
| [T13.12](../tasks/TASK-13_visual-system-accessibility.md) | PASS prototype contrast script HUD pairs; actual token values inspected; no visor/human verification. |
| [T14.02](../tasks/TASK-14_integration-offline-hardening.md) | PASS local task-checker/template inspection; hosted CI not rerun; normal lint affected by BUG-006. |
| [T15.01](../tasks/TASK-15_usability-test.md) | PARTLY: acceptance and linked evidence reviewed; historical/human/source/GIS verification not repeated. |
| [T15.04](../tasks/TASK-15_usability-test.md) | PARTLY: acceptance and linked evidence reviewed; historical/human/source/GIS verification not repeated. |
| [T20.01](../tasks/TASK-20_hab-core-skeleton.md) | PASS automated protocol/client/server cases; loopback transport probed. Manual sign-off and physical LAN latency not repeated. |
| [T20.02](../tasks/TASK-20_hab-core-skeleton.md) | PASS automated protocol/client/server cases; loopback transport probed. Manual sign-off and physical LAN latency not repeated. |
| [T20.03](../tasks/TASK-20_hab-core-skeleton.md) | PASS automated protocol/client/server cases; loopback transport probed. Manual sign-off and physical LAN latency not repeated. |
| [T20.04](../tasks/TASK-20_hab-core-skeleton.md) | PASS automated protocol/client/server cases; loopback transport probed. Manual sign-off and physical LAN latency not repeated. |
| [T20.05](../tasks/TASK-20_hab-core-skeleton.md) | PASS automated protocol/client/server cases; loopback transport probed. Manual sign-off and physical LAN latency not repeated. |
| [T20.06](../tasks/TASK-20_hab-core-skeleton.md) | PASS automated protocol/client/server cases; loopback transport probed. Manual sign-off and physical LAN latency not repeated. |
| [T20.10](../tasks/TASK-20_hab-core-skeleton.md) | PASS automated protocol/client/server cases; loopback transport probed. Manual sign-off and physical LAN latency not repeated. |
| [T20.11](../tasks/TASK-20_hab-core-skeleton.md) | PASS automated protocol/client/server cases; loopback transport probed. Manual sign-off and physical LAN latency not repeated. |
| [T20.12](../tasks/TASK-20_hab-core-skeleton.md) | PASS automated protocol/client/server cases; loopback transport probed. Manual sign-off and physical LAN latency not repeated. |
| [T20.13](../tasks/TASK-20_hab-core-skeleton.md) | PASS automated protocol/client/server cases; loopback transport probed. Manual sign-off and physical LAN latency not repeated. |
| [T21.01](../tasks/TASK-21_scenario-builder.md) | PASS local schema/data/pipeline tests; kernel test forced on. Download provenance and human approval not repeated. |
| [T21.02](../tasks/TASK-21_scenario-builder.md) | PASS local schema/data/pipeline tests; kernel test forced on. Download provenance and human approval not repeated. |
| [T21.03](../tasks/TASK-21_scenario-builder.md) | PASS local schema/data/pipeline tests; kernel test forced on. Download provenance and human approval not repeated. |
| [T21.04](../tasks/TASK-21_scenario-builder.md) | PASS local schema/data/pipeline tests; kernel test forced on. Download provenance and human approval not repeated. |
| [T21.05](../tasks/TASK-21_scenario-builder.md) | PASS local schema/data/pipeline tests; kernel test forced on. Download provenance and human approval not repeated. |
| [T21.07](../tasks/TASK-21_scenario-builder.md) | PASS local schema/data/pipeline tests; kernel test forced on. Download provenance and human approval not repeated. |
| [T22.01](../tasks/TASK-22_simulation-engine.md) | PASS active clock/reducer/log/tick/scenario tests; mocks and fixture limits retained. |
| [T22.02](../tasks/TASK-22_simulation-engine.md) | PASS active clock/reducer/log/tick/scenario tests; mocks and fixture limits retained. |
| [T22.03](../tasks/TASK-22_simulation-engine.md) | PASS active clock/reducer/log/tick/scenario tests; mocks and fixture limits retained. |
| [T22.04](../tasks/TASK-22_simulation-engine.md) | PASS active clock/reducer/log/tick/scenario tests; mocks and fixture limits retained. |
| [T22.05](../tasks/TASK-22_simulation-engine.md) | PASS active clock/reducer/log/tick/scenario tests; mocks and fixture limits retained. |
| [T22.06](../tasks/TASK-22_simulation-engine.md) | PASS active clock/reducer/log/tick/scenario tests; mocks and fixture limits retained. |
| [T22.07](../tasks/TASK-22_simulation-engine.md) | PASS active clock/reducer/log/tick/scenario tests; mocks and fixture limits retained. |
| [T22.08](../tasks/TASK-22_simulation-engine.md) | PASS active clock/reducer/log/tick/scenario tests; mocks and fixture limits retained. |
| [T22.09](../tasks/TASK-22_simulation-engine.md) | PASS active clock/reducer/log/tick/scenario tests; mocks and fixture limits retained. |
| [T22.10](../tasks/TASK-22_simulation-engine.md) | PASS active clock/reducer/log/tick/scenario tests; mocks and fixture limits retained. |
| [T22.11](../tasks/TASK-22_simulation-engine.md) | PASS active clock/reducer/log/tick/scenario tests; mocks and fixture limits retained. |
| [T22.12](../tasks/TASK-22_simulation-engine.md) | FAIL unmocked load (BUG-001) and duplicate session effect (BUG-002); existing mocked/sessionTick suites pass. |
| [T22.17](../tasks/TASK-22_simulation-engine.md) | PASS fixture schema/hash tests; in-place regeneration twice not rerun under write restriction. |
| [T23.01](../tasks/TASK-23_safety-ops.md) | PASS active command/summon/contingency tests; real demo not available. |
| [T23.02](../tasks/TASK-23_safety-ops.md) | FAIL LOAD_SCENARIO duplicate side effects at session boundary (BUG-002); unit command cases pass. |
| [T23.04](../tasks/TASK-23_safety-ops.md) | PASS active command/summon/contingency tests; real demo not available. |
| [T23.05](../tasks/TASK-23_safety-ops.md) | PASS active command/summon/contingency tests; real demo not available. |
| [T23.06](../tasks/TASK-23_safety-ops.md) | PASS active command/summon/contingency tests; real demo not available. |
| [T24.01](../tasks/TASK-24_eva-client-and-hud.md) | PASS contract typecheck; no application integration claimed. |
| [T27.04](../tasks/TASK-27_report-and-replay.md) | FAIL: direct component mount crashes; provenance/status violations (BUG-003–005). |
| [T31.01](../tasks/TASK-31_stop-task-list.md) | PASS type/build contract checks; task implementation remains absent, BUG-001 at integration boundary. |
