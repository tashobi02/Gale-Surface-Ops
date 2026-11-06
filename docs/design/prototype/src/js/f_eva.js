'use strict';
/* ===== SCR-12 EVA tablet, SCR-13 HUD, SCR-14 options sheet =====
   Portrait follows 04 §E.5. Landscape is a PROPOSED deviation (G-01), v2 after team feedback: HAVEN and O₂ compact cards top-left, NEXT below them,
   the map on the whole right column, then the strip (24) and ONE action row (72). Budget @844×390: 64 + 230 + 24 + 72 = 390 (no scrolling). */
const EVA_SIZES = { l: { safety: 100, act: 72 }, p: { safety: 132, act: 136 } };
/* Landscape v2 (team feedback 2026-11-05): HAVEN and O₂ are two compact cards top-left, NEXT below them, the map takes the whole right column.
   Budget @844×390: alert 64 + body 230 (cards 100 + gap 8 + NEXT 110 + 12 padding) + strip 24 + actions 72 = 390. Portrait is unchanged (04 §E.5). */
function evaGeom(W, H, orient) {
  const land = orient !== 'portrait', g = EVA_SIZES[land ? 'l' : 'p'];
  if (land) { const body = H - 64 - 24 - g.act, inner = W - 24, leftW = 0.46 * (inner - 8); return { body, safety: g.safety, act: g.act, leftW, mapW: inner - 8 - leftW, mapH: body - 12, nav: body }; }
  const nav = H - 64 - g.safety - 24 - g.act; return { nav, safety: g.safety, act: g.act };
}
function linkBars(on, n = 3) { return `<span class="linkbars" aria-label="Link ${on ? n : 0} of 3 bars">${[1, 2, 3].map(i => `<i class="${on && i <= n ? '' : 'off'}"></i>`).join('')}</span>`; }
/* ---- FR-50 stop tasks on the EVA tablet ---- */
function boxGlyph(state) {
  const sq = '<rect x="4" y="4" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4"/>';
  if (state === 'TODO') return `<svg viewBox="0 0 30 30" width="30" height="30" aria-hidden="true">${sq}</svg>`;
  if (state === 'DONE') return `<svg viewBox="0 0 30 30" width="30" height="30" aria-hidden="true"><rect x="4" y="4" width="22" height="22" fill="currentColor"/><path d="M9 15.5 13.5 20 21.5 10" fill="none" stroke="var(--bg)" stroke-width="3" stroke-linecap="square"/></svg>`;
  return `<svg viewBox="0 0 30 30" width="30" height="30" aria-hidden="true"><circle cx="15" cy="15" r="11" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M7 23 23 7" stroke="currentColor" stroke-width="2.4"/></svg>`;
}
function taskRow(w, id, t, ro) {
  const todo = t.state === 'TODO', can = todo && !ro;
  const meta = `${t.kind.toUpperCase()} · ${TWORD[t.state]}${t.state === 'SKIPPED' && t.reason ? ' (' + t.reason.toUpperCase() + ')' : ''} ${chip('simulated', 'g', 'FR-50 task state')}${t.origin === 'ops' ? ' <span class="tag">ADDED BY OPS</span>' : ''}${t.unsynced ? ' <span class="tag">NOT SYNCED</span>' : ''}`;
  return `<li class="trow ${t.state.toLowerCase()}" data-task="${t.task_id}" data-state="${t.state}" data-origin="${t.origin}">
    <button class="tbox" data-act="taskTick" data-crew="${id}" data-task="${t.task_id}" ${can ? '' : 'disabled'} aria-label="${can ? 'Mark done: ' : TWORD[t.state] + ': '}${esc(t.text)}">${boxGlyph(t.state)}</button>
    <span class="tcol"><span class="ttxt">${esc(t.text)} ${chip('assumed', 'g', 'team-authored task text, ' + (t.provenance && t.provenance.source_id))}</span><span class="tmeta">${meta}</span></span>
    ${can ? `<span class="cutw"><button class="btn tskip" data-act="taskSkip" data-crew="${id}" data-task="${t.task_id}">SKIP</button></span>` : '<span></span>'}</li>`;
}
function undoStrip(w, id) {
  const u = w.undo; if (!u || u.crew !== id) return ''; const t = tFind(w, id, u.id); if (!t) return '';
  return `<div class="tundo" role="status" data-slot="undo"><span class="uw">Marked ${TWORD[t.state].toLowerCase()}</span>${t.state === 'SKIPPED' ? `<span class="cutw"><button class="btn tskip" data-act="taskReason" style="width:auto;padding:0 10px">REASON: ${esc((t.reason || 'other').toUpperCase())}</button></span>` : ''}<span class="ubar ${u.pinned ? 'pin' : ''}" aria-hidden="true"><i></i></span><span class="cutw"><button class="btn tskip" data-act="taskUndo">${ico('undo')}UNDO</button></span></div>`;
}
function evaTasks(w, id, o) {
  const s = curStopOf(w, id), L = tList(w, id, s), st = w.evs[id].act, ro = st === 'toHaven' || st === 'sheltered' || st === 'ended';
  const back = o.back ? `<span class="cutw"><button class="btn tbtn" data-act="taskView" data-arg="next" data-crew="${id}" aria-pressed="true">${ico('right')}<span>${o.back}</span></button></span>` : '';
  return `<section class="tasks cut cut-s" data-slot="tasks" aria-label="Stop ${tStopNo(s)} tasks" data-ann="id:FR-50|px:rows ≥ 56 high · neutral chrome only|note:Neutral □ to do, ■ done, ⊘ skipped/dropped + the word. No status colour: task progress is not a safety status. One tap + 5 s undo; no hold-to-confirm">
    <header class="thead"><span class="lbl">STOP ${tStopNo(s)} · TASKS</span><b class="num tcnt">${tCount(w, id, s, { size: 18 })}</b>${chip('simulated', 'g', 'FR-50')}<span class="sp"></span>${ro ? '<span class="tag">READ ONLY</span>' : ''}${back}</header>
    <ul class="tlist" role="list">${L.slice().sort((a, b) => (b.origin === 'ops') - (a.origin === 'ops')).map(t => taskRow(w, id, t, ro)).join('')}</ul><span class="tmore" aria-hidden="true">▾ more below</span>${undoStrip(w, id)}</section>`;
}
function tasksBtn(w, id, st, locked, tasksOn, back) {
  if (!['atStop', 'walking', 'noLink', 'toHaven'].includes(st)) return '';
  const s = curStopOf(w, id), cnt = tCount(w, id, s, { size: 20 }), g = chip('simulated', 'g', 'FR-50');
  if (locked) return `<span class="tpill cut cut-s" data-slot="taskcount" aria-label="Tasks collapse to their count during an alert">${ico('list')}<span>TASKS</span><b class="num">${cnt}</b>${g}</span>`;
  if (tasksOn) return `<span class="cutw"><button class="btn tbtn on" data-act="taskView" data-arg="next" data-crew="${id}" aria-pressed="true" data-slot="taskbtn">${ico(back === 'MAP' ? 'pin' : 'right')}<span>${back}</span></button></span>`;
  return `<span class="cutw"><button class="btn tbtn" data-act="taskView" data-arg="tasks" data-crew="${id}" aria-pressed="false" data-slot="taskbtn" data-ann="id:FR-50|px:≥ 56 high|note:Labelled button (icon + word + count), never a bare icon or hamburger (04 §A.3 #9). Phone landscape: swaps the map column for the list">${ico('list')}<span>TASKS</span><b class="num">${cnt}</b>${g}</button></span>`;
}
function evaNext(w, id, v, orient, big, tkBtn) {
  const ev = w.evs[id], st = ev.act, stale = !ev.linked ? ev.stale : false;
  if (st === 'waiting') return `<div class="next cut cut-s fill-raised"><span class="lbl">NEXT</span><span class="nm">Stop 1 · EZ—ENG 01</span><span class="t2" style="font-size:16px">Waiting for EVA start — ops starts the clock</span></div>`;
  if (st === 'sheltered') return `<div class="next cut cut-s"><span class="lbl">STATUS</span>${status('nominal', { slot: 'next', word: 'SHELTERED' })}<span class="nm">Sheltered — PR1</span><span class="t2" style="font-size:16px">Stay inside until ops clears you</span></div>`;
  if (st === 'ended') return `<div class="next cut cut-s"><span class="lbl">STATUS</span><span class="nm">EVA ended</span><span class="t2" style="font-size:16px">Report is available on ops</span></div>`;
  const n = v.next || {}; let head;
  if (n.rdv) head = `<span class="lbl">NEXT</span><span class="nm">Rendezvous · PR1 ${glyph('pr')}</span>`;
  else { const sn = STOPN[n.n]; head = `<span class="lbl">${st === 'atStop' ? 'AT STOP 2 · DWELL ' : 'NEXT'}${st === 'atStop' ? N('dwell_ph', { chip: false, unit: false }) : ''}${stale ? ' <span class="tag">STALE ' + N('stale1', { chip: false, unit: false, size: 12 }) + '</span>' : ''}</span><span class="nm">Stop ${n.n} · ${sn.name ? esc(sn.name) : PH('EZ—ENG 01 name TBD', 'TASK-04')}</span>`; }
  const eta = n.rdv ? 'eta_summon' : v.eta;
  const o = { size: big ? 48 : 32, chip: 'g', grey: !ev.linked };
  return `<div class="next cut cut-s ${!ev.linked ? 'dashedbox' : ''}" data-ann="id:FR-32|token:text-1 · Plex Mono 32/16|px:padding 6/10|note:Next stop: bearing, distance, ETA ≥ 32 px mono. Header row holds the TASKS button (FR-50).">${tkBtn ? `<div class="nhead"><div class="ncol">${head}</div>${tkBtn}</div>` : head}
    <div class="nrow"><span class="v">${n.rdv ? '<span class="t3 num" title="no bearing for rendezvous in the spec">—</span>' : '↗ ' + N(v.bearing, Object.assign({}, o, { unitText: '°' }))}</span><span class="v">${n.rdv ? '' : N(v.dist, o)}</span><span class="v">${N(eta, o)}</span></div></div>`;
}
/* ---- the map: mini (tap or button = full) and full (landscape: HAVEN and O₂ stack smaller at the left, the map fills the rest, ≥ 80 % of the width; portrait: cards stay in their row; buttons first, drag/wheel/pinch extra) ---- */
const LAYER_BTNS = [['slope', 'SLOPE', 'Slope'], ['ti', 'THERMAL', 'Thermal inertia'], ['comm', 'COMM', 'Comm shadow'], ['haven', 'HAVEN', 'Haven bands']];
function mapLegend(mv) {
  const L = FX.site.layers, on = k => mv.layers[k], out = [];
  if (on('slope')) out.push('Slope ' + L.find(l => l.layer_id === 'slope').legend.classes.slice(1).map(c => `${c[0]}–${c[1]}° ${c[2]}`).join(' · '));
  if (on('ti')) out.push('Thermal inertia: low = possible loose fines (assumed)');
  if (on('comm')) out.push('NO SIGNAL — line of sight only');
  if (on('haven')) out.push('Haven bands; hatch = beyond the haven rule');
  return out.length ? `<div class="mlegend">${out.map(esc).join(' · ')} ${chip('derived', 'g', 'layer legends, 05 §F.1')}</div>` : '';
}
function mapControls(w, id, mv) {
  const b = (label, act, o = {}) => `<span class="cutw"><button class="btn xl mbtn ${o.on ? 'on' : ''}" data-act="${act}" data-crew="${id}" data-k="eva" ${o.arg ? `data-arg="${o.arg}"` : ''} ${o.on !== undefined ? `aria-pressed="${!!o.on}"` : ''} ${o.label ? `aria-label="${o.label}"` : ''}>${label}</button></span>`;
  const following = !mv.fit && !mv.pan[0] && !mv.pan[1];
  const sheet = mv.layersOpen ? `<div class="layersheet cut cut-s" role="dialog" aria-label="Map layers"><div class="lrow">${LAYER_BTNS.map(([k, l, full]) => `<span class="cutw"><button class="btn xl mbtn ${mv.layers[k] ? 'on' : ''}" data-act="mapLayer" data-arg="${k}" data-crew="${id}" aria-pressed="${!!mv.layers[k]}" aria-label="${full}">${l}</button></span>`).join('')}</div>${mapLegend(mv)}${mv.toast ? `<div class="errtxt" style="font-size:14px">${sicon('advisory')}<span>${esc(mv.toast)}</span></div>` : ''}</div>` : '';
  return `${sheet}<div class="mapctl" role="group" aria-label="Map controls" data-slot="mapctl">${b('+', 'mapZoom', { arg: 'in', label: 'Zoom in' })}${b('−', 'mapZoom', { arg: 'out', label: 'Zoom out' })}${b(ico('fit') + 'FIT', 'mapFit')}${b(ico('pin') + 'FOLLOW', 'mapFollow', { on: following })}${b(ico('layers') + 'LAYERS', 'mapLayers', { on: !!mv.layersOpen })}${b(ico('x') + 'CLOSE', 'mapClose')}</div>`;
}
function evaMini(w, id, ctx, W, H, full) {
  const ev = w.evs[id], st = ev.act, mv = mvOf(w, id), me = mkXY(w, id) || { x: SCH.hab[0], y: SCH.hab[1], hdg: 0 }, buddy = mkXY(w, id === 'EV1' ? 'EV2' : 'EV1'), pr = mkXY(w, 'PR1');
  const wide = st === 'toHaven' || st === 'sheltered', base = full ? 520 : (wide ? 430 : st === 'waiting' ? 420 : 300);
  const vw = (mv.fit ? 600 : base) / mv.zoom, vh = vw * H / W, c0 = mv.fit ? [440, 700] : (wide ? [520, 690] : [me.x, me.y]), cx = c0[0] + mv.pan[0], cy = c0[1] + mv.pan[1];
  const crew = [{ id, x: me.x, y: me.y, hdg: me.hdg, stale: !ev.linked ? ev.stale : null }, buddy ? { id: id === 'EV1' ? 'EV2' : 'EV1', x: buddy.x, y: buddy.y, hdg: buddy.hdg } : null].filter(Boolean);
  const L = { comm: mv.layers.comm, slope: mv.layers.slope, ti: mv.layers.ti, haven: mv.layers.haven, hill: true };
  const svg = mapSVG({ w: W, h: H, vb: [cx - vw / 2, cy - vh / 2, vw, vh], L, route: 'ok', loop: false, stops: STOPS.map(s => ({ n: s.n, x: s.p[0], y: s.p[1] })), crew, veh: [{ id: 'PR1', x: pr ? pr.x : SCH.hab[0], y: pr ? pr.y : SCH.hab[1], state: w.veh.PR1 }], rdv: w.rdv, pr1Path: w.veh.PR1 === 'enRoute' || w.veh.PR1 === 'arrived', hab: true });
  if (!full) return `<div class="mini mapbox" role="button" tabindex="0" aria-label="Expand the map to full screen" data-act="mapFull" data-crew="${id}" style="width:100%;height:100%;cursor:zoom-in" data-ann="id:FR-32|note:Mini-map: route, me, buddy, shadow ahead, PR1 (schematic). Tap the map or the FULL button to expand it.">${svg}<span class="maptag">SCHEMATIC — not real terrain</span><span class="cutw mapexp"><button class="btn mbtn" data-act="mapFull" data-crew="${id}" aria-label="Full-screen map">${ico('fit')}<span>FULL</span></button></span></div>`;
  return `<div class="mini mapbox mfull" data-panhost="eva" data-crew="${id}" style="width:100%;height:100%" data-ann="id:G-42|note:Full-screen map: landscape = HAVEN and O₂ stacked at the left (smaller values, below the 56 px rule: DV-13), the map takes at least 80 % of the width; the alert slot, strip and action row are untouched. Buttons are the primary path (04 §A.3 #9); drag, wheel and pinch are extras.">${svg}
    <div class="scalebar" style="left:auto;right:8px;top:8px;bottom:auto"><i style="width:${Math.round(40 * W / vw)}px"></i>${N('scale_bar', { chip: 'g', size: 11 })}</div><span class="maptag" style="right:auto;left:8px;bottom:auto;top:8px">SCHEMATIC — not real terrain</span>${mapControls(w, id, mv)}</div>`;
}
function evaOptions(w, id, ctx, W, H) {
  const o = w.opt, st = o.state, alertTxt = FX.alerts.RADIATION_ALERT.text, land = ctx.orient !== 'portrait';
  const op = FX.options.filter(x => !(o.noRdv && x.kind === 'VEHICLE_RENDEZVOUS'));
  let body = '', foot = '';
  const head = `<div class="row" style="gap:10px">${status('warning', { slot: 'sheet' })}<b style="font-size:18px">${esc(alertTxt)}</b></div>`;
  const echo = '';   // landscape v2: both cards stay visible beside the panel, so no O₂ echo is needed (G-22 superseded)
  if (st === 'computing') body = `<div class="col" style="gap:10px"><span class="t2" style="font-size:16px">Computing options…</span>${[1, 2, 3].map(() => '<div class="skel" style="height:44px"></div>').join('')}</div>`;
  else if (st === 'executing') {
    body = `<div class="cut cut-s fill-raised" style="padding:10px 12px"><span class="lbl">EXECUTING · OPTION ${o.sel}</span><div style="font:600 18px var(--f-ui);margin:4px 0">${o.sel === 1 ? 'PR1 dispatched — ETA 14 min' : 'Abort to hab — walking now'}</div>
      <div class="row t2" style="font-size:15px;gap:14px">${glyph('pr')}<span>PR1 ETA ${N('eta_summon', { size: 20, chip: 'g' })}</span><span>Crew ETA ${N('rdv_eta_ph', { size: 20, chip: 'g' })}</span></div></div>`;
    foot = btn('Close sheet', { act: 'sheet', size: 'xl', icon: 'x' });
  } else {
    body = op.map(x => { const sel = o.sel === x.rank || (o.noRdv && x.rank === 2 && o.sel === 2); return `<button class="opt cut cut-s ${sel ? 'sel' : ''} ${st === 'superseded' ? 'dis' : ''}" data-act="setOpt" data-arg="${x.rank}" aria-pressed="${sel}" ${st === 'superseded' ? 'disabled' : ''}>
      <span class="rk">${x.rank}</span><span><span class="okind">${esc(x.label)}</span><span class="odet"><span>dose ${N(x.dose, { chip: 'g', size: 12 })}</span><span>drops ${N(x.drops, { chip: 'g', size: 12, unit: false })}</span>${x.approval ? '<span class="tag">NEEDS OPS APPROVAL</span>' : ''}</span></span><span class="oeta">${N(x.eta, { chip: 'g', size: 28 })}</span></button>`; }).join('');
    if (o.noRdv) body = `<div class="errtxt" style="font-size:15px">${sicon('caution')}<span>${esc(FX.reject.NO_RENDEZVOUS)}</span></div>` + body;
    if (st === 'superseded') body += `<div class="errtxt" style="font-size:15px">${sicon('caution')}<span>Superseded — a newer alert is recomputing options</span></div>`;
    if (o.approval === 'late') body += `<div class="row t2" style="font-size:15px">${sicon('caution')}<span>Ops hasn't approved — abort to hab is always available</span></div>`; else if (o.approval === 'pending' || o.sel === 3) body += `<div class="row t2" style="font-size:15px">${sicon('advisory')}<span>Ops is reviewing — abort to hab is always available</span></div>`;
    const sel = o.sel, nm = sel === 1 ? 'Go — option 1' : sel === 2 ? 'Go — option 2' : 'Go — option 3';
    foot = holdBtn({ key: `${ctx.fid}-go`, wid: ctx.wid, fid: ctx.fid, label: nm, icon: 'right', kind: sel === 2 ? 'crit-w' : 'crit-c', act: sel === 2 ? 'abort' : 'summon', arg: String(sel), outcome: sel === 1 ? 'PR1 dispatched — ETA 14 min' : sel === 2 ? 'Abort to hab — walking now' : 'Queued — waiting for ops', disabled: st === 'superseded' || (sel === 3 && (o.approval === 'pending' || o.approval === 'late')), reason: sel === 3 ? 'Waiting for ops approval' : 'Options superseded' });
  }
  const cls = land ? 'sheetL' : 'sheetP', gl = evaGeom(W, H, ctx.orient), px = land ? Math.round(12 + gl.leftW + 8) : 0;
  return `<aside class="${cls} cut-none" ${land ? `style="left:${px}px;width:auto;right:0"` : ''} role="dialog" aria-label="Alert options" data-ann="id:SCR-14|px:${land ? 'right panel over the map column, ' + Math.round(100 * (W - px) / W) + '% of the width (Proposed, G-01)' : '70% height bottom sheet (04 §E.7)'}|note:Opens automatically on a warning; top option pre-selected; one hold-to-confirm at the bottom"><div class="sheet-b">${head}${echo}${body}</div><div class="sheet-f">${foot}</div></aside>`;
}
function evaStatus(w, st) {   // shown only while there is no active alert
  const ph = (w.phase >= 0 && typeof PHASES !== 'undefined') ? PHASES[w.phase] : '';
  if (st === 'waiting') return { level: 'advisory', word: 'STANDBY', detail: 'Waiting for EVA start', phase: '' };
  if (st === 'ended') return { level: 'advisory', word: 'EVA ENDED', detail: 'Report is on ops', phase: '' };
  return { level: 'nominal', word: 'NOMINAL', detail: 'No active alerts', phase: ph };
}
function renderEva(w, ctx) {
  const id = ctx.ev || 'EV1', ev = w.evs[id], v = evv(w, id), orient = ctx.orient === 'portrait' ? 'p' : 'l', W = ctx.W, H = ctx.H, tab = W >= 768 && H >= 768 ? ' t' : '';
  const g = evaGeom(W, H, ctx.orient), unl = !ev.linked, stale = unl ? ev.stale : false, st = ev.act;
  const dis = !v;                         // before EVA start: disabled metrics show "—" (04 §D.1) — never an invented number
  const showSheet = w.sheet && (w.opt.state !== 'none') && (st === 'atStop' || st === 'walking' || st === 'toHaven' || st === 'noLink');
  const topA = topAlert(w).top, locked = showSheet || !!(topA && topA.level === 'warning' && !topA.acked);     // during an alert the list collapses to its count (FR-50)
  const tkAvail = ['atStop', 'walking', 'noLink', 'toHaven'].includes(st), mv = mvOf(w, id), phoneL = orient === 'l' && !tab;
  const tv = (w.tv && w.tv[id]) || ((st === 'atStop' || st === 'noLink') ? 'tasks' : 'next'), tasksOn = tkAvail && !locked && tv === 'tasks', full = mv.full && !locked;
  const miniW = orient === 'l' ? Math.floor(g.mapW) : W - 24, miniH = orient === 'l' ? g.mapH : g.nav - 96 - 8 - 12;
  const fullL = orient === 'l' && full, leftWf = Math.round(0.155 * W), fullMapW = W - 32 - leftWf;   // landscape full map: HAVEN and O₂ stack at the left (smaller), the map is the rest — at least 80 % of the width
  const bigVal = (key, o) => dis ? '<span class="num t3" data-provenance="derived" title="needs EVA start — no value yet">—</span>' : N(key, Object.assign({ size: fullL ? (tab ? 48 : 40) : (orient === 'p' ? 56 : (tab ? 64 : 56)), chip: 'g', stale }, o));
  const sheltered = st === 'sheltered';
  const havenBlk = `<div class="big cut cut-s ${unl ? 'dashedbox' : ''}" data-slot="haven" data-ann="id:A.3 #4|px:56–64 mono, top-left, fixed|token:text-1|note:Time to haven is ALWAYS top-left (04 §A.3 #4)"><span class="lbl">HAVEN</span>
    <span class="bigv">${sheltered ? status('nominal', { slot: 'haven', word: 'SHELTERED' }) : bigVal(v && v.haven, { unitText: 'min' })}</span>
    <span class="bigsub">${dis ? 'Waiting for EVA start' : sheltered ? 'in PR1' : v.via ? `via ${v.via} ${chip('modelled', 'g')}` : `via ## ${chip('modelled', 'g')}`}${unl ? `<span class="tag">STALE ${N('stale1', { chip: false, unit: false, size: 14 })}</span>` : ''}</span></div>`;
  const o2Blk = `<div class="big cut cut-s ${unl ? 'dashedbox' : ''}" data-slot="o2" data-ann="id:FR-35|px:56–64 mono|note:O₂ margin: immediately right of HAVEN on the same row, in both orientations"><span class="lbl">O₂</span><span class="bigv">${bigVal(v && v.o2, { unitText: '%' })}</span>
    <span class="bigsub">${dis ? '&nbsp;' : `${N(v.o2left, { size: 16, chip: 'g', stale }) } left`}</span></div>`;
  const tkBtn = tasksBtn(w, id, st, locked, tasksOn, phoneL ? 'MAP' : 'NEXT');
  const nextCard = evaNext(w, id, v || {}, orient, !!tab && orient === 'l', tkBtn);
  const tasksPanel = tasksOn ? evaTasks(w, id, { back: phoneL ? '' : 'NEXT' }) : '';
  const navContent = (tasksOn && !phoneL) ? tasksPanel : nextCard;                                  // tablet and portrait: the list takes the NEXT position (04 §E.5 addition)
  const mini = evaMini(w, id, ctx, miniW, Math.max(60, miniH), false);
  const sideContent = (tasksOn && phoneL) ? tasksPanel : mini;                                      // phone landscape: the list takes the map column; the NEXT card stays
  const fullMap = full ? evaMini(w, id, ctx, fullL ? fullMapW : W - 24, orient === 'l' ? g.mapH : g.nav - 12, true) : '';
  const strip = dis ? `<span>EVA —</span><span>DOSE —</span><span>${linkBars(true)} LINK</span>` : `<span>EVA ${N(v.eva, { chip: 'g', size: 16, grey: unl })}</span><span>DOSE ${N(v.dose, { chip: 'g', size: 16, grey: unl })}</span><span>${unl ? (ev.queue.length ? '<span class="pill">NOT SYNCED</span>' : '<span class="pill">NO LINK ' + N('stale1', { chip: false, unit: false, size: 16 }) + '</span>') + ' ' + linkBars(false) : 'LINK ' + linkBars(true)}</span>`;
  const idle = st === 'waiting' || st === 'ended' || st === 'sheltered', why = st === 'waiting' ? 'Not on EVA yet' : st === 'ended' ? 'EVA ended' : 'Already sheltered';
  const linkedOutcome = unl ? 'Queued — sends when link returns' : 'PR1 dispatched — ETA 14 min';
  const acts = holdBtn({ key: `${ctx.fid}-summon`, wid: ctx.wid, fid: ctx.fid, label: 'Summon rover', icon: 'pr', kind: 'crit-c', act: 'summon', arg: '1', outcome: linkedOutcome, disabled: idle, reason: why, ann: 'id:D.3|token:caution-fill|px:≥56 high, hold 800 ms|note:Hold-to-confirm; progress runs along the chamfer; release early cancels; 300 ms outcome' }) +
    holdBtn({ key: `${ctx.fid}-abort`, wid: ctx.wid, fid: ctx.fid, label: 'Abort to hab', icon: 'hab', kind: 'crit-w', act: 'abort', outcome: unl ? 'Queued — sends when link returns' : 'Abort to hab — walking now', disabled: idle, reason: why, ann: 'id:D.3|token:warning-fill' }) +
    `<span class="cutw">${`<button class="btn xl" data-act="rover" ${idle ? 'disabled aria-disabled="true"' : ''}>${ico('ur')}<span>Task rover ${t2tag().replace('T2 SCOPE', 'T2')}</span></button>`}</span>` +
    `<span class="cutw"><button class="btn xl" data-act="openHud">${ico('hud')}HUD</button></span>`;
  const toastH = w.toast ? `<div class="toast cut cut-s" role="status" style="top:70px">${sicon('advisory')}<span>${esc(w.toast)}</span><button class="btn sm" data-act="toastX">OK</button></div>` : '';
  const body = orient === 'l'
    ? (full ? `<div class="body full"><div class="leftcol" style="width:${leftWf}px"><div class="safety">${havenBlk}${o2Blk}</div></div><div class="mapcol" style="left:${12 + leftWf + 8}px">${fullMap}</div></div>` : `<div class="body"><div class="leftcol"><div class="safety">${havenBlk}${o2Blk}</div>${navContent}</div><div class="mapcol">${sideContent}</div></div>`)
    : (full ? `<div class="safety">${havenBlk}${o2Blk}</div><div class="nav full">${fullMap}</div>` : `<div class="safety">${havenBlk}${o2Blk}</div>\n    <div class="nav">${navContent}${sideContent}</div>`);
  return `<div class="eva ${orient}${tab}" data-orient="${ctx.orient}" data-ann="id:SCR-12|token:void · panel|note:Dark cockpit: nominal is quiet. ${ctx.orient === 'portrait' ? '04 §E.5' : 'Landscape v2: Proposed (G-01); cards top-left, map = whole right column, body ' + g.nav + ' px'}">
    ${alertSlot(w, { dev: 'eva', compact: orient === 'p', idle: evaStatus(w, st) })}
    ${body}
    <div class="strip" data-slot="strip" data-ann="id:04 §C.3|px:24 high|note:Metadata strip sits directly above the action row in both orientations">${strip}</div>
    <div class="acts" data-slot="actions" data-ann="id:A.3 #4|px:56+ targets, 8 gaps|note:Primary actions are always bottom. ONE row in landscape (4 × ≥56 px, 8 px gaps)">${acts}</div>
    ${showSheet ? evaOptions(w, id, ctx, W, H) : ''}${toastH}</div>`;
}
ACT.sheet = (el, c) => { if (c.w) { c.w.sheet = !c.w.sheet; touch(c.w); } };
ACT.openHud = (el, c) => { if (c.fr) c.fr.switchTo('SCR-13'); };
ACT.rover = (el, c) => { if (c.fr) c.fr.switchTo('SCR-15'); };
ACT.orient = (el, c) => { const f = FRAMES[el.dataset.fid]; if (f) f.setOrient(el.dataset.arg); };
ACT.hc = (el, c) => { const f = FRAMES[el.dataset.fid]; if (f) { const w = WORLDS[f.wid]; w.hc = !w.hc; touch(w); } };
ACT.tapc = (el, c) => { const f = FRAMES[el.dataset.fid]; if (f) { const w = WORLDS[f.wid]; w.tapConfirm = !w.tapConfirm; touch(w); } };

