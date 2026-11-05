#!/usr/bin/env python3
"""Generates docs/design/mockup-handoff.md from the prototype's data (single source: handoff_data.py + dist/docs_data.json).
Spec anchors are built from the actual headings in /mnt/project (GitHub slug rules) so links are valid by construction."""
import json, re, sys, os
sys.path.insert(0, 'src')
import handoff_data as H

ART = 'https://claude.ai/artifact/SZ4vU9okektcyWgbDADdbt'
D = json.load(open('dist/docs_data.json', encoding='utf-8'))
SPEC = {'01': '01_Product_Requirements_Document.md', '02': '02_Technical_Requirements_Document.md', '03': '03_App_Flow_and_Diagrams.md', '04': '04_Design_Brief.md', '05': '05_Backend_and_Database_Schema.md', '06': '06_High_Level_Implementation_Plan.md'}

def slug(h):
    h = h.strip().lower()
    h = re.sub(r'[`*_~]', lambda m: '_' if m.group(0) == '_' else '', h)
    h = re.sub(r'[^\w\- ]', '', h, flags=re.UNICODE)
    return h.replace(' ', '-')
HEADS = {}
for k, f in SPEC.items():
    HEADS[k] = [l.lstrip('#').strip() for l in open('/mnt/project/' + f, encoding='utf-8') if l.startswith('#')]
def L(spec, start, text=None):
    """link to the heading in spec NN starting with `start` (raises if absent => no silent broken anchors)"""
    for h in HEADS[spec]:
        if h.startswith(start):
            return f"[{text or (spec + ' ' + start.split(' ')[0] if start[0].isalpha() and '.' in start.split(' ')[0] else spec + ' §' + start.split(' ')[0])}](../specs/{SPEC[spec]}#{slug(h)})"
    raise SystemExit(f'heading not found: {spec} {start}')
def esc(s): return str(s).replace('|', '\\|').replace('\n', ' ')
def table(heads, rows):
    out = ['| ' + ' | '.join(heads) + ' |', '| ' + ' | '.join(['---'] * len(heads)) + ' |']
    for r in rows: out.append('| ' + ' | '.join(esc(c) for c in r) + ' |')
    return '\n'.join(out)
def sec_link(spec, sec, label=None):
    return L(spec, sec, label or f'{spec} §{sec.split(" ")[0]}')

# ---- tokens.css parse ----
css = open('src/css/tokens.css', encoding='utf-8').read()
prim = dict(re.findall(r'--(p-[\w-]+):\s*([^;]+);', css.split('/* ---- OPS ---- */')[0]))
def mode_block(name):
    m = re.search(r'\[data-mode="%s"\]\s*\{(.*?)\n\}' % name, css, re.S)
    d = {}
    for k, v in re.findall(r'--([\w-]+):\s*([^;]+);', m.group(1)):
        v = v.strip(); mm = re.match(r'var\(--(p-[\w-]+)\)', v)
        d[k] = prim.get(mm.group(1), v) if mm else v
    return d
MODES = {m: mode_block(m) for m in ['brief', 'ops', 'hud', 'print']}
TOK = ['bg', 'panel', 'raised', 'hairline', 'edge', 'text-1', 'text-2', 'text-3', 'route', 'nominal', 'caution', 'warning', 'advisory', 'unknown', 'warning-fill', 'on-warning-fill', 'caution-fill', 'on-caution-fill', 'btn-fill', 'btn-text', 'focus']
tok_rows = [[f'`{t}`'] + [f"`{MODES[m].get(t, '—')}`" for m in ['brief', 'ops', 'hud', 'print']] for t in TOK]

