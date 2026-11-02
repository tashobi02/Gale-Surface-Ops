# 04 — Design Brief

| | |
| --- | --- |
| **Owner** | Design (this file owns visual and interaction design) |
| **Date** | 2026-11-02 |
| **Status** | Draft v1 — proposed |
| **Related** | Screens: defined in [03 App Flow](03_App_Flow_and_Diagrams.md) (SCR-xx) · Scope: [01 PRD](01_Product_Requirements_Document.md) · [Docs index](../README.md) |

---

## A. Design objectives

| Topic | Decision (Proposed) |
| --- | --- |
| Audience | EVA planner/crew (P1/P2) and judges (P3) — technically literate, not GIS experts |
| Usage context | Habitat or mission-support desk display; dim room; also projected on a venue screen during judging |
| Primary device | Desktop/laptop, mouse + keyboard, ≥ 1366 × 768. Secondary: tablet landscape ≥ 1024 × 768 (touch) |
| Visual character | "Instrument panel": calm, dark neutral chrome so Mars imagery is the brightest thing on screen; precise numerals; no decorative sci-fi effects |
| Information hierarchy | 1) Is the plan OK? (status) → 2) Where are the problems? (map + profile highlights) → 3) How big are the margins? (metrics) → 4) Why should I trust this? (provenance chips → methods) |
| Usability priorities | Never hide a constraint violation; every number explains itself in one click; core flow keyboard-operable; nothing requires reading a manual |

---

## B. Layout and navigation

Desktop layout (≥ 1280 px):

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Top bar 48px: Logo/site name · data-version chip · [Briefing] [Sources] [?] │
├────────────┬───────────────────────────────────────────────┬─────────────────┤
│ Left drawer│                                               │ Right drawer    │
│ 320px      │                MAP (fills)                     │ 320px           │
│ Tabs:      │  scale bar ▸ bottom-left                       │ Tabs:           │
│  Layers    │  north arrow ▸ top-right of map                │  POI detail     │
│  Plan      │  coordinate readout ▸ bottom-right             │  Conditions     │
│            │  Add-stop toggle ▸ map toolbar (top-left)      │                 │
├────────────┴───────────────────────────────────────────────┴─────────────────┤
│ Results panel 220px (collapsible to 48px status strip):                      │
│ [Status banner] [metrics row] [elevation/slope profile]  [warnings list]     │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Element | Placement and behavior |
| --- | --- |
| Map | Always visible; never covered by more than one drawer on screens < 1280 px |
| Layer controls & legends | Left drawer "Layers" tab; legends inline under each enabled layer (not a separate floating legend) |
| Mission inputs & stops | Left drawer "Plan" tab; inputs collapsed into "Constraints" accordion after first edit, stops list stays open |
| POIs | Map markers; detail in right drawer |
| Route results | Bottom panel; status strip remains when collapsed |
| Warnings | Bottom panel list + map symbols + profile highlights (three synchronised views) |
| Uncertainty & sources | Provenance chip next to every value; Sources overlay full-screen with anchors |

---

## C. Visual system

### C.1 Colour palette (contrast verified by computation, WCAG relative luminance)

#### Chrome (dark theme, default)

| Token | Hex | Use | Contrast on `panel` |
| --- | --- | --- | --- |
| `bg` | `#0F141A` | App background, line casing | — |
| `panel` | `#161D26` | Drawers, results panel | — |
| `raised` | `#1E2733` | Cards, inputs | — |
| `text-primary` | `#E8EDF2` | Body text, numbers | 14.4 : 1 |
| `text-secondary` | `#A9B4C2` | Labels | 8.07 : 1 |
| `text-muted` | `#8593A3` | Hints, units | 5.41 : 1 (4.81 on `raised`) |
| `accent` | `#4CC9F0` | Route line, primary buttons, selection | 8.82 : 1 |
| `focus` | `#FFD84D` | Keyboard focus ring (2 px + 2 px offset) | 12.26 : 1 |

#### Semantic (status) — always paired with icon + pattern + text

| Token | Hex | Meaning | Icon | Map/profile pattern |
| --- | --- | --- | --- | --- |
| `ok` | `#3DD68C` | Within limits | ✓ circle | solid |
| `caution` | `#F5A524` | Caution slope, possible loose fines, near limit | ▲ triangle | diagonal hatch |
| `blocked` | `#FF6B6B` | Over hard limit, no route, limit exceeded | ⬣ octagon | cross-hatch |
| `unknown` | `#B8A9FF` | No data / layer unavailable / not modelled | ? diamond | dotted |

