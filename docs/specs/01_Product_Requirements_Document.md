# 01 — Product Requirements Document

| | |
| --- | --- |
| **Owner** | Product (this file owns scope and acceptance criteria) |
| **Date** | 2026-11-02 |
| **Status** | Draft v1 — proposed, pending team review |
| **Related** | [Docs index](../README.md) · [02 Technical](02_Technical_Requirements_Document.md) · [03 App Flow](03_App_Flow_and_Diagrams.md) · [04 Design](04_Design_Brief.md) · [05 Schema](05_Backend_and_Database_Schema.md) · [06 Plan](06_High_Level_Implementation_Plan.md) |
| **Product** | Marswalk Planner *(working title — rename before submission)* |
| **Challenge** | NASA Space Apps 2026 — *Interplanetary Survival Guide: Martian Map* |

## Label legend used in all documents

| Label | Meaning |
| --- | --- |
| **Confirmed** | Supported by a supplied project file or a verified external source (linked) |
| **Assumed** | Adopted temporarily so work can proceed; must be revisited |
| **Proposed** | Our recommended product or technical decision |
| **Unresolved** | Needs a team decision or further verification |

---

## A. Product overview

### A.1 Description

A browser-based, offline-capable planning map for **one hyperlocal Mars site**. A user (proposed persona: a mission planner or crew member rehearsing a surface excursion) places science stops on high-resolution orbital imagery and terrain, and the app:

1. layers multi-mission NASA data (optical, topographic, thermal; spectral if time permits),
2. computes a walkable route between the stops that respects suited-walking slope limits and known hazards,
3. shows the elevation/slope profile, time budget, return distance, daylight window, and an estimated radiation dose,
4. shows what the destination looks like from the ground using real rover images,
5. produces a one-page **Marswalk briefing card** with every number labelled as measured, derived, modelled or assumed.

### A.2 Problem statement

**Confirmed (challenge overview):** NASA data about Mars "isn't yet layered together in the combinations needed to plan specific human missions," and existing tools such as Mars Trek and the USGS-NASA mapping program "are built for regional and global views rather than the hyperlocalized areas astronauts will target on individual spacewalks or surface excursions."

**Proposed framing:** a planner needs to answer, for one excursion: *Can I walk there safely in a suit, see what I need to see, and get back within my consumables and daylight — and how sure am I about each of those answers?*

### A.3 Relationship to the official challenge

| Challenge element | Status in challenge text | How we respond |
| --- | --- | --- |
| Map/tool/interface an astronaut could use during a surface mission, using NASA data | **Official objective** | Core product |
| Layered, integrated view of a location or route combining data from multiple NASA missions | **Official objective** | MGS (MOLA control), MRO (HiRISE, CTX), Mars Express (HRSC, via the USGS merged DEM), Odyssey (THEMIS), MSL (RAD, traverse, rover images) |
| At least three kinds of data | **Optional** ("You may consider") | Optical + topographic + thermal (+ radiation context); spectral is desirable |
| Safety focus; space-weather/radiation | Suggested ("consider") | Radiation dose estimate from measured RAD rates |
| Route map avoiding obstacles, considering suit mobility | Suggested ("if possible") | Constraint-aware route between science stops |
| POV imagery from surface missions | Optional consideration | Curated Curiosity images at points of interest |
| HUD / tablet / habitat display format | Optional consideration | Proposed: habitat/desktop planning display first; tablet secondary |
| Boxwork at Mount Sharp as an example science objective | Example only | **Proposed** as our site (decision D-01) |

### A.4 Intended users and primary tasks (Proposed — inferred, not user-researched)

| Persona | Primary tasks | Notes |
| --- | --- | --- |
| **P1 — EVA planner** (habitat/ground) | Choose stops, compute and compare routes, check constraints, export a briefing | Primary persona for the MVP |
| **P2 — Crew member rehearsing the walk** | Read the briefing, inspect the profile and POV images | Read-mostly; same screens |
| **P3 — Hackathon judge / public viewer** | Understand in under two minutes what the map shows and why it is credible | Drives demo and provenance requirements |

### A.5 Value proposition (Proposed)

One screen that turns scattered NASA products into an **excursion-scale go/no-go picture**, with explicit uncertainty — instead of a pretty map that silently mixes measured data with guesses.

