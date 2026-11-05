import { open, URL } from './harness.mjs';
const { browser, page, errors } = await open({ width: 1700, height: 1200 });
await page.goto(URL + '#overview'); await page.waitForTimeout(400);
const res = await page.evaluate(() => {
  const tot = { frames: 0, vals: 0, noProv: 0, ph: 0, st: 0, stBad: 0 }; const badSt = {}; const rawNums = {};
  for (const id of Object.keys(SCREENS)) { const S = SCREENS[id];
    for (const [st] of S.states) for (const dev of S.sizes) {
      const host = document.createElement('div'); document.getElementById('main').appendChild(host);
      const fr = mountFrame(host, { screen: id, state: st, dev, noCaption: true }); tot.frames++;
      const root = fr.el;
      root.querySelectorAll('.val').forEach(v => { tot.vals++; if (!v.dataset.provenance) tot.noProv++; if (v.dataset.placeholder) tot.ph++; });
      root.querySelectorAll('[data-status]').forEach(s => { tot.st++; const word = s.querySelector('.sword') || (s.classList.contains('alertbar') || s.classList.contains('halert')) ; const shape = s.querySelector('.sicon'); const slot = s.dataset.slot; if (!(word && shape && slot)) { tot.stBad++; const k = id + ':' + st + ':' + s.dataset.status; badSt[k] = (badSt[k] || 0) + 1; } });
      // raw numeric text outside .val and other labelled contexts
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = walker.nextNode())) {
        const t = n.nodeValue.trim(); if (!/\d/.test(t)) continue; const p = n.parentElement; if (!p || p.closest('.val,.code,.micro,.lbl,button,.tag,.badge,.chip,.mono,.t3,svg,pre,th,.protoflag,h1,h2,h3,.ttl,.h-sm,.disp,.meta,a,.logrow,.stat,.errtxt,.kv>span,.serif,label,.sword,.status,.alertbar,.halert,.toast,.legend,li,td,textarea,.cut,.phase,.act,.opt')) continue;
        const k = id + ':' + t.slice(0, 40); rawNums[k] = 1; }
      fr.wrap.remove(); delete FRAMES[fr.fid];
    } }
  return { tot, badSt, raw: Object.keys(rawNums).slice(0, 25) };
});
console.log(JSON.stringify(res.tot)); console.log('4-cue failures:', JSON.stringify(res.badSt)); console.log('raw numeric text outside .val (sample):', res.raw);
console.log('ERR', errors.slice(0,4)); await browser.close();
