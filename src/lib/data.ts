// Reads data/results.json (written by measure/aggregate.mjs) and shapes it for the page.
import results from '../../data/results.json';
import { STACK_IDS, PAGE_IDS, METRICS, type StackId, type Form, type PageId } from './model';

const R: any = results;

export interface Cell {
  s: [number, number, number, number]; // perf, a11y, best practices, seo (medians)
  ps: number[]; // perf score of every run
  m: Record<string, number | null>; // metric medians
  r: Record<string, (number | null)[]>; // every run, per metric
  w: Record<string, number>; // bytes per type + requests/platform/idle
  f: { a11y: string[]; bp: string[]; seo: string[] };
  lcpEl: string | null;
  rep: string | null;
  n: number;
}

const clean = (t: string) => t.replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

function cell(form: Form, page: PageId, stack: StackId): Cell | null {
  const x = R.lh[`${form}/${page}/${stack}`];
  if (!x) return null;
  const m: Record<string, number | null> = {}, r: Record<string, (number | null)[]> = {};
  for (const k of [...METRICS.map(mm => mm.id), 'obsLcp', 'mainThread', 'bootup', 'dom', 'unusedJs']) { m[k] = x.m[k]; r[k] = x.spread[k]; }
  const bt = x.weight.byType;
  return {
    s: [x.scores.performance, x.scores.accessibility, x.scores.bestPractices, x.scores.seo],
    ps: x.perfSpread,
    m, r,
    w: { total: x.weight.total, requests: x.weight.requests, js: bt.js.bytes, img: bt.img.bytes, css: bt.css.bytes, font: bt.font.bytes, html: bt.html.bytes, other: bt.other.bytes, platform: x.weight.platform, idle: x.weight.idle, third: x.weight.thirdParty },
    f: { a11y: x.failing.accessibility.map((a: any) => clean(a.title)), bp: x.failing.bestPractices.map((a: any) => clean(a.title)), seo: x.failing.seo.map((a: any) => clean(a.title)) },
    lcpEl: x.lcp ? (x.lcp.isImage ? 'image' : 'text') : null,
    rep: x.report,
    n: x.n,
  };
}

export const forms: Form[] = R.forms;
export const lh: Record<string, Record<string, Record<string, Cell | null>>> = {};
for (const f of forms) { lh[f] = {}; for (const p of PAGE_IDS) { lh[f][p] = {}; for (const s of STACK_IDS) lh[f][p][s] = cell(f, p, s); } }

const mean = (a: (number | null | undefined)[]) => { const v = a.filter((x): x is number => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
export interface Avg { perf: number | null; lcp: number | null; tbt: number | null; fcp: number | null; cls: number | null; total: number | null; js: number | null; requests: number | null; wins: number }
export const avg: Record<string, Record<string, Avg>> = {};
for (const f of forms) {
  avg[f] = {};
  for (const s of STACK_IDS) {
    const cells = PAGE_IDS.map(p => lh[f][p][s]).filter(Boolean) as Cell[];
    avg[f][s] = {
      perf: mean(cells.map(c => c.s[0])), lcp: mean(cells.map(c => c.m.lcp)), tbt: mean(cells.map(c => c.m.tbt)), fcp: mean(cells.map(c => c.m.fcp)), cls: mean(cells.map(c => c.m.cls)),
      total: mean(cells.map(c => c.w.total)), js: mean(cells.map(c => c.w.js)), requests: mean(cells.map(c => c.w.requests)), wins: 0,
    };
  }
  // page wins on performance score
  for (const p of PAGE_IDS) {
    const sc = STACK_IDS.map(s => lh[f][p][s]?.s[0] ?? -1);
    const top = Math.max(...sc);
    STACK_IDS.forEach((s, i) => { if (sc[i] === top && top >= 0) avg[f][s].wins++; });
  }
}

// Accessibility / best practices / SEO: average over pages + every failing audit seen on any page
export interface Quality { scores: [number | null, number | null, number | null]; fails: { a11y: string[]; bp: string[]; seo: string[] } }
export const quality: Record<string, Record<string, Quality>> = {};
for (const f of forms) {
  quality[f] = {};
  for (const s of STACK_IDS) {
    const cells = PAGE_IDS.map(p => lh[f][p][s]).filter(Boolean) as Cell[];
    const uniq = (k: 'a11y' | 'bp' | 'seo') => [...new Set(cells.flatMap(c => c.f[k]))];
    quality[f][s] = { scores: [mean(cells.map(c => c.s[1])), mean(cells.map(c => c.s[2])), mean(cells.map(c => c.s[3]))], fails: { a11y: uniq('a11y'), bp: uniq('bp'), seo: uniq('seo') } };
  }
}

export const measured = R.measured;
export const race = R.race;
export const journey = R.journey;
export const psi = R.psi;

/** The compact payload the browser script needs for view switches. */
export const clientData = { forms, lh, avg, quality, race: race ? compactRace(race) : null, journey };

function compactRace(rc: any) {
  const out: any = { results: {}, v: String(Date.parse(rc.measured) / 1000 | 0) };
  for (const [k, v] of Object.entries<any>(rc.results)) out.results[k] = { median: v.median, film: v.film };
  return out;
}

export function ranking(form: Form): StackId[] {
  return [...STACK_IDS].sort((a, b) => (avg[form][b].perf ?? 0) - (avg[form][a].perf ?? 0));
}
