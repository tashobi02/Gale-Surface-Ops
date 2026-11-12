# Smoke test — 12 November 2026

| | |
| --- | --- |
| **Owner** | Codex, AI-assisted test execution; team review pending |
| **Date** | 2026-11-12 |
| **Status** | Complete — shallow probes only; no fixes |
| **Related** | [Task status](../tasks/status.md) · [Task register](../tasks/_coordination.md) · [Demo requirements](../specs/01_Product_Requirements_Document.md) · [AI use](../AI_USE.md) |

## 1. Summary

**NO-GO for the default §E.1 killer demo.** Component tests and the sourced headline numbers pass, but the Gale manifest and scenario entry file are absent. The default landing screen is still a placeholder.

Across 33 TASKs (including 05b and 18; there is no TASK-19): **19 PASS, 5 FAIL, 0 BLOCKED, 4 NO AUTOMATED CHECK, 5 NOT STARTED**. One additional test probe is **PASS (hollow)**; it is not a separate task verdict. FAIL describes the smoke outcome, not necessarily a defect in completed work.

- TASK-03 and TASK-20: missing Gale bundle; SMK-001.
- TASK-22: default replay cannot read the scenario; SMK-002.
- TASK-14: workspace lint includes ignored scratch files; SMK-003.
- TASK-07: browser reaches the unfinished landing screen; SMK-004.

No application code was changed. `docs/bugs/2026-11-12_system-test.md` did not exist at the tested commit or in this working tree, so there is no system-test report to link or duplicate. This report does not infer that past findings are fixed.

## 2. Environment

Tested commit: `ad75b3268af29b864cbfc89d418a9d1ca855f745`; initial working tree clean. Node `v26.13.0`; PATH Python `3.13.15`; conda `26.7.1`, executable `/home/obidit/miniconda3/bin/conda`. The `marswalk-pipeline` environment exists: Python `3.12.16`, GDAL `3.13.3`, rasterio `1.5.2`, pyproj `3.8.0`, PROJ `9.9.0`. `make check-env` passed, including Mars radius 3,396,190 m.

No system packages installed. Installed Playwright/Chromium used in an isolated browser; Superset CLI unavailable (`command -v superset`, exit 1). Socket-dependent tests and browser runs used permitted local socket access. No pipeline or browser tool blocker remained. Build output and scratch probes/logs are under `/tmp/marswalk-smoke-2026-11-12/`; the build's `--outDir` argument keeps generated output outside the repo.

Status inventory: **134 done / 84 wip**. README counted progress is **117 done / 80 wip, 345 counted subtasks, 34%**. `python3 scripts/update_progress.py --check` exited 0: the difference is intentional exclusion of fallback/desirable rows, not stale progress. The table below includes all status rows, including TASK-05b and started T18.08. No status rows exist for TASK-10, 11, 26, 28 or 32.

## 3. Baseline results

Counts are passed / skipped / todo **tests**, not files. Repeated/overlapping probes are not added to baseline totals.

| Command | Exit | Result |
| --- | --- | --- |
| `node -v` | 0 | v26.13.0 |
| `command -v conda` | 0 | conda found |
| `npm ci` | 0 | 281 packages; esbuild postinstall blocked by npm allowScripts policy, but subsequent build succeeds |
| `make typecheck` | 0 | All workspaces typecheck |
| `make test-web` | 0 | Compute 606 / 4 / 13; Hab Core 559 / 1 / 20; web 998 / 0 / 7; total 2163 / 5 / 40 |
| `npm --workspace @marswalk/web run build -- --outDir /tmp/marswalk-smoke-2026-11-12/web-dist` | 0 | Vite production build, 71 modules; external outDir notice only |
| `make check-env` | 0 | Pipeline environment passes |
| `python3 --version` | 0 | Python 3.13.15 |
| `conda --version` | 0 | conda 26.7.1 |

## 4. Per-task table

