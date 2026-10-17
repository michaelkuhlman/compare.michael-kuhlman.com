// Scripted shopper: home -> Paddles category -> Kitchen Line Carbon 16 -> pick Coral + add to bag -> bag page.
// Each step is timed from the click until the next screen is usable (content-based checks, same for every stack),
// so a client-side navigation (headless) and a full page load (Magento, Shopify) are compared on equal terms.
// Also records interaction latency (Event Timing, the data INP is built from) for the swatch tap and add-to-bag tap.
// Profiles: mobile = 4G (150 ms latency, 9 Mbps) + 4x CPU on a phone screen; desktop = unthrottled 1440x900.
// Usage: node measure/journey.mjs [--runs 3] [--profiles mobile,desktop] [--stacks ...] [--probe]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { STACKS, chromePath } from './config.mjs';
import { shopifyCookies } from './shopify-auth.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/playwright/node_modules/playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = +arg('runs', 3);
const PROFILES = arg('profiles', 'mobile,desktop').split(',');
const STACK_IDS = arg('stacks', STACKS.map(s => s.id).join(',')).split(',');
const PROBE = process.argv.includes('--probe');
const SHOTS = join(ROOT, 'runs/journey-shots');
mkdirSync(SHOTS, { recursive: true });

const SEL = {
  m2: {
    cat: '#maincontent a[href$="/paddles.html"]', pdp: '#maincontent a[href*="kitchen-line-carbon-16"]:not([aria-hidden="true"]):not([tabindex="-1"])',
    swatch: '.swatch-option[data-option-label="Coral"]', add: '#product-addtocart-button',
    count: () => document.querySelector('.minicart-wrapper .counter-number')?.textContent.trim() === '1',
    openBag: '.minicart-wrapper .action.showcart', viewBag: 'a:visible:has-text("View bag"), .minicart-wrapper a.viewcart:visible', cartPath: '/checkout/cart',
  },
  headless: {
    cat: 'main a[href="/paddles.html"]', pdp: 'main a[href*="kitchen-line-carbon-16"]:not([aria-hidden="true"]):not([tabindex="-1"])',
    swatch: '.ts-swatch[aria-label="Color: Coral"]', add: 'main button.ts-button:has-text("Add to bag")',
    count: () => /\b1\b/.test(document.querySelector('.ts-bag-btn')?.getAttribute('aria-label') || ''),
    openBag: '.ts-bag-btn', viewBag: 'a[href="/checkout/cart"]:visible', cartPath: '/checkout/cart',
  },
  shopify: {
    cat: 'main a[href*="/collections/paddles"]', pdp: 'main a[href*="/products/kitchen-line-carbon-16"]:not([aria-hidden="true"]):not([tabindex="-1"])',
    swatch: '.ts-swatch[data-value="Coral"]', add: '[data-add]',
    count: () => document.querySelector('[data-cart-count]')?.textContent.trim() === '1',
    openBag: '[data-bag-open], .ts-bag-btn', viewBag: '.ts-bag a[href="/cart"]:visible', cartPath: '/cart',
  },
};
const ORIGIN = Object.fromEntries(STACKS.map(s => [s.id, s.origin]));
const PROFILE = {
  mobile: { ctx: { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36' }, net: { latency: 150, downloadThroughput: 9 * 1024 * 1024 / 8, uploadThroughput: 1.5 * 1024 * 1024 / 8 }, cpu: 4 },
  desktop: { ctx: { viewport: { width: 1440, height: 900 } }, net: null, cpu: 1 },
};

const INIT = () => {
  window.__ev = [];
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.interactionId) window.__ev.push({ name: e.name, d: e.duration, t: e.startTime }); }).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch {}
};
// "usable": heading painted and every image in the first screen decoded
const READY = ({ path, text, extra }) => {
  if (!location.pathname.includes(path)) return false;
  // a new document must have painted (Chrome keeps showing the old page until then)
  if (!performance.getEntriesByName('first-contentful-paint').length) return false;
  const h1 = document.querySelector('h1');
  if (!h1 || (text && !h1.textContent.includes(text)) || h1.getBoundingClientRect().height === 0) return false;
  const vh = innerHeight;
  for (const img of document.images) { const r = img.getBoundingClientRect(); if (r.width > 40 && r.bottom > 0 && r.top < vh && getComputedStyle(img).visibility !== 'hidden' && !(img.complete && img.naturalWidth > 0)) return false; }
  if (extra && !document.querySelector(extra)) return false;
  return true;
};