o = []
w = o.append
w('# Mockup handoff — Marswalk Surface Ops prototype\n')
w('| | |\n| --- | --- |')
w('| **Owner** | Sadman Shaharier Mahim, product & systems lead |')
w('| **Date** | 2026-11-05 |')
w('| **Status** | Draft for review |')
w(f"| **Related** | [Docs index](../README.md) · {sec_link('04', 'A.3 Mission-critical', '04 §A.3')} · {sec_link('04', 'C.1 Colour tokens', '04 §C.1')} · {sec_link('04', 'E.5 SCR-12', '04 §E.5')} · {sec_link('04', 'F. Accessibility', '04 §F')} · {sec_link('03', 'B. Screen specification', '03 §B')} · {sec_link('01', 'E. Core demonstration', '01 §E')} · {sec_link('02', 'E.6 WebSocket', '02 §E.6')} · {sec_link('05', 'C.2 Runtime entities', '05 §C.2')} · [AI use](../AI_USE.md) |")
w('')
w('Specs 01–06 are frozen at Draft v2 (2026-11-04). This file is the design handoff for frontend (R3) and EVA/HUD (R5): what the clickable prototype shows, what it deviates from, and what must be decided. Labels follow the docs: **Confirmed** (measured or cited), **Assumed**, **Proposed**, **Unresolved**.\n')
w('## Summary\n')
w(f'- **Prototype:** [Marswalk Surface Ops design handoff prototype]({ART}) — one self-contained HTML page (`docs/design/prototype/marswalk-prototype.html`), all 19 screens (SCR-00 to SCR-18), a state switcher on every screen, device frames per 04 §F, flows, a demo player and a three-device Stage.')
w('- **Honesty rules held:** every displayed number is `{v, unit, prov, src}` from a spec example or a `PLACEHOLDER` (shown as `##.#` with a dotted underline); nothing is computed; nothing is called live; coordinates are the IAU_2015:49900 sphere, east-positive; no external tiles or images; no logos or photos.')
w(f"- **Scale:** {D['nNums']} fixture numbers, {D['nPh']} of them `PLACEHOLDER`; 19 screens; 219 screen × state × frame combinations.")
w('- **Open decision for the team:** the EVA landscape layout is a **Proposed** deviation (DV-01). Ratify it as U-30 before TASK-24 starts.')
w('- **Hosting note:** the artifact host only passes plain `#name` hashes, so prototype links look like `#scr-12-alerting-landscape`; the prototype also accepts the 03 §A forms (`#/planner`, `#/ops`, `#/eva/EV1`, `#/hud/EV1`, `#/report`).\n')

w('## Screen inventory\n')
w('Modes and routes follow 03 §A and 04 §B.2. States are copied from each 03 §B "States" row; additions are listed in the gaps table (G-10).\n')
w(table(['SCR', 'Route (03 §A)', 'Mode', 'States', 'FRs', 'Tier'], [[f"{s['id']} {s['name']}", f"`{s['route']}`", s['mode'].upper(), ' · '.join(x[1] for x in s['states']), s['frs'], s['tier'] + (' (T2 SCOPE tag)' if s['tier'] == 'T2' else '')] for s in D['screens']]))
w('')
w('Frames: projector 1440×900 (ops, planner) with 1280 and 1024 previews and a 900 px "use a larger screen" notice; EVA phone landscape 844×390, tablet landscape 1024×768, phone portrait 390×844, tablet portrait 768×1024; HUD 844×390; A4 794×1123 px (two pages for the report); BRIEF fluid at 360, 768 and 1440 px.\n')

w('## State matrix\n')
w(f'Each state links to the prototype ([open the prototype]({ART})). EVA screens open in landscape; add `-portrait` to the hash for portrait.\n')
rows = []
for s in D['screens']:
    for k, l, h in s['states']:
        rows.append([s['id'], l, f"[`#{h}`]({ART}#{h})"])
w(table(['Screen', 'State', 'Prototype hash'], rows))
w('')

w('## Component inventory\n')
w('Proposed React components in `apps/web` (names and paths are suggestions; props mirror what the prototype renders).\n')
w(table(['Component', 'Proposed path', 'Props', 'States', 'Tokens', 'Spec'], [list(c) for c in H.COMPONENTS]))
w('')

