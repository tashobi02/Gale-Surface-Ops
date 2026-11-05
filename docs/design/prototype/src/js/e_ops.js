'use strict';
/* ===== SCR-11 OPS CONSOLE (OPS, ≥1280 px, projector). 1024–1279: one drawer at a time. <1024: "use a larger screen" notice (04 §F). ===== */
const PHASES = ['EGRESS', 'TRAVERSE', 'STOP 1', 'TRAVERSE', 'STOP 2', 'TRAVERSE', 'STOP 3', 'INGRESS'];
const SESS_WORD = { noSession: 'NO SESSION', loaded: 'LOADED', running: 'RUNNING', paused: 'PAUSED', ended: 'ENDED' };
function phaseTimeline(w) {
  const cur = w.phase, unl = !w.evs.EV1.linked;
  return `<div class="phase" role="list" aria-label="EVA phase timeline" data-ann="id:P4|note:Current phase = filled block + bold label + ▼ marker; past = filled text-3; future = outline. Dashed when unlinked">${PHASES.map((p, i) => `<span role="listitem" class="ph-i ${i < cur ? 'past' : i === cur ? 'now' : ''}" ${i === cur ? 'aria-current="step"' : ''}>${i === cur ? '■ ' : ''}${p}</span>`).join('')}</div>`;
}
function clockCtl(w, dis) {
  const sp = [1, 10, 60];
  return `<div class="row" style="gap:6px" role="group" aria-label="Clock control" data-ann="id:FR-34|note:Keys: Space pause · 1/2/3 speed · N next event">${btn(ico(w.paused ? 'play' : 'pause') + (w.paused ? 'RESUME' : 'PAUSE'), { size: 'seg', act: 'clock', data: { arg: 'pause' }, disabled: dis, cls: w.paused ? 'on' : '', pressed: w.paused, title: 'Space' })}
    ${sp.map(s => btn(s + '×', { size: 'seg', act: 'clock', data: { arg: s }, disabled: dis, cls: w.speed === s && !dis ? 'on' : '', pressed: w.speed === s, title: String(sp.indexOf(s) + 1) })).join('')}
    ${btn(ico('next') + 'NEXT EVENT', { size: 'seg', act: 'clock', data: { arg: 'next' }, disabled: dis, title: 'N' })}</div>`;
}
function metaStrip(w) {
  const pre = w.session === 'noSession';
  return `<div class="meta" data-slot="meta" data-ann="id:04 §C.3|px:24 high|note:Catalogue strip: SOL · LTST · site · plan rev · data version · replay speed"><span>SOL ${pre ? '—' : N('sol', { chip: 'g', unit: false })}</span><span>LTST ${pre ? '—' : N(w.session === 'loaded' ? 'ltst_ph' : 'ltst_alert', { chip: 'g', unit: false })}</span><span>GALE / MT SHARP</span><span>PLAN REV ${pre ? '—' : N('plan_rev', { chip: 'g', unit: false })}</span><span>DATA ${T(FX.meta.data_version, 'derived', FX.meta.data_version_src)}</span><span>REPLAY ${pre ? '—' : N('speed', { chip: 'g' })}</span><span style="margin-left:auto">PROTOTYPE — ILLUSTRATIVE VALUES</span></div>`;
}
function crewCardOps(w, id) {
  const ev = w.evs[id], v = evv(w, id), unl = !ev.linked, st = unl ? ev.stale : false, sel = w.focus === id;
  const val = (k, o) => v ? N(k, Object.assign({ size: 22, chip: 'g', stale: st }, o)) : '<span class="num t3" data-provenance="derived" title="needs EVA start">—</span>';
  const sheltered = ev.act === 'sheltered';
  return `<section class="panel crewc cut cut-m ${unl ? 'stale dashed' : ''} ${sel ? 'sel' : ''}" aria-label="${id} crew card" data-ann="id:D.1 crew card|px:padding 12|note:ID, activity, haven, O₂, dose, link. Unlinked: dashed, grey, age. Click selects (map follows)"><i class="stripe"></i>
    <header class="ph-h"><span class="code">[ ${id} ]</span><span class="sp"></span><span class="act">${unl ? 'NO HAB LINK' : ACTW[ev.act] || ev.act}</span></header>
    <div class="pb"><div><span class="lbl">HAVEN</span><div class="mini-v">${sheltered ? status('nominal', { slot: 'crew', word: 'SHELTERED' }) : val(v && v.haven, { unitText: 'min' })}</div></div>
      <div><span class="lbl">O₂</span><div class="mini-v">${val(v && v.o2, { unitText: '%' })}</div></div>
      <div><span class="lbl">DOSE (EVENT)</span><div class="mini-v">${val(v && v.dose)}</div></div>
      <div><span class="lbl">LINK</span><div class="mini-v row" style="gap:6px">${unl ? status('caution', { slot: 'crew-link', word: 'NO LINK' }) : `${linkBars(true)}`}</div></div></div></section>`;
}
function vehCard(w, id) {
  const pr = id === 'PR1', stw = pr ? { parked: 'PARKED', enRoute: 'EN ROUTE', arrived: 'ARRIVED', returning: 'RETURNING', dispatched: 'DISPATCHED' }[w.veh.PR1] : 'PARKED';
  const eta = pr && (w.veh.PR1 === 'enRoute' || w.veh.PR1 === 'dispatched') ? N('eta_summon', { size: 20, chip: 'g' }) : '<span class="num t3" data-provenance="modelled" title="no ETA while parked">—</span>';
  return `<section class="panel cut cut-m ${pr ? '' : 'fill-raised'}" aria-label="${id} vehicle card"><i class="stripe"></i><header class="ph-h"><span class="code">[ ${id} ]</span><span class="mod">${pr ? 'PRESSURIZED' : 'UTILITY'}</span><span class="sp"></span>${pr ? '' : t2tag()}</header>
    <div class="pb" style="display:grid;grid-template-columns:auto 1fr 1fr;gap:6px 12px;align-items:center">${glyph(pr ? 'pr' : 'ur', 'ic" style="width:28px;height:28px')}
    <div><span class="lbl">STATE</span><div class="act" style="font:700 12px var(--f-mono)">${stw}</div></div><div><span class="lbl">ETA</span><div class="mini-v">${eta}</div></div>
    <span></span><div><span class="lbl">BATTERY</span><div class="mini-v">${pr ? '<span class="t3" style="font-size:12px">not modelled (02 §D.9)</span>' : N('ur_cap', { size: 18, chip: 'g' })}</div></div><span></span></div></section>`;
}
/* RAD dose-rate chart — SHAPE IS A PLACEHOLDER until U-15; axes carry ## ticks, no numbers are drawn */
function doseChart(w, W = 288, H = 118) {
  const cur = w.vals === 'nominal' || w.vals === 'pre' ? 0 : w.vals === 'alert' ? 0.42 : w.vals === 'enroute' ? 0.62 : 0.9;
  const pad = 26, x0 = pad, x1 = W - 8, y0 = 8, y1 = H - 22, px = f => x0 + (x1 - x0) * f, py = f => y1 - (y1 - y0) * f;
  const pts = [[0, .04], [.12, .05], [.3, .08], [.36, .2], [.42, .86], [.5, .62], [.6, .42], [.75, .24], [.9, .14], [1, .1]];
  const d = pts.map((p, i) => (i ? 'L' : 'M') + px(p[0]).toFixed(1) + ' ' + py(p[1]).toFixed(1)).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Replayed dose-rate chart; shape is a placeholder until U-15">
   <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="var(--hairline)"/>
   <path d="M${x0} ${py(.2)}H${x1}" stroke="var(--text-2)" stroke-dasharray="4 3"/><text x="${x0 + 4}" y="${py(.2) - 3}" fill="var(--text-2)" font-size="10" font-family="var(--f-mono)">10 × BACKGROUND (ASSUMED)</text>
   <path d="${d}" fill="none" stroke="var(--text-1)" stroke-width="2" stroke-dasharray="${w.vals === 'nominal' || w.vals === 'pre' ? '2 4' : '0'}" opacity="${w.vals === 'nominal' || w.vals === 'pre' ? .45 : 1}"/>
   ${cur ? `<path d="M${px(cur)} ${y0}V${y1}" stroke="var(--text-1)" stroke-width="1.5"/><path d="M${px(cur) - 5} ${y0}h10l-5 7Z" fill="var(--text-1)"/>` : ''}
   <text x="2" y="${y0 + 8}" fill="var(--text-3)" font-size="10" font-family="var(--f-mono)" text-decoration="underline dotted">##</text><text x="2" y="${y1}" fill="var(--text-3)" font-size="10" font-family="var(--f-mono)" text-decoration="underline dotted">##</text>
   <text x="${x0}" y="${H - 8}" fill="var(--text-3)" font-size="10" font-family="var(--f-mono)" text-decoration="underline dotted">##:##</text><text x="${x1}" y="${H - 8}" text-anchor="end" fill="var(--text-3)" font-size="10" font-family="var(--f-mono)" text-decoration="underline dotted">##:##</text></svg>`;
}
function condPanel(w) {
  const pre = w.session === 'noSession';
  return panel({ code: '[ HAB CORE /// CONDITIONS ]', cls: 'cut-m', ann: 'id:FR-36|note:Every value carries its provenance class; nothing is labelled live', body: `
    <div class="kv" style="grid-template-columns:96px 1fr"><span class="lbl">DOSE RATE</span>${pre ? '—' : N('rate_now', { chip: 'full', size: 16 })}<span class="lbl">BACKGROUND</span>${pre ? '—' : N('rate_bg', { chip: 'full', size: 16 })}<span class="lbl">SUN ELEV</span>${pre ? '—' : N('sun_elev', { chip: 'full', size: 16 })}<span class="lbl">EVENT TOTAL</span>${N('event_total', { chip: 'full', size: 16 })}</div>
    <div style="margin-top:6px">${doseChart(w)}</div><div class="t2" style="font-size:12px;margin-top:2px"><b class="t1">${esc(FX.dose_series.label)}</b> ${chip('replayed')}<br>${esc(FX.dose_series.shape_note)} Published total ≈ 8,100 µGy (01 FR-37).</div>` });
}
function earthPanel(w) {
  const e = w.earth, txt = e.fc === 'none' ? 'No forecast in queue' : e.fc === 'transit' ? 'Forecast in transit — waiting for relay pass' : 'Forecast delivered';
  return panel({ code: '[ ORBITAL /// EARTH LINK ]', ann: 'id:FR-43|note:Light time, next relay pass, queue. Simplified DTN model (02 §D.12)', body: `
    <div class="kv" style="grid-template-columns:96px 1fr"><span class="lbl">LIGHT TIME</span>${N('light_time', { size: 16, chip: 'full', unit: false })}<span class="lbl">NEXT PASS</span><span>MRO ${N('next_pass', { size: 16, chip: 'full' })}</span><span class="lbl">QUEUE</span><span>↑${N('q_up', { size: 16, chip: 'g', unit: false })} ↓${N('q_down', { size: 16, chip: 'g', unit: false })}</span><span class="lbl">FORECAST</span><span style="font-size:13px">${esc(txt)} ${e.fc === 'delivered' ? '(sent ' + N('earth_sent_ago', { size: 13, chip: 'g' }) + ' ago)' : ''}</span></div>` });
}
function optionsPanel(w, ctx) {
  const o = w.opt, on = o.state !== 'none', exec = o.state === 'executing';
  if (!on) return panel({ code: '[ HAB CORE /// OPTIONS ]', cls: 'fill-raised', body: '<span class="t3">No active alert — options appear here on a warning.</span>' });
  const op = FX.options.filter(x => !(o.noRdv && x.kind === 'VEHICLE_RENDEZVOUS'));
  const cards = o.state === 'computing' ? [1, 2, 3].map(() => '<div class="skel" style="height:54px;margin-bottom:6px"></div>').join('') : op.map(x => { const sel = o.sel === x.rank; return `<button class="opt cut cut-s ${sel ? 'sel' : ''}" data-act="setOpt" data-arg="${x.rank}" aria-pressed="${sel}" ${exec ? 'disabled' : ''} style="margin-bottom:6px"><span class="rk">${x.rank}</span><span><span class="okind">${esc(x.label)}</span><span class="odet"><span>dose ${N(x.dose, { chip: 'g', size: 12 })}</span><span>drops ${N(x.drops, { chip: 'g', size: 12, unit: false })}</span>${x.approval ? '<span class="tag">NEEDS OPS APPROVAL</span>' : ''}</span></span><span class="oeta">${N(x.eta, { chip: 'g', size: 26 })}</span></button>`; }).join('');
  const sel = o.sel, pend = sel === 3;
  const act = exec ? `<div class="cut cut-s fill-raised" style="padding:8px 10px"><span class="lbl">EXECUTING · OPTION ${o.sel}</span><div style="font:600 15px var(--f-ui)">${o.sel === 1 ? 'PR1 dispatched — ETA 14 min' : 'Abort to hab — walking now'}</div></div>` :
    o.state === 'superseded' ? `<div class="errtxt">${sicon('caution')}<span>Superseded — a newer alert is recomputing options</span></div>` :
      holdBtn({ key: `${ctx.fid}-ops-go`, wid: ctx.wid, fid: ctx.fid, size: 'tall', label: pend ? 'Approve option 3' : sel === 1 ? 'Dispatch PR1 for crew' : 'Abort crew to hab', icon: pend ? 'check' : sel === 1 ? 'pr' : 'hab', kind: pend ? '' : sel === 1 ? 'crit-c' : 'crit-w', act: pend ? 'approve' : sel === 1 ? 'summon' : 'abort', arg: String(sel), outcome: pend ? 'Approved — option 3' : sel === 1 ? 'PR1 dispatched — ETA 14 min' : 'Abort to hab — walking now', disabled: o.state === 'computing', reason: 'Computing options' });
  return `<section class="panel cut cut-m sel" id="opts" tabindex="-1" aria-label="Options" data-ann="id:SCR-14|note:Expands and takes focus on a warning (key O). Abort and rendezvous never need ops approval; only 'continue with skipped stops' does (03 SCR-14)"><i class="stripe"></i><header class="ph-h"><span class="code">[ HAB CORE /// OPTIONS ]</span><span class="sp"></span>${status('warning', { slot: 'options' })}</header>
   <div class="pb">${o.noRdv ? `<div class="errtxt" style="margin-bottom:6px">${sicon('caution')}<span>${esc(FX.reject.NO_RENDEZVOUS)}</span></div>` : ''}${cards}${act}</div></section>`;
}
function eventLog(w) {
  const rows = FX.log.slice(0, w.log);
  return `<section class="panel cut cut-m log" aria-label="Event log"><i class="stripe"></i><header class="ph-h"><span class="code">[ HAB CORE /// EVENT LOG ]</span><span class="sp"></span><span class="scroll-ct">${rows.length} / ${FX.log.length}</span></header>
   <div class="pb" style="padding:0;overflow:auto;max-height:84px">${rows.map(r => `<button class="logrow" data-act="jump" data-arg="${r.kind === 'ARRIVED_STOP' ? 'EV1' : 'alert'}"><span class="t">${N(r.t, { chip: false, unit: false })}</span><span class="t">${esc(r.actor)}</span><span>${esc(r.text)}</span>${chip(r.prov, 'g', r.src)}</button>`).join('') || '<span class="t3" style="padding:8px 12px;display:block">No events yet</span>'}</div></section>`;
}
function qrBlock(role, label) {
  let cells = ''; const sz = 21; for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) { const f = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13); const inner = f ? (x % 6 === 0 || y % 6 === 0 || x % 6 === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4) || (x >= 16 && x <= 18 && y >= 2 && y <= 4) || (x >= 2 && x <= 4 && y >= 16 && y <= 18)) : ((x * 7 + y * 13 + x * y) % 5 < 2); if (inner) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }
  return `<div class="col" style="align-items:center;gap:4px"><svg class="qr" viewBox="-1 -1 23 23" aria-label="Placeholder QR for ${esc(label)}"><rect x="-1" y="-1" width="23" height="23" fill="#fff"/><g fill="#000">${cells}</g></svg><span class="code">${label}</span><span class="micro" style="text-align:center">PLACEHOLDER — GET /api/join-qr?role=${esc(role)}</span></div>`;
}
function renderOps(w, ctx) {
  const W = ctx.W, H = ctx.H;
  if (W < 1024) return `<div class="notice1024"><span class="ttl">Use a larger screen</span><span class="t2" style="max-width:40ch;font-size:16px">The ops console needs at least 1024 px width (04 §F). Open it on the projector or a laptop.</span></div>`;
  const cls = W < 1280 ? 'w1024' : W < 1440 ? 'w1280' : '', s = w.session, noS = s === 'noSession', alerting = w.opt.state !== 'none' && s !== 'ended';
  const dis = noS || s === 'loaded' || s === 'ended';
  const soundBtn = `<span class="row" style="gap:6px">${btn(ico(w.muted ? 'mute' : 'vol') + (w.muted ? 'SOUND OFF' : 'SOUND ON'), { size: 'seg', act: 'mute', pressed: !w.muted, cls: w.muted ? 'on' : '', title: 'Mute toggle (04 §C.7)' })}</span>`;
  const top = `<div class="top"><span class="code" style="font-size:12px">${glyph('hab', 'ic" style="width:18px;height:18px;display:inline-block;vertical-align:-3px')} SCR-11 / OPS</span><span class="ttl">OPS · ${s === 'noSession' ? 'no session' : FX.scenario.scenario_id}</span>
    ${s === 'paused' || s === 'ended' ? `<span class="status" data-status="${s === 'paused' ? 'advisory' : 'nominal'}" data-slot="session">${sicon(s === 'paused' ? 'advisory' : 'nominal')}<span class="sword">${SESS_WORD[s]}</span></span>` : `<span class="micro t2" data-slot="session" style="color:var(--text-2)">${alerting && s === 'running' ? 'ALERTING' : SESS_WORD[s]}</span>`}<span class="sp"></span>${clockCtl(w, dis)}${soundBtn}</div>`;
  let left = '', right = '', centre = '';
  if (noS) {
    centre = `<div class="big-empty cgrid cut cut-m fill-bg" style="--fill:var(--bg)"><i class="reg" style="left:8px;top:8px"></i><i class="reg" style="right:8px;top:8px"></i><i class="reg" style="left:8px;bottom:8px"></i><i class="reg" style="right:8px;bottom:8px"></i>
      <span class="code">[ HAB CORE /// SESSION ]</span><span class="ttl">No session</span><span class="t2" style="max-width:44ch">Load a scenario to begin. The clock and every crew value stay empty until then.</span>
      <div class="cut cut-s fill-raised" style="padding:10px 14px;text-align:left"><span class="lbl">SCENARIO</span><div style="font:600 16px var(--f-ui)">${esc(FX.scenario.title)} <span class="code">${FX.scenario.scenario_id}</span></div><span class="t3" style="font-size:12px">data ${esc(FX.scenario.data_version)} · seed ${N(FX.scenario.seed, { chip: 'g', unit: false, size: 12 })}</span></div>${w.ui.err ? `<div class="cut cut-s" style="--fill:var(--panel);--line:var(--warning);padding:10px 14px;text-align:left;max-width:520px" role="alert"><div class="row">${status('warning', { slot: 'load', word: 'LOAD FAILED' })}</div><p style="font-size:13px;margin:6px 0">Scenario data_version <b class="mono">${esc(FX.scenario.data_version)}</b> does not match the loaded site <b class="mono">${esc(FX.site.data_version)}</b>. Rebuild the scenario (TASK-21).</p></div>` : ''}${btn('Load scenario', { act: 'loadScn', kind: 'primary', size: 'tall', icon: 'dl' })}</div>`;
    left = panel({ code: '[ HAB CORE /// CREW ]', cls: 'fill-raised', body: '<span class="t3">No crew until a scenario is loaded.</span>' });
    right = condPanel(w);
  } else {
    const mapSize = [Math.max(400, W - (W < 1280 ? 0 : W < 1440 ? 272 + 296 : 300 + 320) - 40), Math.max(300, H - 48 - 32 - 24 - 64 - 128 - 24)];
    const frame = alerting;
    const crew = ['EV1', 'EV2'].map(id => { const p = mkXY(w, id), ev = w.evs[id]; return { id, x: p.x, y: p.y, hdg: p.hdg, stale: !ev.linked ? ev.stale : null }; });
    const pr = mkXY(w, 'PR1'); const L = { comm: w.ui.comm !== false, haven: w.ui.haven !== false, pois: true };
    const vb = frame ? [210, 520, 520, 520 * mapSize[1] / mapSize[0]] : [120, 450, 640, 640 * mapSize[1] / mapSize[0]];
    const svg = mapSVG({ w: mapSize[0], h: mapSize[1], vb, L, route: 'ok', loop: s !== 'loaded', stops: STOPS.map(x => ({ n: x.n, x: x.p[0], y: x.p[1], code: x.code })), poiLabels: true, crew: s === 'loaded' ? [] : crew, veh: [{ id: 'PR1', x: pr.x, y: pr.y, state: w.veh.PR1 }], rdv: w.rdv, pr1Path: w.veh.PR1 !== 'parked' });
    centre = `<div class="mapbox cut cut-m" style="flex:1;min-height:0;--fill:var(--map-out)" data-ann="id:FR-42|token:route · text-1|note:Hab · route · EV chevrons · PR1 · comm shadow hatch · haven isochrones. SCHEMATIC">${svg}
      <div style="position:absolute;left:8px;top:8px;z-index:3;display:flex;gap:6px;flex-direction:column" class="legend">${tog('Comm shadow', L.comm, 'layerOps', { arg: 'comm' })}${tog('Haven bands', L.haven, 'layerOps', { arg: 'haven' })}</div>
      <div class="legend" style="position:absolute;left:8px;bottom:36px;z-index:3;background:var(--bg);border:1px solid var(--edge);padding:4px 8px;font:500 11px var(--f-mono)"><span><span class="sw hatch-c" style="color:var(--text-2)"></span>NO SIGNAL — line of sight only</span><span><span class="sw" style="background:repeating-linear-gradient(45deg,var(--caution) 0 2px,transparent 2px 6px)"></span>Beyond haven rule (${N('haven_rule', { chip: false, size: 11 })})</span></div>
      <div class="scalebar"><i style="width:${Math.round(40 * mapSize[0] / vb[2])}px"></i>${N('scale_bar', { chip: 'g', size: 11 })}</div><span class="north">N ↑</span><span class="maptag">SCHEMATIC — not real terrain</span>${s === 'loaded' ? `<div class="toast cut cut-s" style="top:auto;bottom:60px;left:auto;right:8px;transform:none">${sicon('advisory')}<span>Loaded — press START EVA</span></div>` : ''}</div>`;
    left = `<div class="col" style="gap:8px"><span class="mod" style="padding:0 2px">[ HAB CORE /// CREW ]</span>${crewCardOps(w, 'EV1')}${crewCardOps(w, 'EV2')}<span class="mod" style="padding:0 2px">VEHICLES</span>${vehCard(w, 'PR1')}${vehCard(w, 'UR1')}</div>`;
    if (s === 'loaded') {
      left += panel({ code: '[ HAB CORE /// JOIN ]', cls: 'fill-raised', body: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${qrBlock('planner', 'PLANNER')}${qrBlock('ops', 'OPS')}${qrBlock('eva:EV1', 'EV1')}${qrBlock('eva:EV2', 'EV2')}</div>` });
      right = `<div class="col" style="gap:8px">${panel({ code: '[ HAB CORE /// SCENARIO ]', body: `<div class="kv"><span class="lbl">ID</span><span>${FX.scenario.scenario_id}</span><span class="lbl">SEED</span>${N(FX.scenario.seed, { chip: 'g', unit: false })}<span class="lbl">START UTC</span><span>${T(FX.scenario.start_utc, 'assumed', FX.scenario.start_src)}</span><span class="lbl">CREW</span><span>EV1, EV2</span></div><div style="margin-top:10px">${btn('Start EVA', { act: 'startEva', kind: 'primary', size: 'tall', icon: 'play' })}</div>` })}${condPanel(w)}${earthPanel(w)}</div>`;
    } else if (s === 'ended') {
      right = `<div class="col" style="gap:8px">${panel({ code: '[ HAB CORE /// SESSION ENDED ]', body: `<span style="font-size:15px">All crew sheltered or in hab. The post-EVA report is ready.</span><div style="margin-top:10px">${btn('Open post-EVA report', { act: 'goto', data: { arg: 'scr-17' }, kind: 'primary', size: 'tall', icon: 'file' })}</div>` })}${condPanel(w)}${earthPanel(w)}</div>`;
    } else right = `<div class="col" style="gap:8px">${alerting ? optionsPanel(w, ctx) : ''}${condPanel(w)}${earthPanel(w)}${!alerting ? optionsPanel(w, ctx) : ''}</div>`;
  }
  const body = W < 1280 ? `<div class="main"><div class="colM">${centre}</div></div>` : `<div class="main"><div class="colL">${left}</div><div class="colM">${centre}</div><div class="colR">${right}</div></div>`;
  const drawerNote = W < 1280 ? `<div class="row" style="padding:4px 12px;gap:6px;background:var(--panel);border-bottom:1px solid var(--hairline)">${btn('Crew', { size: 'seg', act: 'drawer', data: { arg: 'L' }, cls: w.ui.dr === 'L' ? 'on' : '' })}${btn('Conditions', { size: 'seg', act: 'drawer', data: { arg: 'R' }, cls: w.ui.dr === 'R' ? 'on' : '' })}<span class="t3" style="font:500 11px var(--f-mono)">1024–1279: ONE DRAWER AT A TIME (04 §F)</span></div>` : '';
  let drawer = ''; if (W < 1280 && w.ui.dr) drawer = `<div style="position:absolute;z-index:7;top:${48 + 32 + 24 + 64 + 28}px;bottom:136px;${w.ui.dr === 'L' ? 'left' : 'right'}:8px;width:330px;overflow:auto;background:var(--bg);border:1px solid var(--edge);padding:8px">${w.ui.dr === 'L' ? left : right}</div>`;
  return `<div class="ops ${cls} ${!w.evs.EV1.linked ? 'unl' : ''}" data-ann="id:SCR-11|token:void · panel · hairline|note:OPS, ≥1280 projector. Keys: Space · 1/2/3 · N · K · O">${top}${phaseTimeline(w)}${metaStrip(w)}${alertSlot(w, { dev: 'ops' })}${drawerNote}${body}${eventLog(w)}${drawer}</div>`;
}
ACT.layerOps = (el, c) => { if (c.w) { c.w.ui[el.dataset.arg] = c.w.ui[el.dataset.arg] === false; touch(c.w); } };
ACT.drawer = (el, c) => { if (c.w) { c.w.ui.dr = c.w.ui.dr === el.dataset.arg ? null : el.dataset.arg; touch(c.w); } };
ACT.goto = (el) => { location.hash = '#' + el.dataset.arg; };
defScreen({ id: 'SCR-11', name: 'Ops console', route: '#/ops', mode: 'ops', tier: 'T1', frs: 'FR-30–38, 40, 42–46', states: [['noSession', 'No session'], ['loaded', 'Loaded'], ['running', 'Running'], ['paused', 'Paused'], ['alerting', 'Alerting'], ['ended', 'Ended']],
  sizes: ['proj', 'proj1280', 'proj1024', 'proj900'], preset: (w, s) => PRE[s](w), render: renderOps });
