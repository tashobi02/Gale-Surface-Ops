# Usability Test Script: 3-Stop Traverse Briefing in ≤ 5 min

| | |
| --- | --- |
| **Owner** | Ridita Alam (R5 EVA & Ops UI · design system) |
| **Task** | [TASK-15](../tasks/TASK-15_usability-test.md) (T15.01, T15.04) |
| **Date** | 2026-11-08 |
| **Status** | Script draft for pilot and volunteer sessions (v1 planning + v2 surface ops) |
| **Related** | [01 §B](../specs/01_Product_Requirements_Document.md#b2-success-criteria-all-proposed-unless-marked) · [01 §E](../specs/01_Product_Requirements_Document.md#e-core-demonstration-scenario) · [01 FR-33](../specs/01_Product_Requirements_Document.md#fr-33--hud-mode-t1-m) · [01 FR-40](../specs/01_Product_Requirements_Document.md#fr-40--pressurized-rover-summon-and-rendezvous-t1-m) · [02 §F.2](../specs/02_Technical_Requirements_Document.md#f2-test-plan-additions-v2) · [03 §C.1](../specs/03_App_Flow_and_Diagrams.md#c1-primary-end-to-end-journey-matches-prd-e) · [04 §F.1](../specs/04_Design_Brief.md#f1-mission-critical-usability-checks-task-15) · [06 §C.1](../specs/06_High_Level_Implementation_Plan.md#c1-retained-from-v1-planning-spine-tier-0) · [Mockup handoff](../design/mockup-handoff.md#unresolved-items) |

---

## 1. Success Criteria (verbatim quote)

This test evaluates the primary User Value goal defined in the product specification:

> **[01 §B.2](../specs/01_Product_Requirements_Document.md#b2-success-criteria-all-proposed-unless-marked) Planning (Tier 0) criterion:**  
> "First-time user makes a 3-stop briefing in ≤ 5 min; 0 silent routing failures over 20 scripted pairs; recompute ≤ 2 s"

And the work-package exit criterion from the implementation plan:

> **[06 §C.1](../specs/06_High_Level_Implementation_Plan.md#c1-retained-from-v1-planning-spine-tier-0) TASK-15 done-when:**  
> "≥ 2 of 3 finish briefing in ≤ 5 min"

---

## 2. Participant Briefing and Task

### 2.1 Participant Instructions (Read verbatim to participant)

> "Welcome. You are acting as an EVA traverse planner for a surface exploration mission on Mars.
>
> Your goal is to plan a 3-stop walking route starting from the habitat, verify that the route meets safety constraints, and generate a briefing card for the crew.
>
> You will start on the mission briefing screen. Click **Start planning** (please do not click 'Open demo plan', as that preloads an existing route).
>
> You are free to choose any stops or explore the map as you wish to complete the briefing. We will time the session from the moment you open the planning tool until you generate the final briefing card.
>
> Please think aloud as you go, sharing what you notice, what you expect, and anything that seems confusing."

### 2.2 Task Definition (Outcome only)

- **Starting point:** SCR-01 (`#/`) loaded with default scenario inputs (Gale Crater / Mt Sharp, Sol 4190, suited walking speed 3.3 km/h, dwell 20 min/stop, max duration 6 h, slope limit 15°).
- **Task goal:** Produce a 3-stop excursion route and open/generate the mission briefing card.
- **Independence:** The prompt does not name specific buttons, drawers, or map tools, so the task remains valid whether stops are placed via curated POIs or free placement (06 §D.4 cut 4).

---

## 3. Timing and End Conditions

- **Start of timing:** The timer starts immediately when the participant clicks **Start planning** on SCR-01 (or opens the workspace).
- **End condition:** `TODO(decision)`: Whether opening the briefing card (SCR-08) is sufficient to stop the clock, or whether the participant must click Print / Export JSON, and whether the plan status must be strictly `OK` or may include `OVER_LIMITS` / `PARTIAL` warning banners ([01 Clarifications](../specs/01_Product_Requirements_Document.md#clarifications) allows opening SCR-08 with warning banners).
- **Time cap:** 5 minutes (300 seconds). If 5 minutes elapse before the end condition is reached, the session is marked as incomplete (`Finished: No`, `Target met: Fail`).

---

## 4. Facilitator Rules

- **Help definition:** `TODO(decision)`: What interactions constitute "help".
  - **Permitted interactions:** Clarifying the original goal statement ("Your task is to plan a 3-stop route and create a briefing card"); answering questions about Mars context (e.g., "Yes, Gale Crater is the exploration zone"); taking notes.
  - **Forbidden interactions (counts as help):** Pointing at UI controls, explaining how to open layers or drawers, telling the participant where to click, or warning them about constraints before the tool does.
  - If the facilitator provides forbidden help to unblock a participant, the session continues to collect qualitative feedback, but the participant is recorded as `Help given: Yes` and fails the "without help" criterion.
- **Session stop conditions:**
  1. The participant produces the briefing card (end condition met).
  2. The 5-minute timer expires.
  3. The participant explicitly states they cannot proceed or gives up.
  4. An unrecoverable application crash or bug occurs (recorded as an application defect).

---

## 5. Participant Privacy and Recording Rules

To comply with project ethical standards and hackathon guidelines (06 §C TASK-17 rule):

1. **Anonymity:** Participants are identified only by code: `P1`, `P2`, `P3`.
2. **No personal identifying information:** Do not record names, emails, ages, or organizational affiliations.
3. **No media recordings:** Absolutely no photographs, audio recordings, or video recordings of participants' faces or likenesses. Only written facilitator notes and screen interaction timings are kept.
4. **Data storage:** Completed observation notes are summarized in `docs/ops/verification-log.md`.

---

## 6. Facilitator Reference Path (Confidential — do not show participant)

The expected standard path from [03 §C.1](../specs/03_App_Flow_and_Diagrams.md#c1-primary-end-to-end-journey-matches-prd-e):

1. **SCR-01 Mission Briefing:** Participant clicks **Start planning**.
2. **SCR-02 Map Workspace:** Map loads with habitat origin (wp-0) and exploration zone POIs.
3. **SCR-06 POI Inspector:** Participant clicks a POI, reviews details, and clicks **Add as stop** (repeated for 3 stops).
4. **SCR-05 Route Results Panel:** Compute worker evaluates route legs; display updates with status (`OK`), distance, walk time, and elevation profile.
5. **SCR-08 Briefing Card:** Participant navigates to Briefing (via top bar or results action), views the printable briefing sheet, and triggers export/print.

---

## 7. Results Recording Template

### Participant Log

| Participant | Date / Venue | Finished (≤ 5 min)? | Time (mm:ss) | Help Given? | Status at Finish | Target Met? |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | `TODO(decision)` | Yes / No | --:-- | No / Yes | OK / Other | Pass / Fail |
| P2 | `TODO(decision)` | Yes / No | --:-- | No / Yes | OK / Other | Pass / Fail |
| P3 | `TODO(decision)` | Yes / No | --:-- | No / Yes | OK / Other | Pass / Fail |

### Hesitations and Screen Issues

Record specific moments where participants paused, expressed confusion, or encountered usability friction:

| Participant | Screen ID | Element / Interaction | Observation / Quote | Severity (Blocks / Slows / Cosmetic) |
| --- | --- | --- | --- | --- |
| P1 | SCR-xx | | | |
| P2 | SCR-xx | | | |
| P3 | SCR-xx | | | |

---

## 8. Surface Ops (v2) Usability Criteria (Verbatim Quotes)

In accordance with [TASK-15 (T15.04)](../tasks/TASK-15_usability-test.md), the usability protocol is extended to cover the mission-critical Surface Ops (v2) criteria across the EVA tablet, HUD visor, and Ops console.

### 8.1 Technical Requirements Document ([02 §F.2](../specs/02_Technical_Requirements_Document.md#f2-test-plan-additions-v2))

> **[02 §F.2](../specs/02_Technical_Requirements_Document.md#f2-test-plan-additions-v2) Test plan additions (v2) — Usability row:**  
> "3 non-team users: HUD 3-s glance test; \"summon vehicle\" without instruction"

### 8.2 Product Requirements Document ([01 §B.2](../specs/01_Product_Requirements_Document.md#b2-success-criteria-all-proposed-unless-marked))

- **[01 FR-33](../specs/01_Product_Requirements_Document.md#fr-33--hud-mode-t1-m) HUD Acceptance:**
  > "all HUD values readable in ≤ 3 s by test users (B.2); passes contrast ≥ 7 : 1 against its background."

- **[01 FR-40](../specs/01_Product_Requirements_Document.md#fr-40--pressurized-rover-summon-and-rendezvous-t1-m) Rover Summon Behavior:**
  > "The rover routes on the grid with its own parameters (02 D.9). The rendezvous point minimises the time until both crew and rover are there. The EVA client shows the rendezvous point, both ETAs and the vehicle's route; ops sees the same. The rover moves only after the crew confirms (or ops confirms on their behalf)."

### 8.3 Design Brief ([04 §F.1](../specs/04_Design_Brief.md#f1-mission-critical-usability-checks-task-15))

> **[04 §F.1](../specs/04_Design_Brief.md#f1-mission-critical-usability-checks-task-15) Mission-critical usability checks (TASK-15):**  
>
> | Check | Pass |
> | --- | --- |
> | 3-s glance: read haven, O₂, next stop from HUD | ≥ 2 of 3 users |
> | Summon rover with gloves, no instruction | ≥ 2 of 3 users, < 15 s |
> | Ops: identify who is in danger and approve an option | ≥ 2 of 3 users, < 20 s |
> | Status recognisable in grayscale screenshot | 100 % of alert levels |

### 8.4 Mockup Handoff Protocol Extensions ([Mockup handoff §Usability test script for TASK-15](../design/mockup-handoff.md#usability-test-script-for-task-15))

> **[Mockup handoff](../design/mockup-handoff.md#usability-test-script-for-task-15):**  
>
> | ID | Task | Pass | Source |
> | --- | --- | --- | --- |
> | UT-6 | **Added:** rotate the phone mid-alert; point to haven and O₂ before and after rotating. | Both found again without searching (≥ 2 of 3): HAVEN is top-left in both, O₂ is the card right of it | New (G-24) |
> | UT-7 | **Added:** Nominal state on the EVA tablet with and without the status line in the alert slot: read haven, O₂ and next stop, then say what the top line means. | Reading time no worse than without the line by more than 0.5 s; ≥ 2 of 3 testers say what the line means | New (DV-03, U-43) |
> | UT-8 | **Added:** with gloves on a phone in landscape at a stop, tick the middle task, then skip the last, then undo; count mis-taps between the box, SKIP and UNDO. | ≥ 2 of 3 testers complete it in under 15 s with ≤ 1 mis-tap | New (FR-50, U-55) |
> | UT-9 | **Added:** open the full-screen map on a phone in landscape, zoom in once, then say HAVEN and O₂ without closing the map. | Both read within 3 s by ≥ 2 of 3 testers (the stacked cards stay at the left; check that 40 px is enough with gloves and glare) | New (G-42, G-48, U-60) |

---

## 9. Surface Ops (v2) Test Protocols

All tests use three non-team volunteer participants (P1–P3). For touch tests, participants wear thick simulated EVA suit gloves on a mobile device running offline.

### 9.1 HUD Visor 3-Second Glance Test (FR-33, 02 §F.2, 04 §F.1)

- **Surface:** SCR-13 HUD visor glance view (`#/eva?role=ev1&mode=hud`), pure black background, landscape orientation (≥ 640 px).
- **Objective:** Verify crew can read critical telemetry within ≤ 3 s under visor constraints.
- **Setup:** Display is concealed until timing begins.
- **Participant prompt (verbatim):** "Look at this display and read aloud: (1) your time to haven, (2) your oxygen margin, and (3) your bearing and distance to the next stop."
- **Procedure:** Uncover display and start stopwatch. Stop timer when all three values are spoken.
- **Pass rule ([04 §F.1](../specs/04_Design_Brief.md#f1-mission-critical-usability-checks-task-15), [06 §C.1](../specs/06_High_Level_Implementation_Plan.md#c1-retained-from-v1-planning-spine-tier-0)):** ≥ 2 of 3 participants read all three values in ≤ 3.0 s.

### 9.2 Summon Rover Without Instruction (FR-40, 02 §F.2, 04 §F.1)

- **Surface:** SCR-12 EVA tablet (`#/eva?role=ev1`), phone/tablet with participant wearing thick gloves.
- **Objective:** Verify crew can locate and execute the rover summon action without prior explanation.
- **Setup:** Client in NOMINAL walking state. `SUMMON ROVER` action button visible in bottom action row.
- **Participant prompt (verbatim):** "You need the pressurized rover to meet you. Summon the rover to your location."
- **Procedure:** Start stopwatch upon reading prompt. Participant must locate the `SUMMON ROVER` button and perform the 800 ms hold-to-confirm interaction. Do not explain hold-to-confirm.
- **Pass rule ([04 §F.1](../specs/04_Design_Brief.md#f1-mission-critical-usability-checks-task-15), [06 §C.1](../specs/06_High_Level_Implementation_Plan.md#c1-retained-from-v1-planning-spine-tier-0)):** ≥ 2 of 3 participants complete summon in < 15 s with gloves and 0 verbal prompts.

### 9.3 UT-8: Glove Task Interaction & Skip-Reason Check (U-55, FR-50)

- **Surface:** SCR-12 EVA tablet with stop task list open (`StopTaskList.tsx`), phone in landscape orientation at a stop.
- **Objective:** Verify task completion, skip reason capture (`time | terrain | alert | other`), and 5-s undo usability with thick gloves.
- **Participant prompt (verbatim):** "With your gloves on, mark the middle task as done, skip the last task, and then undo the skip."
- **Procedure:** Time execution from first touch until undo completes. Facilitator observes touch accuracy and counts any mis-taps between the checkbox square, the `SKIP` button, and the `UNDO` action.
- **Pass rule ([Mockup handoff](../design/mockup-handoff.md#usability-test-script-for-task-15), [06 §C.1](../specs/06_High_Level_Implementation_Plan.md#c1-retained-from-v1-planning-spine-tier-0)):** ≥ 2 of 3 participants complete the sequence in < 15 s with ≤ 1 mis-tap.

### 9.4 UT-9: Landscape Full-Screen Map Telemetry Check (U-60, 04 §E.5, G-48)

- **Surface:** SCR-12 EVA tablet (`#/eva?role=ev1`), phone in landscape orientation.
- **Objective:** Verify whether the stacked HAVEN and O₂ cards at 40 px (below the 56 px rule per U-60 / G-48) remain legible and quickly locatable while interacting with the full-screen map.
- **Participant prompt (verbatim):** "Tap FULL to open the full-screen map, zoom in once using the on-screen zoom control, and then tell me your haven time and oxygen percentage without closing the map."
- **Procedure:** Time from map opening until both values are correctly read.
- **Pass rule ([Mockup handoff](../design/mockup-handoff.md#usability-test-script-for-task-15), [06 §C.1](../specs/06_High_Level_Implementation_Plan.md#c1-retained-from-v1-planning-spine-tier-0)):** Both haven and oxygen are read within ≤ 3 s by ≥ 2 of 3 participants.

### 9.5 Ops Contingency Option Selection (04 §F.1)

- **Surface:** SCR-11 Ops Console (`#/ops`), desktop / projector resolution (≥ 1280 px).
- **Objective:** Verify flight controller can immediately identify crew member in danger during a radiation surge alert and approve an evacuation contingency option.
- **Setup:** Simulation triggers a radiation surge alert; SCR-14 Options panel opens beside tactical map with ranked options.
- **Participant prompt (verbatim):** "An alert just occurred. Identify which crew member is in danger and approve the recommended contingency option."
- **Procedure:** Time from prompt until 800 ms hold-to-confirm on `APPROVE_OPTION` completes.
- **Pass rule ([04 §F.1](../specs/04_Design_Brief.md#f1-mission-critical-usability-checks-task-15), [06 §C.1](../specs/06_High_Level_Implementation_Plan.md#c1-retained-from-v1-planning-spine-tier-0)):** ≥ 2 of 3 participants identify endangered crew and approve option in < 20 s.

---

## 10. Surface Ops (v2) Results Recording Template

### Participant V2 Matrix

| Participant | Test | Time (s) | Target Cap | Errors / Mis-taps | Help Given? | Target Met? |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | HUD 3-s glance (FR-33) | --.- s | ≤ 3.0 s | 0 | No / Yes | Pass / Fail |
| P1 | Summon rover with gloves (FR-40) | --.- s | < 15.0 s | 0 | No / Yes | Pass / Fail |
| P1 | UT-8 Glove task & skip (U-55) | --.- s | < 15.0 s | -- | No / Yes | Pass / Fail |
| P1 | UT-9 Landscape cards (U-60) | --.- s | ≤ 3.0 s | 0 | No / Yes | Pass / Fail |
| P1 | Ops contingency approval (04 §F.1) | --.- s | < 20.0 s | 0 | No / Yes | Pass / Fail |
| P2 | HUD 3-s glance (FR-33) | --.- s | ≤ 3.0 s | 0 | No / Yes | Pass / Fail |
| P2 | Summon rover with gloves (FR-40) | --.- s | < 15.0 s | 0 | No / Yes | Pass / Fail |
| P2 | UT-8 Glove task & skip (U-55) | --.- s | < 15.0 s | -- | No / Yes | Pass / Fail |
| P2 | UT-9 Landscape cards (U-60) | --.- s | ≤ 3.0 s | 0 | No / Yes | Pass / Fail |
| P2 | Ops contingency approval (04 §F.1) | --.- s | < 20.0 s | 0 | No / Yes | Pass / Fail |
| P3 | HUD 3-s glance (FR-33) | --.- s | ≤ 3.0 s | 0 | No / Yes | Pass / Fail |
| P3 | Summon rover with gloves (FR-40) | --.- s | < 15.0 s | 0 | No / Yes | Pass / Fail |
| P3 | UT-8 Glove task & skip (U-55) | --.- s | < 15.0 s | -- | No / Yes | Pass / Fail |
| P3 | UT-9 Landscape cards (U-60) | --.- s | ≤ 3.0 s | 0 | No / Yes | Pass / Fail |
| P3 | Ops contingency approval (04 §F.1) | --.- s | < 20.0 s | 0 | No / Yes | Pass / Fail |

### Summary of Pass / Fail Against 06 §C.1 (≥ 2 of 3)

| Criterion | Success Metric | Pass Count | Status |
| --- | --- | --- | --- |
| Tier 0: 3-stop briefing in ≤ 5 min (01 §B.2, 06 §C.1) | ≥ 2 of 3 finish in ≤ 300 s | - / 3 | Pending |
| HUD 3-s glance test (FR-33, 02 §F.2, 04 §F.1) | ≥ 2 of 3 finish in ≤ 3.0 s | - / 3 | Pending |
| Summon rover with gloves, no instruction (FR-40, 04 §F.1) | ≥ 2 of 3 finish in < 15.0 s | - / 3 | Pending |
| UT-8: Glove task & skip-reason check (U-55, FR-50) | ≥ 2 of 3 in < 15.0 s with ≤ 1 mis-tap | - / 3 | Pending |
| UT-9: Landscape cards check (U-60, 04 §E.5) | ≥ 2 of 3 finish in ≤ 3.0 s | - / 3 | Pending |
| Ops contingency approval (04 §F.1) | ≥ 2 of 3 finish in < 20.0 s | - / 3 | Pending |

---

## 11. Open Decisions

1. **`TODO(decision)`: Exact end condition (v1):** Does the timer stop upon rendering SCR-08 (Briefing card) on screen, or upon clicking Print / Download JSON?
2. **`TODO(decision)`: Help threshold:** Explicitly formalize whether confirming system state (e.g. "Yes, it is calculating") constitutes help.
3. **`TODO(decision)`: Recruiting venue:** Identity of testing venue (physical venue vs. remote screenshare, dependent on U-14).
4. **`TODO(decision)`: Glove specification (v2):** Define standard thickness/material of simulated suit gloves for UT-8 and summon tests (e.g. standard neoprene/work gloves simulating pressurized suit dexterity).