/* ---- SCR-13 HUD ---- */
function renderHud(w, ctx) {
  const id = ctx.ev || 'EV1', ev = w.evs[id], unl = !ev.linked, v = evv(w, id) || evv({ vals: 'nominal' }, id) || EVT[id].nominal, stale = unl ? ev.stale : false;
  const { top } = topAlert(w); const o = { chip: 'g', stale };
  const age = performance.now() - (top ? top.shownAt : 0), anim = top && !RM() && top.level === 'warning' && age < 1000 ? 'flash' : top && !RM() && top.level === 'caution' && age < 600 ? 'pulse' : '';
  const line = top ? `<div class="halert ${anim}" data-level="${top.level}" data-status="${top.level}" data-slot="alert" role="${top.level === 'warning' ? 'alert' : 'status'}" aria-live="${top.level === 'warning' ? 'assertive' : 'polite'}" ${anim ? `style="animation-delay:-${(age / 1000).toFixed(2)}s"` : ''}>${sicon(top.level)}<span>${esc(top.text)}</span></div>` : '';
  const sheltered = ev.act === 'sheltered';
  return `<div class="hud ${unl ? 'unl' : ''}" data-hudexit="1" data-ann="id:SCR-13|px:values 56–72, black, read-only|note:No actions. Exit: tap-and-hold anywhere for 2 s. At most five values; corners empty (visor edge)">
    <div class="hline" data-slot="alert">${line}</div>
    <div class="hgrid">
      <div class="hc ${unl ? 'dash' : ''}" data-slot="haven"><span class="hl">HAVEN</span><span class="hv ${unl ? 'stale' : ''}">${sheltered ? status('nominal', { slot: 'haven', word: 'SHELTERED' }) : N(v.haven, Object.assign({ size: 72, unitText: 'MIN' }, o))}</span><span class="hs">${sheltered ? 'in PR1' : v.via ? `via ${v.via} ${chip('modelled', 'g')}` : `via ## ${chip('modelled', 'g')}`}</span></div>
      <div class="hc ${unl ? 'dash' : ''}"><span class="hl">NEXT</span><span class="hv m">↗ ${N(v.bearing, Object.assign({ size: 56, unitText: '°' }, o))}</span><span class="hv m">${N(v.dist, Object.assign({ size: 56, unitText: 'KM' }, o))}</span><span class="hs">STOP ${v.next && v.next.n ? v.next.n : '#'}</span></div>
      <div class="hc ${unl ? 'dash' : ''}" data-slot="o2"><span class="hl">O₂</span><span class="hv">${N(v.o2, Object.assign({ size: 72, unitText: '%' }, o))}</span><span class="hs">${N(v.o2left, Object.assign({ size: 20 }, o))} LEFT</span></div>
    </div>
    <div class="hfoot">${unl ? `<span class="status" data-status="caution" data-slot="link">${sicon('caution')}<span class="sword">NO LINK</span></span><span>${N('stale1', { chip: 'g', unit: false, size: 18 })}</span>` : `<span>LINK ${linkBars(true)}</span>`}<span>${chip('simulated', 'g')} SIM</span></div>
    <div class="hx"></div></div>`;
}
/* HUD exit: tap-and-hold anywhere for 2 s (03 SCR-13) */
(function () { let st = null;
  document.addEventListener('pointerdown', e => { const h = e.target.closest('.hud[data-hudexit]'); if (!h) return; const fid = h.closest('[data-fid]').dataset.fid; const t0 = performance.now(); st = { fid, t0 }; const tick = () => { if (!st || st.t0 !== t0) return; const p = clamp((performance.now() - t0) / 2000, 0, 1); const bar = $('.hx', FRAMES[fid].el); if (bar) bar.style.width = (p * 100) + '%'; if (p >= 1) { st = null; FRAMES[fid].switchTo('SCR-12'); return; } st.raf = requestAnimationFrame(tick); }; st.raf = requestAnimationFrame(tick); });
  const end = () => { if (st) { cancelAnimationFrame(st.raf); const f = FRAMES[st.fid]; if (f) { const bar = $('.hx', f.el); if (bar) bar.style.width = '0'; } st = null; } };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
})();

const EVA_STATES = [['waiting', 'Waiting for EVA start'], ['walking', 'Walking'], ['atStop', 'At stop'], ['undo', 'Undo window'], ['opsTask', 'Ops-added task'], ['alerting', 'Alerting'], ['toHaven', 'To haven'], ['sheltered', 'Sheltered'], ['noLink', 'No hab link (not synced)'], ['ended', 'EVA ended']];
defScreen({ id: 'SCR-12', name: 'EVA tablet', route: '#/eva/EV1', mode: 'ops', tier: 'T1', frs: 'FR-32, 35, 39, 40, 44', states: EVA_STATES, sizes: ['evaPhoneL', 'evaTabL', 'evaPhoneP', 'evaTabP'], ev: true, orientToggle: true,
  preset: (w, s) => PRE[s](w), render: renderEva, modeOf: (w) => w.ui && w.ui.hud ? 'hud' : 'ops' });
const HUD_STATES = [['nominal', 'Nominal'], ['caution', 'Caution'], ['warning', 'Warning'], ['noLink', 'No link']];
defScreen({ id: 'SCR-13', name: 'HUD', route: '#/hud/EV1', mode: 'hud', tier: 'T1', frs: 'FR-33', states: HUD_STATES, sizes: ['hud'], ev: true, preset: (w, s) => { PRE[{ nominal: 'base', caution: 'caution', warning: 'warning', noLink: 'noLink' }[s]](w); }, render: renderHud });
defScreen({ id: 'SCR-14', name: 'Options sheet / panel', route: '(on alert)', mode: 'ops', tier: 'T1', frs: 'FR-40, 44', states: [['computing', 'Computing options'], ['ready', 'Ready'], ['executing', 'Executing'], ['superseded', 'Superseded'], ['approval', 'Ops approval pending'], ['noRdv', 'No rendezvous']],
  sizes: ['evaPhoneL', 'evaTabL', 'evaPhoneP', 'evaTabP'], ev: true, orientToggle: true, preset: (w, s) => PRE[s](w), render: renderEva });
