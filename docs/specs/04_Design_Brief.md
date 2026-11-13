# 04 — Design Brief

| | |
| --- | --- |
| **Owner** | Design (this file owns visual and interaction design) |
| **Date** | 2026-11-04 |
| **Status** | Draft v2 — supersedes v1 (2026-11-02) |
| **Related** | Screens: [03 App Flow](03_App_Flow_and_Diagrams.md) (SCR-xx) · Scope: [01 PRD](01_Product_Requirements_Document.md) · Behavior: [02 Technical](02_Technical_Requirements_Document.md) · [Docs index](../README.md) |

## Change log v1 → v2

| Area | v1 | v2 |
| --- | --- | --- |
| Character | "Instrument panel", calm dark neutral | **Mission brutalism**: space sci-fi brutalist chrome, strict instrument discipline for data |
| Modes | One dark theme + print | **BRIEF** (light editorial), **OPS** (dark instrument), **HUD** (black visor) + print |
| Surfaces | Planner only | Planner, ops console, EVA tablet, HUD, alert sheet, post-EVA report |
| Alerts | Status banner | Three-level alert system (warning / caution / advisory), latching, acknowledged |
| Type | Inter + IBM Plex Mono | **Chakra Petch** (display) + Inter (UI) + IBM Plex Mono (data) + Source Serif 4 (long-form) |
| References | — | Researched 2026-11-04: Colossal, Anduril, Anthropic, Starfield (and its accessibility critique), NASA Graphics Standards Manual, Brutalist Web Design guidelines (§B.1–B.4) |
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

### B.1 Influences: what we observed and what we take

Researched 2026-11-04 (sources in §B.4). "Observed" is what the source actually shows or states; third-party interpretations are marked as such.

