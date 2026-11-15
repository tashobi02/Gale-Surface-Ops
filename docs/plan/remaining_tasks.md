# Remaining tasks — bring every subtask to 100 %

| | |
| --- | --- |
| **Owner** | Orchestrator (Puku CLI) for the CheesySpace team |
| **Date** | 2026-11-14 |
| **Status** | Engineering checks complete; remaining human/publication acceptance recorded below |
| **Goal** | Every row in [docs/tasks/status.md](../tasks/status.md) reads `done`; the README progress block reads 100 % |
| **Related** | [Task index](../tasks/README.md) · [Coordination map](../tasks/_coordination.md) · [Lane plan](README.md) · [Backend needs](../plan/backend/01-needs-from-frontend.md) · [Frontend needs](../plan/frontend/01-needs-from-backend.md) · [QoL decisions](../plan/qol/decisions.md) |

---

## 1. Where the 37 % really is

> **This section records the state at the start of the plan (83 %, 47 `wip` rows).** The plan has since run: the
> progress block now reads **92 % — 318 of 345 done, 5 in progress**, and §11 tracks what is left and who can
> close it. The analysis below is kept as the record of how the 47 rows were grouped.

The README progress block said **83 % — 286 of 345 subtasks done, 37 in progress**. The machine-readable truth in
`docs/tasks/status.md` was **330 `done` + 47 `wip` = 377 rows**. The 47 `wip` rows were the whole remaining scope.

They were **not** 47 unrelated pieces of work. Grouping them by *root cause* collapses them into **seven** problems:

| # | Root cause | Rows | Fix |
| --- | --- | --- | --- |
| **A** | The real `gale_boxwork` bundle was not in this checkout, so every real-site check stayed `test.fixme` | 7 | Bundle installed (§2) |
| **B** | The frontend waits on **N-xx backend contracts** that were never shipped | 30 | Ship the contracts (§4) |
| **C** | The committed storm recording is **not byte-reproducible** — a 1-ULP platform difference in `sun_elevation_deg` | 3 | Round the value (§3) |
| **D** | Browser checks were blocked by the sandbox (`listen EPERM`) and never re-run | 4 | Run them (§5) |
| **E** | The Hab Core has stubs that throw, so live flows never worked | 3 | Implement the handlers (§4) |
| **F** | Two rows need **team/human** action (public repo, AI-use audit) | 2 | Team (§7) |
| **G** | One row needs **external data** (REMS sols) | 1 | Pipeline (§6) |

### 1.1 The 47 rows, by row

| Root | Rows |
| --- | --- |
| A | T02.04 · T12.06 · T15.02 · T16.05 · T16.07 · T17.04 · T32.21 · T32.22 |
| B | T09.09 · T12.03 · T16.05\* · T18.03 · T18.06 · T18.12 · T24.02 · T24.03 · T24.04 · T24.05 · T24.07 · T24.09 · T24.10 · T24.12 · T25.01 · T25.03 · T25.05 · T25.07 · T25.10 · T26.05 · T27.05\* · T29.04\* · T31.05 · T31.06 · T31.07 · T32.19 · T32.20 · T32.26 |
| C | T27.05 · T22.14 lineage · T09.08\* |
| D | T13.09 · T25.09 · T27.07 · T31.09 |
| E | T09.08 · T25.08 · T29.04 |
| F | T16.04 · T30.02 · T30.03 |
| G | T18.08 |

\* a row can have more than one root cause; the primary one is listed here.

### 1.2 What is *not* in scope

- The **fallback** and **desirable** subtasks (43 of them, 23 done) are excluded from the progress total on purpose
  (`docs/tasks/status.md` header). T18.x rows appear in the 47 because they are `wip` on a *core* subtask, not because
  the desirable list must be finished.
- **Manual** acceptance checks (physical gloves, three non-team users, a real tablet). §7 records how each is
  replaced by an automated equivalent, per [plan README §1.1](../plan/README.md).
- Requirement text, numbers, ids and `Confirmed`/`Assumed`/`Proposed` labels in `docs/specs/**` are **not** to be
  changed (CLAUDE.md §6). Where behaviour must change it goes in as a `spec-change:` commit first.

---

