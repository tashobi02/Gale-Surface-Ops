'use strict';
/* ===== DEMO PLAYER + STAGE + ORIENTATION COMPARE =====
   Beats come from 01 §E.1 (killer demo), 01 §E.2 (planning, condensed for v2), 03 §C.6, and 10_Demo_Script.
   Values HOLD between keyframes. Markers tween visually; NO arithmetic is done on any displayed value.
   Speed: 60× plays the beat table at the pace of the recorded video (the table in 01 §E.1 is written for 60×); 10× and 1× are slower. */
const KB = {
  k0: w => { PRE.base(w); w.log = 1; },
  k1: w => { PRE.alerting(w); raise(w, 'RADIATION_ALERT'); w.opt.state = 'computing'; w.log = 2; w.earth = { state: 'link', fc: 'none' }; },
  k2: w => { PRE.alerting(w); w.opt.state = 'computing'; w.earth = { state: 'waiting', fc: 'transit' }; w.focus = 'earth'; w.log = 2; },
  k3: w => { PRE.alerting(w); w.opt.state = 'ready'; w.log = 3; w.earth = { state: 'waiting', fc: 'transit' }; },
  k4: w => { PRE.toHaven(w); w.alerts = w.alerts.filter(a => a.code !== 'COMM_SHADOW'); w.sheet = true; w.log = 4; w.mk.EV1.t = .12; w.mk.EV2.t = .1; w.mk.PR1.t = .2; },
  k5: w => { PRE.toHaven(w); w.sheet = false; w.listOpen = true; w.log = 5; w.mk.EV1.t = .55; w.mk.EV2.t = .5; w.mk.PR1.t = .85; },
  k5b: w => { PRE.toHaven(w); w.sheet = false; raise(w, 'EARTH_FORECAST'); w.earth = { state: 'link', fc: 'delivered' }; w.listOpen = true; w.log = 6; w.mk.EV1.t = .8; w.mk.EV2.t = .76; w.mk.PR1.t = .95; },
  k6: w => { PRE.sheltered(w); w.log = 7; },
  k7: w => { PRE.ended(w); w.log = 8; },
};
const sec = s => ({ v: s, unit: 's (video)', prov: 'assumed', src: 'Proposed slot' });
const B = (id, at, s, title, cite, caption, view) => ({ id, at, s, title, cite, caption, view });
const TRACKS = {
  killer: { name: 'Killer demo — Storm at sol 4190', cite: '01 §E.1 · 03 §C.6', beats: [
    B('k0', '0:00', 0, 'Crew at stop 2 (resource stop)', '01 §E.1 · 0:00 · 03 §C.6 step 3', 'Ops map: EV1/EV2 markers, route, rover parked at hab. HUD: next stop, margins.', { k: 'stage', beat: 'k0' }),
    B('k1', '0:10', 10, 'Local radiation trigger fires', '01 §E.1 · 0:10 · 03 §C.6 step 4', 'Warning bar on every device at once, same words; dose-rate chart labelled replayed — Curiosity RAD, 20 May 2024.', { k: 'stage', beat: 'k1' }),
    B('k2', '0:20', 20, 'Earth cannot help in time', '01 §E.1 · 0:20 · 03 §C.6 step 5', 'Forecast still in transit; light time and next relay pass shown (04 §E.4 example values).', { k: 'stage', beat: 'k2' }),
    B('k3', '0:30', 30, 'System proposes options', '01 §E.1 · 0:30 · 03 §C.6 step 6', 'Rendezvous 14 min vs abort to hab 41 min (illustrative, 01 §E.1). Expected dose per option is a PLACEHOLDER.', { k: 'stage', beat: 'k3' }),
    B('k4', '0:40', 40, 'EV1 holds “Go — option 1”', '01 §E.1 · 0:40 · 03 §C.6 step 6', 'Hold 0.8 s → “PR1 dispatched — ETA 14 min”. The rendezvous avoids a 17° slope (illustrative). Try it: hold the button on the EV1 tablet.', { k: 'stage', beat: 'k4' }),
    B('k5', '0:55', 55, 'Route crosses a comm shadow', '01 §E.1 · 0:55 · 03 §C.6 step 7', 'Caution “Comm shadow in 120 m — stay with EV2”. One bar slot: the latched warning wins, the caution is behind +1 (G-25); alert list opened.', { k: 'stage', beat: 'k5' }),
    B('k5b', '1:02', 62, 'Earth forecast arrives — after the local alert', '03 §C.6 step 8 (slot Proposed)', 'Advisory “Earth forecast received (sent 14 min ago)”, auto-dismisses after 10 s, stays in the log.', { k: 'stage', beat: 'k5b' }),
    B('k6', '1:10', 70, 'Crew sheltered in PR1', '01 §E.1 · 1:10 · 03 §C.6 step 9', 'Dose received vs unsheltered are PLACEHOLDERS (TASK-22). Event log shows the run.', { k: 'stage', beat: 'k6' }),
    B('k7', '1:20', 80, 'EVA ended → post-EVA report', '01 §E.1 · 1:20 · 03 §C.6 step 10', 'Ops opens the report (SCR-17).', { k: 'scr', scr: 'SCR-17', state: 'default' }),
  ] },
  plan: { name: 'Planning walkthrough (condensed for v2)', cite: '01 §E.2', beats: [
    B('p1', '0:00', 0, 'Open the planner', '01 §E.2 step 1', 'Mission briefing → Start planning → map workspace.', { k: 'scr', scr: 'SCR-02', state: 'idle' }),
    B('p2', '0:08', 8, 'Toggle Slope and Thermal inertia', '01 §E.2 step 2 · 03 §C.1 step 2', 'Legends with units and sources; max two scientific overlays at once.', { k: 'scr', scr: 'SCR-03', state: 'default' }),
    B('p3', '0:16', 16, 'Open the Boxwork ridge POI', '01 §E.2 step 3', 'Science objective, evidence, credit; Add as stop.', { k: 'scr', scr: 'SCR-06', state: 'shown' }),
    B('p4', '0:24', 24, 'Add a science stop and a resource stop', '01 §E.2 step 4 (v2: time-to-haven band)', 'Route computes; profile with haven and comm bands.', { k: 'scr', scr: 'SCR-05', state: 'ok' }),
    B('p5', '0:34', 34, 'Drag a stop onto a steep slope — the honest failure', '01 §E.2 step 5 · 03 §D', 'No feasible route, reason shown, nearest reachable point; totals hidden.', { k: 'scr', scr: 'SCR-05', state: 'partial' }),
    B('p6', '0:44', 44, 'Move it back; hard slope limit 15° → 12°', '01 §E.2 step 6', 'The route re-routes; values are PLACEHOLDERS (the prototype does not compute).', { k: 'scr', scr: 'SCR-04', state: 'editing' }),
    B('p7', '0:54', 54, 'Early start → daylight warning', '01 §E.2 step 7', 'Sun elevation shown (PLACEHOLDER until TASK-06).', { k: 'scr', scr: 'SCR-07', state: 'daylight' }),
    B('p8', '1:02', 62, 'Briefing card → Publish to Hab Core', '01 §E.2 step 8 · 03 §C.1 step 6', 'One-page summary, then PUBLISH_PLAN.', { k: 'scr', scr: 'SCR-08', state: 'ok' }),
    B('p9', '1:12', 72, 'Sources & methods', '01 §E.2 step 9', 'Datasets, models, assumptions, limitations.', { k: 'scr', scr: 'SCR-09', state: 'default' }),
  ] },
  v240: { name: '240-s local judging video', cite: '10_Demo_Script', beats: [
    B('m0', '0:00', 0, 'Team and problem', '10 · 0:00–0:20', 'All six members by name, challenge name; “Earth is 3–22 light-minutes away”.', { k: 'card', card: 'title' }),
    B('m1', '0:20', 20, 'Mission briefing → planner', '10 · 0:20–0:35 · 01 §E.2 steps 1–2', 'Name the datasets: HiRISE, MOLA + HRSC (ESA) DEM, THEMIS.', { k: 'scr', scr: 'SCR-01', state: 'ready' }),
    B('m1b', '0:28', 28, 'Layers', '10 · 0:20–0:35', 'Slope and thermal-inertia layers with legends.', { k: 'scr', scr: 'SCR-03', state: 'default' }),
    B('m2', '0:35', 35, 'Science stop and resource stop', '10 · 0:35–0:50 · 01 §E.2 steps 3–4', 'Route, profile, time-to-haven band.', { k: 'scr', scr: 'SCR-05', state: 'ok' }),
    B('m3', '0:50', 50, 'Honest failure', '10 · 0:50–1:00 · 01 §E.2 step 5', 'No feasible route with reason.', { k: 'scr', scr: 'SCR-05', state: 'partial' }),
    B('m3b', '0:56', 56, 'Briefing card, publish to Hab Core', '10 · 0:50–1:00', 'PUBLISH_PLAN.', { k: 'scr', scr: 'SCR-08', state: 'ok' }),
    B('m4', '1:00', 60, 'Ops + phones: EVA under way', '10 · 1:00–1:10 · 01 §E.1 0:00', 'Crew at the resource stop.', { k: 'stage', beat: 'k0' }),
    B('m5', '1:10', 70, 'Radiation alert on every device', '10 · 1:10–1:30 · 01 §E.1 0:10', 'Dose curve labelled replayed — Curiosity RAD, 20 May 2024.', { k: 'stage', beat: 'k1' }),
    B('m5b', '1:20', 80, 'Earth forecast still in transit', '10 · 1:10–1:30 · 01 §E.1 0:20', 'Light time and relay pass.', { k: 'stage', beat: 'k2' }),
    B('m6', '1:30', 90, 'Options', '10 · 1:30–2:00 · 01 §E.1 0:30', 'Rendezvous vs abort.', { k: 'stage', beat: 'k3' }),
    B('m6b', '1:40', 100, 'EV1 holds Summon rover', '10 · 1:30–2:00 · 01 §E.1 0:40', 'PR1 dispatched.', { k: 'stage', beat: 'k4' }),
    B('m6c', '1:50', 110, 'Comm-shadow caution', '10 · 1:30–2:00 · 01 §E.1 0:55', 'Caution behind +1.', { k: 'stage', beat: 'k5' }),
    B('m7', '2:00', 120, 'Crew sheltered', '10 · 2:00–2:30 · 01 §E.1 1:10', 'Dose received vs unsheltered.', { k: 'stage', beat: 'k6' }),
    B('m7b', '2:15', 135, 'Post-EVA report', '10 · 2:00–2:30 · 01 §E.1 1:20', 'Planned vs actual, alerts, provenance.', { k: 'scr', scr: 'SCR-17', state: 'default' }),
    B('m8', '2:30', 150, 'Datasets aloud', '10 · 2:30–3:20', 'HiRISE, MOLA + HRSC (ESA), THEMIS, RAD, DONKI, SPICE (NAIF + ESA TGO); packages/compute and tests.', { k: 'card', card: 'data' }),
    B('m9', '3:20', 200, 'Impact, boundary, credits', '10 · 3:20–4:00 · 01 §F.1', 'Works for any site with a DEM; habitat-local by design; disclaimer.', { k: 'card', card: 'close' }),
  ] },
  v30: { name: '30-s global video', cite: '10_Demo_Script', beats: [
    B('g0', '0:00', 0, 'Title, team, challenge', '10 · 0:00–0:05', 'Title card.', { k: 'card', card: 'title' }),
    B('g1', '0:05', 5, 'HUD alert', '10 · 0:05–0:20', 'Real 20 May 2024 solar storm, replayed.', { k: 'hud', beat: 'k1' }),
    B('g2', '0:11', 11, 'Summon rover', '10 · 0:05–0:20', 'PR1 dispatched.', { k: 'hud', beat: 'k4' }),
    B('g3', '0:16', 16, 'Crew sheltered', '10 · 0:05–0:20', 'Sheltered — PR1.', { k: 'hud', beat: 'k6' }),
    B('g4', '0:20', 20, 'NASA HiRISE, RAD, DONKI + ESA data', '10 · 0:20–0:25', 'Over the ops console.', { k: 'stage', beat: 'k6' }),
    B('g5', '0:25', 25, 'Impact line, prototype disclaimer', '10 · 0:25–0:30', 'Closing card.', { k: 'card', card: 'close' }),
  ] },
};