Commands run from the repository root unless stated otherwise. Every listed command exited 0 except the explicitly identified failures. Shared baseline typecheck/build cover the task Verify lines that require them. Older `tests/compute/...` Verify paths are represented by their current `Owns` files in the compute workspace; no empty test invocation is treated as a pass. Human-review steps are not replaced by a green command.

Scratch helper bodies are preserved in section 7. These check recorded artifacts, not the correctness of human decisions. Task passes are scoped to the named probe; they do not mark any subtask done. A row is FAIL when a requested supplemental integration probe fails even if its unit probe passes.

| Task | Rows done / wip | Exact probe command(s) | Passed / skipped / todo | Verdict | Note |
| --- | --- | --- | --- | --- | --- |
| [TASK-00](../tasks/TASK-00_resolve-rules-and-register.md) | 5 / 0 | `python3 /tmp/marswalk-smoke-2026-11-12/probes.py 00`<br>`python3 scripts/check_links.py docs/ops/rules.md` | — | PASS | T00.03: answer, sources, registration and Track P present; 7 links resolve. Human authenticity not re-reviewed. |
| [TASK-01](../tasks/TASK-01_feasibility.md) | 5 / 1 | `python3 /tmp/marswalk-smoke-2026-11-12/probes.py 01`<br>`python3 scripts/check_links.py docs/ops/feasibility` | — | PASS | T01.02: AOI note, site config and mock manifest agree on [-3000, -3000, 3000, 3000]; 45 links resolve. Real manifest absent (SMK-001). |
| [TASK-02](../tasks/TASK-02_projection-spike.md) | 2 / 1 | `npm --workspace @marswalk/web test -- projection` | 16 / 0 / 0 | PASS | T02.02: includes byte-identical manifest/pipeline/UI projection and Mars-only CRS checks; spike interaction not exercised. |
| [TASK-03](../tasks/TASK-03_preprocessing-pipeline.md) | 28 / 1 | `make validate SITE=mock_site`<br>`make validate SITE=gale_boxwork`<br>`$(make -s pipeline-python) -m pytest -q pipeline/tests -x` | 275 / 6 / 0 | FAIL | Mock validates; Gale validation exit 2 twice (SMK-001, wip T03.19). Tests cover implemented pipeline, including vectors and scenario extraction. |
| [TASK-04](../tasks/TASK-04_vectors-pois-images.md) | 4 / 5 | `$(make -s pipeline-python) -m pytest -q pipeline/tests/test_vectors.py` | 26 / 0 / 0 | PASS | T04.02/T04.03: vector/POI packaging tests run. Final Gale POIs/images remain wip, not visually approved. |
| [TASK-05](../tasks/TASK-05_compute-core.md) | 22 / 8 | `npm --workspace @marswalk/compute test` | 606 / 4 / 13 | PASS | T05 compute modules: includes real route/worker tests. Real-grid optional tests skipped; this is not proof of a complete Gale plan. |
| [TASK-05b](../tasks/TASK-05b_compute-v2.md) | 17 / 2 | `npm --workspace @marswalk/compute test -- haven rendezvous viewshed linkGraph earthLink eventDose consumables contingency` | 221 / 0 / 4 | PASS | Eight v2 modules run; four todos remain visible. |
| [TASK-06](../tasks/TASK-06_mars24-and-radiation.md) | 3 / 7 | `npm --workspace @marswalk/compute test -- mars24 sun radiation` | 50 / 0 / 0 | PASS | Solar/radiation smoke passes. Demo script also prints sunrise 00:22:19Z and sunset 13:01:00Z at the hab. |
| [TASK-07](../tasks/TASK-07_app-shell-and-map-workspace.md) | 2 / 10 | `npm --workspace @marswalk/web test -- loadSite app bootPlanner`<br>`node --import tsx /tmp/marswalk-smoke-2026-11-12/browser.mts` | 78 / 0 / 0 | FAIL | Loader/boot tests pass and production build succeeds. Browser landing is a placeholder, with console error twice (SMK-004); T07.05 has no status row. |
| [TASK-08](../tasks/TASK-08_plan-panel-and-waypoints.md) | 1 / 0 | `npm --workspace @marswalk/web test -- planStoreContract` | 4 / 0 / 0 | PASS | Only T08.01 is done: contract exists/typechecks. Does not claim SCR-04 or the plan-store implementation works. |
| [TASK-09](../tasks/TASK-09_results-panel-and-profile.md) | 0 / 3 | `npm --workspace @marswalk/web test -- scr05RouteResults routeLayer warningsList` | 54 / 0 / 0 | PASS | Wip-only; results panel mounts against fixtures, route layer and warning interactions run. |
| [TASK-10](../tasks/TASK-10_poi-detail-and-conditions.md) | 0 / 0 | — | — | NOT STARTED | No status rows; not tested. |
| [TASK-11](../tasks/TASK-11_briefing-card-and-export.md) | 0 / 0 | — | — | NOT STARTED | No status rows; not tested. |
| [TASK-12](../tasks/TASK-12_sources-methods-provenance.md) | 1 / 1 | `python3 -m json.tool pipeline/sites/gale_boxwork/sources/tobler-1993.json`<br>`python3 -m json.tool pipeline/sites/gale_boxwork/sources/apollo17-planning.json`<br>`python3 -m json.tool pipeline/sites/gale_boxwork/sources/mars24-allison-mcewen-2000.json`<br>`npm --workspace @marswalk/web test -- provenance` | 0 / 0 / 3 | PASS | Done T12.05 source records parse. Extra provenance probe is PASS (hollow): all three tests todo. SCR-09 rendering and per-value provenance NOT EXERCISED; no T12.03 completion claim. |
| [TASK-13](../tasks/TASK-13_visual-system-accessibility.md) | 4 / 4 | `python3 /tmp/marswalk-smoke-2026-11-12/probes.py 13`<br>`npm --workspace @marswalk/web test -- baseStyles statusIcon` | 34 / 0 / 0 | PASS | Tokens exist for ops/hud/print and are imported by main; base styles and four-cue status tests run. |
| [TASK-14](../tasks/TASK-14_integration-offline-hardening.md) | 1 / 1 | `python3 scripts/check_tasks.py`<br>`python3 /tmp/marswalk-smoke-2026-11-12/probes.py 14`<br>`make lint docs-check` | — | FAIL | Task checker: 33 files, 388 subtasks, 0 problems. Built HTML/CSS external-resource scan empty. Workspace lint fails in ignored scratch files (SMK-003). |
| [TASK-15](../tasks/TASK-15_usability-test.md) | 1 / 1 | `python3 /tmp/marswalk-smoke-2026-11-12/probes.py human`<br>`python3 scripts/check_links.py docs/ops/usability-script.md docs/ops/demo-script.md docs/ops/submission-checklist.md docs/AI_USE.md docs/ops/data-downloads.md` | — | NO AUTOMATED CHECK | Evidence targets exist; link check passes. No usability session or human sign-off performed. |
| [TASK-16](../tasks/TASK-16_submission-package.md) | 0 / 2 | `python3 /tmp/marswalk-smoke-2026-11-12/probes.py human` | — | NO AUTOMATED CHECK | Evidence targets exist; full docs link check passes. No submission, publication or credit approval performed. |
| [TASK-17](../tasks/TASK-17_videos.md) | 0 / 1 | `python3 /tmp/marswalk-smoke-2026-11-12/probes.py human` | — | NO AUTOMATED CHECK | Demo-script evidence exists and links resolve; no timed reading or video review. |
| [TASK-18](../tasks/TASK-18_desirables.md) | 0 / 1 | `python3 /tmp/marswalk-smoke-2026-11-12/probes.py 18` | — | PASS | Only started desirable T18.08: seven cached REMS TAB files and CRISM IMG open and match recorded SHA-256. No other desirable tested. |
| [TASK-20](../tasks/TASK-20_hab-core-skeleton.md) | 10 / 1 | `npm --workspace @marswalk/hab-core test -- server`<br>`make hab` | 30 / 0 / 0 | FAIL | Skeleton tests pass; fixture HTTP/WS smoke passes. Default make hab exits 2 twice: Gale manifest absent (SMK-001). |
| [TASK-21](../tasks/TASK-21_scenario-builder.md) | 6 / 3 | `python3 /tmp/marswalk-smoke-2026-11-12/probes.py 21`<br>`$(make -s pipeline-python) -m pytest -q pipeline/tests/test_spice_tables.py pipeline/tests/test_donki.py pipeline/tests/test_rad.py`<br>`npm --workspace @marswalk/hab-core test -- demoNumbers`<br>`npm --workspace @marswalk/hab-core run demo-numbers` | 152 / 4 / 0 | PASS | Nine existing scenario JSON files parse; 97 pipeline + 55 demo-number tests pass. Real scenario/plan absent; CLI reports eva=null (SMK-002). |
| [TASK-22](../tasks/TASK-22_simulation-engine.md) | 13 / 1 | `npm --workspace @marswalk/hab-core test -- clock engine tick replay`<br>`make replay` | 111 / 0 / 3 | FAIL | Engine tests pass; default replay exits 2 twice before producing a hash (SMK-002, wip T22.13). |
| [TASK-23](../tasks/TASK-23_safety-ops.md) | 5 / 1 | `npm --workspace @marswalk/hab-core test -- commands summon contingencyOps` | 157 / 0 / 7 | PASS | Includes summonReal and contingencyOpsReal; todos retained. No claim of a full storm mission. |
| [TASK-24](../tasks/TASK-24_eva-client-and-hud.md) | 1 / 9 | `npm --workspace @marswalk/web test -- eva fullScreenMap` | 199 / 0 / 3 | PASS | Fixture DOM/view-model tests exercise EVA, HUD, options, link-lost and full-screen map. Production build passes; no physical-device check. |
| [TASK-25](../tasks/TASK-25_ops-console.md) | 0 / 8 | `npm --workspace @marswalk/web test -- ops` | 102 / 0 / 1 | PASS | Wip-only; ops/join DOM and session interactions run on fixtures. |
| [TASK-26](../tasks/TASK-26_links.md) | 0 / 0 | — | — | NOT STARTED | No status rows; not tested. |
| [TASK-27](../tasks/TASK-27_report-and-replay.md) | 0 / 4 | `npm --workspace @marswalk/hab-core test -- report`<br>`npm --workspace @marswalk/web test -- postEvaReport eventLog` | 89 / 0 / 2 | PASS | Wip-only; 33 report-builder + 56 UI tests pass. Default scenario replay remains unavailable under TASK-22. |
| [TASK-28](../tasks/TASK-28_network-kit.md) | 0 / 0 | — | — | NOT STARTED | No status rows; not tested. |
| [TASK-29](../tasks/TASK-29_rover-tasking.md) | 0 / 2 | `npm --workspace @marswalk/web test -- rover` | 35 / 0 / 0 | PASS | Started T29.04/.05 are UI only: rover tasking/queue DOM tests. Unstarted engine rover work not tested separately. |
| [TASK-30](../tasks/TASK-30_score-sheet-points.md) | 0 / 2 | `python3 /tmp/marswalk-smoke-2026-11-12/probes.py human` | — | NO AUTOMATED CHECK | AI-use evidence exists; local links resolve. No external project-page/public-repo verification. |
| [TASK-31](../tasks/TASK-31_stop-task-list.md) | 3 / 4 | `npm --workspace @marswalk/hab-core test -- stopTasks stopTasksPlanRevision stopTaskText`<br>`npm --workspace @marswalk/web test -- stopTasks` | 138 / 0 / 3 | PASS | 101 engine/text + 37 UI tests pass. Wip features are not promoted to done. |
| [TASK-32](../tasks/TASK-32_live-session.md) | 0 / 0 | — | — | NOT STARTED | No status rows; not tested. |

