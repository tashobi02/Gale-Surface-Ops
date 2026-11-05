'use strict';
/* ===== COMPONENTS + ENGINES ===== */
const KEYS = { planner: null };   // keyboard handlers registered by screens
const ACT = {};            // click actions: ACT.name = (el, ctx) => void
const HOLDACT = {};        // completed hold-to-confirm actions: HOLDACT.name = (world, arg, ctx) => void
const FRAMES = {};         // fid -> { el, render(), wid }
const WORLDS = {};

/* ---- world: shared state for a set of frames (player/stage share one; each screen-switcher frame has its own) ---- */
function newWorld(id) {
  const w = {
    id, ver: 0, subs: new Set(), session: 'running', speed: 60, paused: false, vals: 'nominal', beat: null,
    evs: { EV1: { act: 'atStop', linked: true, queue: [], stale: null }, EV2: { act: 'atStop', linked: true, queue: [], stale: null } },
    veh: { PR1: 'parked', UR1: 'parked' }, alerts: [], listOpen: false, opt: { state: 'none', sel: 1, approval: 'none', noRdv: false },
    earth: { state: 'link', fc: 'none' }, log: 2, muted: true, hc: false, tapConfirm: false, sheet: true, orient: 'landscape',
    pos: { EV1: 0.52, EV2: 0.5, PR1: 0, rdv: false }, hold: {}, toast: null, ops: {}, ui: {},
  };
  WORLDS[id] = w; return w;
}
function worldOf(id, init) { return WORLDS[id] || (init ? init(newWorld(id)) : newWorld(id)); }
function touch(w) { w.ver++; w.subs.forEach(fn => fn()); }

/* ---- sound + haptics (04 §C.7): prototype default is muted so many frames don't alarm; the ops toggle shows SOUND OFF ---- */
const SND = {
  ctx: null, timers: {},
  unlock() { if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } },
  tone(f, t0, d) { if (!this.ctx) return; const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.value = .03; o.connect(g); g.connect(this.ctx.destination); o.start(this.ctx.currentTime + t0); o.stop(this.ctx.currentTime + t0 + d); },
  play(level) { if (level === 'warning') { this.tone(880, 0, .16); this.tone(660, .2, .16); } else if (level === 'caution') this.tone(740, 0, .2); },
  vib(level) { try { if (navigator.vibrate) navigator.vibrate(level === 'warning' ? [200, 100, 200, 100, 200] : level === 'caution' ? [200] : 0); } catch (e) { } },
};
document.addEventListener('pointerdown', () => SND.unlock(), { once: false, passive: true });

/* ---- alert engine (04 §D.2; 03 §E.7 lifecycle) ---- */
const RANK = { warning: 3, caution: 2, advisory: 1 };
function raise(w, code, o = {}) {
  if (w.alerts.find(a => a.code === code && !a.gone)) return;
  const def = FX.alerts[code]; if (!def) return;
  const a = { id: 'a-' + code + '-' + (w.ver + 1), code, level: def.level, text: def.text, acked: !!o.acked, cleared: false, gone: false, shownAt: performance.now() };
  w.alerts.push(a);
  if (!o.silent) { if (!w.muted) SND.play(a.level); if (w.vibrateOn) SND.vib(a.level); }
  if (a.level === 'warning' && !a.acked && !w.muted) startRepeat(w, a);
  if (a.level === 'advisory' && !o.persist) { setTimeout(() => { a.gone = true; a.dismissed = true; touch(w); }, 10000); }   // auto-dismiss 10 s; stays in log
  return a;
}
function startRepeat(w, a) { stopRepeat(a); a.timer = setInterval(() => { if (a.acked || a.gone || w.muted) return stopRepeat(a); SND.play('warning'); }, 5000); }
function stopRepeat(a) { if (a.timer) { clearInterval(a.timer); a.timer = null; } }
function ackAlert(w, id) {
  const a = w.alerts.find(x => x.id === id); if (!a) return; a.acked = true; stopRepeat(a);   // silence + mark seen; does NOT clear the condition
  if (a.cleared) a.gone = true; touch(w);
}
function clearAlert(w, code) {
  const a = w.alerts.find(x => x.code === code && !x.gone); if (!a) return; a.cleared = true; if (a.acked || a.level === 'advisory') a.gone = true; touch(w);   // warnings/cautions latch until acknowledged
}
function activeAlerts(w) { return w.alerts.filter(a => !a.gone).sort((x, y) => RANK[y.level] - RANK[x.level] || y.shownAt - x.shownAt); }
function topAlert(w) { const l = activeAlerts(w); return { top: l[0] || null, more: Math.max(0, l.length - 1), list: l }; }
function resetAlerts(w) { w.alerts.forEach(stopRepeat); w.alerts = []; }