/* ---- player ---- */
const PL = { cur: null, raf: 0, last: 0 };
function makePlayer(trackKey, w) {
  const tr = TRACKS[trackKey], P = { key: trackKey, tr, beats: tr.beats, idx: 0, t: 0, speed: 60, playing: false, paused: false, w, cb: new Set() };
  P.len = P.beats[P.beats.length - 1].s + 12;
  P.goto = (i, fromTick) => { i = clamp(i, 0, P.beats.length - 1); const changed = i !== P.idx; P.idx = i; if (!fromTick) P.t = P.beats[i].s; applyBeat(P); P.cb.forEach(f => f(P)); return changed; };
  P.next = () => { if (P.idx < P.beats.length - 1) P.goto(P.idx + 1); else P.playing = false; };
  P.prev = () => P.goto(P.idx - 1);
  P.scrub = f => { P.t = f * P.len; let j = 0; P.beats.forEach((b, k) => { if (P.t >= b.s) j = k; }); P.goto(j, true); };
  P.tick = dt => { if (!P.playing || P.paused) return; P.t += dt * P.speed / 60; if (P.t >= P.len) { P.playing = false; P.t = P.len; P.cb.forEach(f => f(P)); return; } let j = P.idx; while (j + 1 < P.beats.length && P.t >= P.beats[j + 1].s) j++; if (j !== P.idx) P.goto(j, true); else P.cb.forEach(f => f(P)); };
  w.player = P; w.paused = P.paused; w.speed = P.speed;
  w.onCmd = (kind) => { if (kind !== 'summon') return false; const tgt = P.beats.findIndex(b => b.view.beat === 'k4'); if (tgt >= 0 && P.idx < tgt) { P.goto(tgt); return true; } return false; };
  return P;
}
function applyBeat(P) {
  const b = P.beats[P.idx], w = P.w, v = b.view; if (!v || v.k === 'card' || v.k === 'scr') { P.cb.forEach(f => f(P)); return; }
  const prev = w.disp ? JSON.parse(JSON.stringify(w.disp)) : null, ack = w.alerts.filter(a => a.acked).map(a => a.code);
  const ui = { hc: w.hc, muted: w.muted, tc: w.tapConfirm, speed: P.speed, paused: P.paused };
  KB[v.beat](w); w.hc = ui.hc; w.muted = ui.muted; w.tapConfirm = ui.tc; w.speed = P.speed; w.paused = P.paused; w.beat = v.beat; w.player = P;
  if (prev) w.disp = Object.assign({}, w.disp, Object.fromEntries(Object.keys(prev).filter(k => w.mk[k]).map(k => [k, prev[k]])));
  touch(w); startTween(w);
}
function playerLoop(ts) { if (!PL.cur) return; const dt = Math.min(0.1, (ts - (PL.last || ts)) / 1000); PL.last = ts; PL.cur.tick(dt); PL.raf = requestAnimationFrame(playerLoop); }
function playerStop() { cancelAnimationFrame(PL.raf); PL.raf = 0; PL.cur = null; PL.last = 0; }
function playerStart(P) { PL.cur = P; PL.last = 0; cancelAnimationFrame(PL.raf); PL.raf = requestAnimationFrame(playerLoop); }