## 5. Cross-task killer-demo smoke

| Step | Verdict | Evidence |
| --- | --- | --- |
| `make replay`, twice | FAIL | Both exit 2; `scenario check "read" failed`; no event-log hash produced. Deterministic-hash comparison BLOCKED, not passed. |
| `make hab`, twice | FAIL | Both exit 2 before listening; `scenario check "site" failed`; no server process left running. |
| Default mission WebSocket connection | BLOCKED | Default server never starts. Not represented by the fixture test below. |
| Fixture-backed Hab Core HTTP and WebSocket | PASS | Scratch browser harness starts the actual server with a read-only committed SNAPSHOT fixture; `/`, `/api/health`, `/api/session`, `/api/log?after=0`, `/api/report`, `/sites/mock_site/site-manifest.json` each return 200. Client sends HELLO; server responds SNAPSHOT. This is the direction specified by 02 §E.6; server does not send HELLO. |
| Browser `/?site=mock_site` | FAIL | HTTP 200, nonempty SCR-01 placeholder; one captured console/page error, six HTTP requests, all 127.0.0.1, zero non-local requests. Same outcome twice. No manifest request from the landing route; loader tests are separate. SMK-004. |
| Cleanup | PASS | Harness `finally` closes browser and fixture server after each attempt; logs `Browser and fixture Hab Core stopped`. |
| `npm --workspace @marswalk/hab-core run demo-numbers` | PASS | Exit 0; light time 15.84 min, next pass 179.5 min, alert `2024-05-20T05:50:32Z`, dose row 41; matches 01 §E.1 Sources. Sunrise `00:22:19Z`, sunset `13:01:00Z` also match. |

