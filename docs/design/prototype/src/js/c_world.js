'use strict';
/* ===== WORLD: value tables (which fixture num each device shows per state), presets, commands, marker tween =====
   RULE: nothing here does arithmetic on a displayed value. Values are looked up by fixture key; positions are drawing-only. */
const PATHS = { route: ROUTE, back: ROUTE_BACK, pr1: PR1_PATH, rdv: [SCH.s2, [548, 692], SCH.rdv], hab: [SCH.hab, [SCH.hab[0] + 1, SCH.hab[1] + 1]] };
function fracAt(poly, idx) { let tot = 0, acc = 0; for (let i = 1; i < poly.length; i++) { const l = Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]); tot += l; if (i <= idx) acc += l; } return acc / tot; }
const RF = { s1: fracAt(ROUTE, 1), s2: fracAt(ROUTE, 2), s3: 1 };
const STOPN = { 1: { code: 'EZ—ENG 01', name: null }, 2: { code: 'EZ—RES 02', name: 'Hydrated sulfate ledge' }, 3: { code: 'EZ—SCI 01', name: 'Boxwork ridge' } };
const ACTW = { waiting: 'IN HAB', walking: 'WALKING', atStop: 'AT STOP 2', toHaven: 'TO HAVEN', sheltered: 'SHELTERED', ended: 'EVA ENDED', noLink: 'NO HAB LINK' };

function evset(over) { return Object.assign({ haven: 'haven_ph1', o2: 'o2_ph1', o2left: 'o2left_ph1', eva: 'eva_ph1', dose: 'dose_ph1', bearing: 'bearing_ph1', dist: 'dist_ph1', eta: 'eta_ph1', next: { n: 2 }, via: null }, over || {}); }
const EV1_NOM = { haven: 'haven_ev1', o2: 'o2_ev1', o2left: 'o2_left_ev1', eva: 'eva_ev1', dose: 'dose_ev1_0', bearing: 'bearing', dist: 'dist_next', eta: 'eta_next', next: { n: 3 }, via: 'PR1' };
const EV2_SET = { haven: 'haven_ev2', o2: 'o2_ev2', o2left: 'o2_left_ev2', eva: 'eva_ev2', dose: 'dose_ev2', bearing: 'bearing_ev2', dist: 'dist_ev2', eta: 'eta_ev2', next: { n: 3 }, via: null };
const EVT = {
  EV1: { pre: null, walking: evset({ via: null }), nominal: EV1_NOM, alert: Object.assign({}, EV1_NOM, { dose: 'dose_ev1_1' }), enroute: evset({ next: { rdv: 1 }, via: 'PR1' }), sheltered: evset({ next: { sheltered: 1 }, via: 'PR1' }) },
  EV2: { pre: null, walking: Object.assign({}, EV2_SET, { next: { n: 2 } }), nominal: EV2_SET, alert: EV2_SET, enroute: Object.assign({}, EV2_SET, { next: { rdv: 1 }, via: 'PR1' }), sheltered: Object.assign({}, EV2_SET, { next: { sheltered: 1 }, via: 'PR1' }) },
};
const evv = (w, id) => EVT[id][w.vals] || null;

