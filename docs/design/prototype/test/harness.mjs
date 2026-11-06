import chromium from '@sparticuz/chromium';
import { chromium as pw } from 'playwright-core';
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module'; import { pathToFileURL, fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const fp = (pkg, file) => path.join(path.dirname(require.resolve(pkg + '/package.json')), 'files', file);
const faces = [
  ['Chakra Petch', 500, '@fontsource/chakra-petch', 'chakra-petch-latin-500-normal.woff2'],
  ['Chakra Petch', 600, '@fontsource/chakra-petch', 'chakra-petch-latin-600-normal.woff2'],
  ['IBM Plex Mono', 400, '@fontsource/ibm-plex-mono', 'ibm-plex-mono-latin-400-normal.woff2'],
  ['IBM Plex Mono', 500, '@fontsource/ibm-plex-mono', 'ibm-plex-mono-latin-500-normal.woff2'],
  ['IBM Plex Mono', 600, '@fontsource/ibm-plex-mono', 'ibm-plex-mono-latin-600-normal.woff2'],
  ['Inter', 400, '@fontsource/inter', 'inter-latin-400-normal.woff2'], ['Inter', 500, '@fontsource/inter', 'inter-latin-500-normal.woff2'],
  ['Inter', 600, '@fontsource/inter', 'inter-latin-600-normal.woff2'], ['Inter', 700, '@fontsource/inter', 'inter-latin-700-normal.woff2'],
  ['Source Serif 4', 400, '@fontsource/source-serif-4', 'source-serif-4-latin-400-normal.woff2'],
];
const css = faces.map(([f, w, p, file]) => { const pth = fp(p, file); return fs.existsSync(pth) ? `@font-face{font-family:"${f}";font-weight:${w};src:url(file://${pth}) format("woff2")}` : ''; }).join('\n');
export async function open(viewport = { width: 1600, height: 1000 }) {
  const browser = await pw.launch({ executablePath: await chromium.executablePath(), args: chromium.args.concat(['--allow-file-access-from-files']), headless: true });
  const ctx = await browser.newContext({ viewport }); const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.addInitScript(c => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = c; document.head.appendChild(s); }); }, css);
  return { browser, page, errors };
}
export const URL = process.env.PROTO_URL || pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../marswalk-prototype.html')).href;
