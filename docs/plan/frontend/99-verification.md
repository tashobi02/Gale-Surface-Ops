# Package 99 — review checklist and end-to-end UI run

| | |
| --- | --- |
| **Owner** | Orchestrator (Claude) for Sadman Shaharier Mahim |
| **Date** | 2026-11-12 |
| **Related** | [Overview](00-overview.md) · [Harness](01-verification-harness.md) · [Decisions](decisions.md) |

## A. Per-package review checklist (reviewer agent, every PR into `core-frontend`)

1. **Scope:** files changed ⊆ the package's file list (or named in the PR body with a reason); no file of another open package (overview serialisation table).
2. **Tests first:** the named tests exist, were red on the first commit of the branch (check `git log -p` order) and are green now; no new `it.todo`, `it.skip`, `test.fixme` except `fixme('needs N-nn')`.
3. **Harness:** the package's checks are enabled (no `fixme`) and `make e2e-one CHECK=<name>` output is attached.
4. **Provenance:** every new displayed value has `data-provenance` (one of the six classes) and `data-source`; a missing value is "—" with `data-unavailable`.
5. **No invented numbers:** grep the diff for numeric literals in `apps/web/src`; each is a token, a 02/04 spec value with its citation, a protocol constant, or a test fixture.
6. **Science boundary:** no physics, routing, dose or viewshed maths in `apps/web/src` (formatting, counting and display interpolation only); no `Date.now()` driving sim state.
7. **CRS:** no `ol/sphere`, no `EPSG:3857`/`EPSG:4326` paths, east-positive longitude.
8. **Status colours and brand orange:** status classes only on status; harness `brand-orange` green for OPS/HUD routes touched.
9. **Accessibility:** keyboard reachable, visible focus, targets per mode, `axe` green on touched routes.
10. **Markers:** every `TODO(decision)`/`TODO(verify)` the package's FD rows name is gone; no new marker.
11. **Bookkeeping:** status rows exactly as the package says, `make progress` staged, TASK-file "Decided: FD-nnn" lines, `docs/AI_USE.md` row, commit title with subtask and FR ids, attribution lines, explicit paths.
12. **Commands:** `make lint typecheck test-web docs-check` green; `graphify update .` run.

## B. End-to-end UI run (after packages 01–36 are merged into `core-frontend`)

Run from a clean checkout of `core-frontend` merged with the backend branch:

1. `make lint typecheck test-web docs-check` — all green.
2. `grep -rn "TODO(decision)\|TODO(verify)" apps/web/src apps/web/tests apps/web/spike` — empty (backend-owned fixture README lines excepted only if they name N-13).
3. `grep -rn "test.fixme\|it.todo\|it.skip" apps/web` — empty, or only `fixme('needs N-nn')` for a need the backend plan lists as not delivered; each such case keeps its status row `wip`.
4. `make e2e` on F4 (`mock_site` + fake scenario) — all checks green across all device projects.
5. `E2E_SITE=gale_boxwork make e2e` with the real bundle and `scenarios/storm-sol4190/scenario.json` — all checks green, including `scale-bar` 2 %, `walking-skeleton`, `poi-conditions`, `ops-no-terminal`, `task-latency`, `print`, `replay`.
6. Killer demo (01 §E.1) as one scripted run: presenter Next stop ×2 → Start storm → EVA warning, SCR-14 opens → Go (hold) → ops approves where needed → shelter → End → SCR-17 prints ≤ 2 pages → `#/replay` reproduces the report `log_hash`. Two runs give the same `log_hash`.
7. Offline proof: the whole run of step 6 with `offline` guard: zero blocked requests.
8. `python3 scripts/check_tasks.py` and `make progress` — no diff; every subtask in the overview table is `done` or `wip` with a named N-nn.
9. Package 32 videos exist in `var/videos/` with durations 240 ± 5 s and 30 ± 2 s; package 31 `docs/ops/submit-now.md` lists the remaining external acts (FD-192).
10. Record the run in `docs/ops/verification-log.md` (append) with the commit SHA and the `apps/web/e2e/out/results.json` summary.
