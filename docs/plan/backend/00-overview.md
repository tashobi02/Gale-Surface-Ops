# Backend full-run plan — overview

| | |
| --- | --- |
| **Owner** | Backend planner (Claude) for Sadman Shaharier Mahim (product & systems lead; the whole team since 12 Nov 2026) |
| **Date** | 2026-11-12 |
| **Status** | Plan for one full agent run; base `main` at `ad75b32` (branch `core-backend`). Packages merge into `merging-core` |
| **Related** | [decisions.md](decisions.md) · [decisions-index.md](decisions-index.md) · [01-contract.md](01-contract.md) · [02-spec-changes.md](02-spec-changes.md) · [99-verification.md](99-verification.md) · frontend plan: `origin/core-frontend:docs/plan/frontend/` |

## 1. What this plan covers

Every subtask not `done` in `docs/tasks/status.md` (12 Nov) of TASK-01, 03, 04, 05, 05b, 06, 14, 20, 21, 22, 23, 26, 27 (server and replay), 28, 29 (server), 31 (server), 32 (protocol and Hab Core), plus the real-site pipeline build on the external SSD (`$SSD`, BD-12). UI subtasks of these tasks belong to the frontend plan (§3). Every open marker and Unresolved item in scope is decided in [decisions.md](decisions.md) (94 decisions; 515 markers mapped in [decisions-index.md](decisions-index.md)).

## 2. Scope table (subtask → package)

| Package | Subtasks |
| --- | --- |
| [02-spec-changes](02-spec-changes.md) (first) | T32.02; spec halves of T01.07, T04.11 (+ U-row updates) |
| [01-contract](01-contract.md) (01a, 01b) | T32.01, T32.03, T32.04, T32.05 |
| [03-deps-build-ssd](03-deps-build-ssd.md) | T14.01, T14.11 |
| [04-loader-plan-optional](04-loader-plan-optional.md) | T32.06, T32.07, T32.08 |
| [05-haven-tick](05-haven-tick.md) | T23.03 |
| [06-next-stop](06-next-stop.md) | T32.09, T32.10 |
| [07-start-event](07-start-event.md) | T32.11, T32.12 |
| [08-reset-site-setup](08-reset-site-setup.md) | T32.13, T32.14, T32.15 |
| [09-crew-margins](09-crew-margins.md) | T32.30, T32.31 |
| [10-publish-tasks](10-publish-tasks.md) | T32.24, T32.25 |
| [11-command-replay-recording](11-command-replay-recording.md) | T32.16, T32.17, T22.13; T27.05 server half |
| [12-compute-time-sun](12-compute-time-sun.md) | T06.02, T06.03, T06.06, T06.07 |
| [13-compute-conditions-planresult](13-compute-conditions-planresult.md) | T06.05, T06.09, T06.10, T05.32 |
| [14-compute-warnings-worker](14-compute-warnings-worker.md) | T05.13, T05.15, T05.18, T05.24, T05.27 |
| [15-compute-paths-contingency](15-compute-paths-contingency.md) | T23.07 |
| [16-engine-conditions](16-engine-conditions.md) | T22.16 |
| [17-links](17-links.md) | T26.06, T26.01, T26.02 |
| [18-earth](18-earth.md) | T26.03, T26.04 |
| [19-rover](19-rover.md) | T29.01, T29.02, T29.03 |
| [20-report](20-report.md) | T27.02, T27.01 |
| [21-network-kit](21-network-kit.md) | T28.02, T20.07, T20.09, T28.01, T28.04 |
| [22-pipeline-sources-ssd](22-pipeline-sources-ssd.md) | T04.04, T04.05, T04.06, T04.10 (+ T03.19 step 1) |
| [23-pipeline-build](23-pipeline-build.md) | T03.19, T03.21, T03.22, T03.35, T04.08 |
| [24-compute-real-grid-verify](24-compute-real-grid-verify.md) | T05.28, T05.29, T05b.01, T05b.05, T05b.20 |
| [25-scenario-build](25-scenario-build.md) | T21.12, T21.08, T32.32, T21.11, T21.06, T31.02 |
| [26-demo-numbers-reference](26-demo-numbers-reference.md) | T21.15, T21.09, T21.10, T32.18 |
| [27-headless-verify](27-headless-verify.md) | T22.14, T23.08, T32.29, T26.07, T29.06, T31.08 (server), T20.08 |
| [28-browser-release-verify](28-browser-release-verify.md) | T14.06, T14.07, T14.08, T14.09, T14.10, T28.03, T28.05, T31.08 (browser) |
| [29-fallbacks](29-fallbacks.md) (last) | T01.06, T03.23–T03.27, T04.09, T05.30, T05.31, T05b.21, T06.11, T21.13, T21.14, T22.15, T23.09, T26.08, T29.07 |
| [30-todo-sweep-and-close](30-todo-sweep-and-close.md) (last) | marker sweep, ratifications, status reconciliation |

