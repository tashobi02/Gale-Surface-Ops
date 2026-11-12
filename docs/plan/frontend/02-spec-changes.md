# Package 02 — spec changes (docs only, applied before any code that uses them)

| | |
| --- | --- |
| **Subtasks** | None of its own: it writes the **Proposed** spec text that the decisions in [decisions.md](decisions.md) marked `02/§n`. Commit title `spec-change: frontend full-run decisions (FD-…)` |
| **Depends on** | Package 01 merged (so `make docs-check` and the harness run in CI) |
| **Owner agent** | One docs agent; no code |
| **Budget** | ≤ 12 files, ≈ 2 h |

## Rules for the agent

- Every inserted passage starts with *(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-nnn)*.
- Never change an existing requirement id, number, or a Confirmed/Assumed/Proposed/Unresolved label outside the passages named below. Where a passage replaces text, keep the old text as a struck-through line only if the file already uses that convention; otherwise replace it and name the FD id.
- **Do not change any heading text**: anchors such as `#e5-scr-12-eva-tablet-ops-phonetablet-portrait--360-px` are linked from many files and `make docs-check` fails on a broken anchor. Add new text under the existing headings.
- Exact replacement text for §1.1, §4.1 (landscape), §4.2 and §4.10 is the mockup's *Draft patch text* in `docs/design/mockup-handoff.md` (section "Deviations from spec" → "Draft patch text"); copy it, do not reword it.

## Files

`docs/specs/01_Product_Requirements_Document.md`, `docs/specs/02_Technical_Requirements_Document.md`, `docs/specs/03_App_Flow_and_Diagrams.md`, `docs/specs/04_Design_Brief.md`, `docs/specs/05_Backend_and_Database_Schema.md`, `docs/specs/06_High_Level_Implementation_Plan.md`, `docs/design/mockup-handoff.md` (Unresolved table: add "Decided: FD-nnn" to U-30–U-43, U-51–U-60), `docs/tasks/_coordination.md` (§d C10 row: v3 note; open points 4, 7, 8, 15 closed with FD ids), `docs/AI_USE.md` (one appended row), `docs/tasks/status.md` (no row; see Done).

## §1 — 01 PRD

- **§1.1 FR-32 (FD-010).** Replace the first acceptance bullet with the mockup's "Replacement for the first acceptance bullet of 01 FR-32".
- **§1.2 §E core scenario, step 8 (FD-043).** In the step-8 row, replace "radiation 0.19 mSv (7 h, solar max)" with "radiation estimate as computed for the plan's EVA total". FR-12's own acceptance example (7 h, 0.64 mSv/day → 0.19 mSv) is unchanged: it is the compute unit test.
- **§1.3 FR-12 label (FD-128).** Label text becomes "measured background rate × planned duration (simplified)" (the 02 §D.4 wording), so SCR-07, SCR-09 and the cards show one string.
- **§1.4 §F.4 D-08 row (FD-006).** Record the decision: "Gale Surface Ops", search of 12 Nov 2026, ADR-013. The header *Product* row is renamed by package 31, not here.

## §3 — 03 screens and flows (and cross-screen rules)

- **§3.1 §C.6 steps 7–8 (FD-012).** "Crew see the caution and the advisory" → "the caution and the advisory are in the alert list behind '+N'; the latched warning keeps the bar (04 §D.2)".
- **§3.2 C10 v3 contract-change (FD-040, FD-063, FD-074).** Note in `_coordination.md` §d C10 row: `LAYER_Z_INDEX` traverse 45 and waypoints 55 are final; `MapHandle.fitExtent(extent, options?: {animate?: boolean})`; POI selection is UI state outside C11 (`selected_poi_id`). Code lands in packages 07 and 08.
- **§3.3 SCR-15 Content (FD-051).** "ETA, battery after task" → "after the Hab Core accepts the task: its ETA and battery (simulated); before that, —".
- **§3.4 FR-15 and SCR-09 numeric-value allowlist (FD-110).** Add under 01 FR-15 Acceptance: the identifiers and chrome listed in FD-110 are not metrics and carry no provenance label; every other digit does.
- **§3.5 SCR-05 and SCR-08 (FD-122, FD-133).** 03 §D "dashed grey" NO_ROUTE line → "dashed `unknown` (04 §C.5)". SCR-08 header "plan name" = "Plan for <site name> — <EVA start date>".
- **§3.6 Unresolved U-29 (FD-009).** Resolution: no guest join; virtual event.
- **§3.7 SCR-12 Content.** Add "portrait or landscape" (mockup instruction under the FR-32 patch).
- **§3.8 SCR-00 (FD-207).** Add "Mode: OPS"; SCR-18 "inherits the host route's mode".

## §4 — 04 design brief

