'use strict';
/* ===== FR-50 STOP TASKS + MAP VIEW CONTROLS (Proposed 2026-11-05) =====
   COUNT RULE: the prototype never adds or counts. Every task count shown is a number object from FX.tasks.n, reached through lookup tables
   generated at BUILD time (counts, done_total, total_all), keyed by the task-state strings. Task text is PROPOSED copy; task state is "simulated". */
const TSTOPS = ['s1', 's2', 's3'];
const TWORD = { TODO: 'TO DO', DONE: 'DONE', SKIPPED: 'SKIPPED', DROPPED: 'DROPPED' };
const curStopOf = (w, crew) => (w.evs[crew].act === 'waiting' ? 's1' : 's2');
const tStopNo = s => s.slice(1);

function tasksLoad(w, scen) {
  const T = FX.tasks, sc = T.scenarios[scen] || T.scenarios.start;
  w.tasks = { EV1: { s1: [], s2: [], s3: [] }, EV2: { s1: [], s2: [], s3: [] } };
  T.list.forEach(t => { const o = (sc[t.crew_id] || {})[t.task_id] || {}; w.tasks[t.crew_id][t.stop].push(Object.assign({}, t, o)); });
  if (scen === 'opsTask') T.ops_added.forEach(t => w.tasks[t.crew_id][t.stop].push(Object.assign({}, t)));
  w.undo = null; w.xlog = []; w.taskSeq = 0;
}
const tList = (w, crew, stop) => (w.tasks && w.tasks[crew] && w.tasks[crew][stop]) || [];
const tKeys = (w, crew, stop) => FX.tasks.counts[tList(w, crew, stop).map(t => t.state).join(',')] || ['0', '0', '0', '0', '0'];   // [done, skipped, dropped, todo, total] as n-keys
const tNum = k => FX.tasks.n[k];
const cN = (k, o = {}) => N(tNum(k), Object.assign({ unit: false, chip: false }, o));
function tCount(w, crew, stop, o) { const c = tKeys(w, crew, stop); return `${cN(c[0], o)}/${cN(c[4], o)}`; }
function tTotals(w, crew) {   // whole-plan done/total for one crew: lookups only
  const dk = FX.tasks.done_total[TSTOPS.map(s => tKeys(w, crew, s)[0]).join(',')], tk = FX.tasks.total_all[TSTOPS.map(s => tKeys(w, crew, s)[4]).join(',')];
  return { done: dk, total: tk };
}
function xlog(w, kind, actor, text) { (w.xlog = w.xlog || []).push({ seq: 'seq_task', t: 'ltst_task', kind, actor, text, prov: 'simulated', src: 'FR-50 (task event)' }); }

/* ---- presets: every screen state declares its task scenario ---- */
(function () {
  const wrap = (name, fn) => { const f = PRE[name]; PRE[name] = function (w) { const r = f.call(PRE, w); fn(w); return r; }; };
  wrap('base', w => { tasksLoad(w, 'atStop'); w.tv = {}; w.mapv = {}; });
  wrap('noSession', w => tasksLoad(w, 'start')); wrap('loaded', w => tasksLoad(w, 'start'));
  wrap('walking', w => tasksLoad(w, 'walking')); wrap('alerting', w => tasksLoad(w, 'alerting'));
  wrap('toHaven', w => { tasksLoad(w, 'dropped'); w.tv = { EV1: 'tasks', EV2: 'tasks' }; });
  wrap('noLink', w => { tasksLoad(w, 'noLink'); w.evs.EV1.queue = [{ kind: 'UPDATE_STOP_TASK', task_id: 't-s2-02', state: 'DONE' }]; });
  PRE.undo = w => { PRE.base(w); tasksLoad(w, 'undo'); w.undo = { crew: 'EV1', id: 't-s2-02', prev: { state: 'TODO', reason: null }, kind: 'DONE', pinned: true }; };
  PRE.opsTask = w => { PRE.base(w); tasksLoad(w, 'opsTask'); };
})();

