# Usability Test Script: 3-Stop Traverse Briefing in ≤ 5 min

| | |
| --- | --- |
| **Owner** | Ridita Alam (R5 EVA & Ops UI · design system) |
| **Task** | [TASK-15](../tasks/TASK-15_usability-test.md) (T15.01) |
| **Date** | 2026-11-07 |
| **Status** | Script draft for pilot and volunteer sessions |
| **Related** | [01 §B](../specs/01_Product_Requirements_Document.md#b2-success-criteria-all-proposed-unless-marked) · [01 §E](../specs/01_Product_Requirements_Document.md#e-core-demonstration-scenario) · [03 §C.1](../specs/03_App_Flow_and_Diagrams.md#c1-primary-end-to-end-journey-matches-prd-e) · [06 §C.1](../specs/06_High_Level_Implementation_Plan.md#c1-retained-from-v1-planning-spine-tier-0) |

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

## 8. Open Decisions

1. **`TODO(decision)`: Exact end condition:** Does the timer stop upon rendering SCR-08 (Briefing card) on screen, or upon clicking Print / Download JSON?
2. **`TODO(decision)`: Help threshold:** Explicitly formalize whether confirming system state (e.g. "Yes, it is calculating") constitutes help.
3. **`TODO(decision)`: Recruiting venue:** Identity of testing venue (physical venue vs. remote screenshare, dependent on U-14).
