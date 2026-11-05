'use strict';
/* ===== CORE: fixture access, escaping, glyph/icon library, provenance chips, status icons, N() ===== */
const FX = JSON.parse(document.getElementById('fixture').textContent);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const THIN = '\u2009';

/* ---- provenance (04 §C.1 chips; 01 provenance classes) ---- */
const PROV = {
  measured: { g: '<rect x="1.5" y="1.5" width="7" height="7" fill="currentColor"/>', label: 'MEASURED', ch: '■' },
  derived: { g: '<path d="M5 .6 9.4 5 5 9.4.6 5Z" fill="currentColor"/>', label: 'DERIVED', ch: '◆' },
  modelled: { g: '<circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.4"/>', label: 'MODELLED', ch: '○' },
  assumed: { g: '<path d="M5 1.2 9.2 8.8H.8Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="miter"/>', label: 'ASSUMED', ch: '△' },
  replayed: { g: '<path d="M2 1 9 5 2 9Z" fill="currentColor"/>', label: 'REPLAYED', ch: '▶' },
  simulated: { g: '<path d="M5 .8 9.2 5 5 9.2.8 5Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 1.3"/>', label: 'SIMULATED', ch: '◇' },
};
function chip(prov, mode, src) {
  const p = PROV[prov]; if (!p) return `<span class="chip" data-prov="?">?</span>`;
  const t = esc(`${p.label}${src ? ' — ' + src : ''}`);
  return `<span class="chip ${mode === 'g' ? 'g' : ''}" data-prov="${prov}" title="${t}" ${src ? `data-src="${esc(src)}"` : ''}><svg viewBox="0 0 10 10" aria-hidden="true">${p.g}</svg>${mode === 'g' ? `<span class="sr">${p.label}</span>` : p.label}</span>`;
}

/* ---- numbers: every displayed value is a fixture num {v, unit, prov, src} (FR-15) ---- */
function numOf(key) { const n = FX.nums[key]; if (!n) { console.error('missing num', key); } return n; }
function fmtV(n) {
  if (n.v === null || n.v === undefined) return n.fmt || '##.#';
  if (typeof n.v === 'string') return n.v;
  let s = n.disp !== undefined ? String(n.disp) : String(n.v);
  if (n.v < 0) s = '\u2212' + s.replace('-', '');
  const m = s.match(/^(\u2212?)(\d+)(.*)$/);
  if (m && m[2].length > 3 && !['sol', 'seq', 'seed', 'rev'].includes(n.unit)) s = m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + m[3];
  return s;
}
const NOSPACE_UNITS = new Set(['°', '°E', '×', '%']);
function N(key, o = {}) {
  const n = typeof key === 'string' ? numOf(key) : key;
  if (!n) return `<span class="val ph" data-provenance="unknown">⚠ ${esc(key)}</span>`;
  const isPh = n.v === null || n.v === undefined;
  const cls = ['val', isPh ? 'ph' : '', (o.stale || o.grey) ? 'stale' : '', o.loading ? 'loading' : '', o.cls || ''].filter(Boolean).join(' ');
  const style = o.size ? ` style="font-size:${o.size}px"` : '';
  const showUnit = o.unit !== false && n.unit && !['hash', 'sha256', 'fraction', 'seq', 'seed', 'rev', 'sol', 'LTST', 'h:mm', 'm:ss', 'mm:ss', 'HH:MM', 'bars', 'msg', 'MY', 'stops', 'missions', 'types', 'LOS 0/1', 'factor'].includes(n.unit) || o.unit === true;
  const unitTxt = o.unitText || n.unit;
  const unit = showUnit && !(n.v === null && o.hideUnitPh) ? `<span class="unit">${NOSPACE_UNITS.has(unitTxt) ? '' : THIN}${esc(unitTxt)}</span>` : '';
  const chipHtml = o.chip === false ? '' : chip(n.prov, o.chip === 'g' ? 'g' : (o.chip || 'g'), n.src);
  const age = o.stale ? `<span class="age">${esc(o.stale === true ? '0:42' : o.stale)}</span>` : '';
  const title = isPh ? `PLACEHOLDER — unblocked by ${n.unblocks || 'TBD'}` : `${n.prov} — ${n.src}`;
  return `<span class="${cls}"${style} data-provenance="${n.prov}" data-num="${typeof key === 'string' ? key : ''}" data-src="${esc(n.src)}"${isPh ? ' data-placeholder="1"' : ''} title="${esc(title)}"><span class="num">${esc(o.prefix || '')}${esc(fmtV(n))}</span>${unit}${age}${chipHtml}</span>`;
}
/* Number-free textual value that still needs a provenance class (strings like versions) */
function T(text, prov, src, o = {}) {
  return `<span class="val ${o.cls || ''}" data-provenance="${prov}" data-src="${esc(src || '')}"><span class="num">${esc(text)}</span>${o.chip === false ? '' : chip(prov, 'g', src)}</span>`;
}
/* Placeholder text (non-numeric): dotted underline, same audit rules */
function PH(text, unblocks, prov = 'assumed') {
  return `<span class="val ph" data-provenance="${prov}" data-placeholder="1" title="PLACEHOLDER — unblocked by ${esc(unblocks)}"><span class="num">${esc(text)}</span></span>`;
}