/* ---- actions ---- */
function tFind(w, crew, id) { for (const s of TSTOPS) { const t = tList(w, crew, s).find(x => x.task_id === id); if (t) return t; } return null; }
function undoArm(w) {
  const u = w.undo; if (!u || u.pinned) return; clearTimeout(u.timer);
  u.timer = setTimeout(() => { if (w.undo === u) { w.undo = null; touch(w); } }, FX.tasks.undo_ms.v);
}
function taskChange(w, crew, id, state, reason) {
  const t = tFind(w, crew, id); if (!t || t.state !== 'TODO') return;
  w.undo = { crew, id, prev: { state: t.state, reason: t.reason, unsynced: t.unsynced }, kind: state, pinned: false };
  t.state = state; t.reason = state === 'SKIPPED' ? (reason || 'other') : null; t.updated_by = 'eva:' + crew;
  const ev = w.evs[crew];
  if (!ev.linked) { t.unsynced = true; ev.queue.push({ kind: 'UPDATE_STOP_TASK', task_id: id, state }); }   // no hab link: queued, marked "not synced"
  xlog(w, 'TASK_UPDATED', 'eva:' + crew, `${crew} marked a task ${TWORD[state].toLowerCase()}`);
  undoArm(w); touch(w);
}
ACT.taskTick = (el, c) => { if (c.w) taskChange(c.w, el.dataset.crew, el.dataset.task, 'DONE'); };
ACT.taskSkip = (el, c) => { if (c.w) taskChange(c.w, el.dataset.crew, el.dataset.task, 'SKIPPED', 'other'); };
ACT.taskUndo = (el, c) => {
  const w = c.w, u = w && w.undo; if (!u) return; const t = tFind(w, u.crew, u.id);
  if (t) { t.state = u.prev.state; t.reason = u.prev.reason; if (!u.prev.unsynced) { delete t.unsynced; w.evs[u.crew].queue = w.evs[u.crew].queue.filter(q => q.task_id !== u.id); } xlog(w, 'TASK_UPDATED', 'eva:' + u.crew, `${u.crew} reverted a task`); }
  clearTimeout(u.timer); w.undo = null; touch(w);
};
ACT.taskReason = (el, c) => {
  const w = c.w, u = w && w.undo; if (!u) return; const t = tFind(w, u.crew, u.id); if (!t) return; const R = FX.tasks.reasons;
  t.reason = R[(R.indexOf(t.reason) + 1) % R.length]; if (!u.pinned) undoArm(w); touch(w);   // one control cycles the reason: time → terrain → alert → other
};
ACT.taskView = (el, c) => { const w = c.w, id = el.dataset.crew; w.tv = w.tv || {}; w.tv[id] = el.dataset.arg; touch(w); };
const _relink = ACT.relink; ACT.relink = (el, c) => { const w = c.w; if (w) { TSTOPS.forEach(s => tList(w, 'EV1', s).forEach(t => delete t.unsynced)); } _relink(el, c); };

