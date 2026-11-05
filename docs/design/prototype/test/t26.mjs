import { open, URL } from './harness.mjs';
const { browser, page, errors } = await open({ width: 1700, height: 1200 });
const R = []; const ok = (n, c, x = '') => R.push([c ? 'PASS' : 'FAIL', n, x]);
const slot = () => page.evaluate(() => { const s = document.querySelector('.fframe .alertslot'); const b = s.getBoundingClientRect(), f = document.querySelector('.fframe').getBoundingClientRect(); return { y: Math.round(b.top - f.top), h: Math.round(b.height), w: Math.round(b.width), text: s.innerText.replace(/\s+/g, ' ').trim(), line: !!s.querySelector('.statusline'), bar: !!s.querySelector('.alertbar'), cues: !!s.querySelector('.statusline .sicon') && !!s.querySelector('.statusline .sword') && s.querySelector('.statusline').dataset.slot === 'alert', level: (s.querySelector('[data-status]') || {}).dataset?.status }; });
for (const dev of ['evaPhoneL', 'evaTabL', 'evaPhoneP']) {
  await page.goto(URL + '#overview'); await page.waitForTimeout(200);
  await page.evaluate(dev => { document.getElementById('main').innerHTML = ''; UI.zoom = '100'; const h = document.createElement('div'); document.getElementById('main').appendChild(h); mountFrame(h, { screen: 'SCR-12', state: 'atStop', dev, noCaption: true }); }, dev);
  await page.waitForTimeout(500);
  let a = await slot();
  ok(dev + ': nominal shows the status line, 64 px, full width', a.line && !a.bar && a.h === 64 && /NOMINAL/.test(a.text) && a.level === 'nominal', JSON.stringify(a));
  ok(dev + ': status line keeps four cues (shape + word + colour class + fixed slot)', a.cues);
  await page.evaluate(() => { const w = Object.values(WORLDS).at(-1); raise(w, 'RADIATION_ALERT'); touch(w); }); await page.waitForTimeout(250);
  let b = await slot();
  ok(dev + ': an alert replaces the line in the SAME slot (same y, same height)', b.bar && !b.line && b.y === a.y && b.h === a.h && /Shelter now/.test(b.text), JSON.stringify(b));
  await page.evaluate(() => { const w = Object.values(WORLDS).at(-1); const al = w.alerts[0]; ackAlert(w, al.id); clearAlert(w, 'RADIATION_ALERT'); touch(w); }); await page.waitForTimeout(250);
  let c = await slot();
  ok(dev + ': acknowledged + cleared alert → status line returns', c.line && !c.bar && /NOMINAL/.test(c.text), c.text);
}
await page.goto(URL + '#overview'); await page.waitForTimeout(200);
for (const [st, want] of [['waiting', /STANDBY/], ['ended', /EVA ENDED/], ['noLink', /No hab link/], ['sheltered', /Shelter now/]]) {
  await page.evaluate(st => { document.getElementById('main').innerHTML = ''; const h = document.createElement('div'); document.getElementById('main').appendChild(h); mountFrame(h, { screen: 'SCR-12', state: st, dev: 'evaPhoneL', noCaption: true }); }, st); await page.waitForTimeout(400);
  const s = await slot(); ok('state ' + st + ': slot shows ' + want, want.test(s.text), s.text.slice(0, 80));
}
const hud = await page.evaluate(() => { document.getElementById('main').innerHTML = ''; const h = document.createElement('div'); document.getElementById('main').appendChild(h); const fr = mountFrame(h, { screen: 'SCR-13', state: 'nominal', dev: 'hud', noCaption: true }); return fr.el.querySelector('.hline').innerText.trim(); });
ok('HUD nominal stays quiet (slot empty, unchanged)', hud === '', JSON.stringify(hud));
for (const r of R) console.log(r[0], r[1], r[2]);
console.log('FAILS', R.filter(r => r[0] === 'FAIL').length, 'of', R.length, errors.slice(0, 3)); await browser.close();
