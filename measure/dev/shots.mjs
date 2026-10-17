// Dev helper: screenshots of every section at 1440 and 390 (light, or --dark), saved to runs/shots/.
// node measure/dev/shots.mjs [url] [--dark] [--only 390] [--sections hero,race]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
import { chromePath } from '../config.mjs';
const { chromium } = require('/opt/playwright/node_modules/playwright');
const URL_ = process.argv[2]?.startsWith('http') ? process.argv[2] : 'https://compare.michael-kuhlman.com/';
const dark = process.argv.includes('--dark');
const oi = process.argv.indexOf('--only'); const only = oi > 0 ? process.argv[oi + 1].split(',').map(Number) : [1440, 390];
const si = process.argv.indexOf('--sections'); const want = si > 0 ? process.argv[si + 1].split(',') : null;
const OUT = new URL('../../runs/shots/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
for (const w of only) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, deviceScaleFactor: w < 600 ? 2 : 1, colorScheme: dark ? 'dark' : 'light', isMobile: w < 600, hasTouch: w < 600 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(URL_, { waitUntil: 'networkidle' });
  // scroll through so reveals fire, then let animations finish
  const H = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < H; y += 500) { await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(120); }
  await p.waitForTimeout(4500);
  const ids = await p.evaluate(() => ['top', ...[...document.querySelectorAll('main section[id]')].map(s => s.id).filter(i => i !== 'top')]);
  for (const id of ids) {
    if (want && !want.includes(id) && !(id === 'top' && want.includes('hero'))) continue;
    const el = await p.$('#' + id);
    await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(id === 'race' ? 300 : 900);
    await el.screenshot({ path: `${OUT}${w}${dark ? '-dark' : ''}-${id}.png` });
  }
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}${w}${dark ? '-dark' : ''}-fold.png` });
  console.log(w, 'errors:', errs.length ? errs : 'none');
  await ctx.close();
}
await b.close();