/* EVA status line (team feedback 2026-11-05, DV-03): with no alert the 64 px slot shows a quiet status instead of sitting empty.
   Same slot, same position; the alert bar replaces it the moment an alert is raised. Still four cues: colour + shape + word + fixed slot. */
function statusLine(s) {
  return `<div class="status statusline" data-status="${s.level}" data-slot="alert" data-ann="id:DV-03|px:64 high, quiet|note:No alert: a quiet status line fills the slot (icon + word + detail + phase). Replaced by the alert bar when one is raised">${sicon(s.level)}<span class="sl-k">STATUS</span><span class="sword sl-w">${esc(s.word)}</span><span class="sl-d">${esc(s.detail)}</span><span class="sp"></span>${s.phase ? `<span class="sl-k">PHASE</span><span class="sl-p">${esc(s.phase)}</span>` : ''}</div>`;
}
/* alert bar slot: the 64 px slot is always reserved (G-02), the bar only appears when there is something to say */
function alertSlot(w, o = {}) {
  const { top, more } = topAlert(w);
  const dev = o.dev || 'ops';
  if (!top && o.idle) return `<div class="alertslot" data-slot="alert">${statusLine(o.idle)}</div>`;
  if (!top) return `<div class="alertslot" data-slot="alert" data-ann="id:SCR-${dev === 'hud' ? '13' : dev === 'eva' ? '12' : '11'}|px:64 high, full width, fixed|aria:aria-live (assertive for warning)|note:Hidden when nominal (dark cockpit) — the slot stays reserved so nothing shifts (G-02)"></div>`;
  const age = performance.now() - top.shownAt;
  const anim = RM() ? '' : (top.level === 'warning' && age < 1000 ? `flash` : top.level === 'caution' && age < 600 ? 'pulse' : '');
  const delay = anim ? `style="animation-delay:-${(age / 1000).toFixed(2)}s"` : '';
  const live = top.level === 'warning' ? 'assertive' : 'polite';
  return `<div class="alertslot" data-slot="alert"><div class="alertbar ${anim}" ${delay} data-level="${top.level}" data-status="${top.level}" data-slot="alert" role="${top.level === 'warning' ? 'alert' : 'status'}" aria-live="${live}"
    data-ann="id:04 §D.2|px:64 high|token:${top.level === 'warning' ? 'warning-fill' : top.level === 'caution' ? 'caution-fill' : 'raised'}|aria:aria-live=${live}|note:Flash ×2 (2 Hz) then hold; one bar, highest level wins">
    ${sicon(top.level, 'onfill')}<span class="atext">${esc(top.text)}</span>${top.acked ? '<span class="tag" style="color:inherit;border-color:currentColor">ACK</span>' : ''}
    ${more ? `<button class="btn abtn cnt" data-act="alertList" aria-label="${more} more alerts">+${more}</button>` : ''}
    ${dev === 'eva' && top.level === 'warning' && !w.sheet ? `<button class="btn abtn" data-act="sheet">Options</button>` : ''}
    ${!top.acked && dev !== 'hud' ? `<button class="btn abtn" data-act="ack" data-id="${top.id}" ${dev === 'ops' ? 'title="K"' : ''}>${dev === 'ops' ? 'ACK <span class="mono">K</span>' : (o.compact ? 'ACK' : 'Acknowledge')}</button>` : ''}</div></div>`;
}
function alertListPanel(w) {
  if (!w.listOpen) return '';
  const l = w.alerts.slice().sort((x, y) => RANK[y.level] - RANK[x.level] || y.shownAt - x.shownAt);
  return `<ul class="alertlist cut cut-s" role="list" aria-label="Alert list">${l.map(a => `<li class="${a.gone ? 'cleared' : ''}">${status(a.level, { slot: 'alert-list' })}<span>${esc(a.text)}</span><span class="tag">${a.gone ? (a.dismissed ? 'DISMISSED' : 'CLEARED') : a.acked ? 'ACK' : 'NEW'}</span></li>`).join('') || '<li><span class="t3">No alerts</span></li>'}
    <li><button class="btn sm" data-act="alertList">Close</button></li></ul>`;
}

