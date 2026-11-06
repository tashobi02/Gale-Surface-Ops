# Single source for the handoff: used by fixture.py (prototype "Handoff notes" page) and gen_doc.py (docs/design/mockup-handoff.md).
GAPS = [
 ("G-01", "04 §E.5, §F Responsive row; 01 FR-32", "EVA is portrait-only in the specs; the team now wants landscape.", "Added as a **Proposed** deviation with draft patch text (see Deviations) and Unresolved U-30."),
 ("G-02", "04 §D.1 vs §A.3 #4 / §E.5", "Alert bar is \"hidden\" when nominal, but fixed geography says top and \"fixed, 64 px\".", "The 64 px slot is always reserved. On the EVA tablet it shows a quiet status line when there is no alert (team feedback 2026-11-05, DV-03); ops and HUD keep it empty. The alert bar replaces the line in the same slot, so nothing shifts."),
 ("G-03", "02 §E.6 EVENT; 05 Warning.severity vs 04 §C.1", "`severity:\"blocked\"` and `caution|blocked|unknown` versus the rename `blocked → warning`; 05 Alert.level uses warning/caution/advisory.", "Runtime alerts use 05 `level`; planner warnings keep 05's enum and render as the ⬣ warning icon."),
 ("G-04", "05 §F.6 vs 04 §D.2", "Log example \"Radiation surge — shelter now\" vs the action — reason grammar.", "04 wins: \"Shelter now — radiation surge\". 05 §F.6 should be corrected."),
 ("G-05", "04 §E.4/E.5 vs 05 Crew, 02 §C.5 L9", "Dose shown in mGy; the schema stores µGy and forbids Sv conversion.", "Literal example strings in the prototype; the unit formatter is a TASK-24 item."),
 ("G-06", "04 §E.4 vs §E.5", "EV1 dose 0.0 mGy vs 0.1 mGy at apparently the same moment.", "0.0 before the alert, 0.1 from the alert; both cited."),
 ("G-07", "04 §D.3 vs 01 §E.1", "Confirmation copy says \"ETA 12 min\"; the rendezvous option is 14 min.", "14 min used."),
 ("G-08", "04 §D.2 vs 03 §C.6 step 7", "\"Comm shadow in 120 m — stay with EV2\" vs \"Comm shadow ahead — …\".", "First is the caution-bar text; second is the journey label."),
 ("G-09", "03 §B, 04 §B.2", "No mode named for SCR-00 or SCR-18.", "SCR-00 = OPS (**Proposed**); SCR-18 inherits the host mode."),
 ("G-10", "03 §B SCR-05", "States row omits Over limits although the content and 03 §E.4 include it.", "Added."),
 ("G-11", "04 §E.10 vs team codes", "\"Number is the POI's order in pois.geojson\" vs codes SCI 01 / RES 02 / ENG 01 that look per-type.", "The three codes used as given. Unresolved U-34."),
 ("G-12", "01 §E.1 + 04 §E.5", "Only stop 2 (resource) and stop 3 (Boxwork ridge) are fixed.", "Stop 1 = EZ—ENG 01 with a placeholder name (**Proposed**)."),
 ("G-13", "02 §E.2 / §E.6 vs 05 §F.1–F.3", "Illustrative coordinates disagree (boxwork at 2410/−1875 vs 410/325; hab −1800/−1500).", "Map is schematic; metre coordinates only for the 02 §E.2 sample and the 05 §F.1 hab."),
 ("G-14", "02 §E.6 vs 04", "Snapshot haven 18.4 min vs 14 min; `sim_time` 13:05Z vs LTST 13:05 (different clocks).", "14 min used; UTC and LTST kept separate and labelled."),
 ("G-15", "04 §C.1", "PRINT defines only four colours.", "Neutral print tokens added as **Proposed** (text-2, edge, hairline, advisory, unknown). Unresolved U-33."),
 ("G-16", "04 §C.1", "\"⬣ octagon\": U+2B23 is a hexagon.", "An octagon is drawn, per the word."),
 ("G-17", "03 SCR-13 vs 04 §E.6", "\"Five values\" vs a diagram that also shows STOP 3, 5:41 LEFT, SIM.", "Those are sub-labels of the five values (**Proposed** reading)."),
 ("G-18", "Artifact host vs 03 §A", "The host only passes plain `#name` hashes, not `#/path`.", "Router accepts both; links use `#scr-12-walking-landscape`; the UI shows the 03 §A route."),
 ("G-19", "04 §G vs prototype brief", "Google Fonts in a prototype vs offline self-hosted WOFF2 in product.", "Prototype only. Product self-hosts WOFF2; licences pending (U-27, U-40)."),
 ("G-20", "04 §F", "\"ops < 1024 shows a notice\" vs a requested 1024 preview.", "1024 shows one-drawer mode; a 900 px frame shows the notice."),
 ("G-21", "04 §C.6 / §D.5", "The brief's own prose says \"live values\".", "Documentation wording only; UI copy says replayed / simulated / computed."),
 ("G-22", "04 §E.7 vs landscape SCR-14", "A right panel at 60 % width would have covered the O₂ block (first landscape layout).", "Superseded by landscape v2: the panel covers only the map column (about 53 %), so HAVEN, O₂ and NEXT stay visible and no echo is used."),
 ("G-23", "Unresolved numbering", "04's last ID is U-27, but U-28 and U-29 are used by 03.", "New items start at U-30."),
 ("G-24", "EVA landscape \"quadrant\" invariance", "With the two compact cards top-left and the map on the whole right column, strict screen quadrants cannot hold for O₂, NEXT and the mini-map.", "Exact for alert slot, HAVEN (top-left), metadata strip and action row. O₂ moves from top-right (portrait) to beside HAVEN (landscape) but stays immediately right of HAVEN on the same row in both; NEXT and the map reflow. Measured on the Orientation compare page. U-30."),
 ("G-25", "03 §C.6 steps 7–8 vs 04 §D.2", "Crew are said to see the caution and the advisory, but there is one bar slot and the highest level wins.", "A latched warning hides them behind \"+N\"; the demo auto-opens the alert list. Unresolved U-32."),
 ("G-26", "04 §E.6 vs §D.2 / §C.2", "HUD alert shown in uppercase; alerts are sentence case and must read the same on every device.", "Sentence case. **Proposed**."),
 ("G-27", "04 §C.1", "Advisory and unknown share the dotted diamond.", "They differ by inner glyph (i vs ?) and word. Check in TASK-15 (U-41)."),
 ("G-28", "04 §C.2", "Microcopy is 11 px but the rule says minimum 12 px anywhere.", "11 px for chips and module labels only; values and body never below 12 px (EVA 16 px)."),
 ("G-29", "04 §F vs §E.5", "An EVA high-contrast toggle is required but the layout has no slot for it.", "Prototype: toggle in the frame chrome. Product placement Unresolved U-31."),
 ("G-30", "04 §E.5 addition (FR-50) vs landscape layout", "\"At a stop the NEXT card becomes the task list\", but on a phone in landscape the NEXT card is 110 px high and four 56 px rows need about 260 px.", "A labelled TASKS button in the NEXT card header toggles the list into the map column (phone landscape); the NEXT card stays. On tablets and in portrait the list takes the NEXT position as specified. U-51."),
 ("G-31", "Team suggestion vs 04 §A.3 #9", "A hamburger icon to open the list; 04 §A.3 #9 says no hamburger menus or hidden controls in OPS/EVA, and replacing the left column would hide HAVEN and O₂ (FR-50: tasks never move them).", "A labelled button (icon + word + count) instead; the list never replaces HAVEN or O₂. U-51."),
 ("G-32", "04 §E.5 addition vs 04 §C.1", "\"■ done\" uses the same filled square that 04 §C.1 assigns to the MEASURED provenance chip.", "Done is a square with a check mark drawn in it, plus the word DONE; skipped and dropped are ⊘ plus the word. No status colour."),
 ("G-33", "FR-50", "Skip needs a reason (time | terrain | alert | other) but is \"one tap\" with no hold.", "One tap on SKIP records reason `other`; the 5-s undo strip has one REASON control that cycles time → terrain → alert → other. U-55."),
 ("G-34", "FR-50 honesty rule vs interactive ticks", "Counts must come from declared states and not be computed, yet a tap changes them.", "The fixture declares a number object for every count and build-time lookup tables (`counts`, `done_total`, `total_all`) keyed by the task-state strings; the runtime only looks values up. The product will compute counts from the task list. U-53."),
 ("G-35", "03 SCR-13 / 04 §E.6 five-value rule vs FR-50", "A task count would be a sixth HUD value.", "Left off the HUD, which keeps its five values. It could become part of the \"STOP 3\" sub-label if G-17 is accepted. U-54."),
 ("G-36", "FR-50 vs 04 §E.5 strip", "\"Not synced\" must show in the metadata strip, which is already full in portrait.", "A NOT SYNCED pill replaces the NO LINK + age pill (the age stays on the HAVEN card and the alert slot says no hab link)."),
 ("G-37", "FR-50 vs 04 §E.5 addition", "FR-50 shows \"Stop 2 · tasks 1/3\" while walking; 04 shows TASKS 0/3.", "Walking shows the count for the next stop (0/3)."),
 ("G-38", "FR-50", "1–4 tasks per stop vs ops ADD_STOP_TASK.", "Add task is disabled when the stop already has four tasks for that crew, with the reason shown."),
 ("G-39", "FR-50", "Only dropped stops drop their open tasks, but an abort cuts the current stop short.", "Open tasks at the current stop and at later stops become DROPPED when the rendezvous plan revision is made (**Proposed**). U-56."),
 ("G-40", "FR-50 vs 04 §D.2", "\"During an alert the list collapses to its count\", but a warning stays latched after acknowledgement.", "The list collapses while the options sheet is open or a warning is unacknowledged; once acknowledged and executing (To haven) a read-only list is available. U-59."),
 ("G-41", "01 §E.1", "The killer-demo table has no beat for a task tick.", "A new beat at 0:05 (Proposed slot; 1:05 in the 240-s track). The timing of every existing beat is unchanged (tested)."),
 ("G-42", "Team request vs 04 §E.5", "04 §E.5 has a mini-map only; the team wants a full-screen map, and full screen must not hide the fixed geography.", "The map fills the body. Landscape: HAVEN and O₂ stack at the left as smaller cards (HAVEN keeps the top-left origin) and the map takes at least 80 % of the width; portrait keeps the cards in their row. The alert slot, strip and action row never move (measured). A warning closes the full map. U-57, U-60."),
 ("G-43", "04 §A.3 #9", "Pan and zoom are naturally gestures; gesture-only paths are forbidden.", "On-screen +, −, FIT, FOLLOW, LAYERS and CLOSE buttons (≥ 56 px, with words) are the primary path; drag, wheel and pinch are extras. Pinch is implemented but not tested on touch hardware."),
 ("G-44", "04 §F keyboard row", "The planner zoom and pan were keyboard-only and the ops map had no zoom or pan (found by the team).", "Zoom buttons, drag pan and wheel zoom added to the planner; zoom buttons, drag, wheel and Slope / Thermal inertia toggles added to the ops map."),
 ("G-45", "03 SCR-08", "Adding each stop's tasks pushed the briefing card past one A4 page.", "Trimmed to fit all three states: map snapshot 300 → 235 px, profile 70 → 56 px, tasks table set compact (10 px). Nothing was removed."),
 ("G-46", "Found while building", "The Partial briefing banner's status icon was unconstrained and made the page 713 px taller.", "Fixed: every status icon now has a default size."),
 ("G-47", "FR-50", "The text promises \"a total\" on the ops crew card without saying a total of what.", "Total = tasks done of tasks planned for that crew across the whole plan, looked up from `done_total` and `total_all`; there is no grand total across crews."),
 ("G-48", "04 §A.3 #4 and #5 vs the team request", "The team asked for the cards stacked at the left and smaller in the landscape full-screen map: O₂ is no longer beside HAVEN there, and the values fall from 56 px (64 px on tablets) to 40 px (48 px), below the 56 px minimum for HAVEN and O₂. They stay above the 32 px EVA minimum and remain the biggest numbers on screen.", "Applied to the landscape full-screen map only; the normal layout and portrait are unchanged. HAVEN keeps the top-left origin. U-60.")
]
DEVIATIONS = [
 ("DV-01", "EVA tablet orientation", "04 §E.5 portrait only; 04 §F \"EVA 360–1024 px portrait\"; 01 FR-32 \"in portrait\"", "Portrait **or** landscape; default landscape. Landscape v2: HAVEN and O₂ are two compact cards top-left, NEXT sits under them, and the mini-map takes the whole right column. Budget at 844×390: alert 64 · body 230 · strip 24 · one action row 72 = 390 px.", "Proposed — ratify via U-30"),
 ("DV-02", "SCR-14 in landscape", "04 §E.7 \"bottom sheet covering 70 % of the screen\"", "Right-side panel over the map column (about 53 % of the width, not 60 %, so that both cards and NEXT stay visible), below the alert bar; \"Go — option N\" hold button at the panel bottom. No O₂ echo is needed (G-22 superseded).", "Proposed"),
 ("DV-03", "EVA alert slot when there is no alert", "04 §D.1 \"Hidden (dark cockpit)\"; 04 §A.3 \"nominal is quiet\"", "The 64 px slot stays reserved and shows a quiet status line on the EVA tablet: status icon + word (NOMINAL, STANDBY, EVA ENDED) + detail + current phase. The alert bar replaces it in the same slot the moment an alert is raised. Ops and HUD still leave the slot empty (G-02).", "Proposed — U-43"),
 ("DV-04", "HUD alert casing", "04 §E.6 uppercase", "Sentence case, identical words on ops, EVA and HUD (G-26).", "Proposed"),
 ("DV-05", "High-contrast alert bars", "04 §F: HC switches to the HUD palette", "White on warning-fill is 6.54 : 1 (< 7 : 1), so HC bars are black with a 4 px status-colour outline and status-colour text.", "Proposed — U-37"),
 ("DV-06", "EVA high-contrast toggle location", "04 §F requires the toggle; §E.5 has no slot", "Frame-chrome toggle in the prototype (G-29).", "Unresolved — U-31"),
 ("DV-07", "PRINT neutral tokens", "04 §C.1 lists four PRINT colours", "Added text-2 #4B5563, edge #6B7280, hairline #D1D5DB, advisory #1D4ED8, unknown #6D28D9 (G-15).", "Proposed — U-33"),
 ("DV-08", "Comm-shadow layer in the prototype", "02 §C.5 L11 / §D.11 viewshed", "Hand-placed schematic polygons; the real layer comes from comm_hab.u8 (TASK-03).", "Prototype only"),
 ("DV-09", "Route hash forms", "03 §A `#/planner` …", "Plain `#name` forms accepted and used in links (G-18).", "Prototype only"),
 ("DV-10", "Sound default", "04 §C.7 mute toggle with SOUND OFF indicator", "Prototype starts muted so many frames do not alarm; toggle shows SOUND ON / SOUND OFF.", "Prototype only — U-38"),
 ("DV-11", "Fonts and icons", "04 §G self-hosted WOFF2; Lucide", "Google Fonts with fallback stacks and an own icon set in the prototype (G-19).", "Prototype only — U-27, U-40"),
 ("DV-12", "Task list placement on a phone in landscape", "04 §E.5 addition: the NEXT card becomes the list", "TASKS button in the NEXT header; the list takes the map column on phone landscape, the NEXT position on tablets and in portrait (G-30, G-31).", "Proposed — U-51"),
 ("DV-13", "Full-screen map and map controls", "04 §E.5 mini-map only", "Tap or FULL expands the map with labelled controls and layers. Landscape: HAVEN and O₂ stack at the left as smaller cards (values 40 px on phones, 48 px on tablets, below the 56 px rule) and the map takes at least 80 % of the width; portrait is unchanged; the alert slot, strip and action row never move; a warning closes it (G-42, G-43, G-48).", "Proposed — U-57, U-60"),
 ("DV-14", "Map zoom, pan and layers on ops and planner", "04 §F keyboard row only", "On-screen zoom buttons, drag, wheel, and Slope / Thermal inertia on ops (G-44).", "Proposed"),
 ("DV-15", "Task rows use neutral chrome only", "04 §C.1 provenance chips; status colours", "Check-in-square, ⊘ and words instead of a green tick (G-32); one REASON control instead of four chips (G-33).", "Proposed — U-55"),
 ("DV-16", "Briefing card trims", "03 SCR-08 one A4 page", "Map snapshot, profile and the tasks table were made smaller to keep one page (G-45).", "Proposed")
]
PATCH_E5 = """### E.5 SCR-12 EVA tablet (OPS, phone/tablet, portrait or landscape, short side ≥ 360 px)

**Portrait** (unchanged):

```text
┌──────────────────────────────┐
│ ALERT BAR / STATUS LINE      │  fixed, 64 px
├──────────────┬───────────────┤
│ HAVEN        │ O₂            │  the two biggest numbers
│ 14 MIN       │ 71 %          │  56 px Plex Mono
│ via PR1  ○   │ 5:41 left ◇   │
├──────────────┴───────────────┤
│ NEXT  Stop 3 · Boxwork ridge │
│ ↗ 040°  ·  0.42 km · 9 min   │
├──────────────────────────────┤
│ MINI-MAP                     │
├──────────────────────────────┤
│ EVA 2:14 · DOSE 0.1 mGy · ▮▮▮│  metadata strip
├──────────────────────────────┤
│ [ SUMMON ROVER ] [ ABORT ]   │  56–72 px, hold-to-confirm
│ [ TASK ROVER (T2) ]  [ HUD ] │
└──────────────────────────────┘
```

**Landscape** (new; default). Fixed geography kept: alert bar at the top, HAVEN top-left with O₂ immediately to its right, the metadata strip above the actions, the actions at the bottom. The mini-map takes the whole right column.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ALERT BAR, or STATUS: NOMINAL when none                  fixed 64 px │
├────────────────┬────────────────┬────────────────────────────────────┤
│ HAVEN 14 MIN   │ O₂ 71 %        │                                    │
│ via PR1  ○     │ 5:41 left ◇    │   MINI-MAP                         │
├────────────────┴────────────────┤   the whole right column:          │
│ NEXT  Stop 3 · Boxwork ridge    │   route, me, buddy, shadow, PR1    │
│ ↗ 040°  0.42 km  9 min          │                                    │
├─────────────────────────────────┴────────────────────────────────────┤
│ EVA 2:14 · DOSE 0.1 mGy · LINK ▮▮▮                       strip 24 px │
├──────────────────────────────────────────────────────────────────────┤
│ [ SUMMON ROVER ] [ ABORT TO HAB ] [ TASK ROVER (T2) ] [ HUD ]  72 px │
└──────────────────────────────────────────────────────────────────────┘
```

Height budget at 844 × 390: 64 + 230 + 24 + 72 = 390 px, no scrolling. The body is 230 px: cards row 100 px, 8 px gap, NEXT card 110 px, 12 px padding. The left column is 46 % of the width. HAVEN and O₂ values are at least 56 px (56 px on phones, 64 px on tablets); NEXT values are at least 32 px (48 px on tablets, stacked). On rotation the alert bar stays at the top, HAVEN stays top-left, the strip stays above the actions and the actions stay at the bottom; O₂ stays immediately right of HAVEN on the same row, and NEXT and the mini-map change place.

**Stop task list (FR-50).** While walking, the NEXT card header carries a labelled TASKS n/m button for the next stop. At a stop the list opens: up to four rows, each at least 56 px, with a neutral check box, the task text and SKIP; one tap marks DONE or SKIPPED and opens a 5-s undo strip. States use neutral chrome only (to do, check-in-square, ⊘ with the word beside each; no status colour). On tablets and in portrait the list takes the NEXT position; on a phone in landscape it takes the map column and the NEXT card stays, and the button toggles back to the map. During an alert the list collapses to its count. The alert slot, HAVEN, O₂, the metadata strip and the action row never move.

**Full-screen map.** Tapping the mini-map or its labelled FULL button expands the map. In landscape HAVEN and O₂ stack at the left as smaller cards (HAVEN keeps the top-left origin) and the map takes at least 80 % of the width; in portrait the cards stay in their row. Buttons (+, −, FIT, FOLLOW, LAYERS, CLOSE, each at least 56 px with a word) are the primary path, and drag, wheel and pinch are extras. The alert slot, strip and action row never move, and a warning closes it.

**SCR-14 in landscape:** a right-side panel over the map column (about 53 % of the width) below the alert bar replaces the 70 %-height bottom sheet. HAVEN, O₂ and NEXT stay visible in the left column; the \"Go — option N\" hold button sits at the bottom of the panel."""
PATCH_F = "| Responsive | BRIEF fluid 360–1920 px. Planner/ops ≥ 1280 three-column; 1024–1279 one drawer at a time; ops < 1024 shows a \"use a larger screen\" notice. **EVA: phone or tablet, portrait (360–1024 px wide) or landscape (≥ 844 × 390 px); default landscape; the same fixed geography in both.** HUD landscape ≥ 640 px |"
PATCH_FR32 = "- Works on a phone/tablet ≥ 360 px wide in portrait **or ≥ 844 × 390 px in landscape**; touch targets ≥ 56 px (glove use, **Assumed**); the alert bar, HAVEN (top-left), O₂, metadata strip and action row keep their positions in both orientations."
UNRESOLVED = [
 ("U-30", "Ratify the EVA landscape layout (compact HAVEN and O₂ cards top-left, NEXT below, map on the whole right column) and the SCR-14 right panel over the map column (04 §E.5, §E.7, §F; 01 FR-32); confirm that O₂, NEXT and the mini-map may change place between orientations while HAVEN, alert, strip and actions do not (G-24).", "Sadman / Obidit", "Before 10 Nov (TASK-24 start)"),
 ("U-31", "Where does the EVA high-contrast toggle live on the real tablet? Proposal: a fifth compact action-row button or a system quick-setting.", "Design (R6) + R5", "TASK-13"),
 ("U-32", "Should lower-level alerts interrupt a latched warning bar briefly, or stay behind \"+N\" (03 §C.6 steps 7–8 vs 04 §D.2)?", "Sadman", "TASK-24"),
 ("U-33", "Ratify the added PRINT neutral tokens (G-15).", "Design (R6)", "TASK-13"),
 ("U-34", "EZ code numbering: global order in pois.geojson or per stop type (04 §E.10)?", "R1 + R6", "TASK-04"),
 ("U-35", "Final content for stop 1 (EZ—ENG 01): name, objective, image.", "R1 + R6", "TASK-04"),
 ("U-36", "Dose display unit rule (mGy in 04 §E.4/E.5; µGy in 05; no Sv for the event).", "R2 + R5", "TASK-24"),
 ("U-37", "High-contrast alert bars: confirm the outlined variant (white on warning-fill is 6.54 : 1).", "Design (R6)", "TASK-13"),
 ("U-38", "Product sound default (prototype starts muted).", "R5", "TASK-25"),
 ("U-39", "Replace the schematic map with the real basemap, slope, TI and comm_hab layers; recheck all overlay contrast on real imagery.", "R1 + R3", "TASK-03 / TASK-07"),
 ("U-40", "Self-host WOFF2 and verify Chakra Petch, Inter, IBM Plex Mono, Source Serif 4 and Lucide licences (extends U-27).", "R6", "TASK-13"),
 ("U-41", "Usability check that advisory (i) and unknown (?) are distinguishable in grayscale (G-27).", "R6", "TASK-15"),
 ("U-42", "Wire messages carry raw numbers plus a provenance map; the fixture wraps every number as {v, unit, prov, src}. Decide the production adapter.", "R4 + R5", "TASK-20"), ("U-43", "Ops and HUD still leave the idle alert slot empty. Decide whether ops should also show a status line, and whether an always-on NOMINAL line on the EVA tablet is compatible with \"nominal is quiet\" (04 §A.3); check with UT-7.", "Design (R6) + R5", "TASK-15"),
 ("U-47", "**Resolved by FR-50** (stop task list on the EVA tablet, synced to ops). The wording of U-47 itself was not available to the assistant; confirm it can be closed. Prototyped in SCR-12, SCR-11, SCR-08, SCR-17 and the Stage beat at 0:05.", "Sadman", "Resolved 2026-11-05"),
 ("U-44–U-50", "Held in the repository copy of this file, which the assistant could not see. They are not reproduced here: merge this file by hand, do not overwrite.", "Sadman", "Before merging"),
 ("U-51", "Ratify the TASKS button, the phone-landscape list in the map column and the NEXT-position list on tablets and in portrait (G-30, G-31, DV-12).", "Sadman + Design (R6)", "TASK-13"),
 ("U-52", "Per-crew task model: tasks belong to EV1 or EV2 (`crew_id`), EV2 is simulated and completes tasks at the end of each dwell, so a dwell cut short by the storm leaves EV2's tasks open and later dropped. Confirm.", "R2", "TASK-31"),
 ("U-53", "Ratify the prototype rule that counts are looked up from build-time tables; the product computes counts from the task list (G-34).", "Sadman + R2", "TASK-31"),
 ("U-54", "Allow a task count on the HUD as a sixth value, or fold it into the STOP sub-label (G-35)?", "Design (R6) + R5", "TASK-15"),
 ("U-55", "Skip-reason capture: one tap records `other`, then one REASON control in the 5-s undo strip (G-33). Acceptable with gloves?", "Design (R6)", "UT-8"),
 ("U-56", "On abort or rendezvous, do open tasks at the current stop also become DROPPED (G-39)?", "R2", "TASK-31"),
 ("U-57", "Ratify the full-screen map: scope (EVA, ops, planner), layer set, close-on-warning, and drag/wheel/pinch as extras (G-42, G-43). Pinch needs a touch-hardware test.", "Sadman + R3", "TASK-07 / TASK-15"),
 ("U-58", "Who writes the final task text, in which file, and who may add tasks from ops (limit, audit)? Prototype text is PROPOSED copy from the POI objectives.", "R1 + R6", "TASK-31"),
 ("U-59", "List collapse during an alert: collapse while the options sheet is open or a warning is unacknowledged, then allow a read-only list (G-40)?", "Sadman", "TASK-24"),
 ("U-60", "Ratify, for the landscape full-screen map only, the stacked HAVEN / O₂ cards at 40 px (48 px on tablets), below the 56 px rule and with O₂ below HAVEN rather than beside it (G-48); or keep 56 px values and accept a smaller map.", "Sadman + Design (R6)", "UT-9")
]
COMPONENTS = [
 ("StatusIcon / StatusLabel", "ui/status/StatusIcon.tsx", "level: warning|caution|advisory|nominal|unknown; word?; slot", "all five levels", "warning, caution, advisory, nominal, unknown", "A.3 #2; shape + pattern + word + slot"),
 ("ProvenanceChip", "ui/ProvenanceChip.tsx", "prov; mode: full|glyph; src?", "full, glyph-only (EVA/HUD)", "text-2, edge, raised", "FR-15"),
 ("Value", "ui/Value.tsx", "num {v, unit, prov, src}; size; stale?; grey?", "default, loading, disabled (—), stale (age), error, placeholder (##.#)", "text-1, text-3, Plex Mono tabular slashed-zero", "FR-15; data-provenance required"),
 ("Panel / SpecimenCard", "ui/Panel.tsx", "code; mod; title; selected; loading", "default, selected, loading, stale, error", "panel, raised, edge, route, livery stripe", "P1–P3"),
 ("Button / ToggleSwitch / Segmented", "ui/Button.tsx", "kind: primary|critical-warn|critical-caution|ghost; size; pressed; disabledReason", "default, pressed, loading, disabled, error", "btn-fill, edge, text-3, cut-s", "P8"),
 ("HoldButton", "ui/HoldButton.tsx", "label; icon; kind; onConfirm; outcome; disabledReason; tapConfirm", "idle, holding (0–800 ms), cancelled, done (300 ms), confirm (5 s), disabled", "warning-fill, caution-fill, text-1", "D.3; keyboard hold Enter/Space"),
 ("AlertBar / AlertList / AlertCounter", "ui/alerts/AlertBar.tsx", "alerts[]; onAck; onOpenList; device", "none (slot reserved), warning (flash ×2), caution (pulse ×1), advisory (10 s), acked, +N", "warning-fill, caution-fill, raised, advisory", "D.2; aria-live assertive/polite"),
 ("PhaseTimeline", "ui/ops/PhaseTimeline.tsx", "phases[]; current; unlinked", "past, current (■ + bold + ▼), future, dashed", "text-1, text-3", "P4"),
 ("CrewCard / VehicleCard", "ui/ops/CrewCard.tsx", "crew; selected; stale", "default, selected, stale (dashed, grey, age), sheltered", "panel, route, text-3", "D.1"),
 ("LinkIndicator", "ui/LinkIndicator.tsx", "linked; bars; age?", "linked, NO LINK + age (dashed)", "caution, text-1", "D.5"),
 ("EarthLinkWidget", "ui/ops/EarthLinkWidget.tsx", "lightTime; nextPass; queue; state", "link, waiting, conjunction", "unknown, advisory", "FR-43"),
 ("ClockControl", "ui/ops/ClockControl.tsx", "speed; paused; onSpeed; onNext", "default, active speed", "text-1 fill when active", "FR-34; keys Space 1/2/3 N"),
 ("EventLogRow / EventLog", "ui/ops/EventLog.tsx", "event; onJump", "default, active", "hairline, text-2", "FR-46; scroll count (P11)"),
 ("OpsConsole (SCR-11)", "ui/screens/scr11/OpsConsole.tsx", "session; world", "no session, loaded, running, paused, alerting, ended; w1280, w1024, notice", "void, panel, hairline", "04 §E.4"),
 ("EvaTablet (SCR-12)", "ui/screens/scr12/EvaTablet.tsx", "orientation: portrait|landscape; crew", "waiting, walking, at stop, alerting, to haven, sheltered, no hab link, ended", "text-1, panel, caution-fill, warning-fill", "04 §E.5 + landscape (Proposed)"),
 ("Hud (SCR-13)", "ui/screens/scr13/Hud.tsx", "crew; alert", "nominal, caution, warning, no link", "hud-* tokens", "FR-33; hold 2 s to exit"),
 ("OptionsSheet / OptionsPanel (SCR-14)", "ui/screens/scr14/OptionsSheet.tsx", "options[]; selected; orientation; role", "computing, ready, executing, superseded, approval pending, no rendezvous", "raised, route", "FR-40, 44"),
 ("OptionCard", "ui/OptionCard.tsx", "option; selected; disabledReason", "default, selected, loading, disabled", "raised, route", "D.1"),
 ("MapView", "map/MapView.tsx (OpenLayers)", "layers; route; crew; vehicles; overlays", "loading, idle, add-stop, error", "route, text-1, void casing", "TASK-02/07; schematic SVG replaced by real tiles (U-39)"),
 ("DoseChart", "ui/ops/DoseChart.tsx", "series; cursor", "placeholder shape (until U-15), replayed", "text-1, text-2", "FR-37; label \"replayed — Curiosity RAD, 20 May 2024\""),
 ("LayerRow / LayersPanel (SCR-03)", "ui/planner/LayersPanel.tsx", "layer; on; opacity", "default, loading, unavailable, out of range", "raised, edge", "FR-02; max two scientific overlays"),
 ("PlanPanel (SCR-04)", "ui/planner/PlanPanel.tsx", "scenario; stops; errors", "empty, editing, invalid, computing", "raised, warning outline", "FR-05, 06; 300 ms debounce"),
 ("ResultsPanel / ProfileChart (SCR-05)", "ui/planner/ResultsPanel.tsx", "plan; status", "empty, computing, OK, over limits, partial, error", "nominal, caution, warning", "FR-07–12"),
 ("PoiDetail (SCR-06)", "ui/planner/PoiDetail.tsx", "poi; imageState", "image shown, loading, missing", "panel", "FR-04, 45"),
 ("ConditionsPanel (SCR-07)", "ui/planner/ConditionsPanel.tsx", "conditions", "computed, daylight warning, not available", "caution", "FR-11–13"),
 ("BriefingCard (SCR-08) / PostEvaReport (SCR-17)", "ui/print/BriefingCard.tsx", "plan; status", "OK, over limits, partial; report pages 1–2", "print tokens", "FR-14, 46"),
 ("SourcesPage (SCR-09)", "ui/brief/SourcesPage.tsx", "sources; paramSets", "default; anchors layer-*", "brief tokens", "FR-15"),
 ("JoinPage (SCR-10) / BriefingPage (SCR-01)", "ui/brief/JoinPage.tsx", "roles; hab status", "connecting, ready, role taken, unreachable", "brief tokens", "FR-30, 31"),
 ("LinkOverlay (SCR-18) / BootError (SCR-00)", "ui/overlays/LinkOverlay.tsx", "state; cached values", "connecting, lost (EVA), lost (ops), restored", "caution, advisory", "FR-16, NFR-13"),
 ("RoverTasking (SCR-15, T2) / EarthView (SCR-16, T2)", "ui/t2/RoverTasking.tsx", "task; target; state", "choosing … failed; link, waiting, blackout", "caution, unknown", "FR-41, 43, 48"),
 ("StopTaskList / StopTaskRow", "ui/screens/scr12/StopTaskList.tsx", "tasks[]; crewId; stopId; readOnly; undo; onTick; onSkip; onUndo; onReason", "to do, done, skipped, dropped; undo window; not synced; added by ops; read only; collapsed to a count during an alert", "panel, raised, hairline, text-1/2/3, edge (neutral chrome only)", "FR-50; rows ≥ 56 px"),
 ("TasksButton / TaskCountPill", "ui/screens/scr12/TasksButton.tsx", "count; active; locked", "idle, active (MAP / NEXT), locked (non-interactive pill during an alert)", "raised, edge, text-1", "FR-50; ≥ 56 px, icon + word + count"),
 ("TaskProgress", "ui/ops/TaskProgress.tsx", "stopCount; total; onAdd", "default", "text-1, text-3, hairline", "FR-50; ops crew card"),
 ("AddTaskPopover", "ui/ops/AddTaskPopover.tsx", "crew; stop; kind; text; maxReached", "default, empty text (disabled), max reached", "panel, raised, edge", "FR-50 ADD_STOP_TASK"),
 ("MapControls", "map/MapControls.tsx", "zoom; pan; follow; fit; layersOpen; onClose", "default, layers open", "edge, raised, text-1", "G-42, G-43; buttons ≥ 56 px on EVA"),
 ("FullScreenMap", "map/FullScreenMap.tsx", "crew; view; layers; orientation", "open (landscape: cards stacked at the left; portrait: cards in their row), closed, auto-closed by a warning", "route, text-1, void casing", "G-42, G-48; map ≥ 80 % of the width in landscape")
]
INTERACTIONS = [
 ("Hold-to-confirm", "04 §D.3", "Press and hold 800 ms; a progress line runs along the chamfered edge; releasing early cancels (\"Released early — hold 0.8 s\"); on completion a 300 ms outcome state (\"PR1 dispatched — ETA 14 min\") then the command is issued. Keyboard: hold Enter/Space. Accessibility fallback (toggle): tap, then a Confirm button replaces it for 5 s."),
 ("Alert bar", "04 §D.2, §C.6", "One bar slot, highest level wins, \"+N\" counter opens the alert list. Warning flashes twice (2 Hz, < 3 Hz) then holds; caution pulses once; advisory auto-dismisses after 10 s and stays in the log. Acknowledge silences and marks seen; it does not clear the condition; warnings and cautions latch until acknowledged and cleared."),
 ("EVA status line", "DV-03", "With no active alert the 64 px alert slot on the EVA tablet shows STATUS plus a word: NOMINAL (nominal icon), STANDBY or EVA ENDED (advisory icon), with a detail text and the current EVA phase on the right (portrait: word and phase only). The alert bar replaces it in the same slot when an alert is raised and the line returns when the alert is acknowledged and cleared. It is not a live region, so it never announces itself. Ops and HUD keep the slot empty."),
 ("Same words everywhere", "04 §D.2", "One alert store drives ops, EVA and HUD; the Stage page reads the text from each frame and shows IDENTICAL or DIFFER."),
 ("Staleness and link loss", "04 §D.5", "Values older than 5 s turn text-3 with an age stamp. Unlinked: EVA shows the caution bar \"No hab link — operating on cached plan\"; ops shows the crew card dashed with last-known values and age; commands show \"Queued — sends when link returns\" and are resent on reconnection."),
 ("HUD exit", "03 SCR-13", "Tap and hold anywhere for 2 s; a thin progress line appears at the bottom edge; release cancels."),
 ("EVA high contrast", "04 §F Glare", "Switches the EVA frame to the HUD palette; alert bars become outlined (DV-05)."),
 ("Ops mute", "04 §C.7", "Toggle with a visible SOUND OFF / SOUND ON indicator; warning two-tone repeats every 5 s until acknowledged; vibration pattern 3 × 200 ms where the Vibration API exists."),
 ("Ops keys", "04 §F", "Space pause · 1/2/3 speed · N next event · K acknowledge · O focus options."),
 ("Planner", "04 §F, App. A", "A add-stop mode · Enter place at crosshair · Delete remove selected · B briefing · ? sources · arrows pan · +/− zoom. Drag stops; on drop validate → snap offer (≤ 50 m) or refuse; max two scientific overlays (a third dims the oldest and says so); inputs recompute after a 300 ms debounce and an invalid value is never sent."),
 ("Demo player", "01 §E.1, §E.2, 10", "Beats hold between keyframes; markers tween visually only; 60× plays at the pace of the recorded table, 10× and 1× are slower; next event, previous, scrub. Commands from the Stage (hold Summon) advance the replay."),
 ("Stop tasks (FR-50)", "FR-50; 04 §E.5 addition", "Rows are at least 56 px with a neutral check box, the task text and SKIP. One tap marks DONE or SKIPPED (no hold-to-confirm: not a safety action) and opens a 5-s undo strip with a shrinking bar (no number); the REASON control cycles time → terrain → alert → other. Without a hab link the change is queued and marked NOT SYNCED in the row and the strip, and clears when the link returns. Ops can add a task (ops-added rows list first, tagged ADDED BY OPS). Open tasks become DROPPED when a plan revision cuts the stop. During an alert the list collapses to a non-interactive count. Counts are looked up, never computed."),
 ("Full-screen map and map controls", "G-42, G-43", "Tap the mini-map or press FULL. In landscape HAVEN and O₂ stack at the left as smaller cards and the map takes at least 80 % of the width; in portrait the cards stay in their row. The alert slot, strip and action row do not move. Buttons: +, −, FIT, FOLLOW, LAYERS, CLOSE. Extras: drag to pan, wheel or pinch to zoom. Layers: slope, thermal inertia, comm shadow, haven bands (at most two scientific overlays; a third turns the oldest off and says so). A warning closes the full map. The planner has + / − buttons, drag and wheel; ops has + / − / FIT, drag, wheel, and Slope and Thermal inertia toggles.")
]
A11Y = [
 "Contrast: BRIEF/OPS text ≥ 4.5 : 1, non-text ≥ 3 : 1, HUD ≥ 7 : 1; the Design system page computes every pair live and compares it with the 04 §C.1 value.",
 "The EVA status line is a status like any other: nominal icon (circle with check), the word NOMINAL, and the fixed alert slot; it is not an aria-live region so nothing is announced while it is idle.",
 "Four cues per status: colour + shape + word + fixed slot. The Grayscale toggle applies a grayscale filter and the badge counts statuses that have all four cues.",
 "Focus: white 2 px ring with a 2 px void gap on every control; chamfered controls draw the ring on a wrapper because clip-path clips outlines.",
 "Targets: EVA ≥ 56 px with ≥ 8 px gaps (measured in Chromium for all 32 EVA state × device combinations); ops mouse ≥ 32 px.",
 "Live regions: warnings role=alert + aria-live=assertive; cautions and advisories role=status + polite; crew cards and options are lists with full text.",
 "No hamburger menus, no hover-only actions, no gesture-only paths in OPS/EVA; hidden content shows a count (alert \"+N\", log \"n / m\").",
 "Reduced motion: no flashes (static bar) and no marker interpolation; animations and transitions are disabled.",
 "Never colour alone for focus, selection or current step (P10): ring + outline + marker + label.",
 "Task rows are at least 56 px; each check box is a button with a label such as \"Mark done: Observe the sulfate ledge face\"; the undo strip is a status region; task state never uses a status colour, so it reads in grayscale (shape + word).",
 "Map: buttons are the primary path and every control has a word (icon + word on EVA); drag, wheel and pinch are extras; the planner keeps its keyboard keys (arrows pan, +/− zoom). The Add task button carries aria-disabled and it is kept in step with the field."
]
FIXTURE_MAP = [
 ("meta", "—", "Prototype banner, disclaimer (01 §F.1), CRS string, data version"),
 ("nums", "02 §E.6 `provenance` map; 05 Crew / Vehicle / PlanResult fields", "Every displayed number as {v, unit, prov, src}; src is a spec section or PLACEHOLDER"),
 ("site", "05 §C.1 Site, Layer, RoutingGrid, EnvConstant", "Subset: layers with legends, default start, hab mast, env constants"),
 ("pois", "05 §C.1 POI (+ v2 stop_type, ez_theme, evidence)", "Three EZ POIs with catalogue codes"),
 ("param_sets", "05 §C.1 ParamSet", "Suit, PR1, UR1, link, alert, shielding"),
 ("scenario", "05 §C.2 Scenario, ScenarioEvent; 02 §E.7", "storm-sol4190 with events e1 (DONKI) and e2 (Earth message)"),
 ("dose_series", "05 §C.2 DoseSeries", "Shape placeholder until U-15; integral check expected 8,100 µGy"),
 ("earth_link", "05 §C.2 EarthLinkTable", "Rows and passes PLACEHOLDER until U-18"),
 ("options", "05 §C.2 ContingencyOption", "Rendezvous, abort, continue-skip"),
 ("alerts", "05 §C.2 Alert (code, level, message)", "Copy for each alert code; sources cited"),
 ("log", "05 §C.2 LogEvent", "Eight events with seq, kind, actor, provenance"),
 ("snapshot_example", "02 §E.6 SNAPSHOT", "Same shape; numbers wrapped for the audit"),
 ("sources", "05 §C.1 DataSource", "Ten dataset records with DS codes"),
 ("tasks", "05 StopTask (FR-50, Proposed); 02 UPDATE_STOP_TASK / ADD_STOP_TASK; log events TASK_ADDED, TASK_UPDATED, TASK_DROPPED", "14 plan tasks (per crew and stop), one ops-added example, declared scenarios per screen state, count objects `n`, and the build-time lookup tables `counts`, `done_total`, `total_all`; text is PROPOSED copy")
]
USABILITY = [
 ("UT-1", "3-s glance: from the HUD read haven, O₂ and next stop (Warning state).", "≥ 2 of 3 users read all three within 3 s", "04 §F.1; 01 §B.2"),
 ("UT-2", "Summon rover with gloves, no instruction, on the EVA tablet in **landscape**.", "≥ 2 of 3 users, < 15 s", "04 §F.1"),
 ("UT-3", "Ops: identify who is in danger and approve an option.", "≥ 2 of 3 users, < 20 s", "04 §F.1"),
 ("UT-4", "Grayscale screenshots of warning, caution, advisory, nominal, unknown: name each level.", "100 % of alert levels", "04 §F.1"),
 ("UT-5", "**Added:** glove test, landscape vs portrait. Each tester summons the rover and aborts on the same phone in both orientations (order alternated), gloves on, in the Alerting state.", "Record time and mis-taps per orientation; target: landscape no worse than portrait by more than 2 s and ≤ 1 mis-tap per run. Result decides U-30.", "New"),
 ("UT-6", "**Added:** rotate the phone mid-alert; point to haven and O₂ before and after rotating.", "Both found again without searching (≥ 2 of 3): HAVEN is top-left in both, O₂ is the card right of it", "New (G-24)"), ("UT-7", "**Added:** Nominal state on the EVA tablet with and without the status line in the alert slot: read haven, O₂ and next stop, then say what the top line means.", "Reading time no worse than without the line by more than 0.5 s; ≥ 2 of 3 testers say what the line means", "New (DV-03, U-43)"),
 ("UT-8", "**Added:** with gloves on a phone in landscape at a stop, tick the middle task, then skip the last, then undo; count mis-taps between the box, SKIP and UNDO.", "≥ 2 of 3 testers complete it in under 15 s with ≤ 1 mis-tap", "New (FR-50, U-55)"),
 ("UT-9", "**Added:** open the full-screen map on a phone in landscape, zoom in once, then say HAVEN and O₂ without closing the map.", "Both read within 3 s by ≥ 2 of 3 testers (the stacked cards stay at the left; check that 40 px is enough with gloves and glare)", "New (G-42, G-48)")
]
