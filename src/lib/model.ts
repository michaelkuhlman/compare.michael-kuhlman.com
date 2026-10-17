// Shared by the Astro build (server render of the default view) and the browser script (view switches),
// so both draw from exactly the same numbers and scales.

export type StackId = 'm2' | 'headless' | 'shopify';
export type Form = 'mobile' | 'desktop';
export const STACK_IDS: StackId[] = ['m2', 'headless', 'shopify'];
export const PAGE_IDS = ['home', 'category', 'product', 'cms', 'search', 'cart'] as const;
export type PageId = (typeof PAGE_IDS)[number];

export const STACK_META: Record<StackId, { name: string; short: string; tech: string; shape: 'circle' | 'square' | 'triangle' }> = {
  m2: { name: 'Magento 2', short: 'Magento', tech: 'Mage-OS 3.5 · Luma theme · PHP', shape: 'circle' },
  headless: { name: 'Headless', short: 'Headless', tech: 'Next.js 16 · React 19 · Magento GraphQL', shape: 'square' },
  shopify: { name: 'Shopify', short: 'Shopify', tech: 'Online Store 2.0 · Liquid · custom theme', shape: 'triangle' },
};
export const PAGE_META: Record<PageId, { name: string; note: string }> = {
  home: { name: 'Home', note: 'Landing page, hero + 9 sections' },
  category: { name: 'Category', note: 'Paddles listing with filters' },
  product: { name: 'Product', note: 'Kitchen Line Carbon 16, colour swatches' },
  cms: { name: 'Content', note: '“Our Story” CMS page' },
  search: { name: 'Search', note: 'Results for “paddle”' },
  cart: { name: 'Cart', note: 'Empty bag page' },
};

// Lab metrics shown in the vitals section. Thresholds: Core Web Vitals / Lighthouse mobile scoring curves.
export const METRICS = [
  { id: 'lcp', abbr: 'LCP', name: 'Largest Contentful Paint', unit: 'ms', good: 2500, poor: 4000, cwv: true, what: 'When the biggest thing on screen (usually the hero or product photo) has painted.' },
  { id: 'fcp', abbr: 'FCP', name: 'First Contentful Paint', unit: 'ms', good: 1800, poor: 3000, cwv: false, what: 'The first moment anything (text, logo, image) appears.' },
  { id: 'tbt', abbr: 'TBT', name: 'Total Blocking Time', unit: 'ms', good: 200, poor: 600, cwv: true, what: 'How long JavaScript froze the page while it loaded. The lab stand-in for INP.' },
  { id: 'cls', abbr: 'CLS', name: 'Cumulative Layout Shift', unit: '', good: 0.1, poor: 0.25, cwv: true, what: 'How much the layout jumped around while loading. Lower is steadier.' },
  { id: 'si', abbr: 'SI', name: 'Speed Index', unit: 'ms', good: 3400, poor: 5800, cwv: false, what: 'How quickly the visible page fills in, on average.' },
  { id: 'ttfb', abbr: 'TTFB', name: 'Server response', unit: 'ms', good: 800, poor: 1800, cwv: false, what: 'Time the server took to send back the first byte of HTML.' },
] as const;
export type MetricId = (typeof METRICS)[number]['id'];

export const WEIGHT_KEYS = [
  { id: 'total', name: 'Total transfer', note: 'everything the browser downloaded' },
  { id: 'js', name: 'JavaScript', note: 'scripts, compressed' },
  { id: 'img', name: 'Images', note: 'photos, icons' },
  { id: 'css', name: 'CSS', note: 'stylesheets' },
  { id: 'font', name: 'Fonts', note: 'web fonts' },
  { id: 'html', name: 'HTML', note: 'documents' },
  { id: 'other', name: 'Other', note: 'JSON, prefetch, beacons' },
  { id: 'requests', name: 'Requests', note: 'number of files' },
] as const;

export function fmtMs(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '–';
  if (v < 1000) return `${Math.round(v)} ms`;
  return `${(v / 1000).toFixed(v < 10000 ? 2 : 1)} s`;
}
export function fmtSec(v: number | null | undefined, d = 1): string {
  if (v == null) return '–';
  return `${(v / 1000).toFixed(d)} s`;
}
export function fmtMetric(id: string, v: number | null | undefined): string {
  if (v == null) return '–';
  if (id === 'cls') return v < 0.001 ? '0' : v.toFixed(3);
  return fmtMs(v);
}
export function fmtBytes(b: number | null | undefined): string {
  if (b == null) return '–';
  if (b < 1024) return `${Math.round(b)} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}
export const pct = (v: number) => `${Math.max(0, Math.min(100, v)).toFixed(2)}%`;

/** Upper end of a metric's horizontal scale: at least past the "poor" threshold, and past every value incl. run spread. */
export function metricMax(id: string, poor: number, values: number[]): number {
  const top = Math.max(poor * 1.15, ...values.map(v => v * 1.08));
  if (id === 'cls') return Math.max(0.3, Math.ceil(top * 20) / 20);
  const step = top > 8000 ? 2000 : top > 3000 ? 1000 : top > 1000 ? 500 : 100;
  return Math.ceil(top / step) * step;
}
export function ticks(max: number, id: string): number[] {
  if (id === 'cls') return [0, 0.1, 0.25].filter(t => t <= max);
  const n = max > 8000 ? 4000 : max > 4000 ? 2000 : max > 1600 ? 1000 : max > 800 ? 500 : 200;
  const out: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += n) out.push(t);
  return out;
}
export const tickLabel = (id: string, t: number) => (id === 'cls' ? String(t) : t === 0 ? '0' : t < 1000 ? `${t} ms` : `${t / 1000} s`);

export function scoreBand(s: number): 'good' | 'average' | 'poor' {
  return s >= 90 ? 'good' : s >= 50 ? 'average' : 'poor';
}
export function band(v: number, good: number, poor: number): 'good' | 'average' | 'poor' {
  return v <= good ? 'good' : v <= poor ? 'average' : 'poor';
}
export const bandLabel = { good: 'Good', average: 'Needs work', poor: 'Poor' } as const;

/** Index of the best (lowest, or highest when higherIsBetter) value; null if tied within tolerance. */
export function bestOf(vals: (number | null)[], higherIsBetter = false, tolerance = 0): number | null {
  let bi = -1;
  vals.forEach((v, i) => { if (v == null) return; if (bi < 0 || (higherIsBetter ? v > (vals[bi] as number) : v < (vals[bi] as number))) bi = i; });
  if (bi < 0) return null;
  const b = vals[bi] as number;
  const ties = vals.filter(v => v != null && Math.abs((v as number) - b) <= tolerance).length;
  return ties > 1 ? null : bi;
}

/** Event Timing only reports interactions >= 16 ms; 0 means none crossed that floor. */
export const fmtInp = (v: number | null | undefined) => (v == null ? '–' : v < 16 ? '< 16 ms' : `${Math.round(v)} ms`);

/** Placing by rounded score, with ties shown as "=1st". */
export function placing(scores: Record<string, number | null>, s: string): { r: number; label: string } {
  const me = Math.round(scores[s] ?? 0);
  const all = Object.values(scores).map(v => Math.round(v ?? 0));
  const r = all.filter(v => v > me).length;
  const tie = all.filter(v => v === me).length > 1;
  return { r, label: `${tie ? '=' : ''}${['1st', '2nd', '3rd'][r]}` };
}