---

## Clarifications

### Session 2026-11-02

Recorded with `/speckit.clarify` after a `/speckit.analyze` pass over docs/specs.

- Q: When is the 30-s global video due? → A: Upload by 14 Nov 09:00; hard cut-off 12:00 (as in 06 §A).
- Q: Where does the site manifest list its assets? → A: In a required `assets: Asset[]` field on Site (05 §C); every `*_asset` / `asset_id` resolves against it.
- Q: What is the MVP tablet scope? → A: Tablets ≥ 768 px wide can view and add/delete stops (drag only if time permits); layouts follow 04 §E; < 768 px is view-only (03 U-07, 02 NFR-03).
- Q: When can the Briefing card be opened? → A: For any computed plan — OK, Over limits or Partial — with a banner for Over limits and Partial; disabled with no stops or after a computation error (03 SCR-08, 04 §D).

---

## B. Goals and success criteria

All numeric targets below are **Proposed** unless marked otherwise.

| Category | Goal | Success criterion (MVP) |
| --- | --- | --- |
| **User value** | Planner can evaluate one excursion end-to-end | From opening the app, a first-time user produces a briefing card for a 3-stop route in **≤ 5 minutes** without help (tested with ≥ 3 people outside the team) |
| | Hazards are not hidden | 100 % of route segments that exceed the configured slope limit or cross no-data/hazard cells are flagged in the profile *and* the card |
| **Core workflow completion** | Route computation is reliable | For 20 scripted waypoint pairs inside the AOI, the router returns either a valid route or an explicit "no feasible route" reason — **0 crashes, 0 silent failures** |
| | Plan is editable | Moving, adding or deleting a stop recomputes all results in **≤ 2 s** on the weakest team laptop (NFR-02) |
| **Demonstration readiness** | Demo runs with Wi-Fi off | Full core scenario (§E) runs from local files with network disabled, rehearsed ≥ 2 times |
| | Videos and submission | 240-s local judging video by **13 Nov 18:30** and 30-s global video uploaded by **14 Nov 09:00** (hard cut-off 12:00) (**Confirmed** dates, Participants Guide run of show) |
| **Technical / scientific credibility** | Every displayed number has provenance | Each metric on the briefing card carries a label (measured / derived / modelled / assumed) and a source link |
| | Compute is tested | Unit tests pass for slope, routing, time model, radiation, and Mars24 solar functions (reference values listed in [02 §D](02_Technical_Requirements_Document.md#d-core-processing-and-simulation-behavior)) |
| | Data are aligned | Curiosity traverse overlays the orthoimage tracks within the stated DEM/ortho registration tolerance (visual check at 5 locations) |

---

## C. MVP scope

### C.1 Required for MVP

- One site, one AOI (decision D-01), fully offline.
- Map with optical basemap, hillshade/elevation, slope, thermal-inertia layers, legends and opacity.
- Point inspection (coordinates in planetocentric °E, elevation, slope, thermal inertia, with source).
- Curated points of interest with science objective and ground-level rover image.
- Curiosity traverse overlay (historical context, multi-mission evidence).
- Mission inputs with defaults (start time, EVA time limit, slope limits, walkback limit, suited speed, solar-cycle phase).
- Waypoint placement and editing; automatic constraint-aware route between consecutive waypoints.
- Elevation/slope profile linked to the map; hazard and constraint warnings.
- Time, distance and return estimates; daylight window (Mars24); radiation dose estimate (RAD-measured rates).
- Briefing card (print view) and plan export (JSON).
- Sources & methods panel; provenance labels everywhere.

### C.2 Desirable if time permits

- CRISM spectral layer (if MTRDR coverage exists in the AOI — feasibility check TASK-01).
- Illustrative metabolic/oxygen consumption estimate.
- REMS-based seasonal temperature/pressure context for the chosen L_s.
- Save/restore last plan in browser storage.
- Compare two route variants side by side.
- Sun-elevation-based shadow hint at each stop.

### C.3 Post-MVP

- Additional sites (Jezero fallback becomes a second site).
- Live/cached space-weather status (e.g., NASA DONKI — unverified for Mars relevance).
- 3D terrain view; helmet-HUD mock mode.
- Earth–Mars light-time and communication-window display.
- Rover-assisted traverses and crew-pair planning.
- Optional AI narration of the briefing, grounded only in computed results.

### C.4 Explicitly out of scope

- Real-time astronaut tracking, live telemetry, or any operational use.
- Accounts, collaboration, cloud persistence, billing.
- Global/planet-wide routing.
- Medical or flight-rule radiation limits, suit certification claims.
- AI-generated numbers of any kind.

---

## D. Functional requirements

Priority: **M** = Must (MVP), **S** = Should (desirable), **C** = Could (post-MVP).
Screens referenced are defined in [03](03_App_Flow_and_Diagrams.md); compute in [02](02_Technical_Requirements_Document.md); entities in [05](05_Backend_and_Database_Schema.md).

### FR-01 — Load site and optical basemap offline

- **User story:** As a planner, I open the app and immediately see the excursion site in high-resolution orbital imagery.
- **Priority / release:** M / MVP
- **Behavior:** On launch, load `site-manifest.json`, initialise the local Mars projection, render the HiRISE-based basemap at the AOI extent.
- **Inputs / outputs:** Site manifest → rendered map, scale bar in metres, north arrow.
- **Dependencies:** TASK-01 (AOI), TASK-03 (tiles).
- **Acceptance criteria:**
  - *Given* the network is disabled, *when* the app is opened from the local server, *then* the basemap renders within 5 s and no network request leaves `localhost`.
  - *Given* the map at any zoom, *then* the scale bar length agrees with a measured feature (e.g., known crater diameter in the DEM) within 2 %.

### FR-02 — Scientific layers with legend and opacity

- **User story:** As a planner, I toggle elevation, slope and thermal-inertia layers to understand terrain and surface materials.
- **Priority:** M (optical, hillshade, elevation, slope, thermal inertia); S (CRISM spectral — FR-18)
- **Behavior:** Layer panel lists each layer with on/off, opacity (0–100 %), legend with units, resolution, and provenance label.
- **Acceptance criteria:**
  - *Given* any layer is on, *then* its legend shows units (m, °, tiu) and native resolution.
  - Toggling a layer updates the map within 300 ms (tiles cached).
  - Layer order is fixed: basemap < hillshade < scientific overlay < hazards < route < POIs.

### FR-03 — Point inspection

- **User story:** As a planner, I click a spot to read its exact position and values.
- **Priority:** M
- **Behavior:** Click/tap (or the keyboard crosshair, see NFR-04 and [04 §E](04_Design_Brief.md#e-accessibility-and-responsive-behavior)) shows a popover: planetocentric latitude, east-positive longitude (°, 5 decimals), elevation (m relative to the DEM's MOLA-tied datum), slope (°), thermal inertia (tiu or "no data"), each with source.
- **Acceptance criteria:**
  - Values match the preprocessed rasters at that cell (test: 10 sampled cells against Python `rasterio` readout, tolerance: exact for elevation at routing-grid cell, ±0.1° slope).
  - Clicking outside the AOI shows "Outside mapped area" and no values.

### FR-04 — Points of interest with ground imagery

- **User story:** As a crew member, I see what a science stop looks like from the ground before I go.
- **Priority:** M
- **Behavior:** POI markers (5–8 curated) open a detail panel (SCR-06): name, science objective, why it matters, a locally stored Curiosity Navcam/Mastcam image with credit, sol/date, approximate look direction if known, and "Add as stop" button.
- **Acceptance criteria:**
  - Every POI has `image_credit`, `source_url`, and `position_source` fields populated (see [05](05_Backend_and_Database_Schema.md#poi)).
  - "Add as stop" appends the POI as the next waypoint and triggers recomputation.

### FR-05 — Mission inputs with validated defaults

- **User story:** As a planner, I set EVA constraints so the plan reflects my mission rules.
- **Priority:** M
- **Inputs (defaults are Assumed, editable):** EVA start (UTC date-time or local true solar time), max EVA duration (h, default 6), dwell time per stop (min, default 20), hard slope limit (°, default 15), caution slope (°, default 10), walkback limit (km of route distance from start, default 5), flat-ground suited speed (km/h, default 3.3 — Apollo 17 planning value), solar-cycle phase for radiation (max / min).
- **Acceptance criteria:**
  - Out-of-range inputs are rejected inline with the valid range shown (ranges in [02 §E.3](02_Technical_Requirements_Document.md#e3-input-validation-rules)).
  - Changing any input recomputes results without page reload.
  - A visible badge says "Defaults are assumptions — not flight rules."

### FR-06 — Waypoint placement and editing

- **User story:** As a planner, I place a start point and science stops, then drag, reorder or delete them.
- **Priority:** M
- **Behavior:** Start point = habitat/rover position (default from manifest, movable). Up to 10 stops. Stops are numbered; list in panel supports reorder (drag + keyboard up/down buttons) and delete. Route returns to start by default ("loop" on; toggle to one-way).
- **Acceptance criteria:**
  - Placing a waypoint on a no-data or impassable cell is refused with a message and the nearest passable cell offered (snap within 50 m).
  - Undo of the last waypoint action is available (single-level is sufficient).

### FR-07 — Constraint-aware route computation

- **User story:** As a planner, I want the tool to find a walkable path between my stops that avoids slopes I cannot climb and known hazards.
- **Priority:** M
- **Behavior:** For each consecutive waypoint pair, run least-time search on the routing grid (algorithm and cost model in [02 §D.2](02_Technical_Requirements_Document.md#d2-route-planning-fr-06-fr-07-fr-10)). Cells above the hard slope limit, no-data cells and hard-hazard cells are impassable; caution cells cost more.
- **Outputs:** Polyline per leg, total distance, total time, max slope, list of flagged segments.
- **Acceptance criteria:**
  - *Given* two passable points connected by passable cells, *when* routing runs, *then* a route is returned whose every step satisfies the hard slope limit (verified by re-sampling the result).
  - *Given* no passable connection, *then* the leg is marked "No feasible route" with the reason (e.g., "all paths exceed 15° slope") and the nearest reachable point toward the target is shown.
  - Routing a 3-stop loop completes in ≤ 2 s (NFR-02).
  - Same inputs + same data version ⇒ identical route (NFR-06).

### FR-08 — Elevation and slope profile

- **User story:** As a planner, I see where the climbs and dangerous sections are.
- **Priority:** M
- **Behavior:** Profile chart under the map: elevation vs. cumulative distance, segments coloured *and patterned* by slope class (OK / caution / over-limit), stop markers. Hover/keyboard focus on the chart highlights the corresponding map location and vice versa.
- **Acceptance criteria:** Total climb and descent shown in metres; chart remains readable in grayscale (pattern + label, not colour only).

### FR-09 — Traverse time, distance and return estimates

- **User story:** As a planner, I know how long the excursion takes and whether I stay within limits.
- **Priority:** M
- **Behavior:** Compute walking time per leg (slope-dependent speed model), add dwell times, compute EVA timeline, remaining margin vs. max duration, and maximum route distance from start (walkback check).
- **Acceptance criteria:** Reference cases in [02 §D.3](02_Technical_Requirements_Document.md#d3-walking-time-model-fr-09) reproduce exactly in unit tests (e.g., 1 km flat at 3.3 km/h = 18.2 min).

### FR-10 — Hazard and constraint warnings

- **Priority:** M
- **Warning types:** over hard slope (blocked), caution slope, low-thermal-inertia "possible loose sand" (caution, interpretive), no-data cell adjacency, walkback limit exceeded, EVA duration exceeded, segment in darkness (sun below horizon).
- **Acceptance criteria:** Each warning shows severity icon + text + affected segment/time, appears in the results panel and on the briefing card, and can be clicked to zoom to the location.

### FR-11 — Daylight and sun conditions

- **User story:** As a planner, I want to finish the walk in daylight.
- **Priority:** M
- **Behavior:** Compute local true solar time, solar elevation and azimuth at the site for the EVA window using the Mars24 algorithm (Allison & McEwen 2000); show sunrise/sunset (local, ignoring terrain), L_s (season), Mars Year.
- **Acceptance criteria:** Unit tests match reference values from a trusted Mars24 implementation for ≥ 3 timestamps within 0.1° (solar elevation) and 1 min (LTST). Terrain shadowing is explicitly stated as not modelled.

### FR-12 — Radiation dose estimate

- **User story:** As a planner, I see the expected surface radiation dose for this excursion and how solid that number is.
- **Priority:** M
- **Behavior:** Dose equivalent = measured Gale surface rate × EVA duration, for selected solar-cycle phase. Show rate source (Curiosity RAD), uncertainty, and caveats (no suit shielding, no SEP events, no terrain shielding).
- **Acceptance criteria:** For a 7 h EVA at solar-maximum rate 0.64 mSv/day the card shows 0.19 mSv (verified arithmetic: 0.64 × 7/24 = 0.187). Label: "measured rate × planned duration (simplified)."

### FR-13 — Environmental context (seasonal weather)

- **Priority:** S
- **Behavior:** Show REMS-derived typical air/ground temperature and pressure ranges for the L_s bin of the EVA date.
- **Acceptance criteria:** Values trace to named REMS RDR files and the binning script; if not prepared, the panel shows "Not included in this build" rather than placeholder numbers.

### FR-14 — Briefing card and plan export

- **User story:** As a crew member, I take a one-page summary of the excursion with me.
- **Priority:** M
- **Behavior:** Print-optimised view (SCR-08): map thumbnail with route, stops table, timeline, profile, constraints, warnings, conditions, assumptions, sources, data version, plan hash. Export plan as JSON (schema in [05](05_Backend_and_Database_Schema.md#planexport)).
- **Acceptance criteria:** Prints to one A4/Letter page in Chrome without clipping; re-importing exported JSON (if FR-20 built) or reloading it in a test reproduces identical metrics.

### FR-15 — Provenance and methods

- **Priority:** M
- **Behavior:** Every layer and computed value has a provenance label and a link into the Sources & Methods panel (SCR-09), which lists datasets, versions, resolution, licence/credit, processing steps and known limitations.
- **Acceptance criteria:** No numeric value is displayed without a provenance label (automated UI test checks `data-provenance` attribute on every metric element).

### FR-16 — Offline and degraded operation

- **Priority:** M
- **Behavior:** All demo assets are local. If a layer fails to load, the layer row shows an error state and the rest of the app works; routing requires only the routing grid.
- **Acceptance criteria:** Deleting the thermal-inertia tiles results in a visible "Layer unavailable" state and routing still succeeds (sand-caution warnings then show "unknown").

### FR-17 — Curiosity traverse overlay

- **Priority:** M
- **Behavior:** Show Curiosity's historical traverse and waypoints in/near the AOI with sol labels; clicking shows sol and source.
- **Acceptance criteria:** Overlay aligns with visible rover tracks on the HiRISE basemap at ≥ 3 checked locations (tolerance stated in [02 §C](02_Technical_Requirements_Document.md#c-mars-data-and-geospatial-handling)).

### FR-18 — Spectral (CRISM) layer — S

- Shown only if TASK-01 confirms MTRDR coverage of the AOI. Labelled as summary-parameter browse product, "not a mineral identification."

### FR-19 — Illustrative consumables estimate — S

- Metabolic-rate-based oxygen estimate from historical planning values; labelled **illustrative**, never shown as a limit.

### FR-20 — Save/restore plan locally — S

- Last plan in browser storage, wrapped in error handling; app works if storage is unavailable.

### FR-21 — Post-MVP items — C

- Space-weather status, 3D view, multi-site, AI narration (see C.3).

---

## E. Core demonstration scenario

**Starting conditions:** Laptop, local static server running, Wi-Fi off. App opens on the Mission Briefing screen (SCR-01) for the Mount Sharp boxwork site (D-01). Default mission inputs loaded.

| Step | User action | What is displayed | Value demonstrated |
| --- | --- | --- | --- |
| 1 | Reads the brief, clicks **Start planning** | Map workspace: HiRISE basemap, start marker ("Habitat/rover"), POIs, Curiosity traverse | Hyperlocal, multi-mission view |
| 2 | Toggles **Slope**, then **Thermal inertia** | Slope classes; low-TI areas as possible loose sand; legends with units and sources | Layered data types |
| 3 | Opens POI "Boxwork ridge" | Science objective; Curiosity Navcam image of the ridge; credit | Ground-truth POV |
| 4 | Clicks **Add as stop** for 3 POIs | Route computed; profile appears; metrics update | Constraint-aware routing |
| 5 | Drags stop 2 onto a steep slope | Leg turns "blocked/no feasible route" with reason; nearest reachable point shown | Honest failure behavior |
| 6 | Moves stop 2 back; changes hard slope limit 15° → 12° | Route re-routes around a ridge; time increases | Explicit trade-off |
| 7 | Sets EVA start to early morning | Daylight warning on first leg; sun elevation shown | Conditions integration |
| 8 | Opens **Briefing card** | One-page summary: route, timeline, radiation 0.19 mSv (7 h, solar max), warnings, assumptions, sources | Usable output |
| 9 | Opens **Sources & methods** | Dataset list, versions, processing steps, labels | Credibility |

**Result produced:** an exportable plan and briefing card for a 3-stop Marswalk with explicit constraints and uncertainty.

---

## F. Non-goals, assumptions, and risks

### F.1 Prototype boundary (must appear in the app and the video)

> Marswalk Planner is an exploratory planning prototype built for a hackathon. It is **not** validated astronaut operations software. Slope limits, walking speed and consumables values are illustrative assumptions drawn from Earth and Apollo-era references; radiation values are measured background rates at one site and exclude solar particle events, suit shielding and terrain shielding.

### F.2 Key assumptions

| ID | Assumption | Label | Why it matters |
| --- | --- | --- | --- |
| A-01 | The 1 m USGS Gale merged DEM is HiRISE-derived within the chosen AOI | **Assumed** — verify (TASK-01) | Where only CTX/HRSC/MOLA fill exists, slopes at walking scale are unreliable |
| A-02 | Suited flat-ground speed 3.3 km/h | **Assumed** (Apollo 17 lunar planning value) | Drives time estimates; Mars suits and 0.38 g differ |
| A-03 | Hard slope limit 15°, caution 10° | **Assumed** — no verified Mars-suit standard found | Drives route feasibility |
| A-04 | Walkback limit 5 km route distance | **Assumed**; references: NASA lunar walkback test studied 10 km; Apollo 17 walking radius 3.1 km | Drives "exceeded" warning |
| A-05 | Low thermal inertia indicates loose fines | **Assumed interpretation** at 100 m pixel scale (~20 % absolute accuracy, Confirmed) | Sand-caution warnings are coarse |
| A-06 | RAD rate at Gale is representative for the AOI | **Assumed** (same crater, similar elevation range) | Radiation estimate |
| A-07 | Team of 6 (roster in [ops/team.md](../ops/team.md); more members may be added later); ~28-hour event window (13 Nov 07:00 → 14 Nov 11:00); 16–20 focused hours per person → ≈ 96–120 person-hours ([06 §A](06_High_Level_Implementation_Plan.md#a-planning-assumptions)) | Team size **Confirmed** (team owner, 2026-11-04); focused hours per person **Assumed** | Scope feasibility |

### F.3 Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| DEM in AOI is not HiRISE-quality | Routing meaningless at walking scale | TASK-01 check; fallback to Jezero M2020 TRN HiRISE DTM mosaic |
| Custom Mars projection rendering issues in the map library | Map does not render | Fallback: pre-rendered static images in a local metric frame (see [02 §B](02_Technical_Requirements_Document.md#b-technology-choices)) |
| Router too slow in browser | Laggy demo | 5 m routing grid; Web Worker; precomputed demo route as last resort |
| Pre-event building may be restricted by Space Apps rules | Disqualification risk | **Confirmed** — Dhaka Local Lead allowed pre-event application code on 2026-11-04 (Track P, [ops/rules.md](../ops/rules.md)); re-check against the 2026 guides on 13 Nov |
| Over-claiming science | Validity score loss | Provenance labels, methods panel, prototype disclaimer |

### F.4 Unresolved decisions owned by this document

| ID | Decision | Recommendation |
| --- | --- | --- |
| D-01 | Site | Gale crater, Mount Sharp boxwork region; fallback Jezero |
| D-08 | Final product name | Team to choose; avoid names already used by other public 2026 repos |
| D-09 | Default slope / walkback / speed values | Keep as editable assumptions; seek a NASA mentor's view at the 11:30 mentor round |
