# 04 — Design Brief

| | |
| --- | --- |
| **Owner** | Design (this file owns visual and interaction design) |
| **Date** | 2026-11-04 |
| **Status** | Draft v2 — supersedes v1 (2026-11-02) |
| **Related** | Screens: [03 App Flow](03_App_Flow_and_Diagrams.md) (SCR-xx) · Scope: [01 PRD](01_Product_Requirements_Document.md) · Behavior: [02 Technical](02_Technical_Requirements_Document.md) · [Docs index](../README.md) |

### Change log v1 → v2

| Area | v1 | v2 |
| --- | --- | --- |
| Character | "Instrument panel", calm dark neutral | **Mission brutalism**: space sci-fi brutalist chrome, strict instrument discipline for data |
| Modes | One dark theme + print | **BRIEF** (light editorial), **OPS** (dark instrument), **HUD** (black visor) + print |
| Surfaces | Planner only | Planner, ops console, EVA tablet, HUD, alert sheet, post-EVA report |
| Alerts | Status banner | Three-level alert system (warning / caution / advisory), latching, acknowledged |
| Type | Inter + IBM Plex Mono | **Chakra Petch** (display) + Inter (UI) + IBM Plex Mono (data) |
| Shape | Rounded-free cards | Chamfered (45° cut-corner) panels, hairline construction grid, registration marks |
| Focus colour | `#FFD84D` (too close to caution amber) | White ring with dark gap |

All contrast ratios below were computed with the WCAG relative-luminance formula on 2026-11-04.

---

## A. Design objectives

### A.1 Audience and contexts

| Surface | User | Context | Input |
| --- | --- | --- | --- |
| Mission briefing, Sources, reports | Judges, crew reading, public | Projector, laptop, print | Mouse, keyboard |
| Planner | P1 EVA planner | Habitat desk, dim room | Mouse, keyboard |
| Ops console | P3 habitat operator | Habitat desk; the demo projector | Mouse, keyboard |
| EVA tablet | P2 crew in a suit | Outdoors, moving, gloves, divided attention, possible stress | Large touch targets, few actions |
| HUD | P2 crew | Visor-style glance while walking | None (read-only) |

### A.2 Visual character: mission brutalism

Exposed structure, heavy type, honest materials, nothing ornamental pretending to be data. The interface should look like **equipment built by people who expect it to be used under pressure**: confident and editorial when you are reading about the mission, quiet and exact when you are flying it.

**The governing rule: brutalism is for chrome, never for data.** Slabs, chamfers, giant headlines and orange belong to structure, navigation and storytelling. Every live value, alert and action obeys instrument rules (§A.3) that override the aesthetic whenever they conflict.

### A.3 Mission-critical principles (non-negotiable)

1. **Colour means status, only status.** In OPS and HUD, status hues (green, amber, red, cyan, violet) are never decoration, and decoration never uses them. Brand orange does not appear in OPS or HUD except the logo mark.
2. **Every status has four cues:** colour + shape + word + fixed position. Never colour alone (colour-blind safe, glare safe).
3. **Dark-cockpit philosophy:** when everything is nominal the screen is quiet. Only abnormal conditions gain colour, weight or motion. (Flight-deck concept used by Airbus and others; cited as a design idea, not a standard we claim to meet.)
4. **Fixed geography.** A value never moves between screens or states. Time to haven is always top-left on EVA and HUD; the alert bar is always top; primary actions are always bottom.
5. **Glanceable numerals.** Mission numbers use tabular monospace, units attached, ≥ 32 px on EVA/HUD. No squared display font for digits (0/O and 8/B confusion).
6. **Two actions to safety.** Summon vehicle and Abort are reachable from any EVA state in ≤ 2 taps plus a hold-to-confirm (§D.3).
7. **Plain, action-first language.** "Shelter now — radiation surge", not "Elevated particle flux detected".
8. **Show age and source.** Stale values grey out with their age; every value carries a provenance chip.
9. **No hidden controls in OPS/EVA.** No hamburger menus, hover-only actions or gestures-only paths.
10. **Motion only for change.** Nothing moves unless something changed. Alerts flash at most twice (< 3 Hz, WCAG 2.3.1), then hold.