T01.07 and T04.11 rows are written by package 02.

## 3. Frontend-owned ids in these tasks (not planned here)

T14.03, T14.04, T14.05 (boot validation, SCR-00, fault tests — BD-83 answers their open questions), T26.05, T27.03, T27.04, T27.05 (client `replaySource`; the recording comes from packages 11 and 26), T27.06, T27.07, T29.04, T29.05, T31.05, T31.06, T31.07, T31.09, T32.19–T32.23, T32.26–T32.28. Package 28 needs them merged.

## 4. What the frontend consumes

Everything in [01-contract.md](01-contract.md): roles and permissions, typed command args, Scenario/Session/library types, the new Crew and Vehicle fields, `Snapshot.conditions`, `task_library`, `event_library`, `next_stop_target`, log event kinds, `PostEvaReport`, `Recording`, `CommandList`, `logHash`, worker `LOAD_GRID` and `VALIDATE_MANUAL_LEG`, the HTTP/CLI additions, and the F7 fixtures. §7b maps the frontend's needs N-01 … N-28 one by one. 01a and 01b merge to `merging-core` **before** any frontend implementation starts; later behaviour lands behind those types, so the frontend never waits on a type.

## 5. Order and parallel lanes

```text
02 → 01a → 01b ─┬─ 03 ──────────────── 22 → 23 → 24 ─────────┐
                ├─ 04 → 06 → 07 → 08 → 09 → 10 → 11 ─────────┤
                │        05 ─┘ (before 08)                   │
                ├─ 12 → 13 → 14 → 15 (after 04, 05) ─────────┤
                ├─ 16 (after 07, 13) · 17 (after 08) → 19    │
                ├─ 18 (after 07) · 20 (after 17) → 21        │
                └────────────────────────────────────────────┴→ 25 → 26 → 27 → [frontend merged] → 28 → 29 → 30
```

Shared-file chains (one package at a time on each file): `commands.ts` and `session.ts`: 06 → 07 → 08 → 09 → 10 → 11 → 17 → 18 → 19; `tick.ts`: 04 → 07 → 09 → 15; `server.ts`: 08 → 11 → 17 → 20 → 21 → 19; `runtime.ts` / `ws.ts`: 01a → 04 (later changes only through a `contract-change:` note in 01-contract).

## 6. Rules every package follows

- Branch `be/NN-<slug>` from the current `merging-core`; tests first (red, then green); conventional commit with FR/TASK/BD ids; explicit `git add` paths (never `-A`).
- In the same commit: the package's status rows (`done` only when its checks pass; `<commit date>` = the commit's date), `make progress`, `README.md`, one `docs/AI_USE.md` row.
- `make lint typecheck test-web docs-check` before every commit; `make test` (conda on the SSD) when `pipeline/` changes; `graphify update .` after code changes.
- Non-negotiables of CLAUDE.md §2: no runtime internet; science only in `packages/compute` and `pipeline/`; no `Date.now()` in `apps/hab-core/src/engine`; every value labelled; Mars CRS rules; no number from memory — a value comes from data, compute or a ParamSet labelled `assumed`.
- A package that finds a spec gap stops and adds a `contract-change:` or spec row through the orchestrator; it never invents a field.

## 7. Not planned here (for the orchestrator)

- **TASK-18 desirables** (FR-47 terrain refuge `skyView`, T18.02 REMS context, T18.05 O₂ estimate; frontend need N-24): not in the backend scope given to this planner.
- **FR-49** is not built (BD-28: no source).
- Real phones and a router are not used (virtual event, BD-02); WebKit is not installed, so iOS Safari is not tested.
