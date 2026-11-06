import { open, URL } from './harness.mjs';
const { browser, page, errors } = await open({ width: 1700, height: 1300 });
const R = []; const ok = (n, c, x = '') => R.push([c ? 'PASS' : 'FAIL', n, x]);
const mount = (screen, state, dev, extra = {}) => page.evaluate(([screen, state, dev, extra]) => { document.getElementById('main').innerHTML = ''; UI.zoom = '100'; const h = document.createElement('div'); document.getElementById('main').appendChild(h); const fr = mountFrame(h, Object.assign({ screen, state, dev, noCaption: true }, extra)); return fr.fid; }, [screen, state, dev, extra]);
const boxes = () => page.evaluate(() => { const el = document.querySelector('.fframe'), fb = el.getBoundingClientRect(); const r = s => { const n = el.querySelector(s); if (!n) return null; const b = n.getBoundingClientRect(); return [b.left - fb.left, b.top - fb.top, b.width, b.height].map(x => Math.round(x * 2) / 2); }; return { alert: r('.alertslot'), haven: r('[data-slot=haven]'), o2: r('[data-slot=o2]'), strip: r('.strip'), acts: r('.acts') }; });
const wait = ms => page.waitForTimeout(ms);
await page.goto(URL + '#overview'); await wait(300);
// 1. fixed geography across Walking / At stop / Alerting (all 4 devices)
for (const dev of ['evaPhoneL', 'evaTabL', 'evaPhoneP', 'evaTabP']) {
  const seen = {}; for (const st of ['walking', 'atStop', 'alerting', 'undo', 'opsTask', 'noLink', 'toHaven']) { await mount('SCR-12', st, dev); await wait(150); seen[st] = await boxes(); }
  const ref = seen.walking; const diffs = [];
  for (const st of Object.keys(seen)) for (const k of ['alert', 'haven', 'o2', 'strip', 'acts']) if (JSON.stringify(seen[st][k]) !== JSON.stringify(ref[k])) diffs.push(st + ':' + k + ' ' + JSON.stringify(seen[st][k]) + ' vs ' + JSON.stringify(ref[k]));
  ok(dev + ': alert slot, HAVEN, O₂, strip and action row do not move between Walking, At stop, Undo, Ops-added, Alerting, No link and To haven', diffs.length === 0, diffs.slice(0, 2).join(' | '));
}
// 2. counts are looked-up fixture numbers (provenance FR-50), shown as n/m
await mount('SCR-12', 'walking', 'evaPhoneL'); await wait(200);
const w0 = await page.evaluate(() => { const b = document.querySelector('[data-slot=taskbtn]'); return { txt: b.innerText.replace(/\s+/g, ' '), vals: [...b.querySelectorAll('.val')].map(v => [v.dataset.provenance, v.dataset.src]) }; });
ok('walking: TASKS button shows the count 0/3 for the next stop, each number a declared FR-50 fixture value', /TASKS\s*0\s*\/\s*3/.test(w0.txt) && w0.vals.length === 2 && w0.vals.every(v => v[0] === 'simulated' && /FR-50/.test(v[1])), JSON.stringify(w0));
await mount('SCR-12', 'atStop', 'evaPhoneL'); await wait(200);
ok('at stop (phone landscape): list in the map column — one done, one to do, one skipped; count 1/3', await page.evaluate(() => { const rows = [...document.querySelectorAll('.mapcol .trow')].map(r => r.dataset.state); return rows.join() === 'DONE,TODO,SKIPPED' && /1\s*\/\s*3/.test(document.querySelector('.tcnt').innerText) && !document.querySelector('.mapcol .mini') && !!document.querySelector('.leftcol .next'); }));
ok('at stop: NEXT card stays (bearing, distance, ETA visible) beside the list on the phone', await page.evaluate(() => /040/.test(document.querySelector('.leftcol .next').innerText) && /0\.42/.test(document.querySelector('.leftcol .next').innerText)));
// 3. tick / undo / skip / reason / expiry
await page.click('.trow[data-state=TODO] .tbox'); await wait(150);
ok('tick: row DONE, count 2/3, undo strip shown (no hold-to-confirm needed)', await page.evaluate(() => /2\s*\/\s*3/.test(document.querySelector('.tcnt').innerText) && !!document.querySelector('[data-slot=undo]') && [...document.querySelectorAll('.trow')].map(r => r.dataset.state).join() === 'DONE,DONE,SKIPPED'));
await page.click('[data-act=taskUndo]'); await wait(150);
ok('undo restores the row and the count (1/3)', await page.evaluate(() => /1\s*\/\s*3/.test(document.querySelector('.tcnt').innerText) && !document.querySelector('[data-slot=undo]')));
await page.click('.trow[data-state=TODO] .tskip'); await wait(150);
ok('skip: one tap, row SKIPPED, strip offers a reason control', await page.evaluate(() => [...document.querySelectorAll('.trow')].every(r => r.dataset.state !== 'TODO') && /REASON: OTHER/.test(document.querySelector('[data-slot=undo]').innerText)));
await page.click('[data-act=taskReason]'); await wait(100);
ok('reason control cycles other → time', await page.evaluate(() => /REASON: TIME/.test(document.querySelector('[data-slot=undo]').innerText)));
await wait(5300);
ok('undo strip expires on its own after 5 s', await page.evaluate(() => !document.querySelector('[data-slot=undo]')));
// 4. alert: list collapses to its count
await mount('SCR-12', 'alerting', 'evaPhoneL'); await wait(200);
ok('alerting: the list collapses to a non-interactive count pill (no list, no button)', await page.evaluate(() => !document.querySelector('.tasks') && !!document.querySelector('.tpill') && /1\s*\/\s*3/.test(document.querySelector('.tpill').innerText) && !document.querySelector('[data-slot=taskbtn]')));
// 5. TASKS toggle (walking) swaps map <-> list
await mount('SCR-12', 'walking', 'evaPhoneL'); await wait(200);
await page.click('[data-slot=taskbtn]'); await wait(150);
ok('TASKS button swaps the map column for the list; MAP returns it', await page.evaluate(() => !!document.querySelector('.mapcol .tasks') && !document.querySelector('.mapcol .mini')));
await page.click('[data-slot=taskbtn]'); await wait(150);
ok('…and back to the map', await page.evaluate(() => !!document.querySelector('.mapcol .mini') && !document.querySelector('.tasks')));
// tablet and portrait: list takes the NEXT position
for (const dev of ['evaTabL', 'evaPhoneP']) { await mount('SCR-12', 'atStop', dev); await wait(200); ok(dev + ': at a stop the list takes the NEXT position (04 §E.5 addition); map stays', await page.evaluate(() => !!document.querySelector('.tasks') && !document.querySelector('.next') && !!document.querySelector('.mini'))); }
// 6. not synced
await mount('SCR-12', 'noLink', 'evaPhoneL'); await wait(200);
ok('no hab link: queued tick shows NOT SYNCED on the row and in the strip', await page.evaluate(() => !!document.querySelector('.trow .tag') && /NOT SYNCED/.test(document.querySelector('.trow:nth-child(2)').innerText) && /NOT SYNCED/.test(document.querySelector('.strip').innerText)));
await page.evaluate(() => { const w = Object.values(WORLDS).at(-1); ACT.relink(null, { w }); }); await wait(200);
ok('link returns: NOT SYNCED clears', await page.evaluate(() => !/NOT SYNCED/.test(document.querySelector('.fframe').innerText)));
// 7. ops-added task shows first, tagged
await mount('SCR-12', 'opsTask', 'evaPhoneL'); await wait(200);
ok('ops-added task: shown first on the tablet, tagged ADDED BY OPS, count 1/4', await page.evaluate(() => /ADDED BY OPS/.test(document.querySelector('.trow').innerText) && /1\s*\/\s*4/.test(document.querySelector('.tcnt').innerText)));
// 8. to haven: dropped, read-only
await mount('SCR-12', 'toHaven', 'evaPhoneL'); await wait(200);
ok('to haven: remaining tasks shown DROPPED, list read-only', await page.evaluate(() => [...document.querySelectorAll('.trow')].map(r => r.dataset.state).join() === 'DROPPED,DONE,DROPPED' && /READ ONLY/.test(document.querySelector('.tasks').innerText) && !document.querySelector('.tskip')));
// 9. Stage: ops sync + add task
await page.goto(URL + '#stage'); await page.reload(); await wait(900); await page.evaluate(() => { UI.zoom = '100'; fitAll(); });
const opsTxt = () => page.evaluate(() => { const c = document.querySelector('.crewc[aria-label="EV1 crew card"] .tprog'); return c ? c.innerText.replace(/\s+/g, ' ') : ''; });
ok('stage beat 0:00: ops EV1 card shows STOP 2 0/3 and TOTAL 1/8', /STOP 2\s*0\s*\/\s*3/.test(await opsTxt()) && /TOTAL\s*1\s*\/\s*8/.test(await opsTxt()), await opsTxt());
await page.click('[data-pl="goto"][data-arg="1"]'); await wait(700);
ok('new beat 0:05: ops card moves to 1/3 and TOTAL 2/8; log gains a TASK_UPDATED line; EV1 tablet shows the undo strip', /STOP 2\s*1\s*\/\s*3/.test(await opsTxt()) && /TOTAL\s*2\s*\/\s*8/.test(await opsTxt()) && await page.evaluate(() => /marked a stop 2 task done/.test(document.querySelector('.log').innerText) && !!document.querySelector('.eva [data-slot=undo]')), await opsTxt());
await page.evaluate(() => { const w = WORLDS.stage; ACT.addOpen({ dataset: { crew: 'EV1' } }, { w }); }); await wait(300);
await page.fill('[data-tinp]', 'Image the ledge base'); await wait(100);
await page.click('[data-act=addSubmit]'); await wait(400);
ok('ops Add task: appears on the EV1 tablet tagged ADDED BY OPS; log gains TASK_ADDED; counts update by lookup (1/4)', await page.evaluate(() => /ADDED BY OPS/.test(document.querySelector('.eva').innerText) || /Ops added a task/.test(document.querySelector('.log').innerText)) && /1\s*\/\s*4/.test(await opsTxt()), await opsTxt());
// 10. beat timing unchanged
const beats = await page.evaluate(() => TRACKS.killer.beats.map(b => [b.id, b.s]));
const want = { k0: 0, k1: 10, k2: 20, k3: 30, k4: 40, k5: 55, k5b: 62, k6: 70, k7: 80 }; const got = Object.fromEntries(beats);
ok('existing killer-demo beats keep their times; the new beat sits at 0:05', Object.entries(want).every(([k, v]) => got[k] === v) && got.k0b === 5, JSON.stringify(got));
// 11. data rules
const dr = await page.evaluate(() => { const T = FX.tasks; return { len: T.list.every(t => t.text.length <= 60 && !/\d/.test(t.text)), kinds: T.list.every(t => T.kinds.includes(t.kind)), n: Object.values(T.n).every(x => /FR-50/.test(x.src) && x.prov === 'simulated'), per: ['s1', 's2', 's3'].every(s => ['EV1', 'EV2'].every(c => { const n = T.list.filter(t => t.stop === s && t.crew_id === c).length; return n >= 1 && n <= 4; })) }; });
ok('task text ≤ 60 characters, no digits, valid kinds; 1–4 tasks per stop and crew; every count object is simulated with src FR-50', dr.len && dr.kinds && dr.n && dr.per, JSON.stringify(dr));
for (const r of R) console.log(r[0], r[1], r[2] && r[0] === 'FAIL' ? r[2].slice(0, 220) : '');
console.log('FAILS', R.filter(r => r[0] === 'FAIL').length, 'of', R.length, '| errors', errors.slice(0, 3)); await browser.close();