### A.4 Information hierarchy

1. **Am I safe?** Alert bar + time to haven.
2. **What do I do next?** Primary action or next stop.
3. **How much margin is left?** O₂, EVA time, dose, daylight.
4. **Where am I?** Map, route, crew, vehicles.
5. **Why should I trust it?** Provenance chips → Sources & methods.

---

## B. Design language

### B.1 Influences: what we take and what we leave

| Source | Take | Leave |
| --- | --- | --- |
| **Reference board (team image, "GravixPoint")** | Chamfered slabs; signal-orange blocks against paper and charcoal; hairline construction grid; monospace microcopy; giant stat tiles ("250+"); metadata labels ("EST. 2026", "VOL. 01-A"); black-and-white architectural photography | Its marketing tone; orange as an all-purpose accent (we fence it to BRIEF) |
| **Anduril** | Stark dark surfaces; product-as-hero; huge confident headlines; restraint; technical credibility through precision | Militaristic framing |
| **Anthropic** | Warm paper neutrals; editorial calm; humane, plain-spoken copy; generous whitespace; clay-warm accent | Soft illustration style |
| **Colossal Biosciences** | Cinematic scientific storytelling; full-bleed imagery with data captions; dark editorial sections that make science feel monumental | Ultra-thin type, low-contrast captions |
| **Starfield (NASA-punk)** | Functional industrial UI; chamfered panels; livery stripes; hazard bands; utilitarian labels; ship-system readouts that feel built, not drawn | Decorative HUD clutter; fantasy glyphs |

**Never:** glow/bloom, scanlines, film grain over data, animated noise, fake scrolling telemetry, decorative gauges, gradients on data, rounded "app" cards, emoji.

### B.2 Modes

| Mode | Look | Used for | Accent |
| --- | --- | --- | --- |
| **BRIEF** | Light paper + charcoal slabs + signal orange; editorial; black-and-white imagery | SCR-01 Mission briefing, SCR-09 Sources & methods, role select, judge-facing pages | Signal orange |
| **OPS** | Near-black instrument; hairlines; status-only colour | SCR-02–07 planner, SCR-11 ops console, SCR-12 EVA tablet | None (cyan is the route, not an accent) |
| **HUD** | Pure black, white numerals, minimal | SCR-13 HUD | None |
| **PRINT** | White, black, patterns | SCR-08 briefing card, SCR-17 post-EVA report | Black |

Mode is set on `<html data-mode="brief|ops|hud|print">`. The mode never changes inside a screen.

---

## C. Visual system

### C.1 Colour tokens

#### BRIEF mode

| Token | Hex | Use | Contrast |
| --- | --- | --- | --- |
| `paper` | `#F7F5F0` | Page background | — |
| `concrete` | `#E8E6E1` | Secondary panels | ink 13.95 : 1 |
| `steel` | `#CFCFCF` | Grey slab (reference image) | ink 11.17 : 1 |
| `ink` | `#1A1A1A` | Text on paper and on orange | 15.97 : 1 on paper |
| `ink-2` | `#5A5A5A` | Secondary text | 6.33 : 1 on paper |
| `charcoal` | `#282828` | Dark slabs, footer bands | paper text 13.53 : 1 |
| `charcoal-text-2` | `#A3A3A3` | Secondary text on charcoal | 5.84 : 1 |
| `signal` | `#E7553D` | Orange slabs, CTA fills (sampled from the reference image) | ink on it 4.78 : 1 ✓; **white on it 3.64 : 1 — large text only** |
| `signal-ink` | `#C2401F` | Orange *text* on paper | 4.76 : 1 |

Rule: text on `signal` is always `ink`. Orange text on paper uses `signal-ink`. `signal` on `charcoal` (4.05 : 1) is for large type and graphics only.

#### OPS mode

