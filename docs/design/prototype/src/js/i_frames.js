'use strict';
/* ===== FRAMES: screen registry, device frames (04 §F), scaling, review overlays ===== */
const SCREENS = {};
function defScreen(o) { SCREENS[o.id] = o; }
const DEV = {
  proj: { w: 1440, h: 900, n: 'Projector 1440×900' }, proj1280: { w: 1280, h: 800, n: 'Breakpoint 1280×800' }, proj1024: { w: 1024, h: 768, n: 'Breakpoint 1024×768 (one drawer)' }, proj900: { w: 900, h: 640, n: 'Below 1024: notice' },
  evaPhoneL: { w: 844, h: 390, n: 'Phone landscape 844×390', o: 'landscape' }, evaTabL: { w: 1024, h: 768, n: 'Tablet landscape 1024×768', o: 'landscape' },
  evaPhoneP: { w: 390, h: 844, n: 'Phone portrait 390×844', o: 'portrait' }, evaTabP: { w: 768, h: 1024, n: 'Tablet portrait 768×1024', o: 'portrait' },
  hud: { w: 844, h: 390, n: 'HUD landscape 844×390' }, a4: { w: 794, h: 1123, n: 'A4 portrait (PRINT)' },
  b360: { w: 360, h: 780, n: 'BRIEF fluid 360' }, b768: { w: 768, h: 1000, n: 'BRIEF fluid 768' }, b1440: { w: 1440, h: 900, n: 'BRIEF fluid 1440' },
};
const DEVSWAP = { evaPhoneL: 'evaPhoneP', evaPhoneP: 'evaPhoneL', evaTabL: 'evaTabP', evaTabP: 'evaTabL' };
const UI = { ann: false, gray: false, rm: false, ph: false, zoom: 'fit' };
let FSEQ = 0;

function fhost(spec) { return `<div class="fhost" data-spec="${esc(JSON.stringify(spec))}"></div>`; }
function mountHosts(root) { $$('.fhost', root).forEach(h => { if (!h.dataset.mounted) { h.dataset.mounted = '1'; mountFrame(h, JSON.parse(h.dataset.spec)); } }); }
function destroyFrames(root) { $$('[data-fw]', root).forEach(el => { const fr = FRAMES[el.dataset.fw]; if (fr) { WORLDS[fr.wid] && WORLDS[fr.wid].subs.delete(fr.req); delete FRAMES[fr.fid]; } }); }