async function journey(browser, stack, profile, cookies) {
  const P = PROFILE[profile], S = SEL[stack];
  const ctx = await browser.newContext(P.ctx);
  if (stack === 'shopify') await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.addInitScript(INIT);
  const cdp = await ctx.newCDPSession(page);
  if (P.net) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, ...P.net }); }
  if (P.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: P.cpu });
  const steps = {}, inp = {};
  const until = async (fn, argv, timeout = 60000) => page.waitForFunction(fn, argv, { timeout, polling: 'raf' });
  const ev = async () => page.evaluate(() => window.__ev.length).catch(() => 0);
  const evMax = async from => page.evaluate(n => window.__ev.slice(n).reduce((m, e) => Math.max(m, e.d), 0), from).catch(() => null);
  try {
    let t = Date.now();
    await page.goto(ORIGIN[stack] + '/', { waitUntil: 'commit' });
    await until(READY, { path: '/', extra: '.ts-hero__img' });
    steps.home = Date.now() - t;

    const cat = page.locator(S.cat).filter({ visible: true }).first();
    await cat.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
    t = Date.now(); await cat.click();
    await until(READY, { path: 'paddles', text: 'Paddles' });
    steps.category = Date.now() - t;

    const pdp = page.locator(S.pdp).filter({ visible: true }).first();
    await pdp.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
    t = Date.now(); await pdp.click();
    await until(READY, { path: 'kitchen-line-carbon-16', text: 'Kitchen Line Carbon 16' });
    await page.locator(S.swatch).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: 60000 });
    await until(sel => { const b = document.querySelector(sel); return !b || !b.disabled; }, stack === 'headless' ? 'main button.ts-button' : S.add);
    steps.product = Date.now() - t;

    await page.waitForTimeout(600);
    let n0 = await ev();
    await page.locator(S.swatch).filter({ visible: true }).first().click();
    await page.waitForTimeout(700);
    inp.swatch = await evMax(n0);
    n0 = await ev();
    t = Date.now(); await page.locator(S.add).filter({ visible: true }).first().click();
    await until(S.count, null, 60000);
    steps.add = Date.now() - t;
    await page.waitForTimeout(500);
    inp.add = await evMax(n0);

    await page.waitForTimeout(800);
    let view = page.locator(S.viewBag).first();
    if (!(await view.isVisible().catch(() => false))) { await page.locator(S.openBag).first().click(); await view.waitFor({ state: 'visible', timeout: 15000 }); }
    t = Date.now(); await view.click();
    await until(([path]) => location.pathname.includes(path) && performance.getEntriesByName('first-contentful-paint').length > 0 && [...document.querySelectorAll('main, #maincontent')].some(e => e.innerText.includes('Kitchen Line Carbon 16')), [S.cartPath]);
    steps.cart = Date.now() - t;
  } catch (e) {
    await page.screenshot({ path: join(SHOTS, `fail-${stack}-${profile}.png`) }).catch(() => {});
    await ctx.close();
    throw new Error(`${Object.keys(steps).length} steps done, then: ${PROBE ? e.message : e.message.split('\n')[0]}`);
  }
  if (PROBE) await page.screenshot({ path: join(SHOTS, `end-${stack}-${profile}.png`) });
  await ctx.close();
  return { steps, inp, total: Object.values(steps).reduce((a, b) => a + b, 0) };
}

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const { cookies } = await shopifyCookies();
const all = {};
for (let r = 1; r <= RUNS; r++) for (const profile of PROFILES) for (const stack of STACK_IDS) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const j = await journey(browser, stack, profile, cookies);
      (all[`${profile}/${stack}`] ||= []).push(j);
      console.log(`run ${r} ${profile} ${stack}: ${Object.entries(j.steps).map(([k, v]) => `${k} ${v}`).join(' | ')} | total ${j.total} | inp swatch ${Math.round(j.inp.swatch)} add ${Math.round(j.inp.add)}`);
      break;
    } catch (e) { console.log(`run ${r} ${profile} ${stack}: attempt ${attempt} failed: ${e.message}`); }
  }
}
await browser.close();
if (PROBE) process.exit(0);
const median = a => { const s = a.filter(v => v != null).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const out = { measured: new Date().toISOString(), runs: RUNS, profiles: { mobile: '4G (150 ms, 9 Mbps) + 4x CPU, 412x823', desktop: 'unthrottled, 1440x900' }, results: {} };
for (const [key, js] of Object.entries(all)) {
  const steps = {};
  for (const k of ['home', 'category', 'product', 'add', 'cart']) steps[k] = median(js.map(j => j.steps[k]));
  out.results[key] = { steps, total: median(js.map(j => j.total)), inp: { swatch: median(js.map(j => j.inp.swatch)), add: median(js.map(j => j.inp.add)) }, runs: js };
}
writeFileSync(join(ROOT, 'data/journey.json'), JSON.stringify(out, null, 1));
console.log('done -> data/journey.json');