function transportHTML(P) {
  const sp = [1, 10, 60];
  return `<div class="transport" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0">
    <button class="shellbtn" data-pl="play">${P.playing && !P.paused ? '❚❚ PAUSE' : '▶ PLAY'}</button><button class="shellbtn" data-pl="prev">◀ PREV</button><button class="shellbtn" data-pl="next">NEXT EVENT ▶▮</button>
    <span class="lbl-s">CLOCK SPEED</span>${sp.map(s => `<button class="shellbtn" data-pl="speed" data-arg="${s}" aria-pressed="${P.speed === s}">${s}×</button>`).join('')}
    <span class="lbl-s">KEYS: SPACE · 1/2/3 · N · K · O</span></div>
    <div style="position:relative;margin:4px 0 28px"><input id="scrub" type="range" min="0" max="1000" value="${Math.round(1000 * P.t / P.len)}" style="width:100%" aria-label="Scrub the beat timeline"><div id="ticks" style="position:relative;height:24px">${P.beats.map((b, i) => `<button class="shellbtn" data-pl="goto" data-arg="${i}" style="position:absolute;left:${(100 * b.s / P.len).toFixed(2)}%;transform:translateX(-50%);min-height:22px;padding:0 5px;font-size:11px" aria-pressed="${i === P.idx}" title="${esc(b.title)}">${b.at}</button>`).join('')}</div></div>`;
}
function beatInfoHTML(P) { const b = P.beats[P.idx]; return `<div class="cut cut-s" style="--fill:#14181D;--line:#5C6670;padding:10px 14px;margin:6px 0 14px"><span class="code" style="color:#8592A0">BEAT ${P.idx + 1} / ${P.beats.length} · ${P.key.toUpperCase()} · ${b.at} (spec table) · ${esc(b.cite)}</span><div style="font:500 18px var(--f-display);text-transform:uppercase;margin:2px 0">${esc(b.title)}</div><div style="color:#A9B3BE;font-size:13px;max-width:100ch">${esc(b.caption)}</div></div>`; }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pl]'); if (!b || !PL.cur) return; const P = PL.cur, a = b.dataset.pl;
  if (a === 'play') { if (P.t >= P.len) { P.goto(0); } P.playing = !(P.playing && !P.paused); P.paused = false; P.w.paused = false; }
  else if (a === 'next') P.next(); else if (a === 'prev') P.prev(); else if (a === 'goto') P.goto(+b.dataset.arg); else if (a === 'speed') { P.speed = +b.dataset.arg; P.w.speed = P.speed; }
  P.cb.forEach(f => f(P)); touch(P.w);
});
document.addEventListener('input', e => { if (e.target.id === 'scrub' && PL.cur) PL.cur.scrub(+e.target.value / 1000); });

