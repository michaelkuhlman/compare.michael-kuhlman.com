// "Real browser" lens + filmstrips. Loads every page in a real Chrome with APPLIED throttling (the same numbers
// Lighthouse's devtools mode uses: 562.5 ms request latency, 1.47 Mbps down, 4x CPU slowdown, moto g viewport),
// records a CDP screencast, and measures FCP / LCP / CLS / long tasks / bytes in the page. 3 runs, interleaved.
// The median run (by LCP) of each page x stack becomes the filmstrip sprite used by the race on the site.
// Usage: node measure/race.mjs [--runs 3] [--pages home,product] [--out runs/race-<stamp>]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { STACKS, PAGES, url, chromePath } from './config.mjs';
import { shopifyCookies } from './shopify-auth.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/playwright/node_modules/playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = +arg('runs', 3);
const PAGE_IDS = arg('pages', PAGES.map(p => p.id).join(',')).split(',');
const STACK_IDS = arg('stacks', STACKS.map(s => s.id).join(',')).split(',');
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const OUT = join(ROOT, arg('out', `runs/race-${stamp}`));
const SPRITES = join(ROOT, 'public/race');
mkdirSync(OUT, { recursive: true }); mkdirSync(SPRITES, { recursive: true });

const UA = 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36';
const THROTTLE = { latency: 562.5, downloadThroughput: 1474.56 * 1024 / 8, uploadThroughput: 675 * 1024 / 8, cpu: 4 };
const FRAME_W = 240;

const INIT = () => {
  window.__m = { lcp: 0, cls: 0, lt: [], fcp: 0 };
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
};

async function tiny(buf) { return sharp(buf).resize(24, 48, { fit: 'fill' }).greyscale().raw().toBuffer(); }
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length / 255; };

async function loadOnce(browser, stack, page, cookies) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, userAgent: UA });
  if (stack === 'shopify') await ctx.addCookies(cookies);
  const p = await ctx.newPage();
  await p.addInitScript(INIT);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: THROTTLE.latency, downloadThroughput: THROTTLE.downloadThroughput, uploadThroughput: THROTTLE.uploadThroughput });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE.cpu });
  let bytes = 0, requests = 0, jsBytes = 0;
  const types = new Map();
  cdp.on('Network.responseReceived', e => types.set(e.requestId, e.type));
  cdp.on('Network.requestWillBeSent', e => { if (!e.request.url.startsWith('data:')) requests++; });
  cdp.on('Network.loadingFinished', e => { bytes += e.encodedDataLength; if (types.get(e.requestId) === 'Script') jsBytes += e.encodedDataLength; });
  const frames = [];
  let lastFrameAt = Date.now();
  cdp.on('Page.screencastFrame', async f => {
    frames.push({ ts: f.metadata.timestamp * 1000, data: Buffer.from(f.data, 'base64') });
    lastFrameAt = Date.now();
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 75, maxWidth: 412, maxHeight: 823, everyNthFrame: 1 });
  const t0 = Date.now();
  await p.goto(url(stack, page), { waitUntil: 'load', timeout: 120000 });
  // settle: at least 3 s after load and 2.5 s without a new frame (max 30 s total)
  const loadedAt = Date.now();
  while (Date.now() - t0 < 30000 && (Date.now() - loadedAt < 3000 || Date.now() - lastFrameAt < 2500)) await p.waitForTimeout(250);
  await cdp.send('Page.stopScreencast');
  const m = await p.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = window.__m.fcp;
    const tbt = window.__m.lt.reduce((s, [st, d]) => s + (st + d > fcp ? Math.max(0, Math.min(d, st + d - fcp) - 50) : 0), 0);
    return { timeOrigin: performance.timeOrigin, fcp, lcp: window.__m.lcp, cls: window.__m.cls, tbt, load: nav.loadEventEnd, ttfb: nav.responseStart, dcl: nav.domContentLoadedEventEnd, title: document.title, path: location.pathname };
  });
  await ctx.close();
  if (/password/i.test(m.path) || !/Third Shot/.test(m.title)) throw new Error('wrong page: ' + m.path + ' ' + m.title);
  // frames on the page clock; frame 0 = blank screen at navigation start
  const fr = frames.map(f => ({ t: f.ts - m.timeOrigin, data: f.data })).filter(f => f.t > 0);
  const last = fr[fr.length - 1];
  const lastT = await tiny(last.data);
  const blank = Buffer.alloc(lastT.length, 255);
  const d0 = diff(blank, lastT) || 1;
  let si = 0, prevT = 0, prevC = 0, vc = 0;
  for (const f of fr) {
    f.tiny = await tiny(f.data);
    f.done = Math.max(0, Math.min(1, 1 - diff(f.tiny, lastT) / d0));
    si += (1 - prevC) * (f.t - prevT); prevT = f.t; prevC = f.done;
  }
  for (let i = fr.length - 1; i >= 0; i--) { if (fr[i].done < 0.985) { vc = fr[i + 1]?.t ?? fr[i].t; break; } }
  if (!vc && fr.length) vc = fr[0].t;
  return { ...m, si, vc, bytes, jsBytes, requests, frames: fr };
}

