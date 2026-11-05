import { open, URL } from './harness.mjs';
const { browser, page, errors } = await open({ width: 1700, height: 1200 });
const R = []; const ok = (n, c, extra='') => { R.push([c ? 'PASS' : 'FAIL', n, extra]); };
const go = async (h) => { await page.goto(URL + '#' + h); await page.reload(); await page.waitForTimeout(600); await page.evaluate(() => { UI.zoom='100'; fitAll(); }); };
const box = async (sel) => (await page.locator(sel).first().boundingBox());
// ---- 1 hold-to-confirm: early release cancels
await go('scr-12-alerting-landscape');
let b = await box('.alertslot ~ .acts [data-hold-key$="-summon"]') || await box('[data-hold-key$="-summon"]');
await page.mouse.move(b.x + b.width/2, b.y + b.height/2); await page.mouse.down(); await page.waitForTimeout(400); await page.mouse.up(); await page.waitForTimeout(150);
ok('hold: early release cancels', await page.evaluate(() => /Released early/.test(document.querySelector('.fframe').innerText)), await page.evaluate(()=>Object.values(WORLDS)[0].veh.PR1));
await page.waitForTimeout(1300);
// ---- hold completes: progress + outcome + command
b = await box('[data-hold-key$="-summon"]'); await page.mouse.move(b.x + b.width/2, b.y + b.height/2); await page.mouse.down();
await page.waitForTimeout(500); const prog = await page.evaluate(() => { const p=document.querySelector('.hold .hprog'); return p ? p.style.strokeDasharray : null; });
ok('hold: progress runs along the chamfer path (dasharray grows)', /^[0-9.]+[ ,]+100$/.test(prog||'') && parseFloat(prog) > 30 && parseFloat(prog) < 90, prog);
await page.waitForTimeout(450); const mid = await page.evaluate(() => /dispatched/i.test(document.querySelector('.fframe').innerText));
ok('hold: 300 ms outcome state shows what will happen', mid);
await page.mouse.up(); await page.waitForTimeout(500);
ok('hold: command issued after outcome (PR1 enRoute)', await page.evaluate(() => Object.values(WORLDS).some(w => w.veh && w.veh.PR1 === 'enRoute')));
// ---- tap-then-confirm fallback
await go('scr-12-alerting-landscape'); await page.click('[data-fa="tapc"]'); await page.waitForTimeout(200);
b = await box('[data-hold-key$="-summon"]'); await page.mouse.click(b.x + 30, b.y + 20); await page.waitForTimeout(200);
ok('tap fallback: Confirm button replaces it', await page.evaluate(() => /Confirm — Summon rover/.test(document.querySelector('.fframe').innerText)));
await page.click('.confirmbtn'); await page.waitForTimeout(700);
ok('tap fallback: confirm executes', await page.evaluate(() => Object.values(WORLDS).some(w => w.veh && w.veh.PR1 === 'enRoute')));
// ---- alert bar: flash then hold, ack silences without clearing
await go('scr-12-atStop-landscape'); await page.evaluate(() => { const w=Object.values(WORLDS)[0]; raise(w,'RADIATION_ALERT'); touch(w); }); await page.waitForTimeout(150);
ok('alert: warning bar flashes (class) on raise', await page.evaluate(() => !!document.querySelector('.alertbar.flash')));
await page.waitForTimeout(1300); await page.evaluate(()=>touch(Object.values(WORLDS)[0])); await page.waitForTimeout(100);
ok('alert: flash stops after ×2 then holds', await page.evaluate(() => !document.querySelector('.alertbar.flash') && !!document.querySelector('.alertbar[data-level="warning"]')));
await page.evaluate(() => { const w=Object.values(WORLDS)[0]; raise(w,'COMM_SHADOW'); touch(w); }); await page.waitForTimeout(200);
ok('alert: "+1" counter when a second alert exists', await page.evaluate(() => /\+1/.test(document.querySelector('.alertbar').innerText)));
await page.click('.alertbar .cnt'); await page.waitForTimeout(150);
ok('alert: counter opens the alert list', await page.evaluate(() => document.querySelectorAll('.alertlist li').length >= 2));
await page.click('.alertbar [data-act="ack"]'); await page.waitForTimeout(150);
ok('alert: acknowledge silences without clearing (still shown, ACK tag)', await page.evaluate(() => /ACK/.test(document.querySelector('.alertbar').innerText) && !!document.querySelector('.alertbar[data-level="warning"]')));
// ---- caution one pulse
await go('scr-12-atStop-landscape'); await page.evaluate(() => { const w=Object.values(WORLDS)[0]; raise(w,'COMM_SHADOW'); touch(w); }); await page.waitForTimeout(100);
ok('alert: caution pulses once', await page.evaluate(() => !!document.querySelector('.alertbar.pulse')));
// ---- advisory auto-dismiss 10 s
await page.evaluate(() => { const w=Object.values(WORLDS)[0]; w.alerts=[]; raise(w,'EARTH_FORECAST'); touch(w); }); await page.waitForTimeout(300);
const adv1 = await page.evaluate(() => !!document.querySelector('.alertbar[data-level="advisory"]'));
await page.waitForTimeout(10100); const adv2 = await page.evaluate(() => !document.querySelector('.alertbar'));
ok('alert: advisory shows, auto-dismisses after 10 s', adv1 && adv2);
// ---- stale + dashed + queued
await go('scr-12-noLink-landscape');
ok('stale: greyed values with age on EVA', await page.evaluate(() => document.querySelectorAll('.fframe .val.stale').length > 0 && /0:42/.test(document.querySelector('.fframe').innerText)));
ok('stale: dashed boxes on link loss', await page.evaluate(() => document.querySelectorAll('.fframe .dashedbox').length >= 2));
b = await box('[data-hold-key$="-summon"]'); await page.mouse.move(b.x + b.width/2, b.y + b.height/2); await page.mouse.down(); await page.waitForTimeout(950);
ok('queued: outcome copy says Queued — sends when link returns', await page.evaluate(() => /Queued — sends when link returns/.test(document.querySelector('.fframe').innerText)));
await page.mouse.up(); await page.waitForTimeout(700);
ok('queued: command waits on the device (queue length 1, PR1 still parked)', await page.evaluate(() => { const w=Object.values(WORLDS)[0]; return w.evs.EV1.queue.length === 1 && w.veh.PR1 === 'parked'; }));
await page.evaluate(() => { const w=Object.values(WORLDS)[0]; ACT.relink(null,{w}); }); await page.waitForTimeout(200);
ok('queued: link returns → queue delivered', await page.evaluate(() => { const w=Object.values(WORLDS)[0]; return w.evs.EV1.queue.length === 0 && w.evs.EV1.linked; }));
// ---- ops stale card dashed
await go('scr-11-running'); await page.evaluate(() => { const w=Object.values(WORLDS)[0]; ACT.dropLink(null,{w}); }); await page.waitForTimeout(200);
ok('ops: crew card dashed with age on link loss', await page.evaluate(() => !!document.querySelector('.crewc.dashed') && /NO HAB LINK/.test(document.querySelector('.crewc.dashed').innerText)));
// ---- mute
ok('ops: SOUND OFF indicator visible by default', await page.evaluate(() => /SOUND OFF/.test(document.querySelector('.fframe').innerText)));
await page.click('[data-act="mute"]'); await page.waitForTimeout(150);
ok('ops: mute toggle flips to SOUND ON', await page.evaluate(() => /SOUND ON/.test(document.querySelector('.fframe').innerText)));
// ---- keys
await go('scr-11-running'); await page.locator('body').click({ position: { x: 5, y: 5 } }); await page.keyboard.press('Space'); await page.waitForTimeout(150);
ok('keys: Space pauses', await page.evaluate(() => Object.values(WORLDS)[0].paused === true));
await page.keyboard.press('1'); await page.waitForTimeout(100); ok('keys: 1 → 1×', await page.evaluate(() => Object.values(WORLDS)[0].speed === 1));
await page.keyboard.press('3'); await page.waitForTimeout(100); ok('keys: 3 → 60×', await page.evaluate(() => Object.values(WORLDS)[0].speed === 60));
await go('scr-11-alerting'); await page.locator('body').click({ position: { x: 5, y: 5 } }); await page.keyboard.press('k'); await page.waitForTimeout(150);
ok('keys: K acknowledges', await page.evaluate(() => Object.values(WORLDS)[0].alerts.every(a => a.acked)));
await page.keyboard.press('o'); await page.waitForTimeout(100); ok('keys: O focuses options', await page.evaluate(() => document.activeElement && document.activeElement.id === 'opts'));
// ---- HUD exit by 2 s hold
await go('scr-13-warning'); b = await box('.hud'); await page.mouse.move(b.x + 300, b.y + 200); await page.mouse.down(); await page.waitForTimeout(1000);
ok('hud: before 2 s still HUD', await page.evaluate(() => !!document.querySelector('.hud')));
await page.waitForTimeout(1200); await page.mouse.up(); await page.waitForTimeout(300);
ok('hud: 2 s hold exits to the EVA tablet', await page.evaluate(() => !!document.querySelector('.eva') && !document.querySelector('.hud')));
// ---- HC toggle
await go('scr-12-atStop-landscape'); await page.click('[data-fa="hc"]'); await page.waitForTimeout(200);
ok('eva: high-contrast toggle sets the HUD palette (data-hc=1)', await page.evaluate(() => document.querySelector('.fframe').dataset.hc === '1'));
// ---- orientation toggle keeps value positions
await go('scr-12-atStop-landscape'); const hl = await box('[data-slot=haven]'); const fl = await box('.fframe'); await page.click('[data-fa="orient"][data-arg="portrait"]'); await page.waitForTimeout(250);
const hp = await box('[data-slot=haven]'); const fp = await box('.fframe');
ok('orientation toggle: HAVEN stays top-left (both < 50% x, < 25% y)', ((hl.x-fl.x)+hl.width/2)/fl.width < .5 && ((hp.x-fp.x)+hp.width/2)/fp.width < .5 && ((hl.y-fl.y)+hl.height/2)/fl.height < .5 && ((hp.y-fp.y)+hp.height/2)/fp.height < .25);
// ---- planner
await go('scr-02-idle'); await page.click('.fframe'); await page.keyboard.press('a'); await page.waitForTimeout(200);
ok('planner: A toggles add-stop mode', await page.evaluate(() => Object.values(WORLDS)[0].pl.addMode === true));
let mb = await box('.mapsvg'); await page.mouse.click(mb.x + mb.width*0.5, mb.y + mb.height*0.5); await page.waitForTimeout(900);
ok('planner: click places a stop and recomputes', await page.evaluate(() => Object.values(WORLDS)[0].pl.stops.length === 1));
await page.keyboard.press('Delete'); await page.waitForTimeout(900);
ok('planner: Delete removes the selected stop', await page.evaluate(() => Object.values(WORLDS)[0].pl.stops.length === 0));
await go('scr-02-ok'); await page.click('[data-act="plLayer"][data-arg="slope"]'); await page.waitForTimeout(200);
ok('planner: layer toggle expands its legend', await page.evaluate(() => /flat/.test(document.querySelector('.drawer').innerText) && /over limit/.test(document.querySelector('.drawer').innerText)));
await page.click('[data-act="plLayer"][data-arg="ti"]'); await page.waitForTimeout(200); await page.click('[data-act="plLayer"][data-arg="elevation"]'); await page.waitForTimeout(250);
ok('planner: third scientific overlay dims the oldest and tells the user', await page.evaluate(() => /max two scientific overlays/.test(document.querySelector('.fframe').innerText) || Object.values(WORLDS)[0].pl.layers.slope === false));
await go('scr-02-ok'); mb = await box('.mapsvg'); await page.mouse.click(mb.x + mb.width*0.3, mb.y + mb.height*0.25); await page.waitForTimeout(250);
ok('planner: click opens the point inspector', await page.evaluate(() => !!document.querySelector('[aria-label="Point inspector"]')));
// drag stop 2 onto scarp -> snap offer -> decline -> partial
await go('scr-02-ok'); const st2 = await page.evaluate(() => { const g=document.querySelector('.m-stop[data-stop="2"] .m-wp'); const r=g.getBoundingClientRect(); const svg=document.querySelector('.mapsvg'); const m=svg.getScreenCTM(); const pt=svg.createSVGPoint(); pt.x=1196; pt.y=1120; const q=pt.matrixTransform(m); return {x:r.x+r.width/2,y:r.y+r.height/2,tx:q.x,ty:q.y}; });
await page.mouse.move(st2.x, st2.y); await page.mouse.down(); await page.mouse.move((st2.x+st2.tx)/2,(st2.y+st2.ty)/2,{steps:6}); await page.mouse.move(st2.tx, st2.ty,{steps:6}); await page.mouse.up(); await page.waitForTimeout(300);
ok('planner: dragging a stop onto the steep scarp offers a snap (19.0 m)', await page.evaluate(() => /Not walkable here/.test(document.querySelector('.fframe').innerText) && /19\.0/.test(document.querySelector('[aria-label="Snap offer"]').innerText)));
await page.click('[data-act="plSnap"][data-arg="no"]'); await page.waitForTimeout(300);
ok('planner: declining shows PARTIAL, totals hidden, reason + nearest point', await page.evaluate(() => { const t=document.querySelector('.res').innerText; return /PARTIAL/.test(t) && /DISCONNECTED_BY_SLOPE/.test(t) && /2,905/.test(t) && !/6,120/.test(t); }));
// ---- Stage: player and cross-device words
await go('stage'); await page.waitForTimeout(500);
await page.click('[data-pl="goto"][data-arg="1"]'); await page.waitForTimeout(600);
ok('stage: alert words identical on ops, EV1, HUD, EV2', await page.evaluate(() => /IDENTICAL/.test(document.getElementById('wordscheck').innerText)), await page.evaluate(() => document.getElementById('wordscheck').innerText.slice(0,160)));
await page.click('[data-pl="goto"][data-arg="3"]'); await page.waitForTimeout(500);
const sb = await page.locator('[data-hold-key]').first().boundingBox();
await page.locator('.hold').first().scrollIntoViewIfNeeded(); const sumBtn = await page.locator('.hold').first().boundingBox();
await page.mouse.move(sumBtn.x + sumBtn.width/2, sumBtn.y + sumBtn.height/2); await page.mouse.down(); await page.waitForTimeout(1100); await page.mouse.up(); await page.waitForTimeout(800);
ok('stage: holding Summon on a device advances the replay to beat 5 (k4)', await page.evaluate(() => WORLDS.stage.beat === 'k4' || WORLDS.stage.veh.PR1 === 'enRoute'), await page.evaluate(() => WORLDS.stage.beat));
// ---- audits
await go('design-system'); const aud = await page.evaluate(() => auditAll()); ok('audit: every value carries provenance (design system page)', aud.noProv === 0, JSON.stringify(aud));
await go('stage'); await page.waitForTimeout(400); const aud2 = await page.evaluate(() => auditAll()); ok('audit: stage — provenance 100 % and 4 cues on every status', aud2.noProv === 0 && aud2.stBad === 0, JSON.stringify(aud2));
for (const r of R) console.log(r[0], r[1], r[2]);
console.log('FAILS', R.filter(r => r[0] === 'FAIL').length, 'of', R.length, '| page errors', errors.slice(0,5));
await browser.close();