- **§4.1 §E.5 SCR-12 (FD-010, FD-024, FD-028, FD-032, FD-033).** Under the existing heading add the mockup's landscape layout, height budget, stop-task-list and full-screen-map paragraphs from "Replacement for 04 §E.5". Then add: TASKS placement per DV-12 (U-51 decided), collapse rule per G-40 (U-59 decided), skip reason per G-33 (U-55 decided), and turn the "Exception under review" bullet into "Decided (U-60): 40 px phone / 48 px tablet inside the landscape full-screen map only".
- **§4.2 §E.7 SCR-14 (FD-010).** Add "SCR-14 in landscape" from the mockup.
- **§4.3 §F Glare, §D.3 (FD-011, FD-017, FD-176).** CONTRAST button placement (fifth action in landscape; HUD cell split in portrait); high-contrast alert bars are black with a 4 px status-colour outline and status-colour text; the TAP CONFIRM setting enables the 5-s tap fallback of §D.3.
- **§4.4 §C.1, §C.2 (FD-013, FD-066, FD-073).** `focus` row: BRIEF value "ink ring on a paper gap". PRINT: advisory `#1D4ED8`, unknown `#6D28D9` (mockup DV-07). §C.2 "Headings during the font roll-out": "Ended 2026-11-12: Chakra Petch and Source Serif 4 are self-hosted (T13.13); the Display and Headings rows apply to all screens".
- **§4.5 dose units (FD-016).** Under §E.4/§E.5: "Absorbed dose is shown in mGy with one decimal on ops, EVA and HUD; stored in µGy (05); the planner's FR-12 estimate stays in mSv; the event dose is never shown in Sv".
- **§4.6 §C.7 sound (FD-018).** "Ops starts SOUND ON; until the first user gesture arms audio the indicator reads 'SOUND ON — click to arm'".
- **§4.7 §D.1 Alert bar row (FD-022).** The mockup's replacement text for the §D.1 Alert bar row (DV-03).
- **§4.8 §F and Appendix A (FD-062, FD-119, FD-121, FD-124).** Warning order = severity, then along-route position, then leg. Keyboard move of a selected stop: arrow keys with the stop selected nudge it one grid cell; "Move to crosshair" places it at the crosshair (both validated like a drop). Results empty state copy "Add at least one stop". Number formats: the FD-124 table.
- **§4.9 Unresolved table (FD-002, FD-005, FD-061).** U-08: "Decided: opt-in light theme from PRINT tokens (`?theme=light`)". U-25: "Resolved: prototype".
- **§4.10 §F Responsive row (FD-010).** Replace with the mockup's "Replacement for the 04 §F 'Responsive' row", keeping the 11 Nov `--results-height-narrow` sentence.
- **§4.11 §E.6 HUD (FD-200).** Add "Alert text is sentence case, identical on ops, EVA and HUD (§D.2)".

## §5 — 02 and 05 behaviour and data

- **§5.1 02 §E.3, 05 MissionScenario `eva_start_utc` (FD-042).** "Default: the loaded scenario's `eva_start_utc` (Hab Core `GET /api/session`); with no Hab Core, no default: the field is required".
- **§5.2 02 §D.2 note (FD-082).** "`Leg.profile.dist_m` and `Warning.from_m`/`to_m` are along-leg; the UI maps them to positions by interpolating `Leg.geometry` in projected metres".
- **§5.3 05 §C PlanExport (FD-134).** "`plan_hash` input is canonicalised with RFC 8785 (JCS), as `log_hash`".

## §6 — 06 plan and process

- **§6.1 TASK-13 (FD-154).** T13.03 evidence = the prototype frames of SCR-02 and SCR-08.
- **§6.2 §C.1 TASK-15 "Done when" (FD-156–FD-158).** "Automated heuristic checks (package 30 of the frontend plan) replace the three sessions; each UT row has a pass rule; failures become follow-up subtasks". Keep the old text struck through only if 06 already uses strike-through; otherwise replace and cite FD-156.
- **§6.3 §C verification (FD-190, FD-191).** "`human-required` verify subtasks of the frontend lane are met by named Playwright checks plus a verification-log entry".
- **§6.4 §D.4 fallbacks (FD-193).** "Fallbacks are built as degradation paths behind their trigger; the trigger no longer gates building them".

## Steps

1. Apply §1–§6 in file order; run `make lint docs-check` after each file.
2. Mark the mockup handoff's Unresolved rows U-30–U-43 and U-51–U-60 with "Decided 2026-11-12: FD-nnn (Proposed)".
3. Append one `docs/AI_USE.md` row for the commit.
4. Docs only: `graphify update .` does not re-read Markdown; note in the PR that a `/graphify .` rebuild is due (`CLAUDE.md` §7).

## Check replacing manual acceptance

- `make lint docs-check` passes (links, anchors, README progress freshness).
- `python3 scripts/check_tasks.py` passes (no id changed).
- A grep check in the PR description: `git diff -U0 docs/specs | grep -E '^-.*(FR|NFR|SCR|U|D)-[0-9]+'` lists only lines this package was told to replace.

## Status row change

None (no subtask is finished by spec text alone). Packages that depend on these passages cite them.

## Done criteria

- Every `02/§n` reference in decisions.md has its passage in the named spec file with the FD id.
- No heading text changed; `make docs-check` green; one commit `spec-change: frontend full-run decisions (FD-…)` with the attribution lines.
