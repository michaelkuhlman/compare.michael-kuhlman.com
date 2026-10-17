// Runs Lighthouse (CLI, default config + desktop preset) against every page x stack x form factor, N runs each,
// interleaved (run 1 of every combination, then run 2, ...) so a slow minute on the network hits all stacks alike.
// Usage: node measure/lighthouse.mjs [--runs 5] [--forms mobile,desktop] [--pages home,product] [--stacks m2,shopify] [--out runs/<stamp>]
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STACKS, PAGES, url, chromePath } from './config.mjs';
import { shopifyCookies } from './shopify-auth.mjs';
import { summarize } from './summarize.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = +arg('runs', 5);
const FORMS = arg('forms', 'mobile,desktop').split(',');
const PAGE_IDS = arg('pages', PAGES.map(p => p.id).join(',')).split(',');
const STACK_IDS = arg('stacks', STACKS.map(s => s.id).join(',')).split(',');
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const OUT = join(ROOT, arg('out', `runs/${stamp}`));
mkdirSync(join(OUT, 'lhr'), { recursive: true });
const LH = join(ROOT, 'node_modules/.bin/lighthouse');
const CHROME = chromePath();

function lighthouse(target, form, extraHeaders) {
  const tmp = join(OUT, 'tmp.json');
  rmSync(tmp, { force: true });
  const args = [target, '--quiet', '--output=json', `--output-path=${tmp}`, '--max-wait-for-load=60000',
    '--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage'];
  if (form === 'desktop') args.push('--preset=desktop');
  if (extraHeaders) args.push(`--extra-headers=${JSON.stringify(extraHeaders)}`);
  return new Promise((resolve, reject) => {
    const p = spawn(LH, args, { env: { ...process.env, CHROME_PATH: CHROME }, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    const timer = setTimeout(() => p.kill('SIGKILL'), 180000);
    p.on('close', code => {
      clearTimeout(timer);
      if (code !== 0 || !existsSync(tmp)) return reject(new Error(`lighthouse exit ${code}: ${err.slice(-400)}`));
      resolve(JSON.parse(readFileSync(tmp, 'utf8')));
    });
  });
}

let shop = null;
const shopHeaders = async () => { if (!shop || Date.now() - shop.at > 20 * 60e3) shop = { ...(await shopifyCookies()), at: Date.now() }; return { Cookie: shop.cookieHeader }; };

// warm every URL once (CDN / full-page caches), like a real store that has had visitors
for (const s of STACK_IDS) for (const p of PAGE_IDS) {
  const h = s === 'shopify' ? { cookie: (await shopHeaders()).Cookie } : {};
  for (let i = 0; i < 2; i++) await fetch(url(s, p), { headers: h }).then(r => r.arrayBuffer()).catch(() => {});
}

const total = RUNS * FORMS.length * PAGE_IDS.length * STACK_IDS.length;
let n = 0;
writeFileSync(join(OUT, 'meta.json'), JSON.stringify({ started: new Date().toISOString(), runs: RUNS, forms: FORMS, pages: PAGE_IDS, stacks: STACK_IDS, chrome: CHROME }, null, 2));
for (let run = 1; run <= RUNS; run++) for (const form of FORMS) for (const page of PAGE_IDS) for (const stack of STACK_IDS) {
  n++;
  const target = url(stack, page);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const lhr = await lighthouse(target, form, stack === 'shopify' ? await shopHeaders() : null);
      if (lhr.runtimeError) throw new Error(lhr.runtimeError.code);
      const final = lhr.finalDisplayedUrl;
      if (/\/password/.test(final) || new URL(final).pathname.replace(/\/$/, '') !== new URL(target).pathname.replace(/\/$/, '')) throw new Error('landed on ' + final);
      const sum = summarize(lhr, { stack, page, form, run });
      appendFileSync(join(OUT, 'summary.ndjson'), JSON.stringify(sum) + '\n');
      writeFileSync(join(OUT, 'lhr', `${form}-${page}-${stack}-${run}.json.gz`), gzipSync(JSON.stringify(lhr)));
      console.log(`[${n}/${total}] ${form} ${page} ${stack} #${run}: perf ${sum.scores.performance} LCP ${Math.round(sum.m.lcp)} TBT ${Math.round(sum.m.tbt)} ${Math.round(sum.weight.total / 1024)}KB/${sum.weight.requests}`);
      break;
    } catch (e) {
      console.log(`[${n}/${total}] ${form} ${page} ${stack} #${run}: attempt ${attempt} failed: ${e.message}`);
      if (attempt === 3) appendFileSync(join(OUT, 'errors.log'), `${form} ${page} ${stack} ${run}: ${e.message}\n`);
    }
  }
}
rmSync(join(OUT, 'tmp.json'), { force: true });
const meta = JSON.parse(readFileSync(join(OUT, 'meta.json'), 'utf8'));
writeFileSync(join(OUT, 'meta.json'), JSON.stringify({ ...meta, finished: new Date().toISOString() }, null, 2));
console.log('done ->', OUT);
