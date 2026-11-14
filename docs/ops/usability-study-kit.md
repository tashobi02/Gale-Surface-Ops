# Human Usability Study Kit (`T15.02` / `T15.03`)

| | |
| --- | --- |
| **Owner** | Ridita Alam (R5 EVA & Ops UI · design system) |
| **Task** | [TASK-15](../tasks/TASK-15_usability-test.md) (`T15.02` execution, `T15.03` triage) |
| **Spec basis** | [01 §B.2](../specs/01_Product_Requirements_Document.md#b2-success-criteria-all-proposed-unless-marked) · [02 §F.2](../specs/02_Technical_Requirements_Document.md#f2-test-plan-additions-v2) · [04 §F](../specs/04_Design_Brief.md#f-accessibility-and-responsive-behavior) · [06 §C.1](../specs/06_High_Level_Implementation_Plan.md#c1-retained-from-v1-planning-spine-tier-0) · [Mockup handoff](../design/mockup-handoff.md#usability-test-script-for-task-15) |
| **Companion docs** | [Usability script](usability-script.md) · [Automated heuristic results](usability-results.md) · [Demo kit](demo-kit.md) · [Verification log](verification-log.md) |
| **Decisions** | `FD-156`–`FD-158`, `FD-540` ([Frontend decisions](../plan/frontend/decisions.md)) |

> **Scope note:** Automated browser heuristics (`10/10` cases in [usability-results.md](usability-results.md)) verify DOM reachability, target geometry (`>= 56 px` / `>= 8 px` gaps), contrast, grayscale lumas, and `800 ms` hold-to-confirm proxies. They do **not** replace this physical human study (`T15.02` stays `wip` until `P1`–`P3` sessions are completed and logged in [verification-log.md](verification-log.md)).

---

## 1. Pre-Session Hardware & Software Setup

Run all sessions offline on the local build (no internet, [NFR-01](../specs/01_Product_Requirements_Document.md)).

1. **Build and serve `gale_boxwork` + `storm-sol4190`:**
   - Run `npm run build` once, then start the local server (`make hab` or `npm run hab:local`) on `http://127.0.0.1:8080` (or laptop LAN IP for tablet/phone on the same local Wi-Fi).
   - Confirm `GET /api/health` returns `200` and disconnect external internet (airplane mode or Wi-Fi without WAN) if verifying strict offline operation.
2. **Devices required:**
   - **Desktop / laptop (`>= 1280x800`):** for `briefing-5-min` (`#/?site=gale_boxwork`) and `UT-3` Ops Console (`#/ops?site=gale_boxwork`).
   - **Touchscreen phone or tablet (`>= 844x390` landscape / `390x844` portrait):** for `UT-1` (`#/hud/EV1`), `UT-2`/`UT-5`/`UT-6`/`UT-7`/`UT-8`/`UT-9` (`#/eva/EV1`). Lock auto-rotate OFF until `UT-6`, then re-enable auto-rotate for `UT-6`.
   - **Grayscale reference (`UT-4`):** enable OS grayscale display filter or print monochrome screenshots of `WARNING`, `CAUTION`, `ADVISORY`, `NOMINAL`, and `UNKNOWN / LOST`.
   - **Stopwatch:** dedicated physical or separate-device timer (do not cover the test screen).
3. **Reset between participants (`P1` → `P2` → `P3`):**
   - Open a fresh browser window/tab (clear `sessionStorage` and `localStorage`) and return to `#/?site=gale_boxwork` before each participant begins.
   - Do **not** let upcoming participants watch earlier sessions.

---

## 2. Glove Specification & Sizes to Test (`FD-540`)

- **Glove type:** `>= 5 mm` insulated neoprene utility gloves (simulating EVA pressure-glove bulk and reduced fingertip sensitivity).
- **Sizes to have on hand and test across participants:**
  - **Small (`S` / size 7)** — snug fit for smaller hands (checks finger-spread reach across `56 px` targets).
  - **Medium (`M` / size 8–9)** — standard utility fit (checks normal `8 mm`–`10 mm` fingertip contact patch).
  - **Large (`L` / size 10–11)** — bulky palm/thumb overhang (worst-case adjacent-button mis-tap check on `8 px` gaps).
- **Pre-test touch check (before timing starts):** Have the participant tap a neutral blank area of the home screen or OS lock screen to confirm the glove registers capacitive touch on the test device (if the neoprene lacks conductive fingertips, attach a thin conductive-tape patch on the index fingertip and note it on the sheet). Do **not** preview or explain any EVA/planner button during this check.

---

## 3. Consent Line & Recording Protocol (`06 §C TASK-17`)

### 3.1 Eligibility

- Participant must be **outside the CheesySpace team**, a **first-time user** of Gale Surface Ops (`01 §B.2`), and **18 years or older** (`06 §C TASK-17`).

### 3.2 Consent Line (Read Verbatim Before Starting)

> "You are volunteering to test a Mars surface-operations software prototype called Gale Surface Ops. We are evaluating the software, not you—if something is hard to find or unclear, that is a flaw in our interface.
>
> We will assign you an anonymous code (`P1`, `P2`, or `P3`) and record only stopwatch times, task completion, mis-taps, and written notes of what you say or notice. We will not record your name, age, email, voice, photograph, or video.
>
> You may pause or stop at any time. Do you confirm you are 18 or older and consent to participate under these conditions?"

Only proceed if the participant answers **Yes** and tick the consent box on the Printable Result Sheet.

### 3.3 Recording Protocol

1. Label sheets strictly `P1`, `P2`, `P3` (zero names, initials, faces, photos, audio, or video).
2. During tasks, record **stopwatch split times**, **help-given status**, **mis-taps**, and **verbatim hesitations** tagged with the screen ID (`SCR-01`..`SCR-20`).
3. Do **not** coach, point at controls, or explain hidden gestures (such as the `800 ms` hold-to-confirm). If a participant is completely stuck and asks for help, wait 10 s; if they still cannot proceed, you may unblock them only after marking `Help given: Yes` (that task counts as **Fail**).
4. After all three sessions finish, transfer the raw sheets verbatim into a new `## T15.02 — Run three sessions; record times and issues` section in [verification-log.md](verification-log.md), and triage every logged issue into `T15.03` (`Blocks | Slows | Cosmetic`).

---

## 4. Exact Task List, Moderator Script & Timing Points

Run the tasks in this exact order for each participant (`P1`, `P2`, `P3`). Keep the expected path confidential.

### Task 0 — `briefing-5-min`: 3-Stop Traverse Briefing (Tier 0, `01 §B.2`, `06 §C.1`)

- **Surface & Setup:** Desktop (`>= 1280x800`), `#/?site=gale_boxwork` (`SCR-01`), default scenario inputs, bare hands.
- **Moderator prompt (read verbatim):**
  > "Welcome. You are acting as an EVA traverse planner for a Mars mission. Your goal is to plan a 3-stop walking route starting from the habitat, check that it meets safety constraints, and open a briefing card for the crew. Start by clicking **Start planning**—please do not click 'Open demo plan'. Please think aloud as you work."
- **Timing points:**
  - **Start:** Moment participant clicks **Start planning** on `SCR-01`.
  - **Stop:** Moment `SCR-08` renders a computed 3-stop briefing card (`OK`, `OVER_LIMITS`, or `PARTIAL` all count per `FD-540`).
- **Time cap & Pass rule:** `<= 300.0 s` (`5 min`), `Help given: No`; `>= 2 of 3` participants pass.

### Task 1 — `UT-1`: HUD 3-Second Glance (`FR-33`, `02 §F.2`, `04 §F.1`)

- **Surface & Setup:** Landscape device (`>= 640 px`, e.g., `844x390`), `#/hud/EV1?site=gale_boxwork` (`SCR-13`), active warning state. Keep screen concealed (covered or turned away) until timing starts.
- **Moderator prompt (read verbatim):**
  > "When I uncover this visor display, read aloud three things: (1) your time to haven, (2) your oxygen percentage, and (3) your bearing and distance to the next stop."
- **Timing points:**
  - **Start:** Moment the screen is uncovered in front of the participant.
  - **Stop:** Moment all three values are spoken accurately aloud.
- **Time cap & Pass rule:** `<= 3.0 s`, `Help given: No`; `>= 2 of 3` participants pass.

### Task 2 — `UT-2` & `UT-5`: Gloved Rover Summon + Portrait/Landscape Parity (`FR-40`, `02 §F.2`, `04 §F.1`)

- **Surface & Setup:** Phone/tablet with **gloves ON** (`>= 5 mm` neoprene), `#/eva/EV1?site=gale_boxwork` (`SCR-12`) in **landscape** (`844x390`) for `UT-2`, then repeat/verify **portrait** (`390x844`) for `UT-5`. Simulation in `WALKING` state. Do **not** mention "press and hold 800 ms".
- **Moderator prompt (read verbatim):**
  > "With your gloves on, you need the pressurized rover to meet you. Summon the rover to your location."
  > *(For `UT-5` portrait check: rotate device to portrait and prompt: "Now summon the rover and show how you would abort to hab from this screen.")*
- **Timing points:**
  - **Start:** Moment the moderator finishes reading the prompt.
  - **Stop:** Moment the rover summon confirmation completes (`PR1 dispatched` / command accepted).
- **Time cap & Pass rule:** `< 15.0 s`, `Help given: No` (`>= 2 of 3` participants pass); verify same action count in both orientations (`UT-5`).

### Task 3 — `UT-6`: Mid-Alert Phone Rotation (`04 §E.5`, `Mockup UT-6`)

- **Surface & Setup:** Phone with auto-rotate ON (or manual resize), `#/eva/EV1?site=gale_boxwork` with an active `WARNING` alert, gloves ON.
- **Moderator prompt (read verbatim):**
  > "Point to your haven time and your oxygen level. Now rotate the phone upright, and point to haven and oxygen again."
- **Timing points:**
  - **Start / Stop:** Qualitative orientation check—observe whether participant locates `HAVEN` (top-left) and `O2` (immediately right) without searching.
- **Pass rule:** Both values found immediately before and after rotating without searching (`>= 2 of 3` participants pass).

### Task 4 — `UT-7`: Nominal Status Line Comprehension (`FD-022`, `04 §D.2`, `Mockup UT-7`)

- **Surface & Setup:** Phone in landscape, `#/eva/EV1?site=gale_boxwork` with **no active alerts** (`NOMINAL` line visible in top alert slot).
- **Moderator prompt (read verbatim):**
  > "Read aloud your haven time, oxygen level, and next stop. Then tell me in your own words what the top bar line means."
- **Timing points:**
  - **Start:** Moment prompt ends / screen presented.
  - **Stop:** Moment haven, O₂, next stop, and explanation of `NOMINAL` are spoken.
- **Pass rule:** `>= 2 of 3` participants explain accurately what the top `NOMINAL` line means and reading time does not degrade (`<= +0.5 s` vs alert-free baseline).

### Task 5 — `UT-8`: Gloved Stop Task Tick, Skip, Reason & Undo (`U-55`, `FR-50`, `Mockup UT-8`)

- **Surface & Setup:** Phone in landscape (`844x390`), **gloves ON**, `#/eva/EV1?site=gale_boxwork` in `AT_STOP` state with 3 stop tasks (`TASKS 0/3` opened).
- **Moderator prompt (read verbatim):**
  > "With your gloves on, mark the middle task as done, skip the last task, check or cycle the skip reason if shown, and then undo the skip."
- **Timing points:**
  - **Start:** Moment participant makes first touch toward the task list.
  - **Stop:** Moment undo completes and the skipped task reverts to its prior state.
- **Time cap & Pass rule:** `< 15.0 s` AND `<= 1` mis-tap (count every tap that misses its intended box/button or hits an unintended control); `>= 2 of 3` participants pass.

### Task 6 — `UT-9`: Landscape Full-Screen Map Zoom & Stacked Card Read (`U-60`, `04 §E.5`, `Mockup UT-9`)

- **Surface & Setup:** Phone in landscape (`844x390`), **gloves ON**, `#/eva/EV1?site=gale_boxwork`.
- **Moderator prompt (read verbatim):**
  > "Open the full-screen map, zoom in once using the on-screen control, and then tell me your haven time and oxygen percentage without closing the map."
- **Timing points:**
  - **Start:** Moment full-screen map finishes opening (or prompt ends if participant taps open).
  - **Stop:** Moment participant reads both HAVEN and O₂ aloud after zooming once.
- **Time cap & Pass rule:** `<= 3.0 s` after zoom (record total from open and post-zoom read), `>= 2 of 3` participants pass.

### Task 7 — `UT-3`: Ops Danger Identification & Option Approval (`FR-31`, `FR-38`, `04 §F.1`)

- **Surface & Setup:** Desktop (`>= 1280x800`), `#/ops?site=gale_boxwork` (`SCR-11`), bare hands, active `WARNING` alert with `SCR-14` Options panel populated.
- **Moderator prompt (read verbatim):**
  > "An alert just occurred. Tell me which crew member is in danger and approve the recommended contingency option."
- **Timing points:**
  - **Start:** Moment alert / prompt is presented.
  - **Stop:** Moment participant names the crew member (`EV1`) AND completes the `800 ms` hold-to-confirm on `Approve option 1`.
- **Time cap & Pass rule:** `< 20.0 s`, `Help given: No`; `>= 2 of 3` participants pass.

### Task 8 — `UT-4`: Grayscale Status Recognition (`04 §A.3 #2`, `04 §F.1`)

- **Surface & Setup:** Monochrome / grayscale screenshots or OS grayscale mode showing `WARNING`, `CAUTION`, `ADVISORY`, `NOMINAL`, and `UNKNOWN / LOST`.
- **Moderator prompt (read verbatim):**
  > "Looking at each grayscale state without colour, name the alert or status level of each screen."
- **Timing points:** Untimed comprehension check (note hesitation if any).
- **Pass rule:** `100 %` of alert levels (`WARNING`, `CAUTION`, `ADVISORY`) identified accurately by shape + word + shade (`04 §F.1`).

---

## 5. Printable Result Sheet (Copy One Per Participant)

```text
================================================================================
GALE SURFACE OPS — HUMAN USABILITY RESULT SHEET (TASK-15 / T15.02)
================================================================================
Participant Code (no names/PII):  [ ] P1   [ ] P2   [ ] P3
Date: ____-__-__    Venue: [ ] Local hardware   [ ] Virtual + local tablet
Age >= 18 & Consent Read Verbatim: [ ] Yes (proceed)   [ ] No (do not run)
Privacy Confirmed (no photos, no video, no audio, no PII): [ ] Confirmed

Build / Bundle Check:
  Site: gale_boxwork    Scenario: storm-sol4190    Offline confirmed: [ ] Yes

Neoprene Glove Check (>= 5 mm, FD-540):
  Size tested: [ ] S (7)   [ ] M (8-9)   [ ] L (10-11)
  Conductive tip patch needed? [ ] No   [ ] Yes (describe: ____________________)

--------------------------------------------------------------------------------
TASK LOG (Tick Pass/Fail ONLY from measured stopwatch time & observation)
--------------------------------------------------------------------------------
[ ] Task 0 (briefing-5-min, <= 300.0 s, 0 help):
    Time: ____m ____s   End status: [ ] OK  [ ] OVER_LIMITS  [ ] PARTIAL  [ ] None
    Help given? [ ] No  [ ] Yes   Result: [ ] Pass   [ ] Fail

[ ] Task 1 (UT-1 HUD 3-s glance, <= 3.0 s):
    Time: ____.__ s     Read all 3 (Haven, O2, Next)? [ ] Yes  [ ] No
    Help given? [ ] No  [ ] Yes   Result: [ ] Pass   [ ] Fail

[ ] Task 2 (UT-2/UT-5 Gloved Summon + Portrait parity, < 15.0 s):
    Landscape time: ____.__ s   Found hold without hint? [ ] Yes  [ ] No
    Portrait Summon/Abort parity OK? [ ] Yes  [ ] No
    Help given? [ ] No  [ ] Yes   Result: [ ] Pass   [ ] Fail

[ ] Task 3 (UT-6 Mid-alert rotation):
    HAVEN top-left & O2 right found before/after without search? [ ] Yes  [ ] No
    Result: [ ] Pass   [ ] Fail

[ ] Task 4 (UT-7 Nominal status line):
    Telemetry read cleanly? [ ] Yes  [ ] No   Delta vs baseline: ____.__ s
    Explained NOMINAL meaning accurately? [ ] Yes  [ ] No
    Result: [ ] Pass   [ ] Fail

[ ] Task 5 (UT-8 Gloved stop task tick, skip, reason, undo, < 15.0 s, <= 1 mis-tap):
    Time: ____.__ s   Mis-tap count: ____   Help given? [ ] No  [ ] Yes
    Result: [ ] Pass   [ ] Fail

[ ] Task 6 (UT-9 Landscape full-screen map zoom + read HAVEN & O2, <= 3.0 s):
    Post-zoom read time: ____.__ s   40 px cards legible? [ ] Yes  [ ] No
    Help given? [ ] No  [ ] Yes   Result: [ ] Pass   [ ] Fail

[ ] Task 7 (UT-3 Ops danger ID & option approval, < 20.0 s):
    Time: ____.__ s   Named endangered crew? [ ] Yes  [ ] No
    Help given? [ ] No  [ ] Yes   Result: [ ] Pass   [ ] Fail

[ ] Task 8 (UT-4 Grayscale status recognition, 100 % alert levels):
    Identified: [ ] WARNING  [ ] CAUTION  [ ] ADVISORY  [ ] NOMINAL  [ ] UNKNOWN
    Result: [ ] Pass   [ ] Fail

--------------------------------------------------------------------------------
HESITATIONS, MIS-TAPS & SCREEN ISSUES (Tag every issue with SCR-xx for T15.03)
--------------------------------------------------------------------------------
1. Screen: SCR-____ | Severity: [ ] Blocks [ ] Slows [ ] Cosmetic
   Note: _______________________________________________________________________
2. Screen: SCR-____ | Severity: [ ] Blocks [ ] Slows [ ] Cosmetic
   Note: _______________________________________________________________________
3. Screen: SCR-____ | Severity: [ ] Blocks [ ] Slows [ ] Cosmetic
   Note: _______________________________________________________________________
================================================================================
```

### Cohort Tally Sheet (Complete After `P1`–`P3`)

| Criterion | Pass Rule (`06 §C.1` / `04 §F.1`) | `P1` | `P2` | `P3` | Tally (`n/3`) | Cohort Result |
| --- | --- | --- | --- | --- | --- | --- |
| `briefing-5-min` (Tier 0) | `>= 2 of 3` in `<= 300 s`, 0 help | `[ ]` | `[ ]` | `[ ]` | `__ / 3` | `[ ] Pass  [ ] Fail` |
| `UT-1` HUD 3-s glance | `>= 2 of 3` in `<= 3.0 s` | `[ ]` | `[ ]` | `[ ]` | `__ / 3` | `[ ] Pass  [ ] Fail` |
| `UT-2` Gloved rover summon | `>= 2 of 3` in `< 15.0 s`, 0 help | `[ ]` | `[ ]` | `[ ]` | `__ / 3` | `[ ] Pass  [ ] Fail` |
| `UT-3` Ops danger ID + approve | `>= 2 of 3` in `< 20.0 s`, 0 help | `[ ]` | `[ ]` | `[ ]` | `__ / 3` | `[ ] Pass  [ ] Fail` |
| `UT-4` Grayscale status naming | `100 %` of alert levels named | `[ ]` | `[ ]` | `[ ]` | `__ / 3` | `[ ] Pass  [ ] Fail` |
| `UT-5` Landscape/portrait parity | `>= 2 of 3` equal steps + no mis-tap | `[ ]` | `[ ]` | `[ ]` | `__ / 3` | `[ ] Pass  [ ] Fail` |
| `UT-6` Mid-alert rotation | `>= 2 of 3` locate HAVEN & O₂ directly | `[ ]` | `[ ]` | `[ ]` | `__ / 3` | `[ ] Pass  [ ] Fail` |
| `UT-7` Nominal status line | `>= 2 of 3` explain line; `<= +0.5 s` | `[ ]` | `[ ]` | `[ ]` | `__ / 3` | `[ ] Pass  [ ] Fail` |
| `UT-8` Gloved task/skip/undo | `>= 2 of 3` in `< 15.0 s`, `<= 1` mis-tap | `[ ]` | `[ ]` | `[ ]` | `__ / 3` | `[ ] Pass  [ ] Fail` |
| `UT-9` Landscape full-map 40 px | `>= 2 of 3` read HAVEN & O₂ in `<= 3.0 s` | `[ ]` | `[ ]` | `[ ]` | `__ / 3` | `[ ] Pass  [ ] Fail` |

After finishing `P1`–`P3`, append the completed `## T15.02` section to [verification-log.md](verification-log.md) and triage every logged issue under `T15.03`.
