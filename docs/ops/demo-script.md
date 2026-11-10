# Demo script (240 s and 30 s)

| | |
| --- | --- |
| **Owner** | Sadman Shaharier Mahim, product & systems lead — demo story ([06 §A.1](../specs/06_High_Level_Implementation_Plan.md#a1-roles)); recording with the story lane ([06 §C TASK-17](../specs/06_High_Level_Implementation_Plan.md#c-work-packages)) |
| **Date** | 2026-11-09 |
| **Status** | Skeleton v2 (killer demo) — time slots are Proposed; narration is an agent draft (Claude Code, Sonnet 5.5) for Sadman's review and approval (T17.01 is human-required); numbers from T21.09 (01 §E.1) |
| **Related** | [01 §E Core demonstration scenario](../specs/01_Product_Requirements_Document.md#e-core-demonstration-scenario) · [01 §F.1 Prototype boundary](../specs/01_Product_Requirements_Document.md#f1-prototype-boundary-must-appear-in-the-app-and-the-video) · [Submission checklist](submission-checklist.md) |

The scenario steps are owned by [01 §E](../specs/01_Product_Requirements_Document.md#e-core-demonstration-scenario) (v2: E.1 killer demo, E.2 planning); the segment plan is [06 §G](../specs/06_High_Level_Implementation_Plan.md#g-video-plan-task-17). This file adds timing and narration slots. Starting conditions (v2): Hab Core laptop on the offline travel router, ops console on the projector, EV1 (and optionally EV2) phones joined, scenario `storm-sol4190` loaded, clock at 60×.

Video rules from 06 TASK-17: English subtitles, datasets named on camera (NASA **and ESA**), no under-18 likeness. Fallback if the live demo fails: the M4 dry-run recording (11 Nov; final take on 12 Nov) or a headless replay rendered on ops.

## 240-s local judging video (due 13 Nov 18:30)

| Slot (Proposed) | Source | On screen | Narration (English subtitle text, agent draft) |
| --- | --- | --- | --- |
| 0:00–0:20 | 01 §A.2 | Team, all six members by name, challenge name; "Earth is 3–22 light-minutes away" | Team CheesySpace: Obidit Islam, Sadman Shaharier Mahim, Saba Atharique, Mishkat Ahmed Khan, Anjim Hossain, Ridita Alam. Challenge: Interplanetary Survival Guide, Martian Map. Our entry: Marswalk Surface Ops. Earth is 3–22 light-minutes away, so answers must come from the habitat. |
| 0:20–0:35 | 01 §E.2 steps 1–2 | Mission briefing → planner; slope and thermal-inertia layers; name the datasets | Offline, the planner starts at the mission briefing. Slope comes from the USGS Mars MSL Gale Merged DEM 1 m; thermal inertia, from the THEMIS thermal inertia mosaic. |
| 0:35–0:50 | 01 §E.2 steps 3–4 | Science stop (boxwork) and resource stop (hydrated sulfates); route, profile, time-to-haven band | The planner adds a boxwork science stop and a resource stop at a hydrated-sulfate site. A suit-safe route computes, with an elevation profile and a time-to-haven band. |
| 0:50–1:00 | 01 §E.2 step 5 | Honest failure: stop on a steep slope → no feasible route with reason; briefing card, publish to Hab Core | A stop on a steep slope: no feasible route, with the reason. Then the briefing card, published to the Hab Core. |
| 1:00–1:10 | 01 §E.1 0:00 | Ops + phones: EVA under way, crew at the resource stop | The walk is simulated. The crew is at the resource stop; the ops console shows them and the rover parked at the habitat. |
| 1:10–1:30 | 01 §E.1 0:10–0:20 | Radiation alert on every device; dose curve labelled *replayed — Curiosity RAD, 20 May 2024*; Earth forecast still in transit | Then the dose rate climbs. A red alert fires on every device at once. The curve is labelled replayed, Curiosity RAD, 20 May 2024. Earth's forecast is still in transit: light time and next relay pass are on screen. |
| 1:30–2:00 | 01 §E.1 0:30–0:55 | Options; EV1 holds *Summon rover*; rendezvous; comm-shadow caution | The system offers ranked options: abort to the habitat, or rendezvous with the rover, each with its time to shelter and expected event dose. EV1 chooses the rover option and confirms. The rover route avoids a steep slope. It crosses a comm shadow: a COMM_SHADOW warning shows, and a relay rover is tasked to close it. Radio coverage is line-of-sight only. |
| 2:00–2:30 | 01 §E.1 1:10–1:20 | Crew sheltered; dose received vs. unsheltered; post-EVA report | The crew reach the rover and shelter. The dose received is shown against the unsheltered estimate, with the event log. Ops opens the post-EVA report: planned versus actual, alerts, dose. Every value carries a provenance label. |
| 2:30–3:20 | 02 §C, §D | Datasets aloud: HiRISE, MOLA + HRSC (ESA) DEM, THEMIS, RAD, DONKI, SPICE (NAIF + ESA TGO); `packages/compute` and tests; provenance classes | Data from NASA and ESA. USGS Mars MSL Gale Merged Orthophoto Mosaic 25 cm, from HiRISE. USGS Mars MSL Gale Merged DEM 1 m, which includes ESA Mars Express HRSC and MOLA data. The THEMIS thermal inertia mosaic. The RAD dose-rate series from the Curiosity RAD team at Kiel. NASA CCMC DONKI space-weather records. SPICE kernels from NAIF, and the ESA Trace Gas Orbiter trajectory. Deterministic, tested code computes every number: the pipeline before the event, packages/compute at runtime. No number is generated by an AI model; the coding assistants used to build it are disclosed. Every value carries a provenance label: measured, derived, modelled, assumed, replayed or simulated. |
| 3:20–4:00 | 01 §F.1 | Impact, prototype boundary statement, credits | Impact: crews decide with the habitat, not Earth. Marswalk Surface Ops is an exploratory hackathon prototype. It is **not** astronaut operations software. Crew, suit, rover and vehicle states are **simulated**. Solar events are **real historical records replayed** on a simulated clock — not a live feed from Mars. Slope limits, speeds, consumables and shelter values are illustrative assumptions from Earth and Apollo-era references. Radio coverage is line-of-sight only. Credits: NASA/JPL-Caltech/University of Arizona and USGS Astrogeology (Calef and Parker, 2016), ESA, NAIF, CCMC, and the RAD team at Kiel. |

Notes (not spoken; screen references and open items for the narration above):

1. 0:00–0:20: "3–22 light-minutes" is read from the title card (01 §A.2). Team names are from [team.md](team.md). Product name: `TODO(decision)` D-08, working title; `docs/decisions/ADR-008-product-name.md` does not exist yet (ADR-008 is the Hab Core ADR), so T16.01 must fix the number.
2. 0:20–0:35: slope and thermal-inertia legends are on SCR-03. Titles from 02 §C.2: L2 *USGS Mars MSL Gale Merged DEM 1 m* v3; L4 USGS *THEMIS Thermal Inertia Mosaic, Quantitative (32-bit), 100 m/px*. `TODO(verify)` both titles against `docs/ops/credits.md` and SCR-09 (credits.md does not exist yet).
3. 0:35–0:50: route, profile and time-to-haven band are on SCR-05 (route results). `TODO(verify)`: mention CRISM only if the layer ships, then with the 02 L5 wording "indicative, not a mineral identification".
4. 0:50–1:00: no-feasible-route reason is on SCR-05; briefing card is SCR-08, published to the Hab Core.
5. 1:00–1:10: ops console is SCR-11; HUD is SCR-13.
6. 1:10–1:30: "20 May 2024" is on the SCR-11 dose chart label and the SCR-13 alert (01 §E.1, 0:10 row). Earth link widget on SCR-11 shows light time and next relay pass (01 §E.1, 0:20 row). X = 15.8 min light time (`earth_link.json`, row `t_utc` 2024-05-20T05:50:00Z, SPICE, derived); Y = 179.5 min to the next relay pass, MAVEN from 2024-05-20T08:50:00Z (`earth_link.json` passes[16]); from `npm --workspace @marswalk/hab-core run demo-numbers` (T21.15), sources in 01 §E.1. Not voiced.
7. 1:30–2:00: options are on SCR-14 (ops options panel; EVA options sheet). ETA and slope values wait for the headless replay (01 §E.1); read them from the screen at recording. None is voiced. EV1 chooses and confirms on the SCR-12 tablet / SCR-14 options sheet (SCR-13 HUD is read-only). Slope avoidance is on the SCR-11 map; the rover tasking is SCR-15. `TODO(verify)`: 01 §E.1 says "Summon vehicle", the slot says "Summon rover"; match the on-screen button label.
8. 2:00–2:30: dose received versus unsheltered is on SCR-11; post-EVA report is SCR-17. No number is voiced; read the values from the screen.
9. 2:30–3:20: titles from 02 §C.2: L1 *USGS Mars MSL Gale Merged Orthophoto Mosaic 25 cm* v3 (HiRISE); L2 *USGS Mars MSL Gale Merged DEM 1 m* v3 (includes ESA Mars Express HRSC and MOLA; `TODO(verify)` which source fills the AOI); L4 USGS *THEMIS Thermal Inertia Mosaic, Quantitative (32-bit), 100 m/px*; L9 RAD series, RAD team at Kiel (U-15 open); L8 NASA CCMC DONKI; L10 NAIF SPICE kernels and ESA TGO SPICE. Credits and provenance classes are on SCR-09. `TODO(verify)` all titles against `docs/ops/credits.md` (does not exist yet) and SCR-09. The AI statement matches [AI_USE.md](../AI_USE.md) and ADR-006.
10. 3:20–4:00: the quoted statement is 01 §F.1, verbatim. Credits text: 02 §C.2 L1 attribution ("NASA/JPL-Caltech/University of Arizona; USGS Astrogeology (Calef & Parker 2016)"); `TODO(verify)` the RAD team credit and U-15 wording, and all credits against `docs/ops/credits.md` and SCR-09.

## 30-s global video (upload by 14 Nov 09:00)

| Slot (Proposed) | On screen | Narration (English subtitle text, agent draft) |
| --- | --- | --- |
| 0:00–0:05 | Title, team, challenge name | Team CheesySpace. Marswalk Surface Ops. Interplanetary Survival Guide: Martian Map. |
| 0:05–0:20 | HUD alert → summon rover → crew sheltered (real 20 May 2024 solar storm, replayed) | A real solar storm, 20 May 2024, replayed. The HUD alerts every crew device. One action summons the rover. The crew shelter in it. |
| 0:20–0:25 | "NASA HiRISE, RAD, DONKI + ESA data" over the ops console | NASA HiRISE, RAD and DONKI, plus ESA HRSC and TGO data. |
| 0:25–0:30 | Impact line, prototype disclaimer | A prototype, not astronaut software. |

End card (on screen, not voiced): verbatim 01 §F.1 statement — Marswalk Surface Ops is an exploratory hackathon prototype. It is **not** astronaut operations software. Crew, suit, rover and vehicle states are **simulated**. Solar events are **real historical records replayed** on a simulated clock — not a live feed from Mars. Slope limits, speeds, consumables and shelter values are illustrative assumptions from Earth and Apollo-era references. Radio coverage is line-of-sight only. — held long enough to read; `TODO(decision)`: Sadman to choose card duration / slot split before 13 Nov.

Notes (not spoken):

1. 0:00–0:05: product name `TODO(decision)` D-08 (working title).
2. 0:05–0:20: "20 May 2024" is on the SCR-13 HUD alert; "One action summons the rover" is the SCR-14 options action (SCR-13 HUD is read-only); crew sheltered is shown on SCR-11. Use the same verb ("summons") in both videos.
3. 0:20–0:25: titles from 02 §C.2 (L1, L9, L8, ESA HRSC in L2, ESA TGO in L10); credits on SCR-09. `TODO(verify)` against `docs/ops/credits.md` (does not exist yet).
4. 0:25–0:30: the card is the 01 §F.1 statement (60 words), too long to voice in 5 s; see the end card line above.