/* ---- generic components ---- */
function panel(o) {
  return `<section class="panel cut ${o.cut || 'cut-m'} ${o.cls || ''}" ${o.attrs || ''} ${o.ann ? `data-ann="${esc(o.ann)}"` : ''}><i class="stripe"></i>
    <header class="ph-h">${o.code ? `<span class="code">${esc(o.code)}</span>` : ''}${o.mod ? `<span class="mod">${esc(o.mod)}</span>` : ''}<span class="sp"></span>${o.right || ''}</header>
    ${o.title ? `<div style="padding:0 12px"><h3 class="ttl">${esc(o.title)}</h3></div>` : ''}<div class="pb ${o.pbcls || ''}">${o.body || ''}</div></section>`;
}
function btn(label, o = {}) {
  const k = o.kind ? ' ' + o.kind : '';
  const dis = o.disabled ? ' disabled aria-disabled="true"' : '';
  const attrs = Object.entries(o.data || {}).map(([a, b]) => ` data-${a}="${esc(b)}"`).join('');
  return `<span class="cutw ${o.wcls || ''}"><button class="btn ${o.size || ''}${k} ${o.cls || ''}" ${o.act ? `data-act="${o.act}"` : ''}${attrs}${dis}${o.title ? ` title="${esc(o.title)}"` : ''} ${o.pressed ? 'aria-pressed="true"' : ''}>${o.icon ? ico(o.icon) : ''}${label}</button></span>${o.reason ? `<span class="holdnote" role="note">${esc(o.reason)}</span>` : ''}`;
}
function tog(label, pressed, act, o = {}) {
  return `<button class="toggle" role="switch" aria-pressed="${!!pressed}" data-act="${act}" ${o.arg ? `data-arg="${esc(o.arg)}"` : ''} ${o.disabled ? 'disabled' : ''}><span class="sw"></span><span>${label}</span></button>`;
}
function seg(items, cur, act) {
  return `<div class="row" style="gap:4px;flex-wrap:wrap" role="group">${items.map(([k, l]) => btn(l, { size: 'seg', act, data: { arg: k }, cls: k === cur ? 'on' : '', pressed: k === cur })).join('')}</div>`;
}
function metric(o) {
  const vv = o.num ? N(o.num, { chip: o.chip === undefined ? 'g' : o.chip, size: o.size || 20, stale: o.stale }) : (o.html || '');
  return `<div class="metric ${o.cls || ''}" style="display:flex;flex-direction:column;gap:2px"><span class="lbl">${esc(o.label)}</span><span style="font-size:${o.size || 20}px;line-height:1.1">${o.disabled ? `<span class="num t3" data-provenance="derived" title="needs a plan — no value yet">—</span>` : vv}</span>${o.sub ? `<span class="t3" style="font-size:12px">${o.sub}</span>` : ''}</div>`;
}
function t2tag(extra = '') { return `<span class="tag t2s" title="Tier 2 — only after Tier 1 exit criteria (01 §C.3)">T2 SCOPE${extra}</span>`; }