/* ---- ops: add task (ADD_STOP_TASK; ops only) ---- */
const addForm = w => (w.ui.add = w.ui.add || { open: false, crew: 'EV1', stop: 's2', kind: 'observe', text: '' });
ACT.addOpen = (el, c) => { const a = addForm(c.w); a.open = true; a.crew = el.dataset.crew || a.crew; touch(c.w); };
ACT.addClose = (el, c) => { addForm(c.w).open = false; touch(c.w); };
ACT.addSet = (el, c) => { const a = addForm(c.w); a[el.dataset.key] = el.dataset.arg; touch(c.w); };
ACT.addSubmit = (el, c) => {
  const w = c.w, a = addForm(w), L = tList(w, a.crew, a.stop), text = (a.text || '').trim();
  if (!text || text.length > 60 || L.length >= 4) return;
  const T = FX.tasks.list.find(t => t.stop === a.stop);
  w.taskSeq = (w.taskSeq || 0) + 1;
  L.push({ task_id: `t-${a.stop}-2${w.taskSeq}`, stop_id: T.stop_id, stop: a.stop, crew_id: a.crew, kind: a.kind, text, state: 'TODO', reason: null, origin: 'ops', updated_by: 'ops', provenance: { state: 'simulated', text: 'assumed', source_id: T.provenance.source_id }, text_src: 'typed in the prototype (PROPOSED copy)' });
  xlog(w, 'TASK_ADDED', 'ops', `Ops added a task for ${a.crew} at stop ${tStopNo(a.stop)}`); a.text = ''; a.open = false; touch(w);
};
document.addEventListener('input', e => { const i = e.target.closest && e.target.closest('[data-tinp]'); if (!i) return; const f = i.closest('[data-fid]'), fr = f && FRAMES[f.dataset.fid]; if (!fr) return; const w = WORLDS[fr.wid]; addForm(w).text = i.value.slice(0, 60); const b = f.querySelector('[data-act="addSubmit"]'); if (b) { const a = addForm(w), off = !a.text.trim() || tList(w, a.crew, a.stop).length >= 4; b.disabled = off; if (off) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled'); } });

/* ---- map view controls: shared by the EVA map, ops map and planner (04 §A.3 #9: buttons are the primary path; drag, wheel and pinch are extras) ---- */
const mapvInit = () => ({ full: false, zoom: 1, pan: [0, 0], fit: false, layersOpen: false, layers: { comm: true, slope: false, ti: false, haven: false }, order: ['comm'] });
const mvOf = (w, id) => ((w.mapv = w.mapv || {})[id] || (w.mapv[id] = mapvInit()));
function mvState(w, host) {
  const k = host.dataset.panhost;
  if (k === 'eva') return mvOf(w, host.dataset.crew);
  if (k === 'planner') return w.pl;
  if (k === 'ops') return (w.ui.mv = w.ui.mv || { pan: [0, 0], zoom: 1 });
  return null;
}
const mvTarget = (w, el) => { const k = el.dataset.k; return k === 'eva' ? mvOf(w, el.dataset.crew) : k === 'planner' ? w.pl : (w.ui.mv = w.ui.mv || { pan: [0, 0], zoom: 1 }); };
const ZMIN = 0.6, ZMAX = 6;
ACT.mapZoom = (el, c) => { const s = mvTarget(c.w, el); if (!s) return; s.zoom = clamp(s.zoom * (el.dataset.arg === 'in' ? 1.4 : 1 / 1.4), ZMIN, ZMAX); s.fit = false; touch(c.w); };
ACT.mapFit = (el, c) => { const s = mvTarget(c.w, el); if (!s) return; s.pan = [0, 0]; s.zoom = 1; s.fit = true; touch(c.w); };
ACT.mapFollow = (el, c) => { const s = mvTarget(c.w, el); if (!s) return; s.pan = [0, 0]; s.fit = false; touch(c.w); };
ACT.mapFull = (el, c) => { if (!c.w) return; mvOf(c.w, el.dataset.crew).full = true; touch(c.w); };
ACT.mapClose = (el, c) => { if (!c.w) return; const s = mvOf(c.w, el.dataset.crew); s.full = false; s.layersOpen = false; touch(c.w); };
ACT.mapLayers = (el, c) => { if (!c.w) return; const s = mvOf(c.w, el.dataset.crew); s.layersOpen = !s.layersOpen; touch(c.w); };
ACT.mapLayer = (el, c) => {
  const w = c.w, s = mvOf(w, el.dataset.crew), k = el.dataset.arg, sci = ['slope', 'ti', 'comm']; s.layers[k] = !s.layers[k]; s.toast = null;
  if (sci.includes(k) && s.layers[k]) { s.order = (s.order || []).filter(x => x !== k).concat(k); if (sci.filter(x => s.layers[x]).length > 2) { const old = s.order.find(x => s.layers[x] && x !== k); s.layers[old] = false; s.order = s.order.filter(x => x !== old); s.toast = 'Max two scientific overlays at once — the oldest was turned off'; } }
  touch(w);
};
(function () {
  const pts = new Map(); let d = null;
  document.addEventListener('pointerdown', e => {
    const host = e.target.closest && e.target.closest('[data-panhost]'); if (!host || e.button > 0) return;
    if (e.target.closest('button,.m-stop,[role=dialog],.mapctl,.layersheet,.toast,.cutw')) return;
    const f = host.closest('[data-fid]'), fr = f && FRAMES[f.dataset.fid]; if (!fr) return; const w = WORLDS[fr.wid], st = mvState(w, host); if (!st) return;
    if (host.dataset.panhost === 'eva' && !st.full) return;                    // the mini-map only expands on tap; it does not pan
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const svg = host.querySelector('svg.mapsvg'); if (!svg) return;
    if (pts.size === 1) d = { host, w, st, svg, sx: e.clientX, sy: e.clientY, pan0: st.pan.slice(), vb0: svg.getAttribute('viewBox').split(' ').map(Number), moved: false, pinch0: 0, zoom0: st.zoom };
    else if (pts.size === 2 && d) { const [a, b] = [...pts.values()]; d.pinch0 = Math.hypot(a.x - b.x, a.y - b.y); d.zoom0 = st.zoom; }
  });
  document.addEventListener('pointermove', e => {
    if (!d || !pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && d.pinch0) { const [a, b] = [...pts.values()]; d.st.zoom = clamp(d.zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / d.pinch0, ZMIN, ZMAX); d.moved = true; touch(d.w); return; }
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
    const m = d.svg.getScreenCTM(); if (!m) return; d.moved = true;
    const dx = (e.clientX - d.sx) / m.a, dy = (e.clientY - d.sy) / m.d; d.st.pan = [d.pan0[0] - dx, d.pan0[1] - dy]; d.st.fit = false;
    d.svg.setAttribute('viewBox', [d.vb0[0] - dx, d.vb0[1] - dy, d.vb0[2], d.vb0[3]].join(' '));
  });
  const up = e => { if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId); if (d && pts.size === 0) { const x = d; d = null; if (x.moved) { x.st._dragged = true; touch(x.w); } } };
  document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  document.addEventListener('wheel', e => {
    const host = e.target.closest && e.target.closest('[data-panhost]'); if (!host) return; const f = host.closest('[data-fid]'), fr = f && FRAMES[f.dataset.fid]; if (!fr) return; const w = WORLDS[fr.wid], st = mvState(w, host); if (!st) return;
    if (host.dataset.panhost === 'eva' && !st.full) return; e.preventDefault(); st.zoom = clamp(st.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2), ZMIN, ZMAX); st.fit = false; touch(w);
  }, { passive: false });
})();