w('## Token table\n')
w(f"Tokens follow {sec_link('04', 'C.1 Colour tokens', '04 §C.1')}: `:root` primitives plus `[data-mode=\"brief|ops|hud|print\"]` semantic layers; components use semantic tokens only ({sec_link('04', 'G. Implementation notes', '04 §G')}). Token names are the contract; TASK-13 freezes them.\n")
w('### Semantic tokens per mode\n')
w(table(['Token', 'BRIEF', 'OPS', 'HUD', 'PRINT'], tok_rows))
w('')
w('BRIEF-only: `signal` `#E7553D`, `signal-ink` `#C2401F`, `charcoal` `#282828`, `charcoal-text-2` `#A3A3A3`. PRINT neutrals marked PROPOSED in the contrast table are additions (G-15, U-33).\n')
w('### Measured contrast\n')
w('Computed with the WCAG relative-luminance formula in `docs/design/prototype/test/contrast.mjs` and live on the Design system page. "Spec" is the value stated in 04 §C.1.\n')
w(table(['Mode', 'Pair', 'Foreground', 'Background', 'Spec', 'Measured', 'Result'], [[m, n, f'`{a}`', f'`{b}`', (f'{s}' if s is not None else 'none stated'), f'{r:.2f} : 1', ('matches' if s is not None and abs(s - r) <= 0.05 else 'new value' if s is None else 'DIFFERS')] for m, n, a, b, s, r in D['contrast']]))
w('')
w('All 34 stated ratios reproduce; the only difference is PRINT text on white (17.74 measured vs 17.7 stated, rounding). The four PRINT additions are above the 4.5 : 1 text and 3 : 1 non-text thresholds. High-contrast EVA alert bars use an outlined variant because white on `warning-fill` is 6.54 : 1, below the HUD 7 : 1 rule (DV-05, U-37).\n')
w('### tokens.css (as built in the prototype)\n')
w('```css\n' + css.strip() + '\n```\n')
w('Fonts: Chakra Petch (display), Inter (UI), IBM Plex Mono (all numbers, tabular, slashed zero), Source Serif 4 (long-form). The prototype loads them from Google Fonts with fallback stacks. **The product self-hosts WOFF2 (offline), and the licences of Chakra Petch, Source Serif 4 and Lucide are still unverified (U-27, U-40).** Icons in the prototype are an own 1.5 px square-cap set; Lucide is the product set.\n')

w('## Interaction specs\n')
w(table(['Interaction', 'Spec', 'Behaviour'], [list(i) for i in H.INTERACTIONS]))
w('')

w('## EVA orientation spec\n')
w('**Status: Proposed deviation (DV-01), tested in the prototype; ratification is U-30.** Portrait follows 04 §E.5 exactly. Landscape (default) keeps the fixed geography of 04 §A.3 #4: alert bar on top, HAVEN top-left, O₂ beside it, actions at the bottom.\n')
w('### Layouts\n')
blocks = re.findall(r"```text\n(.*?)\n```", H.PATCH_E5, re.S)
w('Portrait follows 04 §E.5 and is repeated in the draft patch text below. Landscape v2 (default):\n')
w('```text\n' + blocks[1] + '\n```\n')
w('Landscape history: the first landscape layout split the screen into four parts (HAVEN | O₂ across the top, NEXT | map below). Team feedback on 2026-11-05 called that a waste of space, so landscape v2 puts HAVEN and O₂ in two compact cards top-left, NEXT under them, and gives the map the whole right column. The measurements below are for v2.\n')
w('### Height budget (measured in Chromium, 844×390)\n')
w(table(D['budget'][0], D['budget'][1:]))
w('')
w('Measured for all 8 EVA states on all 4 device sizes (32 combinations): no scrolling and no overflow; HAVEN, O₂, NEXT and the map never overlap one another; HAVEN is top-left and O₂ is immediately right of it on the same row in every combination; in landscape the map starts right of both cards and spans the full body height; HAVEN and O₂ values are 56 px on phones and 64 px on tablets (limit ≥ 56 px); NEXT values are 32 px on phones and 48 px on tablets (limit ≥ 32 px); every action target is ≥ 56 px high with ≥ 8 px gaps.\n')
w('### Rotation behaviour (measured on the Orientation compare page)\n')
w(table(D['cmp'][0], D['cmp'][1:]))
w('')
w('"Quadrant" is the zone of the frame centre (L/C/R × T/M/B; C = spans the middle). The alert slot, HAVEN (top-left), the metadata strip and the action row stay put exactly. **O₂ no longer keeps its quadrant:** it is top-right in portrait and sits beside HAVEN in landscape, but it is immediately right of HAVEN on the same row in both. NEXT and the mini-map also change place. This is the price of the compact-card layout; whether it is acceptable is part of U-30, and UT-6 tests it with people.\n')
w('### SCR-14 options sheet\n')
w('- **Portrait:** bottom sheet, 70 % of the height ([04 §E.7](../specs/04_Design_Brief.md#e7-scr-14-alert-options-sheet-eva)); alert bar, HAVEN and O₂ stay visible above it.')
w('- **Landscape:** right-side panel over the map column (about 53 % of the width, not the 60 % first proposed), below the alert bar. HAVEN, O₂ and NEXT stay visible in the left column, so no echo is needed (G-22 superseded). One hold-to-confirm "Go — option N" at the panel bottom. The panel body fits three option cards at 844×390 without scrolling.\n')
w('### Keeping the EVA tablet distinct from the HUD\n')
w('The HUD (SCR-13) is pure black, read-only, shows at most five values (haven, bearing + distance, O₂, alert line, link), no map, values 56–72 px, exit by a 2 s hold. The landscape EVA tablet is OPS mode with a map and four actions. They share the geography (haven top-left) but never the layout: the HUD has no actions, no strip and no map.\n')