/* ---- hold-to-confirm (04 §D.3): 800 ms hold, progress along the chamfer, early-release cancel, 300 ms outcome, tap-then-Confirm fallback ---- */
const HOLD_MS = 800, OUTCOME_MS = 300, CONFIRM_MS = 5000;
const HOLDS = {};
function holdBtn(o) {
  const st = HOLDS[o.key] || { phase: 'idle' };
  const w = worldOf(o.wid);
  const kind = o.kind || 'crit-w';
  const meta = `data-hold-key="${o.key}" data-wid="${o.wid}" data-fid="${o.fid || ''}"`;
  if (o.disabled) return `<span class="cutw ${o.wcls || ''}"><button class="btn ${o.size || 'xl'} ${kind}" disabled aria-disabled="true" title="${esc(o.reason || '')}">${o.icon ? ico(o.icon) : ''}<span style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.15">${esc(o.label)}<small style="font:500 12px var(--f-ui)">${esc(o.reason || '')}</small></span></button></span>`;
  if (st.phase === 'confirm') return `<span class="cutw ${o.wcls || ''}"><button class="btn ${o.size || 'xl'} ${kind} confirmbtn" data-act="holdConfirm" ${meta} data-act2="${o.act}" data-arg="${esc(o.arg || '')}" data-outcome="${esc(o.outcome || '')}">${ico('check')}Confirm — ${esc(o.label)}</button></span>`;
  const word = st.phase === 'done' ? `<span class="hword">${ico('check')}${esc(o.outcome || 'Done')}</span>` : st.phase === 'cancelled' ? `<span class="hword">Released early — hold 0.8 s</span>` : `<span class="hword">${o.icon ? ico(o.icon) : ''}${esc(o.label)}</span>`;
  const tapMode = w.tapConfirm;
  return `<span class="cutw ${o.wcls || ''}"><button class="btn ${o.size || 'xl'} hold ${kind} ${st.phase === 'done' ? 'done' : ''}" ${tapMode ? `data-act="holdTap"` : `data-hold="1"`} ${meta} data-act2="${o.act}" data-arg="${esc(o.arg || '')}" data-outcome="${esc(o.outcome || '')}" data-label="${esc(o.label)}"
    ${o.ann ? `data-ann="${esc(o.ann)}"` : ''} aria-label="${esc(o.label)}${tapMode ? ' (tap, then confirm)' : ' (press and hold)'}">
    <svg class="hsvg" aria-hidden="true"><path class="hbase" pathLength="100"/><path class="hprog" pathLength="100" style="stroke-dasharray:${st.phase === 'done' ? 100 : 0} 100"/></svg>${word}</button></span>`;
}
function layoutHolds(root) {   // draw the chamfered perimeter path from the real size (layout px, unaffected by frame scaling)
  $$('.hold', root).forEach(b => {
    const W = b.offsetWidth, H = b.offsetHeight, c = 8, i = 3;
    const d = `M${i} ${i}H${W - c - i * .5}L${W - i} ${c + i * .5}V${H - i}H${c + i * .5}L${i} ${H - c - i * .5}Z`;
    $$('.hsvg path', b).forEach(p => p.setAttribute('d', d));
  });
}
function holdEl(key) { return document.querySelector(`[data-hold-key="${CSS.escape(key)}"].hold`); }
function holdRender(key) { const el = holdEl(key); const fid = el && el.dataset.fid; if (fid && FRAMES[fid]) FRAMES[fid].render(); else { const w = el && WORLDS[el.dataset.wid]; if (w) touch(w); } }
function holdSet(key, st, ms) { HOLDS[key] = st; holdRender(key); if (ms) setTimeout(() => { if (HOLDS[key] === st) { delete HOLDS[key]; holdRender(key); } }, ms); }
function holdStart(btn) {
  const key = btn.dataset.holdKey; if (HOLDS[key] && HOLDS[key].phase === 'holding') return;
  const st = { phase: 'holding', t0: performance.now() }; HOLDS[key] = st; btn.classList.add('pressed');
  const tick = () => {
    if (HOLDS[key] !== st) return;
    const el = holdEl(key); const p = clamp((performance.now() - st.t0) / HOLD_MS, 0, 1);
    if (el) { const pr = el.querySelector('.hprog'); if (pr) pr.style.strokeDasharray = `${p * 100} 100`; }
    if (p >= 1) return holdDone(el || btn, key, st);
    st.raf = requestAnimationFrame(tick);
  };
  st.raf = requestAnimationFrame(tick);
}
function holdCancel(key) {
  const st = HOLDS[key]; if (!st || st.phase !== 'holding') return;
  cancelAnimationFrame(st.raf); const c = { phase: 'cancelled' }; HOLDS[key] = c; holdRender(key); setTimeout(() => { if (HOLDS[key] === c) { delete HOLDS[key]; holdRender(key); } }, 1100);
}
function holdDone(el, key, st) {
  const d = { phase: 'done' }; HOLDS[key] = d; const act = el.dataset.act2, arg = el.dataset.arg, wid = el.dataset.wid, fid = el.dataset.fid;
  holdRender(key);
  setTimeout(() => { delete HOLDS[key]; if (HOLDACT[act]) HOLDACT[act](WORLDS[wid], arg, { fid }); holdRender(key); const w = WORLDS[wid]; if (w) touch(w); }, OUTCOME_MS);   // 300 ms confirmation state, then the command is issued
}
document.addEventListener('pointerdown', e => { const b = e.target.closest('[data-hold]'); if (b && !b.disabled && e.button === 0) { e.preventDefault(); holdStart(b); } });
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => { Object.keys(HOLDS).forEach(k => holdCancel(k)); }));
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { const b = e.target.closest && e.target.closest('[data-hold]'); if (b) { e.preventDefault(); holdStart(b); } } });
document.addEventListener('keyup', e => { if (e.key === 'Enter' || e.key === ' ') { const b = e.target.closest && e.target.closest('[data-hold]'); if (b) holdCancel(b.dataset.holdKey); } });
ACT.holdTap = (el) => { const key = el.dataset.holdKey; const st = { phase: 'confirm' }; HOLDS[key] = st; holdRender(key); setTimeout(() => { if (HOLDS[key] === st) { delete HOLDS[key]; holdRender(key); } }, CONFIRM_MS); };
ACT.holdConfirm = (el) => { const key = el.dataset.holdKey; const d = { phase: 'done' }; HOLDS[key] = d; holdRender(key); const act = el.dataset.act2, arg = el.dataset.arg, wid = el.dataset.wid, fid = el.dataset.fid; setTimeout(() => { delete HOLDS[key]; if (HOLDACT[act]) HOLDACT[act](WORLDS[wid], arg, { fid }); holdRender(key); const w = WORLDS[wid]; if (w) touch(w); }, OUTCOME_MS); };
const holdActive = fid => Object.entries(HOLDS).some(([k, s]) => s.phase === 'holding' && (holdEl(k) || {}).dataset && holdEl(k).dataset.fid === fid);

/* ---- global click delegation ---- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const f = el.closest('[data-fid]'); const fid = f ? f.dataset.fid : null; const fr = fid ? FRAMES[fid] : null;
  const w = fr ? WORLDS[fr.wid] : (el.dataset.wid ? WORLDS[el.dataset.wid] : null);
  const fn = ACT[el.dataset.act]; if (fn) fn(el, { fid, fr, w, ev: e });
});
ACT.ack = (el, c) => { if (c.w) ackAlert(c.w, el.dataset.id); };
ACT.alertList = (el, c) => { if (c.w) { c.w.listOpen = !c.w.listOpen; touch(c.w); } };