| Token | Hex | Use | Contrast on `panel` |
| --- | --- | --- | --- |
| `void` | `#0B0D10` | App background | — |
| `panel` | `#14181D` | Drawers, consoles | — |
| `raised` | `#1C2128` | Cards, inputs | — |
| `hairline` | `#2A313A` | Decorative grid and dividers only | 1.36 : 1 (decorative) |
| `edge` | `#5C6670` | Input and control boundaries | 3.05 : 1 ✓ (non-text ≥ 3 : 1) |
| `text-1` | `#ECEFF2` | Values, body | 15.44 : 1 |
| `text-2` | `#A9B3BE` | Labels | 8.38 : 1 |
| `text-3` | `#8592A0` | Units, hints | 5.62 : 1 (5.10 on `raised`) |
| `route` | `#4CC9F0` | Planned route, selection | 9.27 : 1 |
| `focus` | `#FFFFFF` ring 2 px + 2 px `void` gap | Keyboard focus | — |

#### Status and alert colours (OPS)

| Token | Hex | Meaning | Icon | Pattern | Contrast |
| --- | --- | --- | --- | --- | --- |
| `nominal` | `#3DDC84` | Within limits | ✓ circle | solid | 9.99 : 1 |
| `caution` | `#FFB020` | Act soon / near limit | ▲ triangle | diagonal hatch | 9.75 : 1 |
| `warning` | `#FF4D4D` | Act now / limit exceeded | ⬣ octagon | cross-hatch | 5.45 : 1 (4.95 on `raised`) |
| `advisory` | `#4CC9F0` | Information, no action | ◆ diamond | dotted | 9.27 : 1 |
| `unknown` | `#B8A9FF` | No data / not modelled | ? diamond | dotted | 8.62 : 1 |
| `warning-fill` | `#B3261E` + white text | Warning bar background | | | 6.54 : 1 |
| `caution-fill` | `#FFB020` + black text, hazard stripes at edges | Caution bar background | | | 11.48 : 1 |

The v1 planner tokens `ok / caution / blocked / unknown` map to `nominal / caution / warning / unknown` (same meaning; `blocked` was renamed so the alert system and the planner share one vocabulary).

#### HUD mode (all ≥ 7 : 1 on black)

| Token | Hex | Contrast on `#000000` |
| --- | --- | --- |
| `hud-text` | `#FFFFFF` | 21 : 1 |
| `hud-text-2` | `#A9B3BE` | 9.88 : 1 |
| `hud-nominal` | `#3DDC84` | 11.77 : 1 |
| `hud-caution` | `#FFB020` | 11.48 : 1 |
| `hud-warning` | `#FF6B6B` | 7.57 : 1 |
| `hud-advisory` | `#4CC9F0` | 10.92 : 1 |

#### PRINT

v1 print theme retained: text `#111827` on white (17.7 : 1); caution `#9A5B00` (5.43 : 1); warning `#B42318` (6.57 : 1); nominal `#0E7A4F` (5.36 : 1); patterns kept for black-and-white printers.

#### Provenance chips (all modes; outline style so they never compete with status)

| Class | Glyph | Label |
| --- | --- | --- |
| `measured` | ■ filled square | MEASURED |
| `derived` | ◆ | DERIVED |
| `modelled` | ○ ring | MODELLED |
| `assumed` | △ outline triangle | ASSUMED |
| `replayed` *(v2)* | ▶ | REPLAYED |
| `simulated` *(v2)* | ◇ dashed outline | SIMULATED |

Chip: Plex Mono 11 px uppercase on `raised` (OPS) or `concrete` (BRIEF), `text-2`/`ink-2`, 1 px outline. On EVA/HUD the chip collapses to its glyph only, with the full chip in the long-press detail.

#### Map overlays