w('## Fixture schema\n')
w('One `<script type="application/json" id="fixture">` block in the page (also `docs/design/prototype/fixture.json`). Every number is `{v, unit, prov, src}`; `src` is a spec section or `PLACEHOLDER` (which carries `unblocks`). Wire messages carry raw numbers plus a provenance map; the fixture wraps each number so the prototype can audit it (U-42).\n')
w(table(['Fixture key', 'Maps to', 'Notes'], [list(r) for r in H.FIXTURE_MAP]))
w('')
w(f"{sec_link('02', 'E.6 WebSocket', '02 §E.6')} messages (`HELLO`, `SNAPSHOT`, `STATE_DELTA`, `EVENT`, `COMMAND`, `COMMAND_RESULT`) and {sec_link('05', 'C.2 Runtime entities', '05 §C.2')} entities are reflected in `snapshot_example`, `log`, `options`, `alerts` and `scenario`; field names are the 05 names so they can be bound to real data later.\n")
w('### Placeholder inventory\n')
w('Every `PLACEHOLDER` and what unblocks it (counts are fixture numbers):\n')
w(table(['Unblocked by', 'Count', 'Fixture keys'], [[k, len(v), ', '.join(f'`{x[0]}`' for x in v)] for k, v in sorted(D['ph'].items())]))
w('')
w('Text placeholders (not numbers): the EZ—ENG 01 name, dataset versions and licences marked `TODO(verify)`, the Hab Core join address, the QR codes (real ones come from `GET /api/join-qr?role=`).\n')

w('## Accessibility notes\n')
for a in H.A11Y: w(f'- {a}')
w('')

w('## Deviations from spec\n')
w(table(['ID', 'Item', 'Spec says', 'Prototype / proposal', 'Status'], [list(r) for r in H.DEVIATIONS]))
w('')
w('### Draft patch text\n')
w('The text below is a **Proposal** for the owners of the specs. It does not edit them.\n')
w('#### Replacement for 04 §E.5 (adds the landscape layout) and the SCR-14 landscape variant\n')
w(H.PATCH_E5.replace('### E.5 SCR-12', '##### E.5 SCR-12').strip() + '\n')
w('#### Replacement for the 04 §F "Responsive" row\n')
w('```text\n' + H.PATCH_F + '\n```\n')
w('#### Replacement for the first acceptance bullet of 01 FR-32\n')
w('```text\n' + H.PATCH_FR32 + '\n```\n')
w('Also change the `Content` line of 03 §B SCR-12 ("Entry `#/eva/EV1`") to say "portrait or landscape", and the 04 §D.1 "Alert bar" row to "slot always reserved; the EVA tablet shows a status line (NOMINAL, STANDBY, EVA ENDED) while there is no alert, ops and HUD leave it empty" (DV-03).\n')

w('## Conflicts and gaps\n')
w('Every conflict or gap found while building, with how it was handled. None was resolved silently.\n')
w(table(['ID', 'Where', 'Conflict or gap', 'How it was handled'], [list(g) for g in H.GAPS]))
w('')

w('## Unresolved items\n')
w('IDs continue after U-29 (04 ends at U-27, but U-28 and U-29 are used in 03).\n')
w(table(['ID', 'Item', 'Owner', 'Due'], [list(u) for u in H.UNRESOLVED]))
w('')

