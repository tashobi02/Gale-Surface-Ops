import { open, URL } from './harness.mjs';
const { browser, page, errors } = await open({ width: 1700, height: 1300 });
await page.goto(URL + '#overview'); await page.waitForTimeout(300);
for (const [scr, st, dev] of [['SCR-08','ok','a4'],['SCR-08','partial','a4'],['SCR-08','over','a4'],['SCR-17','default','a4'],['SCR-17','default','a4b']]) {
  const r = await page.evaluate(([scr, st, dev]) => { document.getElementById('main').innerHTML=''; UI.zoom='100'; const h=document.createElement('div'); document.getElementById('main').appendChild(h); const fr=mountFrame(h,{screen:scr,state:st,dev,noCaption:true}); const pg=fr.el.querySelector('.pg'); return { fits: pg.scrollHeight <= pg.clientHeight + 1, sh: pg.scrollHeight, ch: pg.clientHeight, content: [...pg.children].reduce((a,c)=>a, 0) }; }, [scr, st, dev]);
  console.log(scr, st, dev, JSON.stringify(r));
}
console.log(errors.slice(0,3)); await browser.close();