/* ---- cards ---- */
function cardHTML(kind) {
  const inner = kind === 'title' ? `<div class="micro" style="color:var(--text-2)">NASA SPACE APPS 2026 · DHAKA</div><div class="disp" style="font-size:56px;line-height:1">Team CheesySpace</div><div style="font:500 22px var(--f-ui);max-width:40ch">${esc(FX.meta.challenge)}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px 24px;margin-top:8px">${FX.team.map(t => `<div><b style="font:600 16px var(--f-ui)">${esc(t.name)}</b><div class="micro">${esc(t.role)}</div></div>`).join('')}</div>
      <div style="margin-top:12px;font:500 20px var(--f-ui)">Earth is ${N('lt_range_min', { chip: 'g', size: 20, unit: false })}–${N('lt_range_max', { chip: 'g', size: 20 })} light-minutes away.</div><div class="micro">No photos of people are used. Names only.</div>`
    : kind === 'data' ? `<div class="micro">SOURCES — NASA AND ESA · 02 §C</div><div class="disp" style="font-size:36px">Every number traced to data</div><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px 24px;margin-top:8px">${FX.sources.map(s => `<div class="row"><span class="code">${s.code}</span><span style="font:500 14px var(--f-ui)">${esc(s.title)}</span></div>`).join('')}</div>
      <div class="chipbar" style="margin-top:12px">${FX.provenance_classes.map(p => chip(p.k)).join('')}</div><div style="font:500 14px var(--f-ui);margin-top:6px">Science lives only in <code>packages/compute</code> and <code>pipeline/</code>, with tests. ${esc(FX.meta.ai_use)}</div>`
    : `<div class="micro">PROTOTYPE BOUNDARY · 01 §F.1</div><div class="disp" style="font-size:44px;line-height:1.05">Plan the walk.<br>Survive the storm.</div><div class="serif" style="font-size:17px;color:var(--text-1)">${esc(FX.meta.disclaimer)}</div><div style="font:500 14px var(--f-ui)">Credits: NASA (HiRISE, RAD, DONKI, SPICE, MSL), USGS Astrogeology, ESA (Mars Express HRSC, TGO). Replayed history, simulated crew.</div>`;
  return `<div class="frame" data-mode="brief" style="width:100%;aspect-ratio:16/9;padding:36px 48px;display:flex;flex-direction:column;gap:14px;justify-content:center;border:1px solid #5C6670;position:relative"><i class="reg" style="left:12px;top:12px"></i><i class="reg" style="right:12px;top:12px"></i>${inner}<div class="protoflag">PROTOTYPE — illustrative values</div></div>`;
}