function mountFrame(host, spec) {
  const fid = 'f' + (++FSEQ), S0 = SCREENS[spec.screen]; if (!S0) { host.textContent = 'Unknown screen ' + spec.screen; return; }
  const wid = spec.wid || fid; let w = WORLDS[wid];
  if (!w) { w = newWorld(wid); const dv = DEV[spec.dev || S0.sizes[0]]; w.orient = dv.o || 'landscape'; if (spec.state && S0.preset) S0.preset(w, spec.state); if (spec.init) spec.init(w); }
  const fr = { fid, wid, screenId: spec.screen, state: spec.state, devKey: spec.dev || S0.sizes[0], ev: spec.ev || 'EV1', noCaption: !!spec.noCaption, noSwitcher: !!spec.noSwitcher, k: 1, pending: false, compact: !!spec.compact, cell: !!spec.cell, quad: !!spec.quad };
  fr.label = spec.label || null; FRAMES[fid] = fr;
  const wrap = document.createElement('figure'); wrap.className = 'fwrap'; wrap.dataset.fw = fid; host.replaceWith(wrap); fr.wrap = wrap;
  wrap.innerHTML = `<figcaption class="fcap"></figcaption><div class="fscale"><div class="fframe frame" data-fid="${fid}"></div></div><div class="ann-list" hidden></div>`;
  fr.cap = $('.fcap', wrap); fr.box = $('.fscale', wrap); fr.el = $('.fframe', wrap); fr.annList = $('.ann-list', wrap);
  fr.S = () => SCREENS[fr.screenId]; fr.dev = () => DEV[fr.devKey]; fr.orient = () => (fr.dev().o || (fr.dev().w >= fr.dev().h ? 'landscape' : 'portrait'));
  fr.req = () => { if (fr._raf) return; fr._raf = requestAnimationFrame(() => { fr._raf = 0; fr.render(); }); };
  w.subs.add(fr.req); w.frames = (w.frames || 0) + 1;
  fr.setOrient = o => { const d = fr.dev(); if (d.o && d.o !== o && DEVSWAP[fr.devKey]) { fr.devKey = DEVSWAP[fr.devKey]; WORLDS[fr.wid].orient = o; fr.applySize(); fr.drawCaption(); fr.render(); fr.fit(); } };
  fr.setState = s => { fr.state = s; const w = WORLDS[fr.wid]; resetFrameWorld(w, fr); const S = fr.S(); if (S.preset) S.preset(w, s); fr.drawCaption(); touch(w); startTween(w); location.hash.startsWith('#scr-') && ROUTER.syncHash && ROUTER.syncHash(fr); };
  fr.switchTo = id => { const S = SCREENS[id]; if (!S) return; const w = WORLDS[fr.wid]; fr.screenId = id; if (!S.sizes.includes(fr.devKey)) { fr.devKey = S.sizes[0]; } w.ui = {}; if (id === 'SCR-15') { w.rover = 'choosing'; } fr.applySize(); fr.drawCaption(); fr.render(); fr.fit(); };
  fr.applySize = () => { const d = fr.dev(); fr.el.style.width = d.w + 'px'; fr.el.style.height = d.h + 'px'; };
  fr.fit = () => {
    const d = fr.dev(), mainEl = document.getElementById('main'), avail = fr.cell ? Math.max(120, fr.wrap.parentElement.clientWidth) : Math.max(280, (mainEl ? mainEl.clientWidth - 52 : 1000)); const k = UI.zoom === '100' ? 1 : Math.min(1, avail / d.w);
    fr.k = k; fr.el.style.transform = `scale(${k})`; fr.box.style.width = d.w * k + 'px'; fr.box.style.height = d.h * k + 'px';
  };
  fr.drawCaption = () => {
    const S = fr.S(), d = fr.dev(), w = WORLDS[fr.wid]; if (fr.noCaption) { fr.cap.style.display = 'none'; return; }
    if (fr.compact) { const ori = S.orientToggle ? ['portrait', 'landscape'].map(o => `<button class="shellbtn" data-fa="orient" data-fid="${fr.fid}" data-arg="${o}" aria-pressed="${fr.orient() === o}" style="${fr.orient() === o ? 'background:#ECEFF2;color:#0B0D10' : ''}">${o === 'portrait' ? 'PORTRAIT' : 'LANDSCAPE'}</button>`).join('') : ''; const hc = S.ev ? `<button class="shellbtn" data-fa="hc" data-fid="${fr.fid}" aria-pressed="${!!w.hc}">HC</button>` : ''; fr.cap.innerHTML = `<b>${S.id}</b><span>${esc(fr.label || S.name)}</span>${ori}${hc}<span class="badge"><b>PROTOTYPE — illustrative values</b></span>`; return; }
    const st = S.states && S.states.find(x => x[0] === fr.state);
    const sw = (!fr.noSwitcher && S.states && S.states.length > 1) ? `<span class="row" style="gap:4px;flex-wrap:wrap" role="group" aria-label="State switcher">${S.states.map(([k, l]) => `<button class="shellbtn ${k === fr.state ? 'on' : ''}" data-fa="state" data-fid="${fr.fid}" data-arg="${k}" aria-pressed="${k === fr.state}">${esc(l)}</button>`).join('')}</span>` : '';
    const ori = S.orientToggle ? `<span class="row" style="gap:4px" role="group" aria-label="Orientation">${['portrait', 'landscape'].map(o => `<button class="shellbtn ${fr.orient() === o ? 'on' : ''}" data-fa="orient" data-fid="${fr.fid}" data-arg="${o}" aria-pressed="${fr.orient() === o}">${o.toUpperCase()}</button>`).join('')}</span>` : '';
    const tog2 = S.ev ? `<button class="shellbtn" data-fa="hc" data-fid="${fr.fid}" aria-pressed="${!!w.hc}" title="EVA high-contrast toggle (04 §F Glare)">HIGH CONTRAST</button><button class="shellbtn" data-fa="tapc" data-fid="${fr.fid}" aria-pressed="${!!w.tapConfirm}" title="Accessibility fallback: tap, then Confirm for 5 s (04 §D.3)">TAP→CONFIRM</button>` : '';
    fr.cap.innerHTML = `<b>${S.id}</b><span>${esc(S.name)}${st ? ' · <b>' + esc(st[1]) + '</b>' : ''}</span><span class="badge">${esc(d.n)}</span><span class="badge">${S.mode.toUpperCase()}</span>${S.tier === 'T2' ? '<span class="badge" style="border-style:dashed"><b>T2 SCOPE</b></span>' : ''}<span class="badge"><b>PROTOTYPE — illustrative values</b></span>${ori}${tog2}${sw}`;
  };
  fr.render = () => {
    if (!fr.el.isConnected) return; if (holdActive(fr.fid)) { fr.pending = true; return; }
    const S = fr.S(), w = WORLDS[fr.wid], d = fr.dev(), mode = S.modeOf ? S.modeOf(w) : S.mode;
    fr.el.dataset.mode = mode; fr.el.dataset.hc = (w.hc && mode === 'ops') ? '1' : '0';
    const ctx = { fid: fr.fid, wid: fr.wid, W: d.w, H: d.h, orient: fr.orient(), ev: fr.ev, dev: fr.devKey };
    let html; try { html = S.render(w, ctx); } catch (e) { console.error(e); html = `<pre style="padding:16px;color:#f66;white-space:pre-wrap">${esc(S.id + ' render error: ' + e.stack)}</pre>`; }
    const flag = (['SCR-12', 'SCR-13', 'SCR-14', 'SCR-11', 'SCR-02', 'SCR-03', 'SCR-04', 'SCR-05', 'SCR-06', 'SCR-07', 'SCR-15', 'SCR-16', 'SCR-18', 'SCR-00'].includes(S.id)) ? '' : `<div class="protoflag">PROTOTYPE — illustrative values</div>`;
    const t2 = '';
    fr.el.innerHTML = html + (mode === 'print' ? '' : alertListPanel(w)) + flag + t2 + (fr.quad ? '<div style="position:absolute;inset:0;z-index:40;pointer-events:none"><i style="position:absolute;left:50%;top:0;bottom:0;border-left:1px dashed #FF3DF5"></i><i style="position:absolute;top:50%;left:0;right:0;border-top:1px dashed #FF3DF5"></i></div>' : '');
    typo(fr.el); layoutHolds(fr.el); if (w.focus === 'alert') { const o = $('#opts', fr.el); if (o && !fr._focused) { fr._focused = true; } } else fr._focused = false;
    if (UI.ann) annotate(fr); if (S.after) S.after(fr, w);
    fr.pending = false;
  };
  fr.applySize(); fr.drawCaption(); fr.render(); fr.fit(); startTween(w);
  return fr;
}
function resetFrameWorld(w, fr) { w.hold = {}; w.toast = null; w.ui = {}; }