Demo-number output retains source paths/rows: light-time exact value `15.836510733333334` min from Earth-link row 3230; relay wait `179.46666666666667` min from passes[16]. It explicitly says `eva_start_utc: not derived; scenarios/storm-sol4190/plan.json is absent (T21.12)`. No EVA start or route number was invented. `demoNumbers` has 55 passed / 1 skipped / 0 todo; the missing-plan part is not a pass.

## 6. Failures

These are smoke failures, not new claims of deep product bugs. Each was reproduced twice with the same essential output. No edge-case investigation followed.

### SMK-001 — Gale bundle unavailable to validation and default startup

- **Task/subtask:** TASK-03 T03.19 (wip); TASK-20 T20.04 server, TASK-22 T22.13 startup (wip).
- **Commands:** `make validate SITE=gale_boxwork`; `make hab`. Each run twice, each exit 2.
- **Expected:** the requested real-site smoke validates a bundle and starts Hab Core; TASK-03 T03.19 Verify and 02 §F deployment describe those entry points.
- **Actual:** validation: `site-manifest.json: [Errno 2] No such file or directory: 'data/sites/gale_boxwork/site-manifest.json'`; startup: `scenario check "site" failed: no site bundle at .../data/sites/gale_boxwork (site-manifest.json); run the pipeline or fetch the release asset`.
- **Location:** `Makefile:89` (validate), `Makefile:51` (hab); absent `data/sites/gale_boxwork/site-manifest.json` has no line number.
- **Classification:** expected wip data-delivery gap, not a missing-conda/network problem or a demonstrated server regression. Complete/provide T03.19's bundle before the real-site smoke can pass.

