// Turns one Lighthouse result (LHR) into the compact record the site uses.
const TYPE = { Document: 'html', Script: 'js', Stylesheet: 'css', Image: 'img', Media: 'img', Font: 'font' };
// Requests the platform adds on top of the theme (analytics, pixels, wallets, checkout preloading, RUM).
const PLATFORM = [
  /\/cdn\/shopifycloud\//, /\/cdn\/wpm\//, /\/cdn\/s\/trekkie/, /\/web-pixels/, /\/checkouts\/internal\//, /\/\.well-known\/shopify\//,
  /\/\/cdn\.shopify\.com\//, /\/\/shop\.app\//, /shopifysvc\.com/, /\/pay\/hop/,
];
const num = (lhr, id) => lhr.audits[id]?.numericValue ?? null;
const failing = (lhr, cat) => (lhr.categories[cat]?.auditRefs || [])
  .filter(r => r.weight > 0 && lhr.audits[r.id]?.score !== null && lhr.audits[r.id]?.score < 1)
  .map(r => ({ id: r.id, title: lhr.audits[r.id].title, weight: r.weight }));

export function summarize(lhr, tags) {
  const reqs = (lhr.audits['network-requests']?.details?.items || []).filter(r => !r.url.startsWith('data:'));
  const byType = {};
  for (const k of ['html', 'js', 'css', 'img', 'font', 'other']) byType[k] = { bytes: 0, count: 0 };
  let total = 0, platform = 0, platformJs = 0, idle = 0;
  const origin = new URL(lhr.finalDisplayedUrl).host;
  let thirdBytes = 0, thirdCount = 0;
  // A cold Lighthouse run has an empty cache, so a 0-byte "disk" hit can only be a resource Chrome fetched during a
  // 103 Early Hints response (Shopify uses them). Lighthouse records those as 0 bytes; aggregate.mjs adds them back.
  const hinted = [];
  for (const r of reqs) {
    if (!r.transferSize && r.cache === 'disk' && r.resourceSize > 0 && TYPE[r.resourceType] && !reqs.some(o => o !== r && o.url === r.url && o.transferSize > 0)) hinted.push({ url: r.url, type: TYPE[r.resourceType] || 'other' });
    const t = TYPE[r.resourceType] || 'other';
    const b = r.transferSize || 0;
    byType[t].bytes += b; byType[t].count++; total += b;
    if (PLATFORM.some(re => re.test(r.url))) { platform += b; if (t === 'js' || /\.js(\?|$)/.test(r.url)) platformJs += b; }
    if (r.priority === 'VeryLow' && (r.resourceType === 'Other' || r.resourceType === 'Prefetch')) idle += b;
    let host = ''; try { host = new URL(r.url).host; } catch {}
    if (host && host !== origin) { thirdBytes += b; thirdCount++; }
  }
  const met = lhr.audits.metrics?.details?.items?.[0] || {};
  const lcpEl = lhr.audits['lcp-breakdown-insight']?.details?.items?.find(i => i.type === 'node');
  const lcpParts = Object.fromEntries((lhr.audits['lcp-breakdown-insight']?.details?.items?.find(i => i.type === 'table')?.items || []).map(i => [i.subpart, i.duration]));
  const sc = c => (lhr.categories[c] ? Math.round(lhr.categories[c].score * 100) : null);
  return {
    ...tags,
    fetchTime: lhr.fetchTime,
    lighthouse: lhr.lighthouseVersion,
    benchmarkIndex: lhr.environment?.benchmarkIndex,
    scores: { performance: sc('performance'), accessibility: sc('accessibility'), bestPractices: sc('best-practices'), seo: sc('seo') },
    m: {
      fcp: num(lhr, 'first-contentful-paint'), lcp: num(lhr, 'largest-contentful-paint'), tbt: num(lhr, 'total-blocking-time'),
      cls: num(lhr, 'cumulative-layout-shift'), si: num(lhr, 'speed-index'), tti: num(lhr, 'interactive'), ttfb: num(lhr, 'server-response-time'),
      mainThread: num(lhr, 'mainthread-work-breakdown'), bootup: num(lhr, 'bootup-time'), dom: num(lhr, 'dom-size-insight'),
      unusedJs: lhr.audits['unused-javascript']?.details?.overallSavingsBytes ?? null,
      obsFcp: met.observedFirstContentfulPaint, obsLcp: met.observedLargestContentfulPaint, obsLoad: met.observedLoad, obsSi: met.observedSpeedIndex, obsLastVisual: met.observedLastVisualChange,
    },
    weight: { total, requests: reqs.length, byType, platform, platformJs, idle, thirdParty: { bytes: thirdBytes, count: thirdCount }, hinted },
    lcp: lcpEl ? { selector: lcpEl.selector, snippet: lcpEl.snippet?.slice(0, 160), isImage: /^<img|<image|picture/i.test(lcpEl.snippet || ''), label: lcpEl.nodeLabel, parts: lcpParts } : null,
    failing: { accessibility: failing(lhr, 'accessibility'), bestPractices: failing(lhr, 'best-practices'), seo: failing(lhr, 'seo') },
  };
}
