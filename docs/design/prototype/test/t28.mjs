import { open, URL } from './harness.mjs';
const { browser, page, errors } = await open({ width: 1700, height: 1300 });
const R = []; const ok = (n, c, x = '') => R.push([c ? 'PASS' : 'FAIL', n, x]);
const wait = ms => page.waitForTimeout(ms);
const mount = (screen, state, dev, extra = {}) => page.evaluate(([screen, state, dev, extra]) => { document.getElementById('main').innerHTML = ''; UI.zoom = '100'; const h = document.createElement('div'); document.getElementById('main').appendChild(h); const fr = mountFrame(h, Object.assign({ screen, state, dev, noCaption: true }, extra)); return fr.fid; }, [screen, state, dev, extra]);
const vb = sel => page.evaluate(sel => { const s = document.querySelector(sel); return s ? s.getAttribute('viewBox').split(' ').map(Number) : null; }, sel);
const geo = () => page.evaluate(() => { const el = document.querySelector('.fframe'), fb = el.getBoundingClientRect(); const r = s => { const n = el.querySelector(s); if (!n) return null; const b = n.getBoundingClientRect(); return [b.left - fb.left, b.top - fb.top, b.width, b.height].map(x => Math.round(x * 2) / 2); }; return { alert: r('.alertslot'), haven: r('[data-slot=haven]'), o2: r('[data-slot=o2]'), strip: r('.strip'), acts: r('.acts') }; });
await page.goto(URL + '#overview'); await wait(300);
for (const dev of ['evaPhoneL', 'evaTabL', 'evaPhoneP']) {
  await mount('SCR-12', 'walking', dev); await wait(250);
  const before = await geo();
  ok(dev + ': mini-map has a labelled FULL button (≥ 56 px) and the map itself is tappable', await page.evaluate(() => { const b = document.querySelector('.mini .mapexp .btn'); const r = b.getBoundingClientRect(); return /FULL/.test(b.innerText) && r.height >= 55.5 && r.width >= 55.5 && document.querySelector('.mini').dataset.act === 'mapFull'; }));
  await page.click('.mini .mapexp .btn'); await wait(250);
  const after = await geo();
  const land = dev !== 'evaPhoneP';
  const rect = sel => page.evaluate(sel => { const el = document.querySelector('.fframe'), fb = el.getBoundingClientRect(), n = el.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.left - fb.left, y: r.top - fb.top, w: r.width, h: r.height, r: r.right - fb.left, b: r.bottom - fb.top, fw: fb.width, fs: parseFloat(getComputedStyle(n.querySelector('.num') || n).fontSize) }; }, sel);
  const hB = before.haven, fh = await rect('[data-slot=haven]'), fo = await rect('[data-slot=o2]'), fm = await rect('.mfull');
  ok(dev + ': full-screen map opens; alert slot, metadata strip and action row do not move', !!fm && JSON.stringify(before.alert) === JSON.stringify(after.alert) && JSON.stringify(before.strip) === JSON.stringify(after.strip) && JSON.stringify(before.acts) === JSON.stringify(after.acts));
  if (land) {
    ok(dev + ': landscape full map: HAVEN stays top-left (same origin) but smaller; O₂ is stacked directly below it', fh.x === hB[0] && fh.y === hB[1] && fh.w < hB[2] - 20 && Math.abs(fo.x - fh.x) < 1 && fo.y >= fh.b - 0.5, JSON.stringify([hB, fh, fo]));
    ok(dev + ': landscape full map takes at least 80 % of the screen width and does not sit under the cards', fm.w / fm.fw >= 0.80 && fm.x >= Math.max(fh.r, fo.r) + 4, (fm.w / fm.fw).toFixed(3) + ' x=' + fm.x.toFixed(0) + ' cards right=' + Math.max(fh.r, fo.r).toFixed(0));
    ok(dev + ': stacked card values are smaller than before but still ≥ 32 px (below the 56 px HAVEN/O₂ rule: DV-13)', fh.fs >= 32 && fh.fs < 56 && fo.fs >= 32 && fo.fs < 56, fh.fs + ' / ' + fo.fs);
    ok(dev + ': cards do not overlap the strip or the controls', fo.b <= (before.strip[1] + 0.5) && fm.x >= fh.r);
  } else {
    ok(dev + ': portrait full map keeps HAVEN and O₂ exactly where they were', JSON.stringify(before.haven) === JSON.stringify(after.haven) && JSON.stringify(before.o2) === JSON.stringify(after.o2));
    ok(dev + ': portrait full map fills the width', fm.w >= fm.fw - 30);
  }
  ok(dev + ': every map control is ≥ 56 px with a word (icon + word, never bare)', await page.evaluate(() => [...document.querySelectorAll('.mapctl .btn')].every(b => { const r = b.getBoundingClientRect(); return r.height >= 55.5 && r.width >= 55.5 && b.innerText.trim().length >= 1; }) && document.querySelectorAll('.mapctl .btn').length === 6));
  const v0 = await vb('.mfull svg.mapsvg'); await page.click('[data-act=mapZoom][data-arg=in]'); await wait(200); const v1 = await vb('.mfull svg.mapsvg');
  ok(dev + ': zoom-in button narrows the view', v1[2] < v0[2] - 1, v0[2].toFixed(0) + ' → ' + v1[2].toFixed(0));
  await page.click('[data-act=mapZoom][data-arg=out]'); await page.click('[data-act=mapZoom][data-arg=out]'); await wait(200); const v2 = await vb('.mfull svg.mapsvg');
  ok(dev + ': zoom-out button widens the view', v2[2] > v0[2] + 1);
  const mb = await (await page.$('.mfull')).boundingBox(); await page.mouse.move(mb.x + mb.width * .5, mb.y + mb.height * .4); await page.mouse.down(); await page.mouse.move(mb.x + mb.width * .3, mb.y + mb.height * .3, { steps: 6 }); await page.mouse.up(); await wait(250);
  const v3 = await vb('.mfull svg.mapsvg'); const pan = await page.evaluate(() => Object.values(WORLDS).at(-1).mapv.EV1.pan);
  ok(dev + ': drag pans the map (view moves, pan stored)', Math.abs(v3[0] - v2[0]) > 5 && (Math.abs(pan[0]) > 5 || Math.abs(pan[1]) > 5), JSON.stringify(pan));
  await page.click('[data-act=mapFollow]'); await wait(150); ok(dev + ': FOLLOW recentres on me', await page.evaluate(() => { const p = Object.values(WORLDS).at(-1).mapv.EV1.pan; return p[0] === 0 && p[1] === 0; }));
  const z0 = await page.evaluate(() => Object.values(WORLDS).at(-1).mapv.EV1.zoom);
  await page.evaluate(() => { const h = document.querySelector('.mfull'); h.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true, clientX: 300, clientY: 200 })); }); await wait(200);
  ok(dev + ': wheel zooms in', await page.evaluate(z0 => Object.values(WORLDS).at(-1).mapv.EV1.zoom > z0 + 0.01, z0));
  await page.click('[data-act=mapFit]'); await wait(200); ok(dev + ': FIT shows the whole route', await page.evaluate(() => Object.values(WORLDS).at(-1).mapv.EV1.fit === true));
  await page.click('[data-act=mapLayers]'); await wait(200); await page.click('[data-act=mapLayer][data-arg=slope]'); await wait(250);
  ok(dev + ': LAYERS sheet toggles slope (layer drawn, legend with a provenance chip)', await page.evaluate(() => !!document.querySelector('.mfull use.m-slope') && /Slope/.test(document.querySelector('.mlegend').innerText) && !!document.querySelector('.mlegend .chip')));
  await page.click('[data-act=mapLayer][data-arg=ti]'); await wait(200);
  ok(dev + ': a third scientific overlay turns the oldest off and says so', await page.evaluate(() => { const L = Object.values(WORLDS).at(-1).mapv.EV1.layers; return [L.comm, L.slope, L.ti].filter(Boolean).length === 2 && /Max two/.test(document.querySelector('.layersheet').innerText); }));
  await page.click('[data-act=mapClose]'); await wait(200); ok(dev + ': CLOSE returns the normal layout exactly', !(await page.$('.mfull')) && JSON.stringify(await geo()) === JSON.stringify(before));
  // alert auto-collapses the full map
  await page.click('.mini .mapexp .btn'); await wait(200); await page.evaluate(() => { const w = Object.values(WORLDS).at(-1); raise(w, 'RADIATION_ALERT'); w.opt.state = 'ready'; w.sheet = true; touch(w); }); await wait(250);
  ok(dev + ': a warning closes the full-screen map (alerts and options always get the screen)', !(await page.$('.mfull')) && !!(await page.$('.alertbar[data-level=warning]')));
}
// HUD unchanged: still five values, no task count
await mount('SCR-13', 'nominal', 'hud'); await wait(200);
ok('HUD: no task count (five-value rule; gap G-35)', await page.evaluate(() => !/TASKS/i.test(document.querySelector('.hud').innerText)));
// planner: buttons, drag, wheel
await mount('SCR-02', 'ok', 'proj'); await wait(500);
const p0 = await vb('.mapwrap svg.mapsvg');
await page.click('[data-act=mapZoom][data-k=planner][data-arg=in]'); await wait(250); const p1 = await vb('.mapwrap svg.mapsvg');
ok('planner: on-screen + button zooms (was keyboard-only)', p1[2] < p0[2] - 1, p0[2].toFixed(0) + ' → ' + p1[2].toFixed(0));
await page.click('[data-act=mapZoom][data-k=planner][data-arg=out]'); await wait(150);
const mbp = await (await page.$('.mapwrap')).boundingBox(); await page.mouse.move(mbp.x + 500, mbp.y + 300); await page.mouse.down(); await page.mouse.move(mbp.x + 380, mbp.y + 240, { steps: 6 }); await page.mouse.up(); await wait(300);
ok('planner: drag pans the map and does not open the inspector', Math.abs((await vb('.mapwrap svg.mapsvg'))[0] - p0[0]) > 5 && !(await page.$('[aria-label="Point inspector"]')));
await page.evaluate(() => { const h = document.querySelector('.mapwrap'); h.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true })); }); await wait(250);
ok('planner: wheel zooms', await page.evaluate(() => Object.values(WORLDS).at(-1).pl.zoom > 1));
// ops: buttons + drag
await mount('SCR-11', 'running', 'proj'); await wait(500);
const o0 = await vb('.ops svg.mapsvg'); await page.click('[data-act=mapZoom][data-k=ops][data-arg=in]'); await wait(250); const o1 = await vb('.ops svg.mapsvg');
ok('ops: + button zooms the map', o1[2] < o0[2] - 1, o0[2].toFixed(0) + ' → ' + o1[2].toFixed(0));
const mbo = await (await page.$('.ops .mapbox')).boundingBox(); await page.mouse.move(mbo.x + 400, mbo.y + 300); await page.mouse.down(); await page.mouse.move(mbo.x + 300, mbo.y + 250, { steps: 6 }); await page.mouse.up(); await wait(250);
ok('ops: drag pans', Math.abs((await vb('.ops svg.mapsvg'))[0] - o1[0]) > 5);
await page.click('[data-act=layerOn][data-arg=slope]'); await wait(200); ok('ops: Slope layer toggle draws the slope layer', !!(await page.$('.ops use.m-slope')));
for (const r of R) console.log(r[0], r[1], r[0] === 'FAIL' ? (r[2] || '').slice(0, 200) : '');
console.log('FAILS', R.filter(r => r[0] === 'FAIL').length, 'of', R.length, '| errors', errors.slice(0, 3)); await browser.close();