/* ---- stage ---- */
function stageGrid(wid) {
  const A = (screen, dev, ev, label, extra = {}) => fhost(Object.assign({ screen, dev, ev, wid, label, cell: true, compact: true, state: 'atStop' }, extra));
  return `<div class="stage" style="display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:16px;align-items:start">
    <div class="cell" data-cell="ops">${fhost({ screen: 'SCR-11', dev: 'proj', wid, cell: true, compact: true, state: 'running', label: 'Ops console (projector)' })}</div>
    <div class="col" style="gap:14px"><div class="cell">${A('SCR-12', 'evaPhoneL', 'EV1', 'EV1 tablet')}</div><div class="cell">${fhost({ screen: 'SCR-13', dev: 'hud', wid, ev: 'EV1', cell: true, compact: true, state: 'nominal', label: 'EV1 HUD' })}</div><div class="cell">${A('SCR-12', 'evaPhoneL', 'EV2', 'EV2 tablet')}</div></div></div>
    <div id="wordscheck" class="badge" style="margin-top:12px"></div>`;
}
function wordsCheck() {
  const el = $('#wordscheck'); if (!el) return; const texts = [];
  Object.values(FRAMES).filter(f => f.el.isConnected).forEach(f => { const n = f.el.querySelector('.alertbar .atext, .halert span:last-child'); texts.push([f.screenId + (f.ev && f.screenId !== 'SCR-11' ? ' ' + f.ev : ''), n ? n.textContent.trim() : '(no bar)']); });
  const act = texts.filter(t => t[1] !== '(no bar)'), same = act.length > 0 && act.every(t => t[1] === act[0][1]);
  el.innerHTML = `ALERT WORDS ON ALL DEVICES: <b>${act.length ? (same ? '✓ IDENTICAL — “' + esc(act[0][1]) + '”' : '✗ DIFFER') : 'none (EVA tablets show their status line)'}</b> · ${texts.map(t => esc(t[0]) + ': ' + esc(t[1])).join(' | ')}`;
}
function pageStage() {
  const w = worldOf('stage', ww => { PRE.base(ww); return ww; }); playerStop(); const P = makePlayer('killer', w); P.speed = 60;
  return { title: 'Stage', route: '(three-device setup, 01 §E.1)', html: `<h1>Stage</h1><p class="lead">Ops on the projector, EV1 tablet, EV1 HUD and EV2 tablet, all driven by one replayed world. Use the player, or hold <b>Summon rover</b> on EV1 yourself. EV1’s tablet orientation toggle stays available.</p><div id="stage-t"></div><div id="stage-b"></div>${stageGrid('stage')}`,
    mount(root) { const ui = () => { $('#stage-t', root).innerHTML = transportHTML(P); $('#stage-b', root).innerHTML = beatInfoHTML(P); wordsCheck(); }; ui(); P.cb.add(() => { const t = $('#scrub'); if (t && document.activeElement !== t) t.value = Math.round(1000 * P.t / P.len); }); let last = -1; P.cb.add(() => { if (P.idx !== last || true) { last = P.idx; const sc = $('#scrub'); const v = sc ? sc.value : 0; $('#stage-t', root).innerHTML = transportHTML(P); const sc2 = $('#scrub'); if (sc2) sc2.addEventListener('input', () => { }); $('#stage-b', root).innerHTML = beatInfoHTML(P); wordsCheck(); } }); w.subs.add(() => setTimeout(wordsCheck, 30)); playerStart(P); applyBeat(P); setTimeout(wordsCheck, 120); } };
}

