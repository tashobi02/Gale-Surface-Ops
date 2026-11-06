import { open, URL } from './harness.mjs';
const { browser, page, errors } = await open({ width: 1700, height: 1200 });
await page.goto(URL + '#overview'); await page.waitForTimeout(400);
const res = await page.evaluate(() => {
  const out = []; const miss = []; const origErr = console.error; console.error = (...a) => { miss.push(a.join(' ')); };
  for (const id of Object.keys(SCREENS)) { const S = SCREENS[id];
    for (const [st] of S.states) for (const dev of S.sizes) {
      const host = document.createElement('div'); document.getElementById('main').appendChild(host); let fr; let err = null;
      try { fr = mountFrame(host, { screen: id, state: st, dev, noCaption: true }); } catch (e) { err = e.message; }
      const txt = fr ? fr.el.textContent : ''; const re = fr && /render error/.test(txt);
      out.push({ id, st, dev, err: err || (re ? txt.slice(0, 160) : null), len: fr ? fr.el.innerHTML.length : 0, ph: fr ? fr.el.querySelectorAll('[data-placeholder]').length : 0 });
      if (fr) { fr.wrap.remove(); delete FRAMES[fr.fid]; }
    } }
  console.error = origErr; return { out, miss: [...new Set(miss)] };
});
const bad = res.out.filter(r => r.err); console.log('screens', [...new Set(res.out.map(r => r.id))].length, 'combos', res.out.length, 'errors', bad.length);
for (const b of bad.slice(0, 12)) console.log(b.id, b.st, b.dev, b.err);
console.log('missing nums:', res.miss.slice(0, 10));
console.log('PAGEERRORS', errors.slice(0, 6)); await browser.close();