### SMK-002 — Default replay has no scenario entry file

- **Task/subtask:** TASK-21 T21.08 scenario assembly (no status row), T21.12 plan input (no status row); TASK-22 T22.13 (wip); NFR-06/NFR-14.
- **Command:** `make replay`, run twice; exit 2 both times.
- **Expected:** TASK-22 T22.13 Verify prints the same event-log hash twice for `scenarios/storm-sol4190`.
- **Actual:** `scenario check "read" failed: cannot read .../scenarios/storm-sol4190/scenario.json (scenario files come from TASK-21)`; `make: *** [Makefile:55: replay] Error 1`. No hash to compare.
- **Location:** `Makefile:55`; missing `scenarios/storm-sol4190/scenario.json` has no line number.
- **Classification:** uncompleted integration/data gap, not observed nondeterminism. Nine existing JSON files parse and demo-number derivation passes; neither replaces the missing scenario. Provide the scenario/plan before rerunning.

### SMK-003 — Workspace lint includes ignored preprocessing scratch files

- **Task/subtask:** TASK-14 T14.01 (wip), T14.02 Verify; shared documentation gate.
- **Command:** `make lint docs-check`, run twice before report creation; exit 2 both times.
- **Expected:** task Verify and the requested pre-commit gate check repository documentation successfully.
- **Actual:** `Linting: 135 files`; `Summary: 78 issues in 28 files`; for example `pipeline/work/images/SOURCES.md:15:31 error MD034/no-bare-urls` and `pipeline/work/rems/SOURCES.md:3:9 error MD034/no-bare-urls`. Lint stops Make before docs-check runs.
- **Location:** `package.json:7` (lint glob/exclusions), `Makefile:23`; affected files are pre-existing local `pipeline/work/` scratch and nested dependency licences.
- **Classification:** local-worktree/tooling scope problem, not a report formatting failure. Needs system-test follow-up if adjusting lint scope; no fix made. The tracked-file copy check below separates report quality from this workspace condition.