- **Route:** 4 px `route` line with 2 px `void` casing (raises edge contrast on ochre imagery to ≥ 5 : 1, v1 computation).
- **Slope ramp (v1, retained):** 0–5° transparent; 5–10° `#FDE7A9` 40 %; 10–15° `#F5A524` 55 %; 15–25° `#E4572E` 65 % + hatch; > 25° `#8B1E3F` 75 % + cross-hatch. Class edges follow the current limits.
- **Comm shadow (v2):** areas with no line of sight to the hab: 45° hatch in `text-3` at 35 %, dotted outline; legend "NO SIGNAL — line of sight only".
- **Haven isochrones (v2):** 10/20/30-min bands from the hab as thin `text-2` contour lines with labels; the band beyond the haven rule gets a `caution` hatch.
- **Crew markers:** chevron pointing along heading, 28 px, `text-1` fill, `void` outline, ID label (`EV1`). Unlinked: dashed outline + `STALE 0:42` label.
- **Vehicles:** squared glyph with chamfered corner; `PR1` pressurized, `UR1` utility; dispatched path dashed `text-1`; rendezvous point = target reticle.
- **Hab:** filled chamfered square, label `HAB`; antenna coverage origin.
- **Traverse (v1):** thin `#E8EDF2` 60 % dashed with sol labels.

### C.2 Typography