All four ≥ 6.1 : 1 on `panel`.

**Provenance chips** (outline style so they never compete with status colours): `measured` ■ filled square, `derived` ◆, `modelled` ○ ring, `assumed` △ outline triangle — each with its word, in `text-secondary` on `raised`.

**Print theme (SCR-08):** text `#111827` on white (17.7 : 1); caution `#9A5B00` (5.43 : 1); blocked `#B42318` (6.57 : 1); ok `#0E7A4F` (5.36 : 1); patterns retained so black-and-white printing stays readable.

#### Map overlays

- Route: 4 px `accent` line with **2 px `bg` casing on each side**. Reason: `accent` on mid-ochre imagery (`#B07A55`) is only 1.9 : 1, the casing raises edge contrast to 5.07 : 1 (both computed).
- Slope ramp (sequential, colour-blind-safe): 0–5° transparent, 5–10° `#FDE7A9` 40 %, 10–15° `#F5A524` 55 %, 15–25° `#E4572E` 65 % + hatch, > 25° `#8B1E3F` 75 % + cross-hatch. Class edges follow the *current* caution/hard limits, not fixed values.
- Elevation: perceptual sequential ramp (e.g., *batlow* or *viridis*), legend in metres.
- Thermal inertia: separate sequential ramp (e.g., *cividis*) so it is not confused with elevation; legend in tiu with "100 m pixels" note.

### C.2 Typography

| Role | Font | Size / weight |
| --- | --- | --- |
| UI text | **Inter** (self-hosted, offline) | 14 px / 400, line-height 1.45 |
| Panel headings | Inter | 16 px / 600 |
| Screen titles | Inter | 20 px / 600 |
| Metric values | **IBM Plex Mono** (tabular numerals) | 20 px / 500 |
| Units and labels next to metrics | Inter | 12 px / 500, `text-muted` |
| Map labels | Inter | 12 px / 600 with 2 px `bg` halo |

Minimum text size 12 px; numbers always carry units (`1.18 km`, `26 min`, `11.4°`, `0.19 mSv`).

### C.3 Spacing and sizing

- 4 px base grid; component padding 12/16 px; section gaps 24 px.
- Touch targets ≥ 44 × 44 px (tablet); mouse targets ≥ 32 px.
- Drawer width 320 px; results panel 220 px (48 px collapsed).
- Waypoint markers 28 px numbered circles; POI markers 24 px.

### C.4 Iconography

Single outline icon set (e.g., Lucide, MIT-licensed — verify licence in TASK-16). Required icons: layers, route, flag (stop), home/habitat (start), sun, radiation, thermometer, warning variants (C.1), info, print, download, undo.

### C.5 Map annotations and selection states

| Element | Default | Hover | Selected | Disabled/invalid |
| --- | --- | --- | --- | --- |
| Waypoint | `accent` fill, `bg` number | +2 px ring | `focus` ring 3 px | `blocked` outline + ⬣ |
| POI | white pin, `bg` outline | label shown | `accent` pin + right drawer open | — |
| Route leg | cased `accent` line | thicker 6 px | — | NO_ROUTE: dashed `unknown` to nearest reachable point |
| Hazard segment | — | tooltip | — | overlay of `caution`/`blocked` hatch along route |
| Traverse | thin `#E8EDF2` 60 % dashed | sol label | — | — |

---

## D. Interaction and component behavior

| Component | Default | Selected/active | Loading | Disabled | Empty | Error |
| --- | --- | --- | --- | --- | --- | --- |
| Layer row | Toggle off, collapsed legend | Toggle on, legend expanded | Skeleton legend + spinner on toggle | Greyed with reason ("Unavailable in this build") | — | Inline `unknown` message |
| Input field | Value + unit | Focus ring | — | Read-only during demo-lock (optional) | — | Red outline + range text below |
| Stops list | Numbered rows | Row highlighted ↔ map marker | Row ETA shimmer | — | "Add a stop: click a POI or press A" | Row marked ⬣ with reason |
| Status banner | — | OK / Over limits / Partial | "Computing…" (no layout jump) | — | "No plan yet" | "Computation failed — Retry" |
| Profile chart | Elevation line + patterns | Cursor + tooltip | Faded previous profile under spinner | — | Hidden | Message in chart area |
| Metric tile | Value + unit + chip | — | Previous value at 50 % opacity | — | "—" with tooltip "needs a plan" | `unknown` styling |
| POI image | Image + credit | Click → full-size dialog | Blurred placeholder | — | — | "Image not available" + source link |
| Briefing button | Enabled when plan exists | — | — | Disabled with tooltip when no stops | — | — |

