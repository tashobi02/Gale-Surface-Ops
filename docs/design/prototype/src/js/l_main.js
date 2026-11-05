'use strict';
/* ===== SHELL + ROUTER + KEYS =====
   G-18: the artifact host only passes plain #name hashes, so the canonical hash here is e.g. #scr-12-walking-landscape.
   The 03 §A forms (#/planner, #/ops, #/eva/EV1, #/hud/EV1, #/report …) are accepted too, and the top bar always shows the 03 §A route. */
const SPEC_ROUTES = { '/': 'scr-01', '/join': 'scr-10', '/planner': 'scr-02', '/briefing': 'scr-08', '/ops': 'scr-11', '/eva/EV1': 'scr-12', '/eva/EV2': 'scr-12', '/hud/EV1': 'scr-13', '/hud/EV2': 'scr-13', '/report': 'scr-17', '/earth': 'scr-16', '/sources': 'scr-09', '/replay': 'scr-11', '/map': 'scr-02' };
const PAGE_BUILDERS = { overview: pageOverview, 'design-system': pageDesign, screens: pageScreens, demo: pageDemo, stage: pageStage, orientation: pageOrientation, flows: pageFlows, handoff: pageHandoff };
const RAIL = [['Overview', 'overview'], ['Design system', 'design-system'], ['Screens', 'screens'], ['Flows', 'flows'], ['Demo player', 'demo'], ['Stage', 'stage'], ['Handoff notes', 'handoff']];
const RAIL_SUB = [['scr-11', 'SCR-11 Ops console'], ['scr-12', 'SCR-12 EVA tablet'], ['scr-13', 'SCR-13 HUD'], ['scr-14', 'SCR-14 Options sheet'], ['orientation', 'EVA orientation compare']];
const stateSlugs = S => { const m = {}; (S.states || []).forEach(([k, l]) => { m[slug(l)] = k; m[slug(k)] = k; }); return m; };
const ROUTER = {
  cur: null, ignore: false,
  parse(h) {
    h = (h || '').replace(/^#/, ''); if (!h) return { page: 'overview' };
    if (h[0] === '/') { const key = h.replace(/\/$/, '') || '/'; const t = SPEC_ROUTES[key]; if (t) { const p = this.parse(t); if (key.includes('EV2')) p.ev = 'EV2'; return p; } }
    const m = h.match(/^scr-(\d\d)(?:-(.+))?$/);
    if (m) { const id = 'SCR-' + m[1], S = SCREENS[id]; let rest = (m[2] || '').toLowerCase(), orient = null; const om = rest.match(/(?:^|-)(landscape|portrait)$/); if (om) { orient = om[1]; rest = rest.slice(0, rest.length - om[0].length); } const sl = S ? stateSlugs(S) : {}; return { scr: id, state: sl[rest] || null, orient }; }
    if (h.startsWith('flow-')) return { page: 'flow', id: h.slice(5) };
    return { page: h };
  },
  hashFor(id, state, orient) { const S = SCREENS[id]; const st = S && S.states.find(x => x[0] === state); return `scr-${id.slice(4)}${st && S.states.length > 1 ? '-' + slug(st[1]) : ''}${orient ? '-' + orient : ''}`; },
  syncHash(fr) { const w = WORLDS[fr.wid]; const nh = '#' + this.hashFor(fr.screenId, fr.state, fr.S().orientToggle ? fr.orient() : null); if (location.hash !== nh) { this.ignore = true; history.replaceState(null, '', nh); } },
  render() {
    const main = $('#main'), p = this.parse(location.hash); playerStop(); destroyFrames(main);
    let page;
    if (p.scr) page = pageScreen(p.scr, p.state, p.orient, PAGE.dev[p.scr]); else if (p.page === 'flow') page = pageFlow(p.id); else if (PAGE_BUILDERS[p.page]) page = PAGE_BUILDERS[p.page](p); else page = { title: p.page, route: '', html: `<h1>Not found</h1><p class="lead">No page “${esc(p.page)}”.</p>`, mount() { } };
    this.cur = p; main.innerHTML = page.html; mountHosts(main); if (page.mount) page.mount(main); typo(main);
    document.title = page.title + ' — Marswalk Surface Ops prototype';
    $('#routechip').textContent = page.route || ''; $$('#rail a').forEach(a => a.removeAttribute('aria-current'));
    const key = p.scr ? slug(p.scr) : (p.page === 'flow' ? 'flows' : p.page); const link = $(`#rail a[data-r="${key}"]`) || $(`#rail a[data-r="${p.scr ? 'screens' : p.page}"]`); if (link) link.setAttribute('aria-current', 'page');
    if (p.scr && FRAMES) { const fr = Object.values(FRAMES)[0]; }
    refreshReview(); fitAll(); main.scrollTop = 0; setTimeout(auditAll, 50);
  },
};
window.addEventListener('hashchange', () => { if (ROUTER.ignore) { ROUTER.ignore = false; return; } ROUTER.render(); });

function boot() {
  document.body.className = 'shell'; document.body.dataset.mode = 'ops';
  document.body.insertAdjacentHTML('afterbegin', `<header id="topbar" role="banner"><svg class="brandmark" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h10l5 5v10l-5 5H7l-5-5V7Z" fill="#E7553D"/></svg><b style="font:500 14px var(--f-display);text-transform:uppercase;letter-spacing:.02em;white-space:nowrap">Marswalk Surface Ops <span style="color:#8592A0">(working title)</span></b><span class="route" id="routechip" title="Route per 03 §A"></span><span class="sep"></span>
    <button class="shellbtn" id="t-ann" aria-pressed="false" title="Redline overlay">ANNOTATIONS</button><button class="shellbtn" id="t-gray" aria-pressed="false" title="Grayscale + §F.1 four-cue check">GRAYSCALE</button><button class="shellbtn" id="t-rm" aria-pressed="false" title="prefers-reduced-motion">REDUCED MOTION</button><button class="shellbtn" id="t-ph" aria-pressed="false" title="Highlight PLACEHOLDER values">PLACEHOLDERS</button><button class="shellbtn" id="t-zoom" aria-pressed="false" title="Frame scale">FIT</button>
    <span class="badge" id="aud-prov"></span><span class="badge" id="aud-stat"></span><span class="badge" id="aud-ph"></span></header>
    <nav id="rail" aria-label="Sections">${RAIL.map(([l, h]) => `<a href="#${h}" data-r="${h}">${l}</a>`).join('')}<div class="grp">Quick links</div>${RAIL_SUB.map(([h, l]) => `<a class="sub" href="#${h}" data-r="${h}">${l}</a>`).join('')}</nav><main id="main" tabindex="-1"></main>`);
  document.body.insertAdjacentHTML('beforeend', terrainDefsSvg());
  const tg = (id, key) => $('#' + id).addEventListener('click', e => { UI[key] = !UI[key]; e.currentTarget.setAttribute('aria-pressed', UI[key]); refreshReview(); });
  tg('t-ann', 'ann'); tg('t-gray', 'gray'); tg('t-rm', 'rm'); tg('t-ph', 'ph');
  $('#t-zoom').addEventListener('click', e => { UI.zoom = UI.zoom === 'fit' ? '100' : 'fit'; e.currentTarget.textContent = UI.zoom === 'fit' ? 'FIT' : '100 %'; e.currentTarget.setAttribute('aria-pressed', UI.zoom === '100'); fitAll(); });
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { UI.rm = true; $('#t-rm').setAttribute('aria-pressed', 'true'); }
  ROUTER.render();
}

/* ---- keyboard shortcuts (04 §F). Ops: Space pause · 1/2/3 speed · N next event · K acknowledge · O focus options. ---- */
function activeFrame(screenId) { const l = Object.values(FRAMES).filter(f => f.screenId === screenId && f.el.isConnected); return l[0] || null; }
document.addEventListener('keydown', e => {
  if (e.target.matches && e.target.matches('input,textarea,select')) return; if (e.ctrlKey || e.metaKey || e.altKey) return;
  const ops = activeFrame('SCR-11');
  if (ops && !e.target.closest('.hud') && !(e.target.closest && e.target.closest('[data-hold]'))) {
    const w = WORLDS[ops.wid], k = e.key; let used = true;
    if (k === ' ') { if (document.activeElement && document.activeElement.tagName === 'BUTTON') return; w.paused = !w.paused; if (w.player) w.player.paused = w.paused; touch(w); }
    else if (k === '1' || k === '2' || k === '3') { w.speed = [1, 10, 60][+k - 1]; if (w.player) w.player.speed = w.speed; touch(w); }
    else if (k === 'n' || k === 'N') { if (w.player) w.player.next(); else touch(w); }
    else if (k === 'k' || k === 'K') { const t = topAlert(w).top; if (t && !t.acked) ackAlert(w, t.id); }
    else if (k === 'o' || k === 'O') { const o = $('#opts', ops.el); if (o) { o.focus(); } }
    else used = false;
    if (used) { e.preventDefault(); return; }
  }
  if (KEYS.planner) { const pf = activeFrame('SCR-02'); if (pf && KEYS.planner(e, pf)) e.preventDefault(); }
});
document.addEventListener('DOMContentLoaded', boot);