## 2. Root cause A — the real Gale bundle (already done, 7 rows)

**Finding.** `data/sites/gale_boxwork/` shipped only `site-manifest.json` and `vectors/`. The `grid/`, `tiles/` and
`images/` directories are git-ignored (`.gitignore:16-18`) and ship as a GitHub release asset. Every check that needs
the real grid was therefore `test.fixme('needs N-140')`.

**Action (complete).** The release asset was fetched and installed:

```bash
gh release download data-gale_boxwork-2026.11.09 -p 'gale_boxwork-2026.11.09.zip'
shasum -a 256 gale_boxwork-2026.11.09.zip
#   7eebbf6013605d77b69d193df16c6adc0585b3427bc312f7d4f8b8aac5c9ca67  ✔ matches plan README §6
unzip -o gale_boxwork-2026.11.09.zip -d data/sites/
make validate SITE=gale_boxwork    # ✔ exit 0
```

`site-manifest.json` and `vectors/traverse.geojson` already matched the release byte for byte, so only the
git-ignored binary directories were copied in. **No tracked file changed**; `git status` stays clean.

**What it unblocks.** N-140 (`grid/elevation.f32`, `slope_p90.u8`, `flags.u8` reachable at `/sites/gale_boxwork/grid/…`).
The planner now runs the real worker on the real site, so these rows can pass:

| Row | Was blocked by | Now |
| --- | --- | --- |
| T02.04 | the 2 % crater-match test needed the real bundle | run `scale-bar` with `E2E_SITE=gale_boxwork` |
| T12.06 | the live-role provenance case | run `provenance` with `E2E_SITE=gale_boxwork` |
| T15.02 | `briefing-5-min` on the real site | re-run the 5-minute reading check |
| T16.05 | credits check needed the real tiles | run `credits` with the real bundle |
| T17.04 | no capture against the real site | capture the 240 s and 30 s cuts |
| T32.21 / T32.22 | the real `gale_boxwork` candidates | run the candidate switch |

**Caveat.** The bundle is a build artefact, not a commit. A fresh clone must repeat §2. `docs/ops/hosting.md` already
records the route; this plan adds the checksum to `docs/ops/hosting.md` if it is not there yet.

---

## 3. Root cause C — the recording is not byte-reproducible (3 rows)

**Finding — this is a real defect, not a stale artefact.**

With the bundle installed, `apps/hab-core/tests/referenceCommands.test.ts` fails:

```text
FAIL  real tests/referenceCommands.test.ts > the committed recording is this run's: same log hash, same bytes
AssertionError: expected '{"data_version":"gale_boxwork-2026.11…' to be '{"data_version":"gale_boxwork-2026.11…'
```

Diagnosis (exact, not inferred):

- `make replay` is **deterministic** — three consecutive runs give the identical hash `a347721a…`.
- `make record` (with `reference_commands.json`) gives `5fdf8ec…`, which **equals the committed `log_hash`**.
- A byte-level diff of the committed recording against a fresh `make record` shows **exactly 8 differing leaves**, all
  of them `conditions/sun_elevation_deg`, each differing by **one unit in the last place**:

  | message | committed | fresh |
  | --- | --- | --- |
  | 63 | `61.16477678548756` | `61.16477678548755` |
  | 78 | `61.37339777387905` | `61.373397773879056` |
  | 84 | `61.45644098709232` | `61.45644098709231` |
  | 110 | `61.8135568828628` | `61.81355688286281` |
  | 250 | `67.60652305968843` | `67.60652305968841` |
  | 256 | `67.65802064556179` | `67.65802064556178` |
  | 411 | `68.80810354096272` | `68.80810354096275` |
  | 559 | `69.49447635584262` | `69.49447635584261` |

- `solarPosition` (`packages/compute/src/sun.ts:110`) computes `elevation_deg = 90 - acos(cosZ)`. `Math.acos` near
  61° has a derivative of ≈ −2.2, so a 1-ULP difference in `cosZ` — from a platform's `Math.sin`/`Math.cos`
  implementation — becomes a 1-ULP difference in the elevation.
- The `log_hash` is **unchanged** (the hash covers the EVENTs, not the STATE_DELTA payloads), which is why the
  determinism assertion in `referenceCommands.test.ts` passes and only the byte assertion fails.