async function sprite(run, stack, page) {
  // keep visually distinct frames up to visually complete + 400 ms
  const end = run.vc + 400;
  const keep = [{ t: 0, blank: true }];
  let prevTiny = null;
  for (const f of run.frames) {
    if (f.t > end) break;
    if (prevTiny && diff(prevTiny, f.tiny) < 0.004) continue;
    keep.push(f); prevTiny = f.tiny;
  }
  // at most 28 frames: drop the closest-in-time ones (keep first/last)
  while (keep.length > 28) { let bi = 1, bd = Infinity; for (let i = 1; i < keep.length - 1; i++) { const d = keep[i + 1].t - keep[i - 1].t; if (d < bd) { bd = d; bi = i; } } keep.splice(bi, 1); }
  const H = Math.round(FRAME_W * 823 / 412);
  const tiles = await Promise.all(keep.map(f => f.blank
    ? sharp({ create: { width: FRAME_W, height: H, channels: 3, background: '#ffffff' } }).png().toBuffer()
    : sharp(f.data).resize(FRAME_W, H, { fit: 'cover', position: 'top' }).png().toBuffer()));
  const img = sharp({ create: { width: FRAME_W * keep.length, height: H, channels: 3, background: '#ffffff' } })
    .composite(tiles.map((input, i) => ({ input, left: i * FRAME_W, top: 0 })));
  const file = `${page}-${stack}.webp`;
  await img.webp({ quality: 58, effort: 6 }).toFile(join(SPRITES, file));
  return { file, w: FRAME_W, h: H, times: keep.map(f => Math.round(f.t)), done: keep.map(f => (f.blank ? 0 : +f.done.toFixed(3))) };
}

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const { cookies } = await shopifyCookies();
const all = {};
for (let r = 1; r <= RUNS; r++) for (const page of PAGE_IDS) for (const stack of STACK_IDS) {
  const key = `${page}/${stack}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const run = await loadOnce(browser, stack, page, cookies);
      (all[key] ||= []).push(run);
      console.log(`run ${r} ${key}: FCP ${Math.round(run.fcp)} LCP ${Math.round(run.lcp)} SI ${Math.round(run.si)} VC ${Math.round(run.vc)} TBT ${Math.round(run.tbt)} ${Math.round(run.bytes / 1024)}KB/${run.requests} frames ${run.frames.length}`);
      break;
    } catch (e) { console.log(`run ${r} ${key}: attempt ${attempt} failed: ${e.message}`); }
  }
}
await browser.close();

const out = { measured: new Date().toISOString(), throttle: THROTTLE, viewport: '412x823 @1.75x', runs: RUNS, results: {} };
for (const [key, runs] of Object.entries(all)) {
  const [page, stack] = key.split('/');
  const sorted = [...runs].sort((a, b) => a.lcp - b.lcp);
  const med = sorted[Math.floor(sorted.length / 2)];
  const film = await sprite(med, stack, page);
  const strip = r => ({ fcp: r.fcp, lcp: r.lcp, cls: r.cls, tbt: r.tbt, load: r.load, ttfb: r.ttfb, si: r.si, vc: r.vc, bytes: r.bytes, jsBytes: r.jsBytes, requests: r.requests });
  out.results[key] = { page, stack, runs: runs.map(strip), median: strip(med), film };
}
writeFileSync(join(OUT, 'race.json'), JSON.stringify(out, null, 1));
writeFileSync(join(ROOT, 'data/race.json'), JSON.stringify(out, null, 1));
console.log('done ->', join(ROOT, 'data/race.json'));