**Discoverability:** first-run coach marks (3 steps, dismissible, stored only in memory): "Turn on Slope", "Click a POI → Add as stop", "Open Briefing".

**Feedback:** every recompute updates the status banner within 100 ms ("Computing…") and finishes within the NFR-02 target.

**Progressive disclosure:** metrics row shows 6 headline values; "Details" expands per-leg table; equations live only in Sources & Methods.

**Information overload guard:** max two scientific overlays visible at once (third toggle auto-dims the oldest and tells the user).

---

## E. Accessibility and responsive behavior

| Requirement | Implementation |
| --- | --- |
| Contrast | Tokens in C.1 (all text ≥ 4.5 : 1; status colours ≥ 6.1 : 1 on panels) |
| Keyboard | Tab order: top bar → left drawer → map toolbar → map → results → right drawer. Map: arrow keys pan, `+`/`−` zoom, `A` add-stop mode, `Enter` places a stop at the **map-centre crosshair** (visible in add-stop mode), `Delete` removes selected stop, `B` briefing, `?` sources |
| Focus | 2 px `focus` ring + 2 px offset on every interactive element, including waypoints |
| Non-colour cues | Icons + patterns + text for every status; profile classes patterned |
| Touch | ≥ 44 px targets; long-press on map = place stop; drag handles 44 px |
| Map content outside the map | Stops table (coordinates, ETA, sun elevation), warnings list with locations, per-leg table — all screen-reader readable; `aria-live="polite"` announces status changes ("Plan updated: Over limits, 2 warnings") |
| Motion | Respect `prefers-reduced-motion` (no animated flyTo; instant jumps) |
| Responsive | ≥ 1280: three-column layout. 1024–1279: one drawer at a time (left or right), results panel 180 px. 768–1023 (tablet portrait): drawers become bottom sheets; profile collapses to metrics + "Show profile". < 768: view-only message with briefing card readable |

---

## F. Wireframe guidance

### SCR-01 Mission Briefing

Centered column (max 720 px) over a darkened, blurred site image: site title (20 px), one-sentence science objective, three-line "What this tool does", row of data badges, disclaimer box (`unknown` outline), primary button **Start planning**, secondary **Open demo plan**, text link **Sources & methods**.

### SCR-02 Map Workspace (with SCR-03/04/05/07 embedded)

As in the layout in §B. Map toolbar top-left: Add-stop toggle, Fit AOI, Measure (optional). When Add-stop mode is on, crosshair appears at map centre and the toggle is `accent` filled.

### SCR-05 Results (bottom panel)

Left 280 px: status banner (icon, word, one-line reason). Middle: metrics row (Distance · Walk time · EVA total / limit · Max slope · Max walkback / limit · Dose) above the profile (full width of middle area, 140 px tall). Right 300 px: warnings list, newest-severity first.

### SCR-06 POI Detail (right drawer)

Image at top (16:9, click to enlarge), credit line under image (12 px), title, "Science objective" paragraph, "Why it matters" paragraph, position source with provenance chip, button **Add as stop**.

### SCR-08 Briefing Card (print)

A4/Letter portrait, 12 mm margins. Row 1: header (site, plan name, data version, plan hash, timestamp). Row 2 (two columns): route map snapshot (left 60 %), metrics + status (right). Row 3: stops/timeline table (stop, arrival UTC/LTST, dwell, sun elevation, notes). Row 4: profile. Row 5: warnings + assumptions (two columns). Footer: sources (short form) + prototype disclaimer.

### SCR-09 Sources & Methods

Full-screen overlay, left anchor list (Datasets · Processing · Models · Limitations · AI use · Diagnostics), right content with tables.

An HTML wireframe is **not** produced: the layout above is simple enough to build directly, and time is better spent on the TASK-02 rendering spike.

## Unresolved items owned by this document

| ID | Item | Recommendation |
| --- | --- | --- |
| U-08 | Light theme for daylight venue projection | Add a high-contrast light variant only if the venue projector washes out dark UI (test at check-in) |
| U-09 | Colour HiRISE vs. grayscale basemap | Prefer colour COG if it covers the AOI; grayscale gives better hazard-overlay contrast — make it a toggle |