**Consequence.** The recording committed on 13 Nov cannot be reproduced byte for byte on a different CPU or V8 build.
That violates **NFR-06** (deterministic science, reproducible runs) and makes **N-81** (the Pages replay independently
verifying the advertised log hash) unprovable for the byte-level check.

**Fix (the right one, not a re-record).** Round the solar elevation to a fixed precision at the source, in
`packages/compute`, so the value is platform-stable. The display precision of a sun elevation is a tenth of a degree;
the engine already carries full float precision for every *derived* quantity it shows, so the rounding must be
introduced deliberately and documented:

1. Add `roundTo(value, decimals)` to `packages/compute` (or extend the existing `clean()` convention) and apply it to
   `sun_elevation_deg` in `apps/hab-core/src/engine/conditions.ts` — **not** inside `solarPosition`, because
   `solarPosition` is also used by `sunriseSunset`, `warnings.ts` and `compute/conditions.ts`, where a rounded
   elevation would change a sunrise/sunset instant.
2. Choose the precision from the spec: a sun elevation is shown to **0.1°**; the state field therefore carries
   6 decimal places (≈ 1 m of arc), which is far below any display precision and far above the 1-ULP noise.
3. Record the decision in `docs/plan/backend/decisions.md` as `BD-<n>` (backend-owned) and in
   `docs/plan/frontend/decisions.md` as `FD-<n>` if the web side formats it.
4. `spec-change:` commit on 02 §D.5 first, stating that `sun_elevation_deg` is carried at 6 dp.
5. **Re-record** the storm recording with the rounded value so the committed bytes and the code agree.
6. Re-run `make replay` and `make record` twice on this machine and confirm the bytes match.