w('## Usability test script for TASK-15\n')
w(f"Extends {sec_link('04', 'F.1 Mission-critical', '04 §F.1')} with the landscape-vs-portrait glove test. Three non-team users; thick gloves on a touchscreen phone; the prototype's Alerting state; do not explain the controls.\n")
w(table(['ID', 'Task', 'Pass', 'Source'], [list(u) for u in H.USABILITY]))
w('')
w('Procedure for UT-5: alternate the starting orientation between testers; record time to a completed hold and the number of mis-taps; repeat for Abort. If landscape is worse than portrait by more than the margin, keep landscape optional and fix the layout before adopting it (U-30).\n')

w('## Verification\n')
w('Run with headless Chromium and the real fonts (local copies), using real pointer events. Scripts are in `docs/design/prototype/test/`.\n')
w(table(['Check', 'Result'], [
 ['Every screen × state × frame size renders (219 combinations)', 'pass, 0 errors, 0 missing fixture keys'],
 ['EVA layout: 8 states × 4 devices', 'pass, 32 of 32 (no scroll, no overflow, ≥ 56 px values and targets, ≥ 8 px gaps)'],
 ['Provenance on every displayed value, all 219 frames', 'pass, 2,802 values, 0 without provenance (856 are placeholders)'],
 ['Four cues (word + shape + slot) on every status, all 219 frames', 'pass, 378 statuses, 0 failing'],
 ['Interactions (hold-to-confirm, tap fallback, alerts, stale, queued, HUD exit, high contrast, mute, keys, planner, drag-to-failure, Stage, player)', 'pass, 42 of 42'],
 ['EVA status line (swap with the alert bar in the same slot, 3 devices, return after acknowledge + clear, standby / ended / no-link / sheltered)', 'pass, 17 of 17'],
 ['Review toggles (annotations, grayscale, reduced motion, placeholders)', 'pass, 7 of 7'],
 ['Token contrast', 'pass, 34 stated ratios reproduce (PRINT text 17.74 vs 17.7)'],
 ['markdownlint on this file', 'pass, 0 issues (markdownlint-cli2 0.24, default rules with MD013 line length disabled because the tables need long lines; the repo config was not available)'],
 ['Spec links in this file', 'pass, every link into 01–06 resolves to an existing heading (checked against the spec files)'],
]))
w('')
w('**Not verified:** behaviour in the hosted artifact (hash links, Google Fonts), other browsers (only Chromium), real devices and gloves, screen readers, print output, the demo player pacing at 1×/10×/60× over a full run, and prose or alert strings that embed numbers (for example "ETA 14 min"): those carry their source in `fixture.alerts[].src`, but the numbers inside the strings have no chip. The audit counts only values rendered through the value component.\n')

w('## Prototype source and rebuild\n')
w('```text\ndocs/design/prototype/\n  marswalk-prototype.html      built page (self-contained)\n  fixture.json                 the fixture block\n  build.py                     assembles CSS + fixture + JS into the page\n  src/fixture.py               fixture generator (numbers with src / PLACEHOLDER)\n  src/handoff_data.py          single source for the tables in this file\n  src/css/, src/js/            tokens, components, screens\n  test/                        Chromium tests and the contrast script\n```\n')
w('Rebuild: `python3 build.py`. Run tests: `cd test && npm install && node t3.mjs` (and `t6`, `t9`, `t12`, `t18`). The fixture and the prototype are design artefacts: they are not part of the product build, and no value in them is computed.\n')
w('## Credits\n')
w('Data credit shown in the prototype (SCR-09 and SCR-17): NASA/JPL-Caltech (MSL RAD, Curiosity), NASA CCMC (DONKI), NASA NAIF (SPICE), USGS Astrogeology (Gale merged DEM, orthophoto, THEMIS), ESA (Mars Express HRSC inside the DEM; ExoMars TGO kernels). No NASA or other agency logos or insignia are used. The prototype and this file were produced with an AI coding assistant; see [AI use](../AI_USE.md).\n')
open('docs_out/mockup-handoff.md', 'w', encoding='utf-8').write('\n'.join(o))
print('written', sum(len(x) for x in o) // 1024, 'KB', len(o), 'blocks')
