#!/usr/bin/env python3
# Assembles one self-contained HTML file: CSS + fixture JSON block + JS. No external scripts; fonts via Google Fonts with fallbacks.
import json, sys, glob, os
sys.path.insert(0, 'src')
import importlib, fixture
importlib.reload(fixture)
F = fixture.F
css = ''.join(open(f'src/css/{n}.css', encoding='utf-8').read() + '\n' for n in ['tokens', 'components', 'screens'])
order = ['a_core', 'b_comp', 'd_map', 'c_world', 'o_tasks', 'i_frames', 'e_ops', 'f_eva', 'g_planner', 'h_misc', 'j_pages', 'k_player', 'm_flows', 'n_handoff', 'l_main']
js = ''
for n in order:
    p = f'src/js/{n}.js'
    if os.path.exists(p): js += f'/* ---- {n} ---- */\n' + open(p, encoding='utf-8').read() + '\n'
fx = json.dumps(F, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
fonts = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&family=Source+Serif+4:wght@400;600&display=block'
html = f'''<!doctype html>
<html lang="en" data-mode="ops" data-rm="0">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Marswalk Surface Ops — design handoff prototype</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}">
<style>
{css}
</style></head>
<body>
<noscript>This prototype needs JavaScript.</noscript>
<script type="application/json" id="fixture">{fx}</script>
<script>
{js}
</script>
</body></html>'''
open('marswalk-prototype.html', 'w', encoding='utf-8').write(html)
open('fixture.json', 'w', encoding='utf-8').write(json.dumps(F, ensure_ascii=False, indent=1))
print('built', len(html)//1024, 'KB; js', len(js)//1024, 'KB; css', len(css)//1024, 'KB')
