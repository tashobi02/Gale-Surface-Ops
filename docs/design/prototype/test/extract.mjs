import { open, URL } from './harness.mjs';
import fs from 'fs'; import { cr } from './contrast.mjs';
const { browser, page, errors } = await open({ width: 1700, height: 1300 });
await page.goto(URL + '#orientation'); await page.reload(); await page.waitForTimeout(1500);
const data = await page.evaluate(() => {
  const screens = Object.values(SCREENS).map(S => ({ id: S.id, name: S.name, route: S.route, mode: S.mode, tier: S.tier, frs: S.frs, sizes: S.sizes.map(k => DEV[k].n), orient: !!S.orientToggle, states: S.states.map(([k, l]) => [k, l, ROUTER.hashFor(S.id, k, S.orientToggle ? 'landscape' : null)]) }));
  const cmp = [...document.querySelectorAll('#cmp-table tr')].map(r => [...r.children].map(c => c.innerText.replace(/\s+/g, ' ').trim()));
  const budget = [...document.querySelectorAll('#cmp-budget tr')].map(r => [...r.children].map(c => c.innerText.replace(/\s+/g, ' ').trim()));
  const ph = {}; for (const [k, n] of Object.entries(FX.nums)) if (n.src === 'PLACEHOLDER') (ph[n.unblocks] = ph[n.unblocks] || []).push([k, n.unit]);
  return { screens, cmp, budget, ph, nNums: Object.keys(FX.nums).length, nPh: Object.values(FX.nums).filter(n => n.src === 'PLACEHOLDER').length, handoff: FX.handoff, sources: FX.sources.map(s => [s.code, s.id, s.title]) };
});
// contrast (node, same WCAG formula)
const pairs = [['BRIEF','ink on paper','#1A1A1A','#F7F5F0',15.97],['BRIEF','ink on concrete','#1A1A1A','#E8E6E1',13.95],['BRIEF','ink on steel','#1A1A1A','#CFCFCF',11.17],['BRIEF','ink-2 on paper','#5A5A5A','#F7F5F0',6.33],['BRIEF','paper on charcoal','#F7F5F0','#282828',13.53],['BRIEF','charcoal-text-2 on charcoal','#A3A3A3','#282828',5.84],['BRIEF','ink on signal','#1A1A1A','#E7553D',4.78],['BRIEF','white on signal (large text only)','#FFFFFF','#E7553D',3.64],['BRIEF','signal-ink on paper','#C2401F','#F7F5F0',4.76],['BRIEF','signal on charcoal (large/graphics)','#E7553D','#282828',4.05],
['OPS','edge on panel (non-text)','#5C6670','#14181D',3.05],['OPS','text-1 on panel','#ECEFF2','#14181D',15.44],['OPS','text-2 on panel','#A9B3BE','#14181D',8.38],['OPS','text-3 on panel','#8592A0','#14181D',5.62],['OPS','text-3 on raised','#8592A0','#1C2128',5.10],['OPS','route on panel','#4CC9F0','#14181D',9.27],['OPS','nominal on panel','#3DDC84','#14181D',9.99],['OPS','caution on panel','#FFB020','#14181D',9.75],['OPS','warning on panel','#FF4D4D','#14181D',5.45],['OPS','warning on raised','#FF4D4D','#1C2128',4.95],['OPS','advisory on panel','#4CC9F0','#14181D',9.27],['OPS','unknown on panel','#B8A9FF','#14181D',8.62],['OPS','white on warning-fill','#FFFFFF','#B3261E',6.54],['OPS','black on caution-fill','#000000','#FFB020',11.48],
['HUD','hud-text on black','#FFFFFF','#000000',21],['HUD','hud-text-2 on black','#A9B3BE','#000000',9.88],['HUD','hud-nominal on black','#3DDC84','#000000',11.77],['HUD','hud-caution on black','#FFB020','#000000',11.48],['HUD','hud-warning on black','#FF6B6B','#000000',7.57],['HUD','hud-advisory on black','#4CC9F0','#000000',10.92],
['PRINT','text on white','#111827','#FFFFFF',17.7],['PRINT','caution on white','#9A5B00','#FFFFFF',5.43],['PRINT','warning on white','#B42318','#FFFFFF',6.57],['PRINT','nominal on white','#0E7A4F','#FFFFFF',5.36],['PRINT','text-2 on white (PROPOSED)','#4B5563','#FFFFFF',null],['PRINT','edge on white (PROPOSED, non-text)','#6B7280','#FFFFFF',null],['PRINT','advisory on white (PROPOSED)','#1D4ED8','#FFFFFF',null],['PRINT','unknown on white (PROPOSED)','#6D28D9','#FFFFFF',null]];
data.contrast = pairs.map(([m, n, a, b, s]) => [m, n, a, b, s, +cr(a, b).toFixed(2)]);
fs.writeFileSync('../docs_data.json', JSON.stringify(data, null, 1));
console.log('screens', data.screens.length, 'cmp rows', data.cmp.length, 'ph groups', Object.keys(data.ph).length, 'nums', data.nNums, 'ph', data.nPh, 'errors', errors.length);
console.log(data.cmp.slice(0,3), data.budget.slice(-2));
await browser.close();