/* ---- caption controls ---- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-fa]'); if (!b) return; const fr = FRAMES[b.dataset.fid]; if (!fr) return; const a = b.dataset.fa;
  if (a === 'state') fr.setState(b.dataset.arg); else if (a === 'orient') fr.setOrient(b.dataset.arg);
  else if (a === 'hc') { const w = WORLDS[fr.wid]; w.hc = !w.hc; fr.drawCaption(); touch(w); } else if (a === 'tapc') { const w = WORLDS[fr.wid]; w.tapConfirm = !w.tapConfirm; fr.drawCaption(); touch(w); }
});
function fitAll() { Object.values(FRAMES).forEach(f => f.fit && f.fit()); }
new ResizeObserver(() => fitAll()).observe(document.body);

/* ---- annotations overlay (redlines): token names, px, SCR/FR ids, aria roles, behaviour — read from data-ann and measured from the DOM ---- */
function annotate(fr) {
  const k = fr.k || 1, root = fr.el, fb = root.getBoundingClientRect(); $$('.ann-ov', root).forEach(n => n.remove());
  const ov = document.createElement('div'); ov.className = 'ann-ov'; const items = [];
  $$('[data-ann]', root).forEach((el, i) => {
    const r = el.getBoundingClientRect(); if (r.width < 4) return; const x = (r.left - fb.left) / k, y = (r.top - fb.top) / k, wpx = r.width / k, hpx = r.height / k, cs = getComputedStyle(el);
    const parts = {}; String(el.dataset.ann).split('|').forEach(p => { const j = p.indexOf(':'); if (j > 0) parts[p.slice(0, j)] = p.slice(j + 1); });
    const aria = [el.getAttribute('role') && 'role=' + el.getAttribute('role'), el.getAttribute('aria-live') && 'aria-live=' + el.getAttribute('aria-live'), el.getAttribute('aria-label') && 'aria-label="' + el.getAttribute('aria-label') + '"'].filter(Boolean).join(' ');
    const n = items.length + 1; items.push({ n, id: parts.id || '', wh: `${Math.round(wpx)}×${Math.round(hpx)} px`, pad: `pad ${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`, gap: cs.gap && cs.gap !== 'normal' ? 'gap ' + cs.gap : '', font: `${cs.fontFamily.split(',')[0].replace(/"/g, '')} ${Math.round(parseFloat(cs.fontSize))}px/${cs.fontWeight}`, token: parts.token || '', aria: aria || parts.aria || '', note: parts.note || '', px: parts.px || '' });
    const b = document.createElement('div'); b.className = 'ann-box'; b.style.cssText = `left:${x}px;top:${y}px;width:${wpx}px;height:${hpx}px`; b.innerHTML = `<span class="ann-n">${n}</span>`; ov.appendChild(b);
  });
  root.appendChild(ov);
  fr.annList.hidden = false; fr.annList.innerHTML = items.map(a => `<div><b>${a.n}</b> ${esc(a.id)} · ${a.wh} · ${esc(a.pad)} ${esc(a.gap)} · ${esc(a.font)}${a.px ? ' · ' + esc(a.px) : ''}${a.token ? ' · token: ' + esc(a.token) : ''}${a.aria ? ' · ' + esc(a.aria) : ''}${a.note ? '<br><span style="color:#A9B3BE">' + esc(a.note) + '</span>' : ''}</div>`).join('') || '<div>No annotated elements in this state</div>';
}
function refreshReview() {
  const r = document.documentElement; r.dataset.rm = UI.rm ? '1' : '0'; r.dataset.gray = UI.gray ? '1' : '0'; r.dataset.ph = UI.ph ? '1' : '0';
  Object.values(FRAMES).forEach(f => { if (!UI.ann) { $$('.ann-ov', f.el).forEach(n => n.remove()); f.annList.hidden = true; } else annotate(f); });
  auditAll();
}
/* ---- audits: FR-15 provenance on every value; §F.1 four cues per status; placeholder count ---- */
function auditAll() {
  const roots = Array.from(new Set(Object.keys(FRAMES).map(i => FRAMES[i].el).concat($$('#main .frame')))).filter(e => e.isConnected);
  let nums = 0, noProv = 0, ph = 0, st = 0, stBad = 0; const bad = [];
  roots.forEach(r => {
    $$('.val', r).forEach(v => { nums++; if (!v.dataset.provenance) { noProv++; } if (v.dataset.placeholder) ph++; });
    $$('[data-status]', r).forEach(s => { st++; const hasWord = (s.textContent || '').trim().length > 1 || s.querySelector('.sword'); const hasShape = s.querySelector('.sicon') || s.classList.contains('alertbar') || s.classList.contains('halert'); const hasSlot = s.dataset.slot; if (!(hasWord && hasShape && hasSlot)) { stBad++; bad.push(s.dataset.status); } });
  });
  const set = (id, t, ok) => { const e = $('#' + id); if (e) { e.innerHTML = t; e.dataset.ok = ok; } };
  set('aud-prov', `PROVENANCE <b>${nums - noProv}/${nums}</b>`, noProv === 0); set('aud-stat', `4 CUES <b>${st - stBad}/${st}</b>`, stBad === 0); set('aud-ph', `PLACEHOLDERS <b>${ph}</b>`, true);
  return { nums, noProv, ph, st, stBad };
}