**Rows closed:** T27.05 (the committed recording is this run's), and the N-81 lineage of T22.14.

**Acceptance.** `apps/hab-core/tests/referenceCommands.test.ts` passes with the real bundle; `make record` twice
produces byte-identical files; `git diff` on `scenarios/storm-sol4190/recording.json` is empty after a re-record.

---

## 4. Root causes B and E — the missing backend contracts (33 rows)

Thirty-two rows are waiting on a numbered need in
[docs/plan/frontend/01-needs-from-backend.md](../plan/frontend/01-needs-from-backend.md). The frontend lane did its
part: every one of those screens already renders `—` with `data-unavailable="true"` and an `unavailable:<path>` source,
exactly as the rule at the top of that file demands. **Nothing in the web app fabricates a value.** What is missing is
the backend side.

The needs are grouped into four work packages. Each is backend-owned; the frontend lane only re-activates the
`test.fixme` checks that were parked on the need.

### 4.1 WP-B1 — crew telemetry and navigation (N-02, N-03, N-04, N-29)

| Need | What the backend must supply | Frontend rows unblocked |
| --- | --- | --- |
| N-02 | `Crew.o2_remaining_min`, `next_stop_bearing_deg`, `next_stop_distance_m`, `next_stop_eta_s` with provenance map entries | T24.02, T24.03, T24.04, T24.05 |
| N-03 | `Crew.last_linked_sim_time` | T24.02, T24.03, T24.07 |
| N-04 | `Crew.link_hops`, `Crew.link_via` on the crew and on `LINK_STATE` — **no quality bars** | T24.02…T24.05, T31.05, T31.07 |
| N-29 | permit a skip-reason revision on an already-SKIPPED task, keeping the audit and revision rules | T24.05, T31.05, T31.07 |

**Notes.** N-04 changed: "no `quality_bars`" — the EVA tablet must show *unknown* link quality, never a bar it made up.
N-02's navigation values must come from the engine's one-based `stop_index`; the frontend no longer computes geometry.

### 4.2 WP-B2 — the engine's stubbed handlers (N-09, N-101, N-160, T31.04)

| Need | What the backend must supply | Frontend rows unblocked |
| --- | --- | --- |
| N-09 | the `TASK_ROVER` handler (it still throws), `Scenario.carry_items`, and a log kind for an accepted rover task | T29.04 |
| N-101 | `roversTick` (still throws) and a **suggested RELAY target** that closes the current comm shadow, so a RELAY is placed in ≤ 2 taps + confirm | T29.04 |
| N-160 | the worker answers C6 `VALIDATE_MANUAL_LEG` with a `MANUAL_LEG_RESULT` (today it answers `ERROR`), the site manifests carry the BD-23 static PNGs, and a validated leg enters the plan authoritatively (totals, timeline, conditions, radiation, time) | T09.08 |
| T31.04 | the server half of the stop-task engine — today `apps/hab-core/src/engine/tasks.ts` rejects every update | T31.05 |

**Notes.** T09.08's acceptance is "the tool checks slope and hazards and shows profile and time for the drawn leg".
The frontend already draws, validates and shows the one-leg result; without N-160 it shows `Unavailable` and `—` for
the totals, and **never computes them itself**. N-160 is the difference between a half feature and a finished one.

### 4.3 WP-B3 — session, options, link and task semantics (N-31, N-32, N-70, N-90, N-200)

| Need | What the backend must supply | Frontend rows unblocked |
| --- | --- | --- |
| N-31 | the current Earth-link state (available vs waiting) with provenance and source, so the widget stops showing `—` unless blackout | T26.05, T18.12 |
| N-32 | align `ADD_STOP_TASK` with FD-031: **fewer than four tasks per selected crew** at a stop, shared tasks counted for either crew (today it counts all crews together) | T31.06 |
| N-70 | repeated `PUBLISH_PLAN` replaces/updates/deletes planner-origin drafts at retained stops while `LOADED`, with stable draft ids | T32.26 |
| N-90 | `GET /api/join-qr?role=<role>` for every protocol role, including presenter and HUD | T32.19, T32.20 |
| N-200 | a supported way for **ops** to start the library storm — `START_EVENT` is presenter-only, and `engine/liveEvents.ts` keeps the dose at background until that command | T25.08 |

**Notes.** N-200 needs a decision: either extend the `START_EVENT` role matrix to `ops`, or give SCR-11 its own
control. The frontend cannot grant protocol permission, so this is backend-owned and must be logged as `BD-<n>` with
the chosen surface named. N-32's fix direction is given by FD-031 in the frontend decisions.

### 4.4 WP-B4 — the remaining data and view needs (N-24, N-130, N-30, N-100/N-120)

| Need | What the backend must supply | Frontend rows unblocked |
| --- | --- | --- |
| N-24 | the REMS context output (T18.02) and the O₂ estimate function (T18.05) | T18.03, T18.06 |
| N-130 | the Earth-visible **delayed** crew and alert summary with its simulated as-of timestamp and provenance | T18.12 |
| N-30 | the loaded scenario's ParamSet files (values, provenance, source ids) and the loaded dose-series source id and title, to the planner | T12.03, T25.01, T25.03, T25.05, T25.07, T25.10, T16.05 |
| N-06 (follow-up) | the authoritative EVA phase with provenance, so SCR-11 stops showing `—` | T25.01, T25.03, T25.05, T25.07, T25.10 |
| N-100 / N-120 | the hab walking-time field and its grid/source metadata, for the 10/20/30 min haven isochrones and the caution hatch | T24.09, T24.10, T24.12 |

**Notes.** N-100 (ops) and N-120 (live EVA) are the same field for two consumers; ship it once.
N-24's REMS context is also needed for the pipeline work in §6.

---

## 5. Root cause D — the browser checks that never ran (4 rows)

Four rows were parked because the sandbox could not bind a port (`tsx listen EPERM`):

| Row | The check |
| --- | --- |
| T13.09 | `axe` over every built route, both HTML modes, each EVA and ops state fixture; plus the updated `axe` fixture scans |
| T25.09 | `fallbacks-live` |
| T27.07 | `fallbacks-live` and `print` |
| T31.09 | `fallbacks-live` |

**Action.** Run the harness from a directory where binding is permitted, with the real bundle in place:

```bash
npm run -s build
E2E_SITE=gale_boxwork npx playwright test -c apps/web/e2e/playwright.config.ts \
  checks/axe.spec.ts checks/fallbacks-live.spec.ts checks/print.spec.ts
```

**Acceptance.** Each named check passes with **0 failed**; the result JSON lands in `apps/web/e2e/out/`. The row's
evidence cell is updated with the run and the port. If a check still fails, it is a real defect and is fixed in §4 or
§9 — it is not re-parked.

**Rule.** A check that has been "awaiting the orchestrator" for more than one package is a defect, not a blocker.

---

## 6. Root cause G — the pipeline data (1 row)

**T18.08** — the REMS and CRISM caches. Open items: REMS sols 4183–4186 and 4193–4195 (the server throttled), the
`L_s`-bin sol choice (`TODO(decision)`), and step 5 of the checklist (open every cached file with the network off).

**Action.** Re-fetch the missing REMS sols with backoff; record the `L_s`-bin sol choice as `BD-<n>` in the backend
decisions (the choice follows from the series the storm replay uses); then run step 5 with the network disabled and
record the outcome in `docs/ops/verification-log.md`.

---

## 7. Root cause F — the rows that need the team (3 rows)

These cannot be automated and must not be closed by an agent. They are prepared, handed over, and **left visible** in
the plan until the team acts.

| Row | What is needed | What the agent does |
| --- | --- | --- |
| T16.04 | `docs/AI_USE.md` has zero rows after `## Prompts location`; that section now resolves `TODO(decision)` to operator-local CLI/agent session logs outside git (FD-544). What remains is the **historical** disclosure cells and the live 2026 guide audit. | Prepare the audit checklist; the team fills the cells. |
| T30.02 | the same historical AI-use sweep, plus the 2026 guide audit. | Same. |
| T30.03 | the **public** repository and Pages publication, and an unauthenticated link check. The repo still reports private. | Prepare the release steps; the team publishes. |
| T16.07 | the same publication evidence. | Same. |

**Handling.** The agent writes the exact command sequence into `docs/ops/submit-now.md` and leaves the rows `wip`
with that pointer, so the remaining 100 % is a **team checklist**, not hidden work. Per the README's "Submitted"
status, the material itself is already in.

---

## 8. Execution plan — six parallel work packages

The packages are independent in the files they touch, so they run in parallel. Each ends with
`make lint typecheck test-web docs-check` green and a commit that updates its own rows in
`docs/tasks/status.md` **and** runs `python3 scripts/update_progress.py` in the same commit (CLAUDE.md §6).

```text
            ┌─────────────────────────────────────────────┐
            │  §2  real Gale bundle            [DONE]      │
            │  grid/ tiles/ images installed, validated    │
            └──────────────┬──────────────────────────────┘
                           │ N-140
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
 ┌────────────┐    ┌──────────────┐    ┌──────────────┐
 │ §3  float  │    │ §4 backend   │    │ §5 browser   │
 │ determinism│    │ contracts    │    │ checks       │
 │ (WP-C)     │    │ WP-B1..B4    │    │ (WP-D)       │
 └─────┬──────┘    └──────┬───────┘    └──────┬───────┘
       │  recording        │  contracts        │
       │  bytes match      │  land             │  rows flip
       ▼                  ▼                  ▼
 ┌──────────────────────────────────────────────────────┐
 │  §9  re-verify: full suite + progress block          │
 │  377 rows all `done` → README progress block 100 %    │
 └──────────────────────────────────────────────────────┘
```

| Package | Scope | Agent model | Depends on |
| --- | --- | --- | --- |
| **P1** | §3 float determinism + re-record | gpt-6.1-terra | — |
| **P2** | §4.1 WP-B1 crew telemetry | gpt-6.1-terra | — |
| **P3** | §4.2 WP-B2 engine handlers | gpt-6.1-terra | — |
| **P4** | §4.3 WP-B3 session semantics | Gemini Hydrogen 4 | — |
| **P5** | §4.4 WP-B4 data and view needs | Gemini Hydrogen 4 | — |
| **P6** | §5 browser checks + §6 pipeline | gpt-6.1-terra | P1–P5 for the full re-verify |
| **P7** | **Review** of P1–P6 | gpt-6.1-sol | P1–P6 |
| **P8** | **Review round 2** if P7 finds defects | gpt-6.1-sol + opus-4.8 | P7 |

**File ownership** (so the packages never collide — `docs/plan/README.md` §4):

| Package | Owns (writes) |
| --- | --- |
| P1 | `packages/compute/src/sun.ts`, `apps/hab-core/src/engine/conditions.ts`, `scenarios/storm-sol4190/recording.json`, `docs/specs/02*` (solar section only) |
| P2 | `packages/protocol/src/runtime.ts`, `packages/protocol/src/ws.ts`, `apps/hab-core/src/engine/tick.ts`, `apps/hab-core/src/engine/links.ts` |
| P3 | `apps/hab-core/src/engine/tasks.ts`, `apps/hab-core/src/engine/rovers.ts`, `apps/hab-core/src/rover.ts`, `packages/compute/src/manualLeg.ts`, `apps/web/src/worker/**` |
| P4 | `apps/hab-core/src/commands.ts`, `apps/hab-core/src/engine/liveEvents.ts`, `apps/hab-core/src/server.ts`, `packages/protocol/src/ws.ts` (role matrix) |
| P5 | `apps/hab-core/src/scenarioMeta.ts`, `apps/hab-core/src/engine/haven.ts`, `apps/hab-core/src/earthView.ts`, `packages/compute/src/conditions.ts` |
| P6 | `apps/web/e2e/**`, `pipeline/src/marswalk_pipeline/**` |
| P7 | review only — no writes, a findings list |

`docs/tasks/status.md`, `docs/AI_USE.md` and the README progress block are **append/update-only** and are the one
shared surface; each package stages its own rows explicitly (never `git add -A`) and regenerates the block in the same
commit.

---

## 9. Definition of done

A task is done when **all** of these hold:

1. Its acceptance criteria in `docs/tasks/TASK-*.md` are met, or the row states in the spec that an automated check
   replaces the manual one (plan README §1.1) and that check passes.
2. Every `test.fixme('needs N-nn')` that named a need this package shipped is **reactivated and passing**.
3. No `TODO(decision)` / `TODO(verify)` is left in the backend scope (`make check-todos`).
4. `make lint typecheck test-web docs-check` is green, and `make test` (with the conda env) is green.
5. The row in `docs/tasks/status.md` reads `done` with evidence that points at a real file, test or commit.
6. `python3 scripts/update_progress.py` has been run and `README.md`'s block is staged in the same commit.

**The finish line:** `docs/tasks/status.md` has 377 rows, all `done`, and the README progress block reads
`██████████████████ 100 %`.

---

## 10. Risks and traps

| Risk | Why it bites | Guard |
| --- | --- | --- |
| **Re-recording without fixing §3** | the new bytes would drift again on the next machine, and NFR-06 stays broken | fix the rounding **first**, re-record second |
| **A rounding change in `solarPosition`** | it feeds `sunriseSunset` and `warnings.ts`; rounding there moves a sunrise instant | round in `engine/conditions.ts`, not in `compute` |
| **Inventing a missing value** | CLAUDE.md §2 forbids it, and the FR-15 provenance rule breaks | the frontend keeps rendering `—` with `data-unavailable`; only the backend supplies real values |
| **A `PUBLISH_PLAN` semantics change (N-70)** | it touches the plan store and the task engine at once | stable draft ids; the `plan-rules` check stays green |
| **Merging packages at once** | five packages touch `packages/protocol/src/ws.ts` | each package commits and the reviewer verifies the merged result |
| **Closing the team's rows** | T16.04, T16.07, T30.02, T30.03 need the team | they stay `wip` with a prepared checklist (§7) |
| **The bundle is not in git** | a fresh clone has no `grid/` | the install command is in §2 and in `docs/ops/hosting.md` |

---

## 11. Status of this plan

**Current: 99 % — 342 of 345 core subtasks done, 3 in progress.** The remaining core rows require physical
usability evidence or a public-repository/portal verification. One conditional fallback row also remains open.
The twenty completed TASK-05b rows were previously ignored by the counter; they now count correctly. T14.03 and
T14.05 were genuinely absent and are now implemented, tested and independently reviewed.

| Step | State |
| --- | --- |
| §2 — real Gale bundle installed and validated | **done** |
| §3 — float determinism | **done**; stale downstream scenario/recording dependencies rebuilt reproducibly on 15 November |
| §4 — backend contracts | **done** for the planned work packages; the planning-only vehicle haven branch remains explicitly declined by BD-173 |
| §5 — browser checks | **done** for engineering scope; real Gale recovery/replay and the authoritative N-29 flow pass |
| §6 — pipeline data | **done** for T18.08: all 42 selected REMS files and four CRISM files verified offline, with complete inventories; no bundle re-release |
| §7 — team handover | Disclosure confirmed and final video approved by Obidit Islam on 15 November; remaining evidence below |
| §9 — re-verify | **done** for local engineering scope: lint, typecheck, all four test suites, docs checks, build, independent review and browser recovery/replay pass |

### 11.1 Remaining acceptance

| Rows | Who can close them | Evidence still needed |
| --- | --- | --- |
| T15.02 | **the team** | Three timed outside-team sessions and physical glove/device results; the team lead explicitly reports none yet |
| T16.07 | **the team** | An explicit publication decision and unauthenticated repository access; repository is private and Pages is not configured; the public Vercel app is separately recorded |
| T30.03 | **the team** | The public-repository scoring point and actual NASA portal project link/screenshots; the supplied app URL does not establish those |
| T17.04 (excluded fallback) | **the team** | Final-content approval is supplied; whether the approved long video replaced a failed live take, plus original upload-deadline evidence, remain unverified |

T16.04 and T30.02 are now **done** with the team lead's disclosure confirmation and the repaired mechanical
sweep. T18.08 is **done** with independently repeated offline verification. Conditional and human outcomes
are not invented to make the percentage read 100 %. The deployed app and both video links are recorded in the
[confirmation evidence](../ops/verification-log.md#t1604-t1704-and-t3002--team-confirmations-and-public-links-2026-11-15).

**Closed on 2026-11-14** (browser evidence on the real `gale_boxwork` bundle, port 8091 — see the
[verification log](../ops/verification-log.md#t1206-t1309-t1502-t1812-t2404-t2405-t2407-and-t2805--the-real-bundle-verified-2026-11-14)):
T12.06 (`provenance` 19 passed), T13.09 (`axe` 22 passed), T14.10 (`release-recovery` 7/7), T18.12 (N-213 closed by
BD-172: the clock advances while the Earth queue drains, so a message queued during the EVA is delivered at the real
08:50 maven pass after the EVA ends; `earth-message` 1 passed against the committed SPICE table), T24.04, T24.05
(`eva-conditions`/`eva-portrait`/`eva-warning` 12 passed and the one-hold tap counts), T24.07 (`link-lost` 2 passed,
`release-network` 9 passed), T25.08 and T31.05 (`ops-no-terminal` 8 passed), T28.05 (the killer demo through the
OPS and EVA UI in single-laptop mode), T09.09 (N-214 closed by the decline BD-173: the planning form's vehicle branch
is declined, so the SCR-05 panel shows it as an unavailable value with its own source per 03 §SCR-05, and the live
exact branch is unaffected in the Hab Core), and the automated half of T15.02 and T17.04.

## 12. Resumption audit — 15 November 2026

Obidit Islam asked Codex to resume the interrupted Puku session and finish the remaining work. The implementation
and review sequence is: finish the AI-use checker regressions; verify the complete REMS/CRISM cache offline;
repair the progress generator; implement boot validation and the missing fault-injection suite; run the required
checks; append evidence, regenerate progress and record the remaining human acceptance work.

The seven `wip` rows in §11 were not the whole unfinished scope. The generator ignored all twenty completed
`T05b` rows because its status parser accepted only numeric task ids, and grouped TASK-05b with TASK-05.
T14.03 and T14.05 had no status row and were real work: the boot validator was a throwing stub and the
integration fault suite did not exist. The repair preserves the registered ids and acceptance criteria.

The interrupted checker repair has tests for all six reviewer findings, including per-occurrence references,
explicit scoped correction rows, negated historical markers and literal colon-number filenames. The raw cache
verification covers BD-167's complete source selection and companion labels; it does not re-release the shipped
site bundle or change its data_version. [FD-566](frontend/decisions.md) records the asynchronous boot contract
before implementation. Physical usability, contributor confirmations, final video review and publication evidence
remain subject to their original acceptance criteria.