| Source | Observed | Take | Leave |
| --- | --- | --- | --- |
| **Reference board (team image, "GravixPoint")** | Chamfered orange slabs on paper and charcoal; hairline construction grid; mono microcopy; giant stat tiles; metadata labels ("EST. 2026", "VOL. 01-A") | Slabs, chamfers, stat tiles, metadata strip; signal orange sampled from the image (#E7553D) | Orange as an all-purpose accent (fenced to BRIEF) |
| **Anduril** | Site set in Helvetica Now; clear, minimal black-and-white palette where the only colour comes from product photography (Fonts In Use). A third-party "Anduril-style" design system adds: sharp corners, no shadows or gradients, headings at weight 400 never bold, uppercase letter-spaced labels, tabular numerals, one accent per view (unofficial) | Neutral chrome where **Mars imagery supplies the colour**; light-weight headlines; uppercase spaced labels; tabular numbers; one accent per view; zero radius, no shadows | Military framing; reliance on product photography we don't have |
| **Anthropic** | Identity by Geist: minimalism and precision, clean typography, muted palette, modular layouts. Styrene (Berton Hasebe) for headlines, Tiempos (Klim) for body text (type.today) | **An editorial serif for long reading** next to a precise sans; muted warm neutrals; modular sections; calm, plain-spoken copy | Licensed typefaces (we use open substitutes) |
| **Colossal Biosciences** (dire wolf page) | An **archival indexing system everywhere**: numbered nav ("01 de-extinction"), catalogue codes ("002E-00 dire wolf", "CSL—LBS"), bracketed record IDs ("[ DW—PUP 001 ]"), exposed module labels ("[ COLOSSAL LABS /// video module ]", "QUOTATION MODULE"), gallery counters ("01 / 27"); specimen cards with labelled fields (SPECIES, AGE / SEX); a phase timeline (neonatal → adult); "+" as the expand affordance | Catalogue codes and module labels that **match our real IDs** (SCR-, POI, crew); specimen-style data cards for POIs, crew and vehicles; a phase timeline for the EVA; "+" only ever means expand | Image-heavy scroll effects, decorative dot fields, thin captions over photos |
| **Starfield (NASA-punk)** | Art director's term for a grounded sci-fi look drawn from 1970s NASA, function over style, few holograms, physical buttons you want to press (Starfield Wiki, Destructoid). Accessibility review of its in-game screens (Vandehey): focus shown only by a colour change, a scrollbar as thin and grey as the decorative lines so content hides off-screen, decorative dots that read as an ellipsis, page indicators by colour only, low-contrast controls | Grounded, tactile, button-like controls; industrial labelling; **its documented failures become our anti-pattern list (§B.3)** | Clutter; decorative lines that compete with controls |
| **NASA Graphics Standards Manual (Danne & Blackburn, 1975)** | One typeface (Helvetica) used throughout, strict grids, a single red (PMS 179), a binder of rules covering everything from vehicles to stationery | Discipline: few typefaces, a fixed grid, one brand red, rules written down (this document) | **NASA insignia** — we never use the meatball or worm in the UI; NASA appears only as a data credit |
| **Guidelines for Brutalist Web Design (Copeland)** | Content readable on all reasonable screens; only links and buttons respond to clicks; links underlined and buttons look like buttons; back button works; view content by scrolling; decoration only when needed; performance is a feature | All seven, as rules (§B.3) | — |

**Never:** glow/bloom, scanlines, film grain over data, animated noise, fake scrolling telemetry, decorative gauges, gradients or drop shadows on data, rounded "app" cards, emoji, NASA insignia.

### B.2 Modes

| Mode | Look | Used for | Accent |
| --- | --- | --- | --- |
| **BRIEF** | Light paper + charcoal slabs + signal orange; editorial; black-and-white imagery | SCR-01 Mission briefing, SCR-09 Sources & methods, role select, judge-facing pages | Signal orange |
| **OPS** | Near-black instrument; hairlines; status-only colour | SCR-02–07 planner, SCR-11 ops console, SCR-12 EVA tablet | None (cyan is the route, not an accent) |
| **HUD** | Pure black, white numerals, minimal | SCR-13 HUD | None |
| **PRINT** | White, black, patterns | SCR-08 briefing card, SCR-17 post-EVA report | Black |

Mode is set on `<html data-mode="brief|ops|hud|print">`. The mode never changes inside a screen.

### B.3 Patterns adopted from the research

| # | Pattern | Rule | Where |
| --- | --- | --- | --- |
| P1 | **Catalogue codes** (Colossal) | Every screen, panel and record carries a mono code that is a real ID, never decoration: `SCR-11 / OPS`, `[ EZ—RES 02 ]` for POIs, `[ EV1 ]`, `[ PR1 ]`, gallery counters `03 / 08`. Codes match 03 SCR ids and 05 ids | Panel headers, POI cards, crew and vehicle cards, image viewers |
| P2 | **Module labels** (Colossal) | Major regions are labelled with their function: `[ HAB CORE /// EVENT LOG ]`, `[ ORBITAL /// EARTH LINK ]`. Max one per region, `text-3`, 11 px mono | Ops console regions, Sources & methods sections |
| P3 | **Specimen cards** (Colossal) | Record cards show a code, a name, then label/value pairs in a fixed order (labels uppercase mono, values sentence case or numbers) | SCR-06 POI detail (TYPE · OBJECTIVE · EVIDENCE · POSITION SOURCE), crew cards, vehicle cards |
| P4 | **Phase timeline** (Colossal) | The EVA is a horizontal strip of phases (EGRESS · TRAVERSE · STOP 1 … · INGRESS); the current phase is marked by a filled block **and** a bold label **and** a ▼ marker, never colour alone | Ops top bar, EVA metadata strip, post-EVA report |
| P5 | **Imagery carries the colour** (Anduril) | Chrome stays neutral; Mars imagery provides warmth; at most **one accent per view** in BRIEF (the signal orange) | BRIEF pages |
| P6 | **Light headlines** (Anduril, Anthropic) | Display and headings at weight 500 (was 600); never bold headlines; uppercase spaced labels | All modes |
| P7 | **Editorial serif for reading** (Anthropic) | Paragraphs longer than three lines in BRIEF and PRINT use a serif; short captions stay mono | Sources & methods, report narrative, POI "why it matters" |
| P8 | **Buttons look like buttons** (Copeland; Starfield's physical buttons) | Every control has a visible `edge` boundary, a text label and a pressed state; only controls respond to clicks; links are underlined; the browser back button follows the hash route | All modes |
| P9 | **No decoration that mimics a control** (Starfield anti-pattern) | Decorative lines are hairline and never adjacent to controls; no decorative dots, chevrons, "+" or "…" unless they do what they look like | All modes |
| P10 | **Focus and selection never by colour alone** (Starfield anti-pattern) | Focus = white ring + gap; selection = outline + weight or marker; current page/step = larger marker + label | All modes |
| P11 | **Hidden content is announced** (Starfield anti-pattern) | Overflowing lists show a scroll shadow **and** a count ("+2 more"); scrollbars are on the right and at least 8 px wide; prefer showing everything when it fits | Alert list, event log, options sheet |
| P12 | **Performance is a feature** (Copeland) | Self-hosted fonts subset to Latin; no video; images sized to their slot; JS budget per NFR-09 | All |

### B.4 Research sources (accessed 2026-11-04)

- Colossal Biosciences, dire wolf page — <https://colossal.com/direwolf/>
- Anduril typography and palette — Fonts In Use, "Anduril Industries": <https://fontsinuse.com/uses/32662/anduril-industries>; unofficial "Anduril Design System" skill (third-party interpretation): <https://skills.sh/adisinghstudent/anduril/anduril>
- Anthropic identity — type.today, "Styrene in use: Anthropic": <https://type.today/en/journal/anthropic>; Abduzeedo on Geist's identity: <https://www.abduzeedo.com/seamlessly-crafting-ai-branding-and-visual-identity-anthropic>
- Starfield NASA-punk — Starfield Wiki: <https://starfieldwiki.net/wiki/General:Nasapunk>; Scott Vandehey, "Starfield's Accessibility Problems": <https://spaceninja.com/blog/2023/starfield-accessibility/>
- NASA Graphics Standards Manual (1975) — We Are The Mutants: <https://wearethemutants.com/2020/01/09/unity-precision-thrust-the-nasa-graphics-standards-manual-1975/>; Inkbot Design: <https://inkbotdesign.com/?p=22452>
- David Bryant Copeland, "Guidelines for Brutalist Web Design" — <https://brutalist-web.design/>

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
| `focus` | *(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-066)* `ink` ring 2 px on a `paper` gap of 2 px | Keyboard focus in BRIEF (a white ring is invisible on paper) | — |

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

**HUD status pills** *(added 2026-11-11, Proposed 2026-11-11, decided by Sadman Shaharier Mahim (product lead))*: on a HUD status fill (`hud-nominal`, `hud-caution`, `hud-warning`, `hud-advisory`, and `hud-text-2` for `unknown`) the pill ink is `#000000`, not `ink` (`#1A1A1A`). Flat, `#000000` ink on each fill reaches ≥ 7 : 1 (computed 2026-11-11 with the WCAG formula: nominal 11.77, caution 11.48, warning 7.57, advisory 10.92, unknown 9.88). The pill's pattern overlay (diagonal stripes, dots or cross-hatch, §C.1 status table) is drawn with an alpha chosen so that the darkest patterned area keeps ≥ 7 : 1 with `#000000` ink for every HUD status; the shape glyph and the word carry the status, the pattern is secondary (§A.3 #2). TODO(verify): the alpha value is set by T13.05 once measured by `apps/web/tests/ui/patterns.test.ts`; this document states no number for it.

#### PRINT

v1 print theme retained: text `#111827` on white (17.7 : 1); caution `#9A5B00` (5.43 : 1); warning `#B42318` (6.57 : 1); nominal `#0E7A4F` (5.36 : 1); patterns kept for black-and-white printers. *(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-013)* Print advisory `#1D4ED8` and unknown `#6D28D9` (mockup DV-07).

Print neutrals *(added 2026-11-11, Proposed 2026-11-11, decided by Sadman Shaharier Mahim (product lead); these are the values shipped in `tokens.css`)*: fill `#F3F4F6` (panel and table fills; `#111827` text on it 16.12 : 1), rule `#D1D5DB` (hairlines and dividers only, 1.47 : 1 on white, so never text and never the only cue), secondary text `#4B5563` (7.56 : 1 on white, 6.87 : 1 on the fill; computed 2026-11-11).

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
| Display | **Chakra Petch** (OFL — verify, TASK-13) | 40–96 px / 500, uppercase, tracking −1 % (P6) | BRIEF headlines, OPS screen titles ≥ 20 px |
| Headings | Chakra Petch | 20–28 px / 500 uppercase | Panel titles |
| UI text | **Inter** | 14 px / 400, line-height 1.45 | Labels, body (OPS) |
| Microcopy | **IBM Plex Mono** | 11–13 px / 500 uppercase, tracking +4 % (11 px only where the minimum text size rule below allows it) | Metadata strips, chips, kickers (the reference image's small mono copy) |
| Captions (BRIEF) | IBM Plex Mono | 13–15 px / 400, line-height 1.6 | Short editorial copy ≤ 3 lines (reference image) |
| Long-form (BRIEF, PRINT) | **Source Serif 4** (OFL — verify, TASK-13) | 17 px / 400, line-height 1.6, max 68 characters per line | Paragraphs > 3 lines (P7): Sources & methods, report narrative, POI "why it matters" |
| Values | **IBM Plex Mono**, tabular, slashed zero | 20 px (OPS) · 32–56 px (EVA) · 48–72 px (HUD) / 500 | Every number |
| Alert text | Inter | 18 px (OPS) · 22 px (EVA) / 700, sentence case | Alert bar |

Rules: never Chakra Petch for digits or for text under 20 px; never bold headlines (P6). Uppercase only for labels ≤ 4 words and headlines; messages and alerts are sentence case. All fonts self-hosted (offline).

**Minimum text size** *(changed 2026-11-11, Proposed 2026-11-11, decided by Sadman Shaharier Mahim (product lead); resolves the conflict between the 11 px microcopy row and "Minimum 12 px anywhere")*: microcopy (catalogue codes P1, module labels P2, and the other 11 px mono labels in §B.3, §C.1 and §E.10) may be 11 px only in BRIEF and planner desktop surfaces, and only at ≥ 4.5 : 1 against its background. The minimum is 12 px everywhere else, including the ops console. The minimum is 16 px on EVA (unchanged) and never below 14 px on the HUD. Where §B.3, §C.1 or §E.10 state 11 px, this rule decides.

**Headings during the font roll-out** *(added 2026-11-11, Proposed 2026-11-11, decided by Sadman Shaharier Mahim (product lead))*: v1 screens (SCR-00 to SCR-09, [03 §B](03_App_Flow_and_Diagrams.md)) keep headings in Inter 600 until Chakra Petch (and Source Serif 4, where a row above lists it) are self-hosted under `apps/web/public/fonts` with their OFL licences credited in the UI and README (NFR-07). From then on the Display and Headings rows above apply (Chakra Petch / 500 uppercase, P6). This is a temporary exception to P6's "never bold headlines". TODO(decision): self-hosting Chakra Petch and Source Serif 4, owner T13.04. *(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-073)* Ended 2026-11-12: Chakra Petch and Source Serif 4 are self-hosted (T13.13); the Display and Headings rows apply to all screens.

### C.3 Shape, grid and structure

- **Chamfer system:** 45° cut corners via `clip-path`. Sizes: `cut-s` 8 px (chips, buttons), `cut-m` 16 px (cards, panels), `cut-l` 32–64 px (BRIEF slabs, hero blocks). Cut position encodes nothing; default top-right + bottom-left like the reference image. No rounded corners anywhere.
- **Construction grid:** 4 px base; 1 px `hairline` grid lines and `+` registration marks at major intersections (BRIEF hero, OPS empty states, panel headers). Never behind numbers or map content.
- **Slabs:** solid colour blocks that carry a headline or a single huge stat (reference image's "250+" tiles) — BRIEF only, and the post-EVA report summary.
- **Metadata strip:** a 24 px mono strip on every major surface: `SOL 4190 · LTST 13:05 · GALE / MT SHARP · PLAN REV 03 · DATA gale_boxwork-2026.11.08 · REPLAY 60×`. It is the "EST. 2026 / VOL. 01-A" idea made useful.
- **Livery stripe:** a 4 px tri-band (`text-1` / `text-3` / `hairline`) on the top edge of OPS panels — Starfield-style identity that carries no status meaning.
- **Spacing:** padding 12/16 px; section gaps 24 px (OPS), 48–96 px (BRIEF).
- **Targets:** mouse ≥ 32 px; tablet ≥ 44 px; **EVA ≥ 56 px** with ≥ 8 px gaps (gloves, A-assumed).

### C.4 Iconography

One outline set (Lucide, ISC licence). *(Licence corrected 2026-11-11: 04 said "MIT", which was a factual error. Lucide is licensed under the ISC licence, with portions derived from Feather Icons under MIT; the complete text is kept in `apps/web/public/icons/LICENSE`.)* For v1 the Lucide defaults are accepted as shipped: stroke 2 px, round caps and joins (Proposed 2026-11-11, decided by Sadman Shaharier Mahim (product lead); replaces "1.5 px stroke, squared caps"). Custom glyphs: hab, pressurized rover, utility rover, crew chevron, antenna/no-signal, radiation (trefoil), relay pass, Earth link. Status shapes as in §C.1. Icons never stand alone for actions on EVA: icon + word.

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

Sound is never the only cue; ops has a mute toggle with a visible "SOUND OFF" indicator. *(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-018)* Ops starts SOUND ON; until the first user gesture arms audio the indicator reads "SOUND ON — click to arm".

---

## D. Components and behavior

### D.1 Component states

| Component | Default | Active/selected | Loading | Disabled | Stale | Error |
| --- | --- | --- | --- | --- | --- | --- |
| Panel (`cut-m`) | `panel` + livery stripe | `edge` outline 1 px | Skeleton bars | — | — | — |
| Metric readout | Value + unit + provenance glyph | — | Previous value 50 % opacity | "—" + "needs a plan" | Grey value + `0:42` age | `unknown` styling + reason |
| Stat slab (BRIEF/report) | Huge value top-left, mono label bottom-left (reference image) | — | — | — | — | — |
| Alert bar | Slot always reserved; the EVA tablet shows a status line (NOMINAL, STANDBY, EVA ENDED) while there is no alert, ops and HUD leave it empty *(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-022)* | Warning / caution / advisory (§D.2) | — | — | — | — |
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
| Specimen card (P3) | Code `[ EZ—RES 02 ]`, name, label/value pairs in fixed order | `route` outline | Skeleton rows | — | Grey values + age | `unknown` row with reason |
| Phase timeline (P4) | Phase blocks, past = filled `text-3`, current = filled `text-1` + bold label + ▼, future = outline | — | — | — | Dashed when unlinked | — |

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

Gloved taps are imprecise and modal "Are you sure?" dialogs get dismissed by reflex. Critical actions use **press-and-hold 800 ms**: a progress bar runs along the button's chamfered edge; release early cancels; on completion a 300 ms confirmation state shows what will happen ("PR1 dispatched — ETA 12 min"). Keyboard: hold Enter/Space. Accessibility fallback: tap, then tap the "Confirm" button that replaces it for 5 s. *(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-176)* On the EVA tablet a TAP CONFIRM setting (in the same toggle row as CONTRAST) enables this 5-s tap fallback.

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

v1 layout retained ([Appendix A](#b-layout-and-navigation): top bar 48 px, left drawer 320 px, map, right drawer 320 px, results panel 220 px) with the v2 skin: livery stripe, metadata strip under the top bar, chamfered drawers, Chakra Petch panel titles, Plex Mono values. Results panel adds a **time-to-haven band** and a **comm band** under the elevation profile.

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

Research patterns applied: each region carries a module label (P2), e.g. `[ HAB CORE /// CREW ]`, `[ ORBITAL /// EARTH LINK ]`, `[ HAB CORE /// EVENT LOG ]`; crew and vehicle cards are specimen cards with codes `[ EV1 ]`, `[ PR1 ]` (P3); the EVA phase timeline (P4) runs under the top bar:

```text
EGRESS ▸ TRAVERSE ▸ STOP 1 ▸ TRAVERSE ▸ ■ STOP 2 ▸ TRAVERSE ▸ STOP 3 ▸ INGRESS
                                         ▼ now (bold label + filled block)
```

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
│ [ TASK ROVER ]       [ HUD ] │
└──────────────────────────────┘
```

*(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-010)* Orientation: the tablet works in portrait (above) or landscape (below); the default is landscape.

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

*(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-024, FD-032, FD-028)* Stop task list placement and rules, from the mockup (DV-12, G-30, G-31, G-33, G-40): a labelled TASKS n/m button in the NEXT card header opens the list for the next stop; on a phone in landscape the list takes the map column, the NEXT card stays, and the button toggles back to the map; on tablets and in portrait the list takes the NEXT position. Skipping: one tap on SKIP records the reason `other`, and the 5-s undo strip holds one REASON control cycling time, terrain, alert, other (U-55 decided). During an alert the list collapses to a non-interactive count while the options sheet is open or a warning is unacknowledged; after acknowledgement it shows as a read-only list (U-59 decided).

**Stop task list (FR-50, added 2026-11-05, Proposed).** While walking, the NEXT card ends with a task count (`TASKS 0/3`). At a stop, the NEXT card becomes the task list: up to four rows of at least 56 px, each a neutral square check box, the task text and a SKIP control. States use neutral chrome only — an empty square for to do, a square with a check mark drawn in it for done (not a filled `■`, which §C.1 gives to the MEASURED provenance chip; mockup handoff G-32), `⊘` for skipped or dropped — with the word beside each; task progress is not a safety status, so no status colour is used. An unsynced change shows "not synced" in the metadata strip. During an alert the list collapses back to its count; the alert slot, HAVEN, O₂ and the action row never move. The landscape variant follows the same rules inside the NEXT position of the mockup handoff's landscape layout (U-30, [design/mockup-handoff.md](../design/mockup-handoff.md)). The prototype shows it (SCR-08, SCR-11, SCR-12, SCR-17); open layout questions are U-51 to U-58 in the [mockup handoff](../design/mockup-handoff.md#unresolved-items).

*(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-016)* **Dose units:** absorbed dose is shown in mGy with one decimal on ops, EVA and HUD; it is stored in µGy (05); the planner's FR-12 estimate stays in mSv; the event dose is never shown in Sv.

**Full-screen map (Tier 1, added 2026-11-05).** Tapping the mini-map or a FULL button opens the map over the body area.

- **Fixed geography holds:** the alert slot, the metadata strip and the action row do not move; HAVEN and O₂ stay visible. In portrait they keep their row. In landscape they stack at the left as smaller cards so the map gets at least 80 % of the width; HAVEN keeps the top-left origin.
- **Controls are buttons, not gestures:** +, −, FIT, FOLLOW, LAYERS and CLOSE, each at least 56 px and labelled with a word (§A.3 #9). Drag, wheel and pinch are extras only.
- **Layers:** slope, thermal inertia, comm shadow and haven bands; at most two scientific overlays at once, and a third turns the oldest off and says so.
- **Warnings win:** a warning closes the full-screen map and returns the normal layout.
- **Decided (U-60):** *(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-033)* the landscape stacked cards show HAVEN and O₂ at 40 px on phones and 48 px on tablets, below the 56 px rule in §A.3. This applies only inside the landscape full-screen map; a harness check keeps both values the largest numbers on screen and at least 32 px.
- **Ops and planner maps** get the same on-screen + / − / FIT buttons, plus drag and wheel; ops adds Slope and Thermal inertia toggles (handoff DV-14).

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

Maximum five values. No map. Corners kept empty (visor edge distortion). Values 48–72 px. *(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-200)* Alert text is sentence case, identical on ops, EVA and HUD (§D.2).

### E.7 SCR-14 Alert options sheet (EVA)

Bottom sheet covering 70 % of the screen on a warning (portrait; landscape below): alert text, then option cards ranked 1–3 (ETA to shelter, expected dose, stops dropped), the top option pre-selected, one hold-to-confirm button "Go — option 1". "Ops is reviewing" indicator if ops approval is pending.

*(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-010)* **SCR-14 in landscape:** a right-side panel over the map column (about 53 % of the width) below the alert bar replaces the 70 %-height bottom sheet. HAVEN, O₂ and NEXT stay visible in the left column; the "Go — option N" hold button sits at the bottom of the panel.

### E.8 SCR-08 Briefing card and SCR-17 Post-EVA report (PRINT)

v1 briefing grid retained ([Appendix A](#scr-08-briefing-card-print)). Post-EVA report page 1 opens with four stat slabs (dose received vs. unsheltered, time to shelter, stops completed, plan revisions), then the planned-vs-actual timeline, the alert table and the map trace; page 2 the event log and sources. A4/Letter, 12 mm margins, patterns kept.

### E.9 SCR-09 Sources & methods (BRIEF)

Long-form paragraphs use Source Serif 4 (P7); dataset entries are specimen cards with catalogue codes matching DataSource ids (P1, P3).

Editorial long-form page: left index (Datasets · Processing · Models · Assumptions (ParamSets) · Replay sources · Limitations · AI use · Diagnostics), right content with tables; each dataset row has a black-and-white thumbnail slab.

### E.10 Specimen card (SCR-06 POI detail, crew and vehicle cards)

```text
┌─[ EZ—RES 02 ]────────────────────────────────┐
│ HYDRATED SULFATE LEDGE                       │  Chakra Petch 20 px / 500
│ ──────────────────────────────────────────── │
│ TYPE           Resource — ISRU water         │  labels: Plex Mono 11 px uppercase
│ OBJECTIVE      Sample sulfate-bearing unit   │  values: Inter 14 px
│ WHY IT MATTERS (serif paragraph, P7)         │
│ EVIDENCE   +   2 sources                     │  "+" expands, nothing else does
│ POSITION       ±15 m · assumed △             │  provenance glyph
│ IMAGE          03 / 08  Mastcam · sol 4171   │  gallery counter (P1)
│                                              │
│ [ ADD AS STOP ]                              │  bordered, labelled button (P8)
└──────────────────────────────────────────────┘
```

Codes: `EZ—SCI nn` (science), `EZ—RES nn` (resource), `EZ—ENG nn` (engineering); the number is the POI's order in `pois.geojson`. Values shown are illustrative.

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
| Glare | EVA has a "high-contrast" toggle that switches to HUD palette. *(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-011, FD-017)* The toggle is a labelled CONTRAST button: the fifth button of the action row in landscape; in portrait the HUD cell splits into HUD and CONTRAST, each ≥ 56 px. High-contrast alert bars are black with a 4 px status-colour outline and status-colour text (white on the warning fill is 6.54 : 1, below 7 : 1) |
| Responsive | BRIEF fluid 360–1920 px. Planner/ops ≥ 1280 three-column; 1024–1279 one drawer at a time and a results panel 180 px high (`--results-height-narrow`; 220 px at ≥ 1280, Proposed 2026-11-11, decided by Sadman Shaharier Mahim (product lead)); ops < 1024 shows a "use a larger screen" notice. **EVA: phone or tablet, portrait (360–1024 px wide) or landscape (≥ 844 × 390 px); default landscape; the same fixed geography in both.** *(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-010)* HUD landscape ≥ 640 px |

*(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-062, FD-119, FD-121, FD-124)* **Planner behaviour rules.**

- Warning order is severity first, then along-route position, then leg.
- Keyboard move of a selected stop: the arrow keys nudge it one grid cell; "Move to crosshair" places it at the crosshair. Both are validated like a drop.
- Results empty state copy: "Add at least one stop".
- Number formats (one `format.ts`):

| Unit | Format |
| --- | --- |
| km | 2 decimals |
| min | integer |
| ° | 1 decimal |
| mSv | 2 decimals |
| mGy | 1 decimal |
| m | integer |
| % | integer |

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

---

## Appendix A — v1 planner layout reference (retained, restyled)

The planner (SCR-02–SCR-08) keeps the v1 layout, component states and wireframes below; task files cite these sections. Apply the v2 visual system (§C) on top, with these token renames: `accent` → `route`, `ok` → `nominal`, `blocked` → `warning`, `bg` → `void`, `text-primary/secondary/muted` → `text-1/2/3`, and the focus ring is the v2 white ring (§C.1), not yellow. Where this appendix and §A–§G disagree, §A–§G win.

### B. Layout and navigation

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

### C.5 Map annotations and selection states

| Element | Default | Hover | Selected | Disabled/invalid |
| --- | --- | --- | --- | --- |
| Waypoint | `accent` fill, `bg` number | +2 px ring | `route` outline of `--selection-width` (2 px) plus a marker, see below | `blocked` outline + ⬣ |
| POI | white pin, `bg` outline | label shown | `accent` pin + right drawer open | — |
| Route leg | cased `accent` line | thicker 6 px | — | NO_ROUTE: dashed `unknown` to nearest reachable point |
| Hazard segment | — | tooltip | — | overlay of `caution`/`blocked` hatch along route |
| Traverse | thin `#E8EDF2` 60 % dashed | sol label | — | — |

**Selection and keyboard focus are two different things** *(changed 2026-11-11, Proposed 2026-11-11, decided by Sadman Shaharier Mahim (product lead); replaces the selected waypoint's "`focus` ring 3 px")*: the selected waypoint is drawn with an outline of `--selection-width`, 2 px, in the `route` colour plus a marker (P10: selection is never by colour alone). Keyboard focus is the white 2 px ring with a 2 px gap of §C.1 and §F (unchanged), drawn from `--focus-ring`, on every interactive element including a waypoint marker; a selected waypoint that also has focus shows both. The two share neither token nor colour.

### D. Interaction and component behavior

| Component | Default | Selected/active | Loading | Disabled | Empty | Error |
| --- | --- | --- | --- | --- | --- | --- |
| Layer row | Toggle off, collapsed legend | Toggle on, legend expanded | Skeleton legend + spinner on toggle | Greyed with reason ("Unavailable in this build") | — | Inline `unknown` message |
| Input field | Value + unit | Focus ring | — | Read-only during demo-lock (optional) | — | Red outline + range text below |
| Stops list | Numbered rows | Row highlighted ↔ map marker | Row ETA shimmer | — | "Add a stop: click a POI or press A" | Row marked ⬣ with reason |
| Status banner | — | OK / Over limits / Partial | "Computing…" (no layout jump) | — | "No plan yet" | "Computation failed — Retry" |
| Profile chart | Elevation line + patterns | Cursor + tooltip | Faded previous profile under spinner | — | Hidden | Message in chart area |
| Metric tile | Value + unit + chip | — | Previous value at 50 % opacity | — | "—" with tooltip "needs a plan" | `unknown` styling |
| POI image | Image + credit | Click → full-size dialog | Blurred placeholder | — | — | "Image not available" + source link |
| Briefing button | Enabled when a plan is computed (OK, Over limits, Partial) | — | — | Disabled with tooltip when no stops or after a computation error | — | — |

**Discoverability:** first-run coach marks (3 steps, dismissible, stored only in memory): "Turn on Slope", "Click a POI → Add as stop", "Open Briefing".

**Feedback:** every recompute updates the status banner within 100 ms ("Computing…") and finishes within the NFR-02 target.

**Progressive disclosure:** metrics row shows 6 headline values; "Details" expands per-leg table; equations live only in Sources & Methods.

**Information overload guard:** max two scientific overlays visible at once (third toggle auto-dims the oldest and tells the user).

### F. Wireframe guidance

#### SCR-01 Mission Briefing

Superseded by [§E.1](#e1-scr-01-mission-briefing-brief).

#### SCR-02 Map Workspace (with SCR-03/04/05/07 embedded)

As in the layout in §B. Map toolbar top-left: Add-stop toggle, Fit AOI, Measure (optional). When Add-stop mode is on, crosshair appears at map centre and the toggle is `accent` filled.

#### SCR-05 Results (bottom panel)

Left 280 px: status banner (icon, word, one-line reason). Middle: metrics row (Distance · Walk time · EVA total / limit · Max slope · Max walkback / limit · Dose) above the profile (full width of middle area, 140 px tall). Right 300 px: warnings list, newest-severity first.

#### SCR-06 POI Detail (right drawer)

Image at top (16:9, click to enlarge), credit line under image (12 px), title, "Science objective" paragraph, "Why it matters" paragraph, position source with provenance chip, button **Add as stop**.

#### SCR-08 Briefing Card (print)

A4/Letter portrait, 12 mm margins. Row 1: header (site, plan name, data version, plan hash, timestamp). Row 2 (two columns): route map snapshot (left 60 %), metrics + status (right). Row 3: stops/timeline table (stop, arrival UTC/LTST, dwell, sun elevation, notes). Row 4: profile. Row 5: warnings + assumptions (two columns). Footer: sources (short form) + prototype disclaimer.

#### SCR-09 Sources & Methods

Superseded by [§E.9](#e9-scr-09-sources--methods-brief).

## Unresolved items owned by this document

| ID | Item | Recommendation |
| --- | --- | --- |
| D-13 | Design language (this document) | **Proposed 2026-11-04**: mission brutalism with BRIEF/OPS/HUD/PRINT modes ([ADR-010](../decisions/ADR-010-mission-brutalist-design-language.md)) |
| U-08 | Light OPS variant for a washed-out venue projector | BRIEF mode already covers judge-facing screens; add an OPS high-contrast variant only if the projector test fails. *(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-002, FD-061)* Decided: opt-in light theme from PRINT tokens (`?theme=light`) |
| U-09 | Colour vs. grayscale HiRISE basemap | Toggle; grayscale default in OPS (better hazard-overlay contrast), colour in BRIEF slabs. **Resolved** ([FD-003](../plan/frontend/decisions.md), FD-196) |
| U-25 | Visual mockups of key screens | Produce before 7 Nov so R3/R5 build from a shared picture. *(Proposed 2026-11-12, decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026; FD-005)* Resolved: prototype |
| U-26 | Product name and logo mark (D-08) | Chamfered-hexagon mark in the reference image's style; name decided at kickoff |
| U-27 | Chakra Petch, Source Serif 4 and Lucide licences | Verify in TASK-13; fallback display face: Space Grotesk (OFL) |
| U-47 | Add the FR-50 stop task list to the prototype — **Resolved 2026-11-05** (mockup handoff update; follow-ups U-51 to U-58 there) | Closed |
