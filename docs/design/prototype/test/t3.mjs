import { open, URL } from './harness.mjs';
const { browser, page, errors } = await open({ width: 1700, height: 1200 });
const states = ['waiting','walking','atStop','undo','opsTask','alerting','toHaven','sheltered','noLink','ended'];
const devs = ['evaPhoneL','evaTabL','evaPhoneP','evaTabP'];
const out = [];
await page.goto(URL + '#scr-12'); await page.waitForTimeout(400);
for (const dev of devs) for (const st of states) {
  const r = await page.evaluate(([dev, st]) => {
    const host = document.createElement('div'); document.getElementById('main').appendChild(host);
    const fr = mountFrame(host, { screen: 'SCR-12', state: st, dev, noCaption: true }); UI.zoom = '100'; fr.fit();
    const el = fr.el, eva = el.querySelector('.eva'), fb = el.getBoundingClientRect(), land = fr.orient() === 'landscape';
    const q = s => el.querySelector(s);
    const rel = n => { if (!n) return null; const b = n.getBoundingClientRect(); return { x: b.left - fb.left, y: b.top - fb.top, w: b.width, h: b.height, r: b.right - fb.left, b: b.bottom - fb.top }; };
    const R = { alert: rel(q('.alertslot')), haven: rel(q('[data-slot=haven]')), o2: rel(q('[data-slot=o2]')), next: rel(q('.leftcol > .next, .leftcol > .tasks, .nav > .next, .nav > .tasks')), mini: rel(q('.mapcol, .nav > .mini')), strip: rel(q('.strip')), acts: rel(q('.acts')), body: rel(q('.body')), safety: rel(q('.safety')) };
    const fs = sel => { const n = q(sel); return n ? parseFloat(getComputedStyle(n).fontSize) : null; };
    const btns = [...el.querySelectorAll('.acts .btn')].map(b => { const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    let minGap = 999; for (let i = 1; i < btns.length; i++) if (btns[i].y === btns[i - 1].y) minGap = Math.min(minGap, btns[i].x - (btns[i - 1].x + btns[i - 1].w));
    const inter = (a, b) => a && b && Math.min(a.r, b.r) - Math.max(a.x, b.x) > 0.5 && Math.min(a.b, b.b) - Math.max(a.y, b.y) > 0.5;
    const probs = []; const names = ['haven', 'o2', 'next', 'mini'];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (inter(R[names[i]], R[names[j]])) probs.push('overlap ' + names[i] + '/' + names[j]);
    for (const n of names) if (R[n] && (R[n].r > fb.width + 1 || R[n].b > R.strip.y + 1 || R[n].x < -1)) probs.push('outside ' + n);
    if (!(eva.scrollHeight <= eva.clientHeight + 1 && eva.scrollWidth <= eva.clientWidth + 1)) probs.push('scroll ' + eva.scrollHeight + '/' + eva.clientHeight);
    if (Math.abs(R.alert.h - 64) > .5) probs.push('alert h ' + R.alert.h); if (Math.abs(R.strip.h - 24) > .5) probs.push('strip h ' + R.strip.h); if (Math.abs(R.acts.b - fb.height) > 1) probs.push('acts not at bottom');
    const fontHaven = fs('[data-slot=haven] .bigv .num'), fontNext = fs('.next .nrow .num'), minActH = Math.min(...btns.map(b => b.h));
    if (fontHaven !== null && fontHaven < 56) probs.push('haven font ' + fontHaven); if (fontNext !== null && fontNext < 32) probs.push('next font ' + fontNext); if (minActH < 56) probs.push('act h ' + minActH); if (minGap !== 999 && minGap < 8) probs.push('gap ' + minGap);
    // geography
    if (!(R.haven.x + R.haven.w / 2 < fb.width / 2 && R.haven.y + R.haven.h / 2 < fb.height / 2)) probs.push('haven not top-left');
    if (!(Math.abs(R.o2.y - R.haven.y) < 1.5 && R.o2.x >= R.haven.r - 0.5)) probs.push('o2 not immediately right of haven');
    if (land) { if (R.mini.x < R.next.r - 0.5 || R.mini.x < R.haven.r - 0.5) probs.push('map not in right column'); if (Math.abs(R.mini.b - R.strip.y) > 8 || Math.abs(R.mini.y - R.alert.b) > 8) probs.push('map does not span right column height'); if (R.mini.w < fb.width * .45) probs.push('map narrow ' + R.mini.w); }
    const out = { dev, st, land, frame: [fb.width, fb.height], probs, R: Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v && [v.x, v.y, v.w, v.h].map(Math.round)])), fontHaven, fontNext, minActH, minGap: minGap === 999 ? null : Math.round(minGap) };
    fr.el.closest('.fwrap').remove(); delete FRAMES[fr.fid]; return out;
  }, [dev, st]);
  out.push(r);
}
const bad = out.filter(r => r.probs.length);
console.log('checked', out.length, 'bad', bad.length);
for (const r of out.filter(r => r.st === 'atStop')) console.log(r.dev, JSON.stringify({ frame: r.frame, R: r.R, fontHaven: r.fontHaven, fontNext: r.fontNext, minActH: r.minActH, minGap: r.minGap }));
console.log('BAD'); for (const r of bad) console.log(r.dev, r.st, JSON.stringify(r.probs));
console.log('ERR', errors.slice(0, 5));
await browser.close();
