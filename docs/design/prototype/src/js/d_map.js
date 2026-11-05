'use strict';
/* ===== SCHEMATIC MAP (SCHEMATIC — not real terrain). Drawing constants are NOT data.
   World = 1200 × 1200 svg units, north-up, 1 unit = 5 m (the 05 §F.1 routing grid). AOI ±3000 m (illustrative until TASK-01).
   Layers derive from ONE synthetic height field so slope, shadow and isochrones agree with the relief. ===== */
const MAP = { U: 1200, GN: 150, CS: 8, M: 40, built: null };
const SCH = {   // schematic anchor points in svg units (positions only; derived loosely from spec figures: stop 2→3 = 0.42 km at 040°, hab at 05 §F.1 default_start)
  hab: [240, 900], s1: [372, 812], s2: [600, 640], s3: [654, 576], rdv: [475, 735], scarp: [1196, 1120], near: [1181, 1082],
};
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function buildTerrain(P = {}) {
  const PC = Object.assign({ c: 0, lin: 0.06, A1: 20, A2: 12, gully: 34, ms: 150, gx: 520, gy: 690, gsx: 55, gsy: 34 }, P);
  const { GN, CS } = MAP, rnd = mulberry(4190), L = 17, lat = []; for (let i = 0; i < L * L; i++) lat.push(rnd());
  const sm = t => t * t * (3 - 2 * t);
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi); const g = (a, b) => lat[((b % L + L) % L) * L + ((a % L + L) % L)]; return (g(xi, yi) * (1 - fx) + g(xi + 1, yi) * fx) * (1 - fy) + (g(xi, yi + 1) * (1 - fx) + g(xi + 1, yi + 1) * fx) * fy; };
  const segd = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1); const px = a[0] + t * dx - x, py = a[1] + t * dy - y; return Math.hypot(px, py); };
  const RIDGES = [  // [a, b, amplitude m, sigma units]
    [[345, 760], [440, 805], PC.A1, 10], [[560, 560], [700, 470], PC.A2, 10], [[690, 585], [790, 540], 14, 9], [[470, 640], [530, 600], 10, 8],
    [[900, 300], [1100, 380], 34, 14], [[160, 560], [330, 520], 18, 14], [[860, 800], [1050, 720], 30, 12], [[600, 1000], [900, 900], 22, 14]];
  function H(x, y) {
    const u = x / 1200, v = 1 - y / 1200, ax = Math.max((x - 240) * 0.6 + (900 - y) * 0.8, -160);
    let s = clamp((0.5 * u + 0.8 * v - 0.5) / 0.6, 0, 1); let h = PC.lin * 5 * ax + PC.c * Math.max(ax, 0) ** 2 * 5 + PC.ms * s * s;   // regional tilt toward Mount Sharp + the mountain's rise
    h += 12 * (vn(x / 110, y / 110) - .5) + 5 * (vn(x / 42 + 3, y / 42 + 5) - .5);
    for (const [a, b, A, sg] of RIDGES) { const d = segd(x, y, a, b); h += A * Math.exp(-d * d / (2 * sg * sg)); }
    h -= PC.gully * Math.exp(-(((x - PC.gx) / PC.gsx) ** 2 + ((y - PC.gy) / PC.gsy) ** 2));   // small gully behind the first ridge (comm-shadow pocket)
    const d = segd(x, y, [1060, 1200], [1200, 1070]); const side = ((x - 1060) * (-130) - (y - 1200) * 140) > 0 ? 1 : 0;
    h += 110 / (1 + Math.exp(-((side ? 1 : -1) * d - 2) / 3));   // SE scarp (steep: drop-zone for the honest failure demo)
    return h;
  }
  const N1 = GN + 1, Hs = new Float32Array(N1 * N1);
  for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) Hs[j * N1 + i] = H(i * CS, j * CS);
  const hz = (i, j) => Hs[clamp(j, 0, GN) * N1 + clamp(i, 0, GN)];
  const slope = new Float32Array(GN * GN), shade = new Uint8Array(GN * GN);
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    const dzdx = ((hz(i + 1, j) + hz(i + 1, j + 1)) - (hz(i, j) + hz(i, j + 1))) / (2 * MAP.M), dzdy = ((hz(i, j + 1) + hz(i + 1, j + 1)) - (hz(i, j) + hz(i + 1, j))) / (2 * MAP.M);
    slope[j * GN + i] = Math.atan(Math.hypot(dzdx, dzdy)) * 180 / Math.PI;
    const li = -dzdx * 0.7 + dzdy * 0.7;   // light from NW (y grows southward)
    shade[j * GN + i] = clamp(Math.round(3 + li * 14), 0, 6);
  }
  const hab = SCH.hab, hh = H(hab[0], hab[1]) + 10;
  // Comm-shadow polygons are HAND-PLACED for the schematic (a pocket on the s2→rendezvous corridor plus behind-ridge areas). The real layer is grid/comm_hab.u8 from TASK-03.
  const sh = new Uint8Array(GN * GN);
  const SHADOWS = [[548, 692, 40, 22, -32], [822, 590, 70, 34, -20], [286, 560, 40, 26, 10], [1040, 1010, 120, 70, 35], [880, 200, 90, 40, 0], [700, 960, 44, 24, 15]];
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { const x = i * CS + CS / 2, y = j * CS + CS / 2; for (const [cx, cy, rx, ry, rot] of SHADOWS) { const r = rot * Math.PI / 180, dx = x - cx, dy = y - cy, u = dx * Math.cos(r) + dy * Math.sin(r), v = -dx * Math.sin(r) + dy * Math.cos(r); if ((u / rx) ** 2 + (v / ry) ** 2 <= 1) { sh[j * GN + i] = 1; break; } } }
  // haven isochrones: reverse-Dijkstra from the hab with walking cost (visual; levels at 3.3 km/h flat-ground walking distance, ingress excluded)
  const cost = new Float32Array(GN * GN).fill(Infinity), hi = [Math.floor(hab[0] / CS), Math.floor(hab[1] / CS)];
  const pq = [[0, hi[1] * GN + hi[0]]]; cost[hi[1] * GN + hi[0]] = 0;
  const hpush = (it) => { pq.push(it); let i = pq.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (pq[p][0] <= pq[i][0]) break; [pq[p], pq[i]] = [pq[i], pq[p]]; i = p; } };
  const hpop = () => { const top = pq[0], last = pq.pop(); if (pq.length) { pq[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < pq.length && pq[l][0] < pq[m][0]) m = l; if (r < pq.length && pq[r][0] < pq[m][0]) m = r; if (m === i) break; [pq[m], pq[i]] = [pq[i], pq[m]]; i = m; } } return top; };
  while (pq.length) {
    const [c, k] = hpop(); if (c > cost[k]) continue; const i = k % GN, j = (k / GN) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GN || nj >= GN) continue; const nk = nj * GN + ni, sl = slope[nk]; if (sl > 15) continue;
      const nc = c + Math.hypot(di, dj) * CS * (1 + (sl / 20) ** 2); if (nc < cost[nk]) { cost[nk] = nc; hpush([nc, nk]); }
    }
  }
  return { Hs, slope, shade, sh, cost, H, N1, hh };
}
/* marching squares over the (GN+1)² node grid → path data */
function contourPath(Hs, N1, level) {
  const CS = MAP.CS, v = (i, j) => Hs[j * N1 + i], out = []; const lerp = (a, b) => (level - a) / (b - a);
  for (let j = 0; j < N1 - 1; j++) for (let i = 0; i < N1 - 1; i++) {
    const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1), idx = (a > level) * 1 + (b > level) * 2 + (c > level) * 4 + (d > level) * 8; if (idx === 0 || idx === 15) continue;
    const P = { t: [(i + lerp(a, b)) * CS, j * CS], r: [(i + 1) * CS, (j + lerp(b, c)) * CS], bo: [(i + lerp(d, c)) * CS, (j + 1) * CS], l: [i * CS, (j + lerp(a, d)) * CS] };
    const seg = { 1: ['l', 't'], 2: ['t', 'r'], 3: ['l', 'r'], 4: ['r', 'bo'], 5: ['l', 't', 'r', 'bo'], 6: ['t', 'bo'], 7: ['l', 'bo'], 8: ['l', 'bo'], 9: ['t', 'bo'], 10: ['t', 'l', 'r', 'bo'], 11: ['r', 'bo'], 12: ['l', 'r'], 13: ['t', 'r'], 14: ['l', 't'] }[idx];
    for (let s = 0; s < seg.length; s += 2) { const p = P[seg[s]], q = P[seg[s + 1]]; out.push(`M${p[0].toFixed(0)} ${p[1].toFixed(0)}L${q[0].toFixed(0)} ${q[1].toFixed(0)}`); }
  }
  return out.join('');
}
function rleRects(grid, test, cls) {   // merge horizontal runs into ONE path per class (a single paint: no double-composited seams)
  const { GN, CS } = MAP, by = {};
  for (let j = 0; j < GN; j++) { let i = 0; while (i < GN) { const t = test(grid[j * GN + i], j * GN + i); if (!t) { i++; continue; } let k = i + 1; while (k < GN && test(grid[j * GN + k], j * GN + k) === t) k++; const c = cls(t); (by[c] || (by[c] = [])).push(`M${i * CS} ${j * CS}h${(k - i) * CS}v${CS + 0.6}h-${(k - i) * CS}z`); i = k; } }
  return Object.entries(by).map(([c, d]) => `<path class="${c}" d="${d.join('')}"/>`).join('');
}
function terrainDefs() {
  if (MAP.built) return MAP.built;
  const T = buildTerrain(), { GN, CS, U } = MAP; MAP.T = T;
  const hs = rleRects(T.shade, v => v === 3 ? 0 : v, v => 'hs' + v);
  let cont = ''; const lv = []; for (let l = 0; l < 12; l++) lv.push(20 + l * 22);
  const idx = lv.map((l, n) => `<path class="${n % 4 === 0 ? 'ct-i' : 'ct'}" d="${contourPath(T.Hs, T.N1, l)}"/>`).join('');
  const slopeCls = s => s >= 25 ? 4 : s >= 15 ? 3 : s >= 10 ? 2 : s >= 5 ? 1 : 0;
  const sl = rleRects(T.slope, s => slopeCls(s), c => 'sl' + c);
  // TI blobs: low thermal inertia patches (assumed interpretation: possible loose fines) — schematic, from smooth noise
  const ti = [[300, 980, 90, 45, -.2], [820, 640, 70, 40, .5], [520, 460, 60, 34, .1], [980, 940, 100, 50, -.4]].map(([x, y, rx, ry, r]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${r * 57} ${x} ${y})"/>`).join('');
  const shadow = rleRects(T.sh, v => v, () => 'shd');
  const edges = []; for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) if (T.sh[j * GN + i]) { const nb = (a, b) => (a < 0 || b < 0 || a >= GN || b >= GN) ? 0 : T.sh[b * GN + a]; const x = i * CS, y = j * CS; if (!nb(i, j - 1)) edges.push(`M${x} ${y}h${CS}`); if (!nb(i, j + 1)) edges.push(`M${x} ${y + CS}h${CS}`); if (!nb(i - 1, j)) edges.push(`M${x} ${y}v${CS}`); if (!nb(i + 1, j)) edges.push(`M${x + CS} ${y}v${CS}`); }
  const LV = [110, 220, 330], isoNodes = new Float32Array(T.N1 * T.N1); for (let j = 0; j < T.N1; j++) for (let i = 0; i < T.N1; i++) { const c = T.cost[Math.min(j, GN - 1) * GN + Math.min(i, GN - 1)]; isoNodes[j * T.N1 + i] = isFinite(c) ? c : 9999; }
  const iso = LV.map(l => `<path class="iso" d="${contourPath(isoNodes, T.N1, l)}"/>`).join('');
  const over = rleRects(T.cost, c => c > LV[2] && c < 470, () => 'ovr');
  MAP.built = `<g id="mw-hill"><rect width="${U}" height="${U}" class="hsb"/>${hs}</g><g id="mw-contour">${idx}</g><g id="mw-slope">${sl}</g><g id="mw-ti">${ti}</g>
    <g id="mw-shadow">${shadow}</g><path id="mw-shadow-edge" d="${edges.join('')}"/><g id="mw-iso">${iso}</g><g id="mw-over">${over}</g>`;
  return MAP.built;
}
function pointAt(poly, t) {   // visual-only: position at fraction t along a polyline (no value is displayed from this)
  const seg = []; let tot = 0; for (let i = 1; i < poly.length; i++) { const l = Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]); seg.push(l); tot += l; }
  let d = clamp(t, 0, 1) * tot; for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const f = seg[i] ? d / seg[i] : 0, a = poly[i], b = poly[i + 1]; return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, hdg: Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180 / Math.PI }; } d -= seg[i]; }
  const e = poly[poly.length - 1]; return { x: e[0], y: e[1], hdg: 0 };
}
const ROUTE = [SCH.hab, SCH.s1, SCH.s2, SCH.s3];            // planned route (schematic)
const ROUTE_BACK = [SCH.s3, [560, 700], [440, 770], SCH.hab];
const PR1_PATH = [SCH.hab, [300, 880], [350, 780], [420, 740], SCH.rdv];  // vehicle path (schematic; avoids the steep scarp and the first ridge crest)
const STOPS = [{ n: 1, code: 'EZ—ENG 01', p: SCH.s1, type: 'engineering' }, { n: 2, code: 'EZ—RES 02', p: SCH.s2, type: 'resource' }, { n: 3, code: 'EZ—SCI 01', p: SCH.s3, type: 'science' }];