/* ---- status icon: shape + pattern + glyph (04 §C.1, §G <status-icon level>) ---- */
const LEVELS = {
  nominal: { word: 'NOMINAL', shape: 'circle', pat: 'solid' },
  caution: { word: 'CAUTION', shape: 'tri', pat: 'diag' },
  warning: { word: 'WARNING', shape: 'oct', pat: 'cross' },
  advisory: { word: 'ADVISORY', shape: 'dia', pat: 'dots' },
  unknown: { word: 'UNKNOWN', shape: 'dia', pat: 'dots' },
};
const SHAPES = {
  circle: '<circle cx="10" cy="10" r="8.2"/>',
  tri: '<path d="M10 2 18.6 17.6H1.4Z"/>',
  oct: '<path d="M6.2 1.6h7.6l4.6 4.6v7.6l-4.6 4.6H6.2l-4.6-4.6V6.2Z"/>',
  dia: '<path d="M10 1.4 18.6 10 10 18.6 1.4 10Z"/>',
};
const HATCH = {
  solid: '', diag: '<g stroke="currentColor" stroke-width="1.2" stroke-opacity=".55"><path d="M0 8 8 0M0 14 14 0M0 20 20 0M6 20 20 6M12 20 20 12"/></g>',
  cross: '<g stroke="currentColor" stroke-width="1.1" stroke-opacity=".6"><path d="M0 8 8 0M0 14 14 0M0 20 20 0M6 20 20 6M12 20 20 12M12 0 0 12M20 0 0 20M20 6 6 20M20 12 12 20M8 0 0 8"/></g>',
  dots: '<g fill="currentColor" fill-opacity=".7"><circle cx="6" cy="6" r=".9"/><circle cx="10" cy="4" r=".9"/><circle cx="14" cy="6" r=".9"/><circle cx="4" cy="10" r=".9"/><circle cx="16" cy="10" r=".9"/><circle cx="6" cy="14" r=".9"/><circle cx="14" cy="14" r=".9"/><circle cx="10" cy="16" r=".9"/></g>',
};
const SYM = {
  nominal: '<path d="M5.6 10.4 8.7 13.4 14.6 7" />',
  caution: '<path d="M10 7.6v4.4M10 14.1v.1" />', warning: '<path d="M10 5.6v5.6M10 13.8v.1" />',
  advisory: '<path d="M10 9v5M10 6.2v.1" />', unknown: '<path d="M8 7.9c0-1.2.9-2 2.1-2s2 .8 2 1.8c0 1.8-2.1 1.7-2.1 3.5M10 14.2v.1" />',
};
function sicon(level, cls = '') {
  const L = LEVELS[level] || LEVELS.unknown;
  const fillSolid = L.pat === 'solid';
  return `<svg class="sicon ${cls}" viewBox="0 0 20 20" aria-hidden="true">
    <g class="sh-wrap"><g class="pt" ${fillSolid ? 'style="fill-opacity:1"' : 'style="fill-opacity:.0"'}>${SHAPES[L.shape].replace('<', '<')}</g>
    <g class="sh">${SHAPES[L.shape]}</g></g>
    ${fillSolid ? '' : `<g clip-path="url(#cp-${L.shape})">${HATCH[L.pat]}</g>`}
    <g class="sy" style="stroke:var(--halo,var(--bg));stroke-width:4;paint-order:stroke">${SYM[level] || SYM.unknown}</g>
    <g class="sy" style="stroke:${fillSolid ? 'var(--halo,var(--bg))' : 'currentColor'}">${SYM[level] || SYM.unknown}</g></svg>`;
}
/* status = colour + shape + word + fixed position (slot is the screen region name) */
function status(level, o = {}) {
  const L = LEVELS[level] || LEVELS.unknown;
  return `<span class="status" data-status="${level}" data-slot="${esc(o.slot || 'inline')}">${sicon(level)}<span class="sword">${esc(o.word || L.word)}</span>${o.extra ? `<span class="t3" style="font-weight:500;letter-spacing:0;text-transform:none;font-family:var(--f-ui)">${esc(o.extra)}</span>` : ''}</span>`;
}