| Role | Font | Size / weight | Where |
| --- | --- | --- | --- |
| Display | **Chakra Petch** (OFL — verify, TASK-13) | 40–96 px / 600, uppercase, tracking −1 % | BRIEF headlines, OPS screen titles ≥ 20 px |
| Headings | Chakra Petch | 20–28 px / 600 uppercase | Panel titles |
| UI text | **Inter** | 14 px / 400, line-height 1.45 | Labels, body (OPS) |
| Microcopy | **IBM Plex Mono** | 11–13 px / 500 uppercase, tracking +4 % | Metadata strips, chips, kickers (the reference image's small mono copy) |
| Body (BRIEF) | IBM Plex Mono | 15 px / 400, line-height 1.6 | Editorial paragraphs (reference image) |
| Values | **IBM Plex Mono**, tabular, slashed zero | 20 px (OPS) · 32–56 px (EVA) · 48–72 px (HUD) / 500 | Every number |
| Alert text | Inter | 18 px (OPS) · 22 px (EVA) / 700, sentence case | Alert bar |

Rules: never Chakra Petch for digits or for text under 20 px. Uppercase only for labels ≤ 4 words and headlines; messages and alerts are sentence case. Minimum 12 px anywhere; 16 px on EVA. All fonts self-hosted (offline).

### C.3 Shape, grid and structure

- **Chamfer system:** 45° cut corners via `clip-path`. Sizes: `cut-s` 8 px (chips, buttons), `cut-m` 16 px (cards, panels), `cut-l` 32–64 px (BRIEF slabs, hero blocks). Cut position encodes nothing; default top-right + bottom-left like the reference image. No rounded corners anywhere.
- **Construction grid:** 4 px base; 1 px `hairline` grid lines and `+` registration marks at major intersections (BRIEF hero, OPS empty states, panel headers). Never behind numbers or map content.
- **Slabs:** solid colour blocks that carry a headline or a single huge stat (reference image's "250+" tiles) — BRIEF only, and the post-EVA report summary.
- **Metadata strip:** a 24 px mono strip on every major surface: `SOL 4190 · LTST 13:05 · GALE / MT SHARP · PLAN REV 03 · DATA gale_boxwork-2026.11.08 · REPLAY 60×`. It is the "EST. 2026 / VOL. 01-A" idea made useful.
- **Livery stripe:** a 4 px tri-band (`text-1` / `text-3` / `hairline`) on the top edge of OPS panels — Starfield-style identity that carries no status meaning.
- **Spacing:** padding 12/16 px; section gaps 24 px (OPS), 48–96 px (BRIEF).
- **Targets:** mouse ≥ 32 px; tablet ≥ 44 px; **EVA ≥ 56 px** with ≥ 8 px gaps (gloves, A-assumed).

### C.4 Iconography

One outline set (Lucide, MIT — verify licence in TASK-13), 1.5 px stroke, squared caps. Custom glyphs: hab, pressurized rover, utility rover, crew chevron, antenna/no-signal, radiation (trefoil), relay pass, Earth link. Status shapes as in §C.1. Icons never stand alone for actions on EVA: icon + word.

### C.5 Imagery

- **BRIEF:** black-and-white HiRISE crops and Curiosity images as full-bleed slabs with mono captions (Colossal / reference image). Grayscale conversion is allowed for *decorative* slabs only and is credited "processed".
- **Science images (POI detail, reports):** shown unaltered (no duotone, no crop that changes meaning), with credit, sol, camera, and a "view original" link.

### C.6 Motion

- Transitions ≤ 150 ms ease-out; no parallax; no animated map flights with `prefers-reduced-motion`.
- Warning: alert bar flashes twice (2 Hz) then holds; caution: one pulse then holds.
- Live values update in place without animation; changed values get a 1 s `text-1` underline tick.
- Vehicle and crew markers move smoothly at ≤ 10 Hz; at 60× the trail is shown instead of fast motion.

### C.7 Sound and haptics (EVA, ops)

| Level | Sound | Haptic (Android Chrome; iOS Safari has no Vibration API) |
| --- | --- | --- |
| Warning | Two-tone repeating every 5 s until acknowledged | 3 × 200 ms |
| Caution | Single chime | 1 × 200 ms |
| Advisory | None | None |

Sound is never the only cue; ops has a mute toggle with a visible "SOUND OFF" indicator.

---

## D. Components and behavior

### D.1 Component states

| Component | Default | Active/selected | Loading | Disabled | Stale | Error |
| --- | --- | --- | --- | --- | --- | --- |
| Panel (`cut-m`) | `panel` + livery stripe | `edge` outline 1 px | Skeleton bars | — | — | — |
| Metric readout | Value + unit + provenance glyph | — | Previous value 50 % opacity | "—" + "needs a plan" | Grey value + `0:42` age | `unknown` styling + reason |
| Stat slab (BRIEF/report) | Huge value top-left, mono label bottom-left (reference image) | — | — | — | — | — |
| Alert bar | Hidden (dark cockpit) | Warning / caution / advisory (§D.2) | — | — | — | — |
| Option card (contingency) | `raised`, rank number, ETA, dose, drops | `route` outline | ETA shimmer | Greyed with reason | — | — |
| Action button (primary) | `text-1` fill, `void` text, `cut-s` | Pressed: inverted | Spinner replaces icon | `edge` outline, `text-3` | — | Shake-free red outline + text |
| Critical action (Summon / Abort) | `warning-fill` or `caution-fill` slab with icon + word | Hold progress bar fills along the chamfer | — | Disabled only with visible reason ("No hab link — queued") | — | — |
| Layer row (v1) | Toggle, legend collapsed | Legend expanded | Skeleton | "Unavailable in this build" | — | Inline `unknown` |
| Input (v1) | Value + unit | Focus ring | — | Read-only in demo-lock | — | `warning` outline + range |
| Crew card (ops) | ID, activity, haven, O₂, dose, link | Selected: map follows | — | — | Grey + age | — |
| Vehicle card (ops) | ID, state, ETA, battery | — | — | — | — | — |
| Link indicator | `LINK` + bars | — | — | — | `NO LINK` + age, dashed | — |
| Earth link widget | Light time, next relay pass, queue count | — | — | `CONJUNCTION` | — | — |
| Clock control (ops) | Sim time, speed buttons 1×/10×/60×, pause, next event | Active speed filled | — | — | — | — |
| Event log row | Time, actor, event, provenance | Click → map jumps | — | — | — | — |

### D.2 Alert system

| Level | When | Bar | Behaviour | Example text |
| --- | --- | --- | --- | --- |
| **Warning** | Immediate action required (radiation alert, haven exceeded, O₂ warning) | `warning-fill`, ⬣, full width, top | Latches until acknowledged **and** cleared; sound; options sheet opens on EVA | "Shelter now — radiation surge" |
| **Caution** | Action needed soon (comm shadow ahead, O₂ caution, buddy separation) | `caution-fill`, ▲, hazard stripes | Latches until acknowledged; chime | "Comm shadow in 120 m — stay with EV2" |
| **Advisory** | Information (Earth forecast arrived, relay pass starting) | `raised` + `advisory` ◆ | Auto-dismiss after 10 s; stays in log | "Earth forecast received (sent 14 min ago)" |

- One bar slot; highest level wins; a counter shows others (`+2`). Tapping the counter opens the alert list.
- Text grammar: **action — reason**, ≤ 60 characters, sentence case, no jargon, no exclamation marks.
- Acknowledge = silence + mark as seen; it does not clear the condition. Cleared alerts move to the log.
- The same alert appears with the same words on EVA, HUD and ops.

### D.3 Hold-to-confirm (critical actions)

Gloved taps are imprecise and modal "Are you sure?" dialogs get dismissed by reflex. Critical actions use **press-and-hold 800 ms**: a progress bar runs along the button's chamfered edge; release early cancels; on completion a 300 ms confirmation state shows what will happen ("PR1 dispatched — ETA 12 min"). Keyboard: hold Enter/Space. Accessibility fallback: tap, then tap the "Confirm" button that replaces it for 5 s.

### D.4 Writing rules

- Verbs first in actions: "Summon rover", "Abort to hab", "Approve option 1".
- Units always attached with a thin space: `12 min`, `0.42 km`, `3.1 mGy`.
- Times: mission clock `HH:MM` LTST plus UTC on hover/long-press; durations as `mm:ss` under 1 h.
- Never "live". Use "replayed", "simulated", "computed".
- Errors say what happened and what to do: "Rover can't reach you here — moving rendezvous to ridge foot".

### D.5 Staleness and link loss

Values older than 5 s (live) turn `text-3` with an age stamp. When a suit is unlinked: EVA shows a full-width `NO HAB LINK — operating on cached plan` caution bar; commands show "Queued — sends when link returns"; ops shows that crew card dashed with last-known values and age.

---

## E. Layouts

### E.1 SCR-01 Mission briefing (BRIEF)

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ ⬢ MARSWALK                                   [JOIN AS ▸]  [SOURCES →]       │
├──────────────────────────────────────────┬─────────────────────────────────┤
│ B/W HiRISE slab of Mount Sharp           │      ◢ SIGNAL ORANGE SLAB       │
│ (full bleed, + registration marks)       │  GALE / MT SHARP     SOL 4190   │
│                                          │                                 │
├──────────────────────────────────────────┤  Mono paragraph: one EZ, two    │
│ PLAN THE WALK.                           │  crew, one storm. Every number  │
│ SURVIVE THE STORM.                       │  traced to NASA and ESA data.   │
│ (Chakra Petch 72 px, ink on paper)       │                                 │
│ mono kicker: EXPLORATION ZONE 01-A       │  [START PLANNING ▸] [RUN DEMO]  │
├──────────────┬──────────────┬────────────┴───┬─────────────────────────────┤
│ 7            │ 3            │ 8,100 µGy      │ Disclaimer box (dotted,      │
│ MARS MISSIONS│ STOP TYPES   │ RAD, 20 MAY    │ `unknown` outline): replayed │
│ NASA + ESA   │ SCI/RES/ENG  │ 2024 REPLAYED  │ history, simulated crew.     │
└──────────────┴──────────────┴────────────────┴─────────────────────────────┘
```

Stat slabs are `signal` with `ink` text (4.78 : 1), mirroring the reference image's tiles. Every stat is real and links to its source (7 = MRO, Mars Express, MGS, Odyssey, MSL, MAVEN, TGO; recount if the data list changes).

### E.2 SCR-10 Join / role select (BRIEF)

Five chamfered tiles: PLANNER · OPS · EV1 · EV2 · EARTH (T2). Each shows what the role can do. The ops console displays a QR per role; scanning lands directly in that role. A device remembers its role for the session only.

### E.3 SCR-02 Planner workspace (OPS)

v1 layout retained (top bar 48 px, left drawer 320 px, map, right drawer 320 px, results panel 220 px) with the v2 skin: livery stripe, metadata strip under the top bar, chamfered drawers, Chakra Petch panel titles, Plex Mono values. Results panel adds a **time-to-haven band** and a **comm band** under the elevation profile.

### E.4 SCR-11 Ops console (OPS, ≥ 1280 px, projector)

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⬢ OPS · storm-sol4190 │ SOL 4190 · LTST 13:05 · REV 03 │ ⏸ 1× 10× [60×] ⏭ │ 🔊 │
├──────────────────────────────────────────────────────────────────────────────┤
│ ALERT BAR (hidden when nominal)                                    [+2] [ACK] │
├───────────────┬──────────────────────────────────────────┬───────────────────┤
│ CREW          │                                          │ CONDITIONS        │
│ ┌EV1─────────┐│               MAP                         │ Dose rate  ▶      │
│ │HAVEN 14 MIN││  hab · route · EV1/EV2 chevrons ·         │ Background ▶      │
│ │O₂ 71 %  ○  ││  PR1 · comm shadow hatch ·                │ Sun elev   ○      │
│ │DOSE 0.0 mGy││  haven isochrones                         ├───────────────────┤
│ │LINK ▮▮▮    ││                                           │ EARTH LINK        │
│ └────────────┘│                                           │ Light time 14:02  │
│ ┌EV2─────────┐│                                           │ Next pass MRO 9m  │
│ └────────────┘│                                           │ Queue ↑1 ↓0       │
│ VEHICLES      │                                           ├───────────────────┤
│ PR1 PARKED    │                                           │ OPTIONS (on alert)│
│               │                                           │ 1 Rendezvous 14m  │
│               │                                           │ 2 Abort hab 41m   │
├───────────────┴──────────────────────────────────────────┴───────────────────┤
│ EVENT LOG  13:04 EV1 arrived stop 2 ◇ · 13:05 Radiation alert ▶ · …           │
└──────────────────────────────────────────────────────────────────────────────┘
```

On a warning, the Options panel expands and takes focus; the map auto-frames the affected crew, nearest vehicle and candidate shelters.

### E.5 SCR-12 EVA tablet (OPS, phone/tablet portrait, ≥ 360 px)

```text
┌──────────────────────────────┐
│ ALERT BAR (when present)     │  fixed, 64 px
├──────────────┬───────────────┤
│ HAVEN        │ O₂            │  the two biggest numbers
│ 14 MIN       │ 71 %          │  56 px Plex Mono
│ via PR1  ○   │ 5:41 left ◇   │
├──────────────┴───────────────┤
│ NEXT  Stop 3 · Boxwork ridge │
│ ↗ 040°  ·  0.42 km · 9 min   │
├──────────────────────────────┤
│ MINI-MAP (route, me, buddy,  │
│ shadow ahead, PR1)           │
├──────────────────────────────┤
│ EVA 2:14 · DOSE 0.1 mGy · ▮▮▮│  metadata strip
├──────────────────────────────┤
│ [ SUMMON ROVER ] [ ABORT ]   │  56–72 px, hold-to-confirm
│ [ TASK ROVER (T2) ]  [ HUD ] │
└──────────────────────────────┘
```

### E.6 SCR-13 HUD (black, landscape)

```text
┌───────────────────────────────────────────────────────────┐
│ ⬣ SHELTER NOW — RADIATION SURGE                           │ (only when alerting)
│                                                           │
│ HAVEN 14 MIN ○        ↗ 040°  0.42 KM        O₂ 71 %      │
│ via PR1               STOP 3                 5:41 LEFT    │
│                                                           │
│                                           LINK ▮▮▮  ◇ SIM │
└───────────────────────────────────────────────────────────┘
```

Maximum five values. No map. Corners kept empty (visor edge distortion). Values 48–72 px.

### E.7 SCR-14 Alert options sheet (EVA)

Bottom sheet covering 70 % of the screen on a warning: alert text, then option cards ranked 1–3 (ETA to shelter, expected dose, stops dropped), the top option pre-selected, one hold-to-confirm button "Go — option 1". "Ops is reviewing" indicator if ops approval is pending.

### E.8 SCR-08 Briefing card and SCR-17 Post-EVA report (PRINT)

v1 briefing grid retained. Post-EVA report page 1 opens with four stat slabs (dose received vs. unsheltered, time to shelter, stops completed, plan revisions), then the planned-vs-actual timeline, the alert table and the map trace; page 2 the event log and sources. A4/Letter, 12 mm margins, patterns kept.

### E.9 SCR-09 Sources & methods (BRIEF)

Editorial long-form page: left index (Datasets · Processing · Models · Assumptions (ParamSets) · Replay sources · Limitations · AI use · Diagnostics), right content in mono body with tables; each dataset row has a black-and-white thumbnail slab.

---

## F. Accessibility and responsive behavior

| Requirement | Implementation |
| --- | --- |
| Contrast | §C.1 (text ≥ 4.5 : 1 in BRIEF/OPS, ≥ 7 : 1 in HUD; non-text ≥ 3 : 1) |
| Non-colour cues | Shape + pattern + word + position for every status and alert |
| Keyboard (planner, ops) | v1 map keys retained (arrows pan, `+/−` zoom, `A` add stop, `Enter` place at crosshair, `Delete`, `B` briefing, `?` sources). Ops: `Space` pause, `1/2/3` speed, `N` next event, `K` acknowledge, `O` focus options |
| Focus | White 2 px ring + 2 px `void` gap on every interactive element, including map markers |
| Screen readers | `aria-live="assertive"` for warnings, `polite` for cautions/advisories; crew cards and options are lists with full text; map content duplicated in tables (v1) |
| Motion | `prefers-reduced-motion`: no flashes (static bar), no marker interpolation |
| Gloves | EVA targets ≥ 56 px, ≥ 8 px gaps; hold-to-confirm; no swipe-only actions; test with thick gloves on a touchscreen phone (TASK-15) |
| Glare | EVA has a "high-contrast" toggle that switches to HUD palette |
| Responsive | BRIEF fluid 360–1920 px. Planner/ops ≥ 1280 three-column; 1024–1279 one drawer at a time; ops < 1024 shows a "use a larger screen" notice. EVA 360–1024 portrait; HUD landscape ≥ 640 px |

### F.1 Mission-critical usability checks (TASK-15)

| Check | Pass |
| --- | --- |
| 3-s glance: read haven, O₂, next stop from HUD | ≥ 2 of 3 users |
| Summon rover with gloves, no instruction | ≥ 2 of 3 users, < 15 s |
| Ops: identify who is in danger and approve an option | ≥ 2 of 3 users, < 20 s |
| Status recognisable in grayscale screenshot | 100 % of alert levels |

---

## G. Implementation notes

- **Tokens:** one `tokens.css` with `:root` primitives and `[data-mode="brief|ops|hud|print"]` semantic layers; components use semantic tokens only. Token names in §C.1 are the contract (TASK-13 freezes them).
- **Chamfers:** utility classes `.cut-s/.cut-m/.cut-l` using `clip-path: polygon(...)`; an inner pseudo-element draws the 1 px outline because `clip-path` clips borders.
- **Fonts:** self-host WOFF2 for Chakra Petch, Inter, IBM Plex Mono; `font-display: block` on OPS/HUD to avoid layout jumps; verify OFL licences and record in credits.
- **Numbers:** `font-variant-numeric: tabular-nums slashed-zero` on all values.
- **Status rendering:** a single `<status-icon level>` component draws shape + pattern so no screen hand-rolls status colours.
- **No HTML wireframes are produced in this doc;** visual mockups of SCR-01, SCR-11, SCR-12 and SCR-13 are a separate design deliverable (U-25).

## Unresolved items owned by this document

| ID | Item | Recommendation |
| --- | --- | --- |
| U-08 | Light OPS variant for a washed-out venue projector | BRIEF mode already covers judge-facing screens; add an OPS high-contrast variant only if the projector test fails |
| U-09 | Colour vs. grayscale HiRISE basemap | Toggle; grayscale default in OPS (better hazard-overlay contrast), colour in BRIEF slabs |
| U-25 | Visual mockups of key screens | Produce before 7 Nov so R3/R5 build from a shared picture |
| U-26 | Product name and logo mark (D-08) | Chamfered-hexagon mark in the reference image's style; name decided at kickoff |
| U-27 | Chakra Petch and Lucide licences | Verify in TASK-13; fallback display face: Space Grotesk (OFL) |