/* ---- SVG builder ---- */
function mapSVG(o) {
  terrainDefs();
  const vb = o.vb || [-60, -60, 1320, 1320], k = o.w / vb[2], L = o.L || {}, id = o.id || 'm';
  const inv = 1 / k, mk = (x, y, inner, extra = '') => `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${inv.toFixed(4)})" ${extra}>${inner}</g>`;
  let s = `<svg class="mapsvg" width="${o.w}" height="${o.h}" viewBox="${vb.join(' ')}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Schematic map of the Mount Sharp area (not real terrain)">`;
  s += `<rect x="-200" y="-200" width="1600" height="1600" class="m-out"/><rect x="0" y="0" width="1200" height="1200" fill="url(#pt-out)" opacity="0"/>`;
  s += `<use href="#mw-hill" class="m-hill"/>`;
  if (L.hill !== false) s += `<use href="#mw-contour" class="m-ct"/>`;
  if (L.slope) s += `<use href="#mw-slope" class="m-slope"/>`;
  if (L.ti) s += `<use href="#mw-ti" class="m-ti"/>`;
  if (L.comm) s += `<use href="#mw-shadow" class="m-shd"/><use href="#mw-shadow-edge" class="m-shde"/>`;
  if (L.haven) s += `<use href="#mw-over" class="m-over"/><use href="#mw-iso" class="m-iso"/>`;
  s += `<rect x="0" y="0" width="1200" height="1200" class="m-aoi"/>`;
  if (L.traverse !== false && L.traverse) s += `<path class="m-trav" d="M120 1100C300 1020 420 1010 520 930S760 900 900 960" />` + mk(520, 930, `<text class="m-sol" y="-6">SOL ###</text>`);
  // routes
  const pl = a => 'M' + a.map(p => p.join(' ')).join('L');
  if (o.route && o.route !== 'none') {
    const ghost = o.route === 'ghost', part = o.route === 'partial';
    s += `<path class="m-routecase" d="${pl(ROUTE)}"/><path class="m-route ${ghost ? 'ghost' : ''}" d="${pl(ROUTE)}"/>`;
    if (o.loop !== false) s += `<path class="m-route back" d="${pl(ROUTE_BACK)}"/>`;
    if (part) s += `<path class="m-noroute" d="M${SCH.s2.join(' ')}L${SCH.near.join(' ')}"/>`;
  }
  if (o.pr1Path) s += `<path class="m-pr1case" d="${pl(PR1_PATH)}"/><path class="m-pr1" d="${pl(PR1_PATH)}"/>`;
  if (o.rdv) s += mk(SCH.rdv[0], SCH.rdv[1], `<circle r="13" class="m-rdv"/><circle r="5" class="m-rdv"/><path class="m-rdv" d="M-19 0H-8M8 0H19M0 -19V-8M0 8V19"/><text class="m-lab" x="18" y="-12">RDV</text>`);
  // haven isochrone labels
  if (L.haven) { [[110, 'HAVEN 10'], [220, '20'], [330, '30 MIN']].forEach(([r, t], n) => { const x = SCH.hab[0] + r * .7, y = SCH.hab[1] - r * .74; s += mk(x, y, `<text class="m-iso-lab" x="4" y="-3">${t}</text>`); }); }
  // hab
  s += mk(SCH.hab[0], SCH.hab[1], `<path class="m-hab" d="M-12 -12H4L12 -4V12H-4L-12 4Z"/><text class="m-lab" x="16" y="5">HAB</text>`);
  // stops + POIs
  const stops = o.stops || [];
  stops.forEach(st => {
    const sel = st.sel ? ' sel' : '', poi = L.pois !== false && st.code;
    s += `<g class="m-stop${sel}" data-stop="${st.n}" ${o.interactive ? 'tabindex="0" role="button" aria-label="Stop ' + st.n + (st.code ? ' ' + st.code : '') + '"' : ''}>` + mk(st.x, st.y, `${st.sel ? '<circle r="17" class="m-selring"/>' : ''}<circle r="12" class="m-wp ${st.bad ? 'bad' : ''}"/>${st.bad ? '<path class="m-badx" d="M-5 -5 5 5M5 -5-5 5"/>' : `<text class="m-wpn" text-anchor="middle" y="4.5">${st.n}</text>`}` + (poi && o.poiLabels ? `<g transform="translate(16 -22)"><rect class="m-plate" x="-3" y="-11" width="${st.code.length * 6.6 + 8}" height="16"/><text class="m-lab" y="1">[ ${st.code} ]</text></g>` : '')) + `</g>`;
  });
  // vehicles
  (o.veh || []).forEach(v => { s += mk(v.x, v.y, `<g class="m-veh ${v.state || ''}"><path d="M-11 -11H3L11 -3V11H-3L-11 3Z"/><path d="M-6 -2h9M-6 3h9" class="m-vd"/></g><text class="m-lab" x="15" y="4">${v.id}</text>`, `data-mk="${v.id}" data-inv="${inv.toFixed(4)}"`); });
  // crew chevrons (28 px) with ID; unlinked = dashed outline + STALE age
  (o.crew || []).forEach(c => { const lab = c.stale ? `${c.id}  STALE ${c.stale}` : c.id; s += mk(c.x, c.y, `<g class="rot" transform="rotate(${(c.hdg || 0).toFixed(0)})"><path class="m-chev ${c.stale ? 'stale' : ''}" d="M0 -14 10 13 0 8 -10 13Z"/></g><text class="m-lab ${c.stale ? 'stale' : ''}" x="14" y="-12">${lab}</text>`, `data-mk="${c.id}" data-inv="${inv.toFixed(4)}"`); });
  // overlays: ui furniture
  if (o.crosshair) s += mk(o.crosshair[0], o.crosshair[1], `<path class="m-cross" d="M-16 0H-5M5 0H16M0 -16V-5M0 5V16"/><circle r="9" class="m-cross" fill="none"/>`);
  if (o.dropZone) s += mk(SCH.scarp[0] - 20, SCH.scarp[1] - 20, `<text class="m-lab t3" x="-80" y="-26">STEEP — assumed scarp</text>`);
  s += `</svg>`;
  return s;
}
function terrainDefsSvg() {
  terrainDefs();
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <clipPath id="cp-circle"><circle cx="10" cy="10" r="8.2"/></clipPath><clipPath id="cp-tri"><path d="M10 2 18.6 17.6H1.4Z"/></clipPath>
    <clipPath id="cp-oct"><path d="M6.2 1.6h7.6l4.6 4.6v7.6l-4.6 4.6H6.2l-4.6-4.6V6.2Z"/></clipPath><clipPath id="cp-dia"><path d="M10 1.4 18.6 10 10 18.6 1.4 10Z"/></clipPath>
    <pattern id="pt-sl3" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#E4572E" fill-opacity=".65"/><rect width="1.6" height="6" fill="#000" fill-opacity=".5"/></pattern><pattern id="pt-sl4" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#8B1E3F" fill-opacity=".75"/><path d="M0 0 6 6M6 0 0 6" stroke="#000" stroke-opacity=".55" stroke-width="1"/></pattern><pattern id="pt-caut" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.8" height="7" fill="#FFB020" fill-opacity=".55"/></pattern><pattern id="pt-hatch45" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="8" fill="currentColor"/></pattern>
    ${MAP.built}</defs></svg>`;
}