/* ---- presets ---- */
const PRE = {
  base(w) {
    resetAlerts(w); Object.assign(w, { session: 'running', paused: false, vals: 'nominal', beat: null, listOpen: false, sheet: true, phase: 4, rdv: false, speed: 60, focus: null, hudHold: 0 });
    w.evs = { EV1: { act: 'atStop', linked: true, queue: [], stale: null }, EV2: { act: 'atStop', linked: true, queue: [], stale: null } };
    w.veh = { PR1: 'parked', UR1: 'parked' }; w.opt = { state: 'none', sel: 1, approval: 'none', noRdv: false }; w.earth = { state: 'link', fc: 'none' }; w.log = 2;
    w.mk = { EV1: { p: 'route', t: RF.s2 }, EV2: { p: 'route', t: RF.s2 - 0.025 }, PR1: { p: 'hab', t: 0 } }; w.disp = JSON.parse(JSON.stringify(w.mk)); w.ui = {}; w.rover = 'none'; return w;
  },
  noSession(w) { PRE.base(w); w.session = 'noSession'; w.vals = 'pre'; w.log = 0; w.phase = -1; w.evs.EV1.act = w.evs.EV2.act = 'waiting'; w.mk.EV1 = w.mk.EV2 = { p: 'hab', t: 0 }; w.disp = JSON.parse(JSON.stringify(w.mk)); },
  loaded(w) { PRE.base(w); w.session = 'loaded'; w.vals = 'pre'; w.log = 1; w.phase = -1; w.evs.EV1.act = w.evs.EV2.act = 'waiting'; w.mk.EV1 = { p: 'hab', t: 0 }; w.mk.EV2 = { p: 'hab', t: 0 }; w.disp = JSON.parse(JSON.stringify(w.mk)); },
  waiting(w) { PRE.loaded(w); },
  walking(w) { PRE.base(w); w.vals = 'walking'; w.phase = 3; w.evs.EV1.act = w.evs.EV2.act = 'walking'; w.log = 1; w.mk.EV1 = { p: 'route', t: RF.s1 + (RF.s2 - RF.s1) * .55 }; w.mk.EV2 = { p: 'route', t: RF.s1 + (RF.s2 - RF.s1) * .5 }; w.disp = JSON.parse(JSON.stringify(w.mk)); },
  running(w) { PRE.base(w); }, atStop(w) { PRE.base(w); },
  paused(w) { PRE.base(w); w.paused = true; w.session = 'paused'; },
  alerting(w) { PRE.base(w); w.vals = 'alert'; raise(w, 'RADIATION_ALERT', { silent: true }); w.opt.state = 'ready'; w.log = 3; w.earth = { state: 'waiting', fc: 'transit' }; w.focus = 'alert'; },
  computing(w) { PRE.alerting(w); w.opt.state = 'computing'; },
  ready(w) { PRE.alerting(w); },
  executing(w) { PRE.toHaven(w); w.opt.state = 'executing'; w.sheet = true; },
  superseded(w) { PRE.alerting(w); w.opt.state = 'superseded'; raise(w, 'HAVEN_TIME_EXCEEDED', { silent: true }); },
  approval(w) { PRE.alerting(w); w.opt.sel = 3; w.opt.approval = 'pending'; },
  noRdv(w) { PRE.alerting(w); w.opt.noRdv = true; w.opt.sel = 2; },
  toHaven(w) {
    PRE.alerting(w); w.vals = 'enroute'; w.phase = 5; w.veh.PR1 = 'enRoute'; w.opt.state = 'executing'; w.rdv = true; w.log = 5; w.earth = { state: 'waiting', fc: 'transit' };
    w.evs.EV1.act = w.evs.EV2.act = 'toHaven'; w.sheet = false; w.alerts.forEach(a => a.acked = true); raise(w, 'COMM_SHADOW', { silent: true });
    w.mk = { EV1: { p: 'rdv', t: .3 }, EV2: { p: 'rdv', t: .26 }, PR1: { p: 'pr1', t: .6 } }; w.disp = JSON.parse(JSON.stringify(w.mk));
  },
  sheltered(w) {
    PRE.toHaven(w); w.vals = 'sheltered'; w.phase = 6; w.veh.PR1 = 'arrived'; w.evs.EV1.act = w.evs.EV2.act = 'sheltered'; w.opt.state = 'none'; w.log = 7; w.earth = { state: 'link', fc: 'delivered' };
    w.alerts.forEach(a => { a.acked = true; }); clearAlert(w, 'COMM_SHADOW'); w.mk = { EV1: { p: 'rdv', t: 1 }, EV2: { p: 'rdv', t: 1 }, PR1: { p: 'pr1', t: 1 } }; w.disp = JSON.parse(JSON.stringify(w.mk));
  },
  ended(w) { PRE.sheltered(w); w.session = 'ended'; w.phase = 7; w.evs.EV1.act = w.evs.EV2.act = 'ended'; w.log = 8; w.veh.PR1 = 'returning'; w.alerts.forEach(a => { a.acked = true; a.gone = true; }); },   // EVA over: alerts are closed out and stay in the log
  noLink(w) { PRE.base(w); w.evs.EV1.linked = false; w.evs.EV1.stale = '0:42'; raise(w, 'LINK_LOST', { silent: true }); w.log = 2; },
  rejected(w) { PRE.alerting(w); w.toast = FX.reject.FORBIDDEN_ROLE + ' (FORBIDDEN_ROLE)'; },
  mismatch(w) { PRE.noSession(w); w.ui.err = true; },
  approvalLate(w) { PRE.alerting(w); w.opt.sel = 3; w.opt.approval = 'late'; },
  caution(w) { PRE.base(w); raise(w, 'COMM_SHADOW', { silent: true }); },
  warning(w) { PRE.alerting(w); },
};