/* ---- demo page ---- */
function pageDemo() {
  const key = PAGE.track || 'killer'; const wid = 'demo'; delete WORLDS[wid]; const w = newWorld(wid); PRE.base(w); playerStop(); const P = makePlayer(key, w);
  const picker = `<div class="row" style="gap:6px;flex-wrap:wrap" role="group" aria-label="Track">${Object.entries(TRACKS).map(([k, t]) => `<button class="shellbtn" data-trk="${k}" aria-pressed="${k === key}">${esc(t.name)} <span style="color:#8592A0">· ${esc(t.cite)}</span></button>`).join('')}</div>`;
  return { title: 'Demo player', route: '(prototype shell)', html: `<h1>Demo player</h1><p class="lead">Keyframes from 01 §E.1, 01 §E.2 and 10_Demo_Script. Values hold between keyframes; markers only move visually; nothing is computed. 60× plays at the pace of the recorded video table; 10× and 1× are slower replays of the same beats.</p>${picker}<div id="demo-t"></div><div id="demo-b"></div><div id="demo-v"></div>`,
    mount(root) {
      let mounted = null, vfr = null;
      const view = () => {
        const b = P.beats[P.idx], v = b.view, host = $('#demo-v', root); const sig = JSON.stringify(v.k === 'stage' ? 'stage' : v.k === 'hud' ? 'hud' : v);
        $('#demo-t', root).innerHTML = transportHTML(P); $('#demo-b', root).innerHTML = beatInfoHTML(P);
        if (v.k === 'stage' || v.k === 'hud') { const kind = v.k; if (mounted !== kind) { destroyFrames(host); host.innerHTML = kind === 'stage' ? stageGrid(wid) : `<div style="max-width:880px">${fhost({ screen: 'SCR-13', dev: 'hud', wid, ev: 'EV1', state: 'nominal', noSwitcher: true, compact: true, label: 'EV1 HUD' })}</div>`; mountHosts(host); mounted = kind; vfr = null; fitAll(); applyBeat(P); } }
        else if (v.k === 'card') { destroyFrames(host); host.innerHTML = cardHTML(v.card); mounted = 'card'; }
        else if (v.k === 'scr') { const S = SCREENS[v.scr]; if (!S) { host.innerHTML = `<p class="lead">${v.scr} is not built yet.</p>`; return; } if (mounted !== 'scr:' + v.scr) { destroyFrames(host); host.innerHTML = fhost({ screen: v.scr, state: v.state, dev: S.sizes[0], noSwitcher: true }); mountHosts(host); mounted = 'scr:' + v.scr; vfr = Object.values(FRAMES).find(f => f.screenId === v.scr && f.el.isConnected); } else if (vfr && vfr.state !== v.state) vfr.setState(v.state); }
        setTimeout(wordsCheckSafe, 60);
      };
      P.cb.add(() => { const b = P.beats[P.idx]; const sig = P.idx; if (view._last !== sig) { view._last = sig; view(); } else { const t = $('#scrub'); if (t && document.activeElement !== t) t.value = Math.round(1000 * P.t / P.len); } });
      view._last = -1; view(); view._last = 0; playerStart(P);
    } };
}
const wordsCheckSafe = () => { try { wordsCheck(); } catch (e) { } };
document.addEventListener('click', e => { const b = e.target.closest('[data-trk]'); if (!b) return; PAGE.track = b.dataset.trk; ROUTER.render(); });