/* ---- UI icons: own 24px set, 1.5px stroke, square caps (Lucide is the product set — licence U-27) ---- */
const ICONS = {
  play: '<path d="M7 5v14l11-7Z"/>', pause: '<path d="M8 5v14M16 5v14"/>', next: '<path d="M6 5v14l9-7ZM18 5v14"/>',
  vol: '<path d="M4 9v6h4l5 4V5L8 9ZM16 9.5c1.3 1.3 1.3 3.7 0 5M18.5 7c2.6 2.6 2.6 7.4 0 10"/>', mute: '<path d="M4 9v6h4l5 4V5L8 9ZM17 9l5 6M22 9l-5 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', check: '<path d="M5 12.5 10 17.5 19 7"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>', right: '<path d="M5 12h14M13 6l6 6-6 6"/>', left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  layers: '<path d="M12 3 2.5 8 12 13l9.5-5ZM2.5 12.5 12 17.5l9.5-5M2.5 16.5 12 21.5l9.5-5"/>', list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7Z"/>', dl: '<path d="M12 3v12M6 10l6 6 6-6M4 20h16"/>', ul: '<path d="M12 16V4M6 9l6-6 6 6M4 20h16"/>',
  pin: '<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12ZM12 6.5v5M9.5 9h5"/>', undo: '<path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3" transform="translate(0 -3)"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>', rot: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4"/>',
  hc: '<path d="M12 3a9 9 0 1 0 0 18ZM12 3a9 9 0 0 1 0 18"/>', hud: '<path d="M3 6h18v12H3ZM7 10h4M7 14h6M16 10h1"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 9v6M9 12h6"/>',
  qr: '<path d="M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h3v3h-3ZM20 14v7h-3M14 20h3"/>', alert: '<path d="M12 3 2.5 20h19ZM12 10v5M12 17.5v.1"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', home: '<path d="M3 11 12 3l9 8M5 10v11h14V10"/>',
  pen: '<path d="M4 20l1-5L16 4l4 4L9 19Z"/>', file: '<path d="M6 3h8l4 4v14H6ZM14 3v4h4M9 12h6M9 16h6"/>', info: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v6M12 7.5v.1"/>',
  ruler: '<path d="M3 17 17 3l4 4L7 21ZM8 12l2 2M11 9l2 2M14 6l2 2"/>', fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', hand: '<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-2 7-6 7-3 0-4-1.5-6-4l-1.5-2.5a1.5 1.5 0 0 1 2.5-1.5L8 15"/>',
};
function ico(name, cls = 'ic') { if (!ICONS[name] && (GLYPHS[name] !== undefined || name === 'rad')) return glyph(name, cls); return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${ICONS[name] || ''}</svg>`; }

/* ---- custom glyphs (04 §C.4): hab, pressurized rover, utility rover, crew chevron, antenna/no-signal, radiation, relay pass, Earth link ---- */
function trefoil() {
  const R = 9.5, r = 3.2, cx = 12, cy = 12, out = [];
  for (const mid of [90, 210, 330]) {
    const a0 = (mid - 30) * Math.PI / 180, a1 = (mid + 30) * Math.PI / 180, P = (rr, a) => `${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy - rr * Math.sin(a)).toFixed(2)}`;
    out.push(`M${P(r, a0)} L${P(R, a0)} A${R} ${R} 0 0 0 ${P(R, a1)} L${P(r, a1)} A${r} ${r} 0 0 1 ${P(r, a0)}Z`);
  }
  return `<path d="${out.join('')}" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>`;
}
const GLYPHS = {
  hab: '<path d="M4 4h12l4 4v12H8l-4-4ZM12 4V1M10 1h4M9 20v-5h6v5"/>',
  pr: '<path d="M3 17V9l3-3h9l3 3 3 2v6ZM6 9h4v3H6ZM13 9h3l2 3h-5ZM3 17h18M7 20a1.5 1.5 0 1 0 .01 0M17 20a1.5 1.5 0 1 0 .01 0"/>',
  ur: '<path d="M4 15h13V9H4ZM17 11l4-5M21 6h-3M7 18.5a1.5 1.5 0 1 0 .01 0M14 18.5a1.5 1.5 0 1 0 .01 0M4 15v1.5h13V15"/>',
  chev: '<path d="M12 2.5 19 21l-7-4.3L5 21Z"/>',
  ant: '<path d="M12 21V9M8 21h8M12 9l-3-5h6ZM5 6a8 8 0 0 0 0 7M19 6a8 8 0 0 1 0 7"/>',
  noant: '<path d="M12 21V9M8 21h8M12 9l-3-5h6ZM5 6a8 8 0 0 0 0 7M19 6a8 8 0 0 1 0 7M3 3l18 18"/>',
  rad: null,
  relay: '<path d="M3 17c3-8 15-8 18 0M10 8h4v4h-4ZM12 12v5M8 20h8"/>',
  earth: '<circle cx="12" cy="12" r="5.5"/><path d="M6.5 12h11M12 6.5c-2 2.5-2 8.5 0 11M12 6.5c2 2.5 2 8.5 0 11M3 5l3 2M21 5l-3 2M3 19l3-2"/>',
};
function glyph(name, cls = 'ic') {
  const body = name === 'rad' ? trefoil() : GLYPHS[name];
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${body}</svg>`;
}
const GLYPH_NAMES = [['hab', 'Habitat'], ['pr', 'Pressurized rover'], ['ur', 'Utility rover'], ['chev', 'Crew chevron'], ['ant', 'Antenna'], ['noant', 'No signal'], ['rad', 'Radiation'], ['relay', 'Relay pass'], ['earth', 'Earth link']];

/* ---- helpers ---- */
const cls = (...a) => a.filter(Boolean).join(' ');
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const lc = s => String(s || '').toLowerCase();
const wait = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const RM = () => document.documentElement.dataset.rm === '1';

/* typographic apostrophes in text people read (host rule); code, pre, monospace and inputs are left as typed */
function typo(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { if (!/\w'\w/.test(n.nodeValue)) continue; const p = n.parentElement; if (!p || p.closest('pre,code,textarea,input,script,style,.mono')) continue; n.nodeValue = n.nodeValue.replace(/(\w)'(\w)/g, '$1\u2019$2'); }
}