/* ---- commands (events, not state edits: they log and are replayed — 03 §E.5) ---- */
function logEvent(w, text) { w.log = Math.min(8, w.log + 1); }
HOLDACT.summon = (w, arg) => {
  if (!w) return; const ev = w.evs.EV1;
  if (!ev.linked) { ev.queue.push({ kind: 'SUMMON_VEHICLE', option: arg }); w.toast = FX.reject.NO_LINK; touch(w); return; }   // NO_LINK: queued on device, resent on LINK_STATE linked=true
  if (w.onCmd && w.onCmd('summon', arg)) return;
  w.opt.sel = +arg || 1; w.opt.state = 'executing'; w.veh.PR1 = 'enRoute'; w.evs.EV1.act = w.evs.EV2.act = 'toHaven'; w.vals = 'enroute'; w.phase = 5; w.rdv = true; w.log = 5;
  w.mk = { EV1: { p: 'rdv', t: .3 }, EV2: { p: 'rdv', t: .26 }, PR1: { p: 'pr1', t: .6 } }; touch(w); startTween(w);
};
HOLDACT.abort = (w) => {
  if (!w) return; if (!w.evs.EV1.linked) { w.evs.EV1.queue.push({ kind: 'ABORT' }); w.toast = FX.reject.NO_LINK; touch(w); return; }
  if (w.onCmd && w.onCmd('abort')) return;
  w.opt.sel = 2; w.opt.state = 'executing'; w.evs.EV1.act = w.evs.EV2.act = 'toHaven'; w.vals = 'enroute'; w.phase = 5; w.log = 5; touch(w);
};
HOLDACT.approve = (w, arg) => { if (!w) return; w.opt.approval = 'none'; w.opt.state = 'executing'; w.opt.sel = +arg || 3; touch(w); };
ACT.setOpt = (el, c) => { if (!c.w) return; const n = +el.dataset.arg; if (c.w.opt.state === 'executing') return; c.w.opt.sel = n; c.w.opt.approval = n === 3 ? 'pending' : 'none'; touch(c.w); };
ACT.clock = (el, c) => { if (!c.w) return; const a = el.dataset.arg; if (a === 'pause') { c.w.paused = !c.w.paused; if (c.w.player) c.w.player.paused = c.w.paused; } else if (a === 'next') { if (c.w.player) c.w.player.next(); } else { c.w.speed = +a; if (c.w.player) c.w.player.speed = +a; } touch(c.w); };
ACT.mute = (el, c) => { if (!c.w) return; c.w.muted = !c.w.muted; if (c.w.muted) c.w.alerts.forEach(stopRepeat); else { SND.unlock(); SND.play('caution'); } touch(c.w); };
ACT.relink = (el, c) => { if (!c.w) return; const ev = c.w.evs.EV1; ev.linked = true; ev.stale = null; clearAlert(c.w, 'LINK_LOST'); if (ev.queue.length) { c.w.toast = 'Sent — queued command delivered'; ev.queue = []; } touch(c.w); };
ACT.dropLink = (el, c) => { if (!c.w) return; const ev = c.w.evs.EV1; ev.linked = false; ev.stale = '0:42'; raise(c.w, 'LINK_LOST'); touch(c.w); };
ACT.startEva = (el, c) => { if (!c.w) return; PRE.base(c.w); touch(c.w); };
ACT.loadScn = (el, c) => { if (!c.w) return; PRE.loaded(c.w); touch(c.w); };
ACT.endEva = (el, c) => { if (!c.w) return; PRE.ended(c.w); touch(c.w); };
ACT.jump = (el, c) => { if (c.w) { c.w.focus = el.dataset.arg; touch(c.w); } };
ACT.toastX = (el, c) => { if (c.w) { c.w.toast = null; touch(c.w); } };

/* ---- marker tween: markers may animate position visually; no value is computed from it ---- */
function mkXY(w, id) { const d = (w.disp && w.disp[id]) || (w.mk && w.mk[id]); if (!d) return null; return pointAt(PATHS[d.p] || PATHS.hab, d.t); }
function startTween(w) {
  if (w._tw) return; if (RM()) { w.disp = JSON.parse(JSON.stringify(w.mk)); return; }
  const step = () => {
    let moving = false;
    for (const id of Object.keys(w.mk || {})) {
      const t = w.mk[id], d = w.disp[id] || (w.disp[id] = { p: t.p, t: t.t });
      if (d.p !== t.p) { d.p = t.p; d.t = (t.p === 'rdv' || t.p === 'pr1') ? 0 : t.t; }
      const diff = t.t - d.t; if (Math.abs(diff) > 0.002) { d.t += diff * 0.06 + Math.sign(diff) * 0.0006; moving = true; } else d.t = t.t;
    }
    FRAMEIDS(w).forEach(fid => { const f = FRAMES[fid]; if (f) $$('[data-mk]', f.el).forEach(g => { const id = g.dataset.mk, p = mkXY(w, id); if (!p) return; g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${g.dataset.inv})`); const r = $('.rot', g); if (r) r.setAttribute('transform', `rotate(${p.hdg.toFixed(0)})`); }); });
    if (moving) w._tw = requestAnimationFrame(step); else w._tw = null;
  };
  w._tw = requestAnimationFrame(step);
}
const FRAMEIDS = w => Object.keys(FRAMES).filter(fid => FRAMES[fid].wid === w.id);