### SMK-004 — Mock-site landing renders the unfinished briefing fallback

- **Task/subtask:** TASK-07 T07.05 (no status row), T07.03 app routing (wip); SCR-01.
- **Command:** `node --import tsx /tmp/marswalk-smoke-2026-11-12/browser.mts`, with the final harness in section 7, run twice; exit 1 each time from its no-console-errors assertion.
- **Expected:** the requested browser smoke loads the local entry page with usable briefing content and no console errors (03 SCR-01; TASK-07 T07.05). T07.05 is not claimed complete.
- **Actual:** HTTP 200; body `Mission briefing — not built yet` and `Tracked in T07.05. No values are shown here.` Console: `Error: TODO(TASK-07): not implemented`. No external request occurred.
- **Location:** `apps/web/src/ui/screens/scr01MissionBriefing.tsx:12`; route boundary at `apps/web/src/ui/App.tsx:35` catches the stub error and renders the fallback.
- **Classification:** expected unstarted-screen gap surfaced by the requested entry-page smoke, not an unhandled browser crash or a failure of done site-loading behavior. Implement the owning screen before treating the landing route as functional.

## 7. Blocked and not tested

- Real storm replay/hash comparison and mission WebSocket are BLOCKED by SMK-001/002. No full storm → options → summon → rendezvous mission was claimed. Fixture-backed transport proves only skeleton wiring.
- TASK-10, 11, 26, 28 and 32: NOT STARTED; no dedicated probes. TASK-19 does not exist. Other unstarted fallback/desirable subtasks were excluded. Broad baseline tests may incidentally include stubs, without expanding task acceptance claims.
- Human-led usability, submission, videos and score-sheet tasks: evidence files/relative links checked, no interviews, external page authentication, publication or manual approval. No claims about physical devices, projector, Wi-Fi loss, print pagination or visual correctness.
- T12 provenance probe is **PASS (hollow)**, 0 passed / 0 skipped tests / 3 todo (Vitest reports its test file skipped). No numeric-label or SCR-09 render assurance follows. The row's PASS applies only to the done DataSource deliverable's JSON parse.
- Optional real-data skips in the baseline and pipeline suite remain skips; this report does not infer their behavior. Production HTML/CSS scanning plus one browser route is not an exhaustive JavaScript/runtime internet audit.
- Scratch harness setup failures were corrected before the two real browser reproductions: `.ts` outside an ESM package rejected top-level await (exit 1); initial `.mts` HELLO used invalid role `observer`, so timed out (exit 1). Final harness uses the protocol's `ops` role. These are test-author errors, not product findings.
- The first AOI helper read the wrong JSON nesting and printed `None`; it was not used as evidence. The corrected helper reads `aoi.extent_m` and asserts equality; its successful result is in the task table.

