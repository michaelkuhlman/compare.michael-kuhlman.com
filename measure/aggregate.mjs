// Collects the latest Lighthouse / race / journey / PSI runs into data/results.json (what the site renders),
// public/data/*.json|csv (downloads) and public/reports/*.html (full Lighthouse report of each median run).
// Usage: node measure/aggregate.mjs [--lh runs/lh-...]   (default: newest runs/lh-* directory)
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STACKS, PAGES, url } from './config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const newest = prefix => readdirSync(join(ROOT, 'runs')).filter(d => d.startsWith(prefix) && statSync(join(ROOT, 'runs', d)).isDirectory()).sort().pop();
const LHDIR = join(ROOT, arg('lh', 'runs/' + newest('lh-')));
import { execFileSync } from 'node:child_process';
import { summarize } from './summarize.mjs';
// re-summarize from the saved reports, so changes to summarize.mjs apply to old runs too
const rows = readFileSync(join(LHDIR, 'summary.ndjson'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).map(x => {
  const f = join(LHDIR, 'lhr', `${x.form}-${x.page}-${x.stack}-${x.run}.json.gz`);
  return existsSync(f) ? summarize(JSON.parse(gunzipSync(readFileSync(f))), { stack: x.stack, page: x.page, form: x.form, run: x.run }) : x;
});
// Early-Hints resources: measure their real compressed size once and add it back
const hintSize = new Map();
for (const x of rows) for (const h of x.weight.hinted || []) {
  if (!hintSize.has(h.url)) {
    let n = 0;
    try { n = +execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{size_download}', '-H', 'Accept-Encoding: br, gzip', h.url], { encoding: 'utf8' }); } catch {}
    hintSize.set(h.url, n);
  }
  const b = hintSize.get(h.url);
  x.weight.byType[h.type].bytes += b; x.weight.total += b; x.weight.hintedBytes = (x.weight.hintedBytes || 0) + b;
}
console.log('early-hints resources re-measured:', hintSize.size);
const meta = JSON.parse(readFileSync(join(LHDIR, 'meta.json'), 'utf8'));

const median = a => { const s = a.filter(v => v != null).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r = (v, d = 0) => (v == null ? null : +v.toFixed(d));
const METRICS = { fcp: 0, lcp: 0, tbt: 0, cls: 3, si: 0, tti: 0, ttfb: 0, mainThread: 0, bootup: 0, dom: 0, unusedJs: 0, obsFcp: 0, obsLcp: 0, obsLoad: 0 };

const lh = {};
const reportsDir = join(ROOT, 'public/reports');
mkdirSync(reportsDir, { recursive: true });
let ReportGenerator = null;
try { ({ ReportGenerator } = await import('lighthouse/report/generator/report-generator.js')); } catch (e) { console.warn('no report generator', e.message); }

for (const form of meta.forms) for (const page of PAGES) for (const stack of STACKS) {
  const runs = rows.filter(x => x.form === form && x.page === page.id && x.stack === stack.id);
  if (!runs.length) continue;
  const m = {}, spread = {};
  for (const [k, d] of Object.entries(METRICS)) { const vals = runs.map(x => x.m[k]); m[k] = r(median(vals), d); spread[k] = vals.map(v => r(v, d)); }
  const scores = {}; for (const k of ['performance', 'accessibility', 'bestPractices', 'seo']) scores[k] = median(runs.map(x => x.scores[k]));
  const perfSpread = runs.map(x => x.scores.performance);
  // representative run: the one whose performance score and LCP sit closest to the medians
  const rep = [...runs].sort((a, b) => (Math.abs(a.scores.performance - scores.performance) / 10 + Math.abs(a.m.lcp - m.lcp) / (m.lcp || 1)) - (Math.abs(b.scores.performance - scores.performance) / 10 + Math.abs(b.m.lcp - m.lcp) / (m.lcp || 1)))[0];
  const w = rep.weight;
  const wMed = {
    total: median(runs.map(x => x.weight.total)), requests: median(runs.map(x => x.weight.requests)),
    platform: median(runs.map(x => x.weight.platform)), idle: median(runs.map(x => x.weight.idle)),
    thirdParty: median(runs.map(x => x.weight.thirdParty.bytes)), hinted: median(runs.map(x => x.weight.hintedBytes || 0)),
    byType: Object.fromEntries(Object.keys(w.byType).map(k => [k, { bytes: median(runs.map(x => x.weight.byType[k].bytes)), count: median(runs.map(x => x.weight.byType[k].count)) }])),
  };
  const key = `${form}/${page.id}/${stack.id}`;
  let report = null;
  const lhrFile = join(LHDIR, 'lhr', `${form}-${page.id}-${stack.id}-${rep.run}.json.gz`);
  if (ReportGenerator && existsSync(lhrFile)) {
    const lhr = JSON.parse(gunzipSync(readFileSync(lhrFile)));
    report = `reports/${form}-${page.id}-${stack.id}.html`;
    writeFileSync(join(ROOT, 'public', report), ReportGenerator.generateReportHtml(lhr));
  }
  lh[key] = { m, spread, scores, perfSpread, weight: wMed, lcp: rep.lcp, failing: rep.failing, report, url: url(stack.id, page.id), n: runs.length };
}

const load = f => (existsSync(join(ROOT, 'data', f)) ? JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8')) : null);
const race = load('race.json');
const journey = load('journey.json');
const psi = load('psi.json');

const first = rows.map(x => x.fetchTime).sort()[0], last = rows.map(x => x.fetchTime).sort().pop();
const results = {
  generated: new Date().toISOString(),
  measured: { from: first, to: last, lighthouse: rows[0].lighthouse, runsPerCombo: meta.runs, totalRuns: rows.length, benchmarkIndex: median(rows.map(x => x.benchmarkIndex)), chrome: meta.chrome.match(/linux-([\d.]+)/)?.[1] },
  stacks: STACKS, pages: PAGES, forms: meta.forms,
  lh, race, journey, psi,
};
writeFileSync(join(ROOT, 'data/results.json'), JSON.stringify(results));

// downloads
mkdirSync(join(ROOT, 'public/data'), { recursive: true });
writeFileSync(join(ROOT, 'public/data/results.json'), JSON.stringify(results, null, 1));
const cols = ['form', 'page', 'stack', 'run', 'fetchTime', 'performance', 'accessibility', 'bestPractices', 'seo', 'fcp_ms', 'lcp_ms', 'tbt_ms', 'cls', 'speed_index_ms', 'ttfb_ms', 'bytes', 'requests', 'js_bytes', 'image_bytes', 'css_bytes', 'font_bytes', 'html_bytes', 'other_bytes', 'platform_bytes', 'url'];
const csv = [cols.join(',')].concat(rows.map(x => [x.form, x.page, x.stack, x.run, x.fetchTime, x.scores.performance, x.scores.accessibility, x.scores.bestPractices, x.scores.seo,
  r(x.m.fcp), r(x.m.lcp), r(x.m.tbt), r(x.m.cls, 4), r(x.m.si), r(x.m.ttfb), x.weight.total, x.weight.requests, x.weight.byType.js.bytes, x.weight.byType.img.bytes, x.weight.byType.css.bytes,
  x.weight.byType.font.bytes, x.weight.byType.html.bytes, x.weight.byType.other.bytes, x.weight.platform, url(x.stack, x.page)].join(',')));
writeFileSync(join(ROOT, 'public/data/lighthouse-runs.csv'), csv.join('\n') + '\n');
console.log(`aggregated ${rows.length} runs -> data/results.json (${Math.round(JSON.stringify(results).length / 1024)} KB)`);