/* ---- orientation compare (the “fixed geography” proof) ---- */
function pageOrientation() {
  const wid = 'cmp'; delete WORLDS[wid]; const w = newWorld(wid); PRE.atStop(w); const sts = EVA_STATES.filter(s => ['waiting', 'atStop', 'alerting', 'toHaven', 'noLink'].includes(s[0]));
  return { title: 'EVA orientation compare', route: '#/eva/EV1 (portrait vs landscape)', html: `<h1>EVA orientation compare</h1><p class="lead">One world, two frames: portrait (04 §E.5) and landscape v2 (Proposed, G-01: compact HAVEN and O₂ cards top-left, map on the whole right column). Crosshair = frame quadrants. The table is measured from the DOM after every render, so it proves — or disproves — that rotating does not move a value relative to its quadrant.</p>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:12px" role="group">${sts.map(([k, l]) => `<button class="shellbtn" data-cmp="${k}">${esc(l)}</button>`).join('')}</div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start"><div style="width:390px">${fhost({ screen: 'SCR-12', dev: 'evaPhoneP', wid, state: 'atStop', cell: true, compact: true, quad: true, label: 'PORTRAIT 390×844' })}</div><div style="width:844px;max-width:100%">${fhost({ screen: 'SCR-12', dev: 'evaPhoneL', wid, state: 'atStop', cell: true, compact: true, quad: true, label: 'LANDSCAPE 844×390' })}</div></div>
    <h2>Measured zone positions</h2><div id="cmp-table"></div><h2>Landscape height budget @ 844×390</h2><div id="cmp-budget"></div>`,
    mount(root) { const run = () => setTimeout(measureCompare, 60); w.subs.add(run); run(); } };
}
document.addEventListener('click', e => { const b = e.target.closest('[data-cmp]'); if (!b) return; const w = WORLDS.cmp; if (!w) return; const keep = { hc: w.hc }; PRE[b.dataset.cmp](w); w.hc = keep.hc; touch(w); startTween(w); });
function zoneOf(fr, sel) { const n = fr.el.querySelector(sel); if (!n) return null; const fb = fr.el.getBoundingClientRect(), b = n.getBoundingClientRect(), x = ((b.left + b.width / 2) - fb.left) / fb.width, y = ((b.top + b.height / 2) - fb.top) / fb.height; const hx = x < .45 ? 'L' : x > .55 ? 'R' : 'C', vy = y < .45 ? 'T' : y > .55 ? 'B' : 'M'; return { x, y, q: vy + hx, wpx: b.width, hpx: b.height, top: b.top - fb.top }; }
function measureCompare() {
  const frs = Object.values(FRAMES).filter(f => f.wid === 'cmp' && f.el.isConnected); const P = frs.find(f => f.orient() === 'portrait'), L = frs.find(f => f.orient() === 'landscape'); if (!P || !L) return;
  const rows = [['Alert slot (top, full width)', '.alertslot'], ['HAVEN', '[data-slot=haven]'], ['O₂', '[data-slot=o2]'], ['NEXT stop', '.next'], ['Mini-map', '.mini'], ['Metadata strip', '.strip'], ['Action row', '.acts']];
  const notes = { 'O₂': '⚠ moves from top-right to beside HAVEN (landscape cards are compact, top-left); see the same-row check below', 'NEXT stop': '⚠ reflows: under the two cards in landscape, under the safety row in portrait', 'Mini-map': '⚠ reflows: whole right column in landscape, band below NEXT in portrait' };
  const body = rows.map(([n, sel]) => { const a = zoneOf(P, sel), b = zoneOf(L, sel); if (!a || !b) return `<tr><td>${n}</td><td colspan="3">not present in this state</td></tr>`; const exact = n === 'HAVEN' ? a.q === b.q : n.startsWith('Alert') ? a.q[0] === 'T' && b.q[0] === 'T' : (n.startsWith('Meta') || n.startsWith('Action')) ? a.q[0] === 'B' && b.q[0] === 'B' : false; return `<tr><td>${n}</td><td>${a.q} <span class="t3">(${Math.round(a.x * 100)}%, ${Math.round(a.y * 100)}%)</span></td><td>${b.q} <span class="t3">(${Math.round(b.x * 100)}%, ${Math.round(b.y * 100)}%)</span></td><td><b>${exact ? '✓ same quadrant' : notes[n] || '⚠ differs'}</b></td></tr>`; }).join('');
  const rr = (f, s) => { const n = f.el.querySelector(s); return n ? n.getBoundingClientRect() : null; };
  const adj = f => { const h = rr(f, '[data-slot=haven]'), o = rr(f, '[data-slot=o2]'); return h && o && Math.abs(h.top - o.top) < 1.5 && o.left >= h.right - 0.5; };
  const same = adj(P) && adj(L);
  const extra = `<tr><td>O₂ immediately right of HAVEN, same row</td><td>${adj(P) ? 'yes' : 'no'}</td><td>${adj(L) ? 'yes' : 'no'}</td><td><b>${same ? '✓ holds in both orientations' : '✗ broken'}</b></td></tr>`;
  $('#cmp-table').innerHTML = `<table class="sp"><tr><th>Zone</th><th>Portrait (quadrant · centre)</th><th>Landscape (quadrant · centre)</th><th>Result</th></tr>${body}${extra}</table>`;
  const fb = L.el.getBoundingClientRect(), g = s => { const n = L.el.querySelector(s); return n ? Math.round(n.getBoundingClientRect().height) : '–'; };
  const sA = g('.alertslot'), sB = g('.body'), sC = g('.safety'), sN = g('.next'), sT = g('.strip'), sAc = g('.acts'), sum = sA + sB + sT + sAc;
  $('#cmp-budget').innerHTML = `<table class="sp"><tr><th>Band</th><th>Height (measured)</th><th>Rule</th></tr><tr><td>Alert slot</td><td>${sA} px</td><td>64 px fixed (04 §E.5)</td></tr><tr><td>Body (left column + map)</td><td>${sB} px</td><td>map = the whole right column</td></tr><tr><td>&nbsp;&nbsp;cards row (HAVEN | O₂)</td><td>${sC} px</td><td>values ≥ 56 px Plex Mono; here 56 px (64 px on tablets)</td></tr><tr><td>&nbsp;&nbsp;NEXT card</td><td>${sN} px</td><td>values ≥ 32 px</td></tr><tr><td>Metadata strip</td><td>${sT} px</td><td>24 px (04 §C.3)</td></tr><tr><td>Action row</td><td>${sAc} px</td><td>targets ≥ 56 px + 8 px padding/gaps</td></tr><tr><td><b>Total</b></td><td><b>${sum} px</b></td><td>frame ${Math.round(fb.height)} px — ${sum === Math.round(fb.height) ? '✓ fits, no scrolling' : '✗ check'}</td></tr></table>`;
}