### Documentation validation

`python3 scripts/check_links.py docs README.md CLAUDE.md AGENTS.md` passed before report creation: 3,742 relative links, zero broken. `python3 scripts/update_progress.py --check` and `python3 scripts/check_tasks.py` both exited 0. Workspace `make lint docs-check` remains red for SMK-003; its docs-check prerequisite cannot be described as passed.

Final validation: `npx --no-install markdownlint-cli2 docs/bugs/2026-11-12_smoke-test.md docs/AI_USE.md` exited 0 (two files, zero issues). `python3 /tmp/marswalk-smoke-2026-11-12/clean-check.py` ran `make lint docs-check` in a clean tracked-file copy and exited 0: 105 Markdown files, zero lint issues; 3,780 relative links, zero broken; progress check passed. The copy was made with `git archive HEAD`, overlaid with this report and the AI-use addition, and given a dependency symlink. Ignored `pipeline/work/` files were omitted. The original workspace gate was rerun after report creation and still exited 2 with the same 78 scratch-file issues (136 files scanned). No source or scratch file was removed to make that gate green.

### Scratch helper reproduction

Save the following as `/tmp/marswalk-smoke-2026-11-12/probes.py` and run the exact task-table commands from the repository root. Helpers only read files. The `human` mode uses the smoke inventory; its output was checked against the evidence links in status.md (15: usability script/task; 16: docs index, feasibility, hosting, team, TI threshold and task notes; 17: demo script; 18: data-downloads; 30: AI use).

```python
import pathlib,json,re,sys
r=pathlib.Path.cwd(); mode=sys.argv[1]
if mode=='00':
 s=(r/'docs/ops/rules.md').read_text();assert all(x in s for x in ['## Answer','## Sources','## Registration','Track P']);print('Rules answer, sources, registration and Track P present')
elif mode=='01':
 for n in ['aoi','coverage','hab-site']:assert (r/f'docs/ops/feasibility/{n}.md').is_file()
 for f in ['pipeline/sites/gale_boxwork/site.json','data/sites/mock_site/site-manifest.json']:
  s=json.loads((r/f).read_text());print(f, s['aoi']['extent_m'])
 assert s['aoi']['extent_m']==[-3000,-3000,3000,3000]
 assert '3000' in (r/'docs/ops/feasibility/aoi.md').read_text()
elif mode=='13':
 s=(r/'apps/web/src/ui/styles/tokens.css').read_text();assert all(x in s for x in ['data-mode="ops"','data-mode="hud"','data-mode="print"']);assert 'tokens.css' in (r/'apps/web/src/main.ts').read_text();print('ops/hud/print tokens exist and main imports them')
elif mode=='14':
 hits=[]
 for p in pathlib.Path('/tmp/marswalk-smoke-2026-11-12/web-dist').rglob('*'):
  if p.suffix in ['.html','.css']:
   hits += [(str(p),m[0]) for m in re.finditer(r'(?:src=|href=|url\()[\s\"\x27]*https?://[^\s\"\x27)<>]+',p.read_text())]
 print('External HTML/CSS resource URLs:',hits);assert not hits
elif mode=='21':
 files=list((r/'scenarios/storm-sol4190').rglob('*.json'))
 for p in files:json.loads(p.read_text())
 print(f'{len(files)} scenario JSON files parse')
elif mode=='human':
 inv={'rows': []}
 for line in (r/'docs/tasks/status.md').read_text().splitlines():
  m=re.match(r'\| T(\d+[a-z]?)\.\d+ \| (?:done|wip) \| [^|]+ \| (.*) \|$',line)
  if m: inv['rows'].append({'task':m[1],'evidence':m[2]})
 for task in ['15','16','17','18','30']:
  targets=set()
  for row in inv['rows']:
   if row['task']==task:
    targets.update(re.findall(r'\]\(([^)#]+)(?:#[^)]*)?\)',row['evidence']))
  for t in targets:
   if '://' not in t:assert (r/'docs/tasks'/t).exists(),(task,t)
  print(task,'evidence file targets exist:',sorted(targets))

elif mode=='18':
 import hashlib
 base=r/'pipeline/work/rems'; checked=0
 for line in (base/'SOURCES.md').read_text().splitlines():
  cols=[x.strip() for x in line.split('|')]
  if len(cols)>6 and re.fullmatch(r'[0-9a-f]{64}',cols[6]):
   p=base/(cols[2]+'.TAB');assert hashlib.sha256(p.read_bytes()).hexdigest()==cols[6];checked+=1
 doc=(r/'docs/ops/data-downloads.md').read_text()
 expected=re.search(r'SHA-256 `([a-f0-9]{64})`',doc[doc.index('| D17 |'):])[1]
 p=r/'pipeline/work/crism/frt0000b6f1_07_su165j_mtr3.img';assert hashlib.sha256(p.read_bytes()).hexdigest()==expected
 print(f'{checked} REMS TAB hashes and CRISM IMG hash match recorded sources')
```

