// Cross-check with Google PageSpeed Insights (Lighthouse on Google's servers) for the two Magento-based stores.
// The keyless PSI API quota is usually exhausted, so this opens pagespeed.web.dev like a visitor and reads the
// runPagespeed responses the page itself receives (mobile + desktop). Shopify is impossible here (password page).
// Usage: node measure/psi.mjs [--pages home,category,product,cms]
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { url, chromePath } from './config.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/playwright/node_modules/playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PAGES = arg('pages', 'home,category,product,cms').split(',');
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
const out = { measured: new Date().toISOString(), source: 'pagespeed.web.dev', results: {} };
for (const page of PAGES) for (const stack of ['m2', 'headless']) {
  const target = url(stack, page);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    const got = {};
    p.on('response', async r => {
      if (!/runPagespeed/.test(r.url())) return;
      try {
        const j = await r.json();
        const lr = j.lighthouseResult; if (!lr) return;
        const strat = lr.configSettings.formFactor;
        got[strat] = { score: Math.round(lr.categories.performance.score * 100), lcp: lr.audits['largest-contentful-paint'].numericValue, fcp: lr.audits['first-contentful-paint'].numericValue, tbt: lr.audits['total-blocking-time'].numericValue, cls: lr.audits['cumulative-layout-shift'].numericValue, lighthouse: lr.lighthouseVersion };
      } catch {}
    });
    await p.goto(`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(target)}&form_factor=mobile`, { timeout: 60000 }).catch(() => {});
    const t0 = Date.now();
    while (Date.now() - t0 < 150000 && !(got.mobile && got.desktop)) await p.waitForTimeout(1000);
    await ctx.close();
    if (got.mobile || got.desktop) {
      for (const f of ['mobile', 'desktop']) if (got[f]) (out.results[`${f}/${page}`] ||= {})[stack] = got[f];
      console.log(page, stack, JSON.stringify(got));
      break;
    }
    console.log(page, stack, 'attempt', attempt, 'no result');
  }
}
await browser.close();
writeFileSync(join(ROOT, 'data/psi.json'), JSON.stringify(out, null, 1));
console.log('done -> data/psi.json');