The final browser harness is below; save as `/tmp/marswalk-smoke-2026-11-12/browser.mts`. It uses the build directory from the baseline, the installed Playwright browser and the committed fixture, with no engine mutations. Local sockets must be allowed.

```typescript
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=process.cwd();
const require=createRequire(root+'/package.json');
const {chromium}=require('playwright');
const WebSocket=require('ws');
const {startServer}=await import(root+'/apps/hab-core/src/server.ts');
const fixture=JSON.parse(readFileSync(root+'/apps/web/tests/fixtures/ws/connect.json','utf8'))[0];
// Read-only fixture adapter: verifies transport, not a mission simulation.
const session={snapshot:(clients:any[])=>({...fixture,clients}),eventsAfter:()=>[],advance:()=>({events:[],deltas:[]}),initialPlan:()=>null};
const server=await startServer({site:'mock_site',host:'127.0.0.1',port:0,webDir:'/tmp/marswalk-smoke-2026-11-12/web-dist',session});
let browser;
try{
 for(const path of ['/','/api/health','/api/session','/api/log?after=0','/api/report','/sites/mock_site/site-manifest.json']){
 const r=await fetch(server.url+path);console.log('HTTP',path,r.status);assert.equal(r.status,200);
 }
 await new Promise<void>((resolve,reject)=>{
  const ws=new WebSocket(server.url.replace('http','ws')+'/ws');const timer=setTimeout(()=>{ws.terminate();reject(new Error('SNAPSHOT timeout'));},5000);
  ws.on('open',()=>ws.send(JSON.stringify({v:1,type:'HELLO',role:'ops',client_id:'smoke',display_name:'Smoke',last_seq:0})));
  ws.once('message',(data:any)=>{clearTimeout(timer);const m=JSON.parse(String(data));console.log('WS client HELLO -> server',m.type);ws.close();m.type==='SNAPSHOT'?resolve():reject(new Error(m.type));});ws.on('error',reject);
 });
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage();const errors:string[]=[],nonlocal:string[]=[],requests:string[]=[];
 page.on('console',(m:any)=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',(e:any)=>errors.push(String(e)));
 page.on('request',(r:any)=>{requests.push(r.url());if(!['127.0.0.1','localhost','[::1]'].includes(new URL(r.url()).hostname))nonlocal.push(r.url());});
 const response=await page.goto(server.url+'/?site=mock_site');await page.waitForLoadState('networkidle');
 const body=await page.locator('body').innerText();
 console.log(JSON.stringify({status:response.status(),body:body.slice(0,1600),consoleErrors:errors,nonLocalRequests:nonlocal,requests},null,2));
 assert.equal(response.status(),200);assert(body.trim());assert.equal(nonlocal.length,0);assert.equal(errors.length,0);
}finally{await browser?.close();await server.close();console.log('Browser and fixture Hab Core stopped');}
```
