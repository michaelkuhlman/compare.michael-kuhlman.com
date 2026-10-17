// Shopify vs Magento 2: comparison content. Facts checked 16 Oct 2026; every number links to a source in SOURCES.
// Performance lines are filled from our own measurements (data/results.json), so they follow a re-measure.
import { fmtBytes, fmtMs } from './model';
import { avg, journey, lh } from './data';

export type Edge = 'shopify' | 'm2' | 'depends';
export interface Row { id: string; aspect: string; shopify: string; m2: string; edge: Edge; why: string; src?: number[] }

const a = avg.mobile;
const shopPlatform = (() => {
  const cells = ['home', 'category', 'product', 'cms', 'search', 'cart'].map(p => lh.mobile[p].shopify).filter(Boolean) as any[];
  return cells.reduce((s, c) => s + (c.w.platform ?? 0), 0) / (cells.length || 1);
})();
const jt = (s: string) => journey?.results?.[`mobile/${s}`]?.total ?? null;

export const SOURCES = [
  { n: 1, label: 'Shopify pricing (plans, card rates, third-party transaction fees)', url: 'https://www.shopify.com/pricing' },
  { n: 2, label: 'Shopify Plus pricing (from $2,300/month, 9 expansion stores)', url: 'https://www.shopify.com/plus/pricing' },
  { n: 3, label: 'Shopify changelog: product variant limit is now 2,048 for all merchants', url: 'https://shopify.dev/changelog/the-product-variant-limit-is-now-2048-for-all-merchants' },
  { n: 4, label: 'Shopify changelog (2 Apr 2026): key B2B features now available on non-Plus plans', url: 'https://changelog.shopify.com/posts/key-b2b-features-now-available-on-non-plus-plans' },
  { n: 5, label: 'Shopify dev docs: checkout UI extensions (information, shipping, payment steps are Plus-only)', url: 'https://shopify.dev/docs/api/checkout-ui-extensions' },
  { n: 6, label: 'Adobe Commerce lifecycle policy (2.4.8 and 2.4.9 support windows)', url: 'https://experienceleague.adobe.com/en/docs/commerce-operations/release/planning/lifecycle-policy' },
  { n: 7, label: 'Mage-OS 3.5.0 release notes (8 Sep 2026 emergency security release)', url: 'https://newreleases.io/project/github/mage-os/mageos-magento2/release/3.5.0' },
  { n: 8, label: 'Adobe Commerce licence cost estimates 2026 (third-party, quote-based)', url: 'https://www.mgt-commerce.com/blog/magento-license-cost/' },
  { n: 9, label: 'Hyvä theme free and open source since 10 Nov 2025', url: 'https://amasty.com/blog/hyva-theme-is-now-open-source-and-free/' },
  { n: 10, label: 'Shopify security and PCI DSS Level 1 (shared responsibility)', url: 'https://cside.com/blog/does-shopify-make-you-pci-compliant-6-4-3-11-6-1' },
];

export const ROWS: Row[] = [
  { id: 'ops', aspect: 'Hosting & operations', edge: 'shopify', why: 'Nothing to run',
    shopify: 'Fully hosted SaaS. Servers, scaling, CDN, TLS and upgrades are Shopify’s job.',
    m2: 'Self-hosted (or Adobe Commerce Cloud). You run PHP, MySQL, OpenSearch, Redis and cron, and apply every patch.' },
  { id: 'cost', aspect: 'Cost model', edge: 'depends', why: 'Shopify is cheaper to start; Magento has no revenue share', src: [1, 2, 8],
    shopify: 'Basic $39, Grow $105, Advanced $399 a month ($29 / $79 / $299 billed yearly); Plus from $2,300. Online card fees 2.9% → 2.5% + 30¢, plus 2% / 1% / 0.6% if you use another payment provider. Paid apps on top.',
    m2: 'Open Source (and Mage-OS) is free. You pay hosting, development and extensions; developer time is the big line. Adobe Commerce (the paid edition) is quoted by revenue; industry estimates start around $22,000 a year.' },
  { id: 'code', aspect: 'Customisation & code ownership', edge: 'm2', why: 'Change anything, own everything',
    shopify: 'Liquid themes, apps and Shopify Functions (discount, shipping and payment logic). The platform code itself is closed.',
    m2: 'Full PHP source. Modules, plugins and observers can change any behaviour; you own the code and the database.' },
  { id: 'catalog', aspect: 'Catalogue complexity', edge: 'm2', why: 'Richer product model', src: [3],
    shopify: 'Up to 2,048 variants per product since October 2025, still at most three options (e.g. size, colour, material).',
    m2: 'Configurable, bundle, grouped, virtual and downloadable products, unlimited custom attributes, filters on any attribute.' },
  { id: 'intl', aspect: 'Multi-store & international', edge: 'depends', why: 'Shopify is simpler; Magento goes deeper', src: [2],
    shopify: 'Markets handle currencies, languages and domains in one store. Plus includes the main store and 9 expansion stores.',
    m2: 'Native website / store / store-view hierarchy: per-scope catalogues, prices, languages and themes on one backend.' },
  { id: 'b2b', aspect: 'B2B', edge: 'depends', why: 'Both now cover the basics', src: [4],
    shopify: 'Since April 2026 every plan gets company profiles, payment terms, volume pricing and up to 3 B2B catalogues. Customer-specific catalogues without limit stay Plus-only.',
    m2: 'Open Source has customer groups and tier prices; the full B2B suite (company accounts, quotes, shared catalogues) is Adobe Commerce, or extensions.' },
  { id: 'checkout', aspect: 'Checkout', edge: 'depends', why: 'Conversion out of the box vs total control', src: [5],
    shopify: 'Excellent hosted checkout with Shop Pay. Branding on every plan, but custom UI on the information, shipping and payment steps is Plus-only.',
    m2: 'The checkout is your code: any step, field, payment or shipping flow. Quality depends on what you build or buy.' },
  { id: 'perf', aspect: 'Performance (our measurements)', edge: 'depends', why: 'Platform overhead vs tuning effort',
    shopify: `Fast edge network and Early Hints, but the platform adds its own scripts: about ${fmtBytes(shopPlatform)} per page here and ${fmtMs(a.shopify.tbt)} average blocking time on a phone${(a.shopify.tbt ?? 0) >= Math.max(a.m2.tbt ?? 0, a.headless.tbt ?? 0) ? ', the most of the three' : ''}.`,
    m2: `Luma’s default JavaScript is heavy; this store needed a tuning pass (full-page cache, WebP, CDN) to reach ${Math.round(a.m2.perf ?? 0)} on mobile. The free Hyvä theme cuts the JavaScript further.` },
  { id: 'security', aspect: 'Security, PCI & upgrades', edge: 'shopify', why: 'Patched for you', src: [6, 7, 10],
    shopify: 'PCI DSS Level 1 platform; security fixes ship without you doing anything; no upgrade projects.',
    m2: 'You patch. In September 2026 an exploited remote-code flaw needed an emergency release within days. Each version gets about three years of support (2.4.9: May 2026 to May 2029).' },
  { id: 'talent', aspect: 'Ecosystem & talent', edge: 'shopify', why: 'Bigger, cheaper pool',
    shopify: 'Huge app store and a large pool of theme developers; easy to hire for.',
    m2: 'Deep extension ecosystem and specialist agencies, but a smaller, pricier PHP talent pool.' },
  { id: 'seo', aspect: 'SEO', edge: 'depends', why: 'Both rank fine',
    shopify: 'Solid defaults (sitemap, canonical tags), but fixed URL patterns such as /products/ and /collections/.',
    m2: 'Full control of URLs, rewrites, metadata and how filtered pages are indexed; more to configure.' },
  { id: 'lockin', aspect: 'Lock-in & data portability', edge: 'm2', why: 'Your code, your database',
    shopify: 'Products, customers and orders export via CSV or API, but themes, apps and checkout logic do not move, and the terms are Shopify’s.',
    m2: 'You own the database and the code (OSL 3.0 licence) and can change host or agency at will.' },
  { id: 'launch', aspect: 'Time to launch', edge: 'shopify', why: 'Days, not months',
    shopify: 'Days to weeks with a theme and a few apps.',
    m2: 'Weeks to months, with developers involved from the start.' },
];

export const tally = { shopify: ROWS.filter(r => r.edge === 'shopify').length, m2: ROWS.filter(r => r.edge === 'm2').length, depends: ROWS.filter(r => r.edge === 'depends').length };

export const WINS = {
  shopify: ['You want to launch in weeks and never think about servers or patches', 'The team is small or non-technical', 'Standard catalogue and checkout, where Shopify’s checkout and app store do the heavy lifting', 'Predictable monthly costs matter more than owning the code'],
  m2: ['The catalogue is complex: many attributes, product types or price rules', 'Several brands, sites or countries should share one backend', 'The checkout or order flow is part of what makes the business different', 'You want to own the code and data, with no revenue share, and have a team to run it'],
};

// "Pick your priorities": points per stack for each priority (0-3). Headless = Magento's flexibility + app-like speed,
// at the highest build effort; that is why it scores 0 on the effort-related priorities.
export const PRIORITIES = [
  { id: 'launch', label: 'Launch fast', s: 3, m: 0, h: 0 },
  { id: 'noops', label: 'No servers to run', s: 3, m: 0, h: 0 },
  { id: 'smallteam', label: 'Small or no dev team', s: 3, m: 0, h: 0 },
  { id: 'startcost', label: 'Low cost to start', s: 2, m: 1, h: 0 },
  { id: 'apps', label: 'Big app ecosystem', s: 2, m: 1, h: 1 },
  { id: 'checkout', label: 'Proven checkout out of the box', s: 3, m: 1, h: 1 },
  { id: 'own', label: 'Own the code & data', s: 0, m: 3, h: 3 },
  { id: 'catalog', label: 'Complex catalogue', s: 0, m: 3, h: 3 },
  { id: 'multistore', label: 'Many stores, one backend', s: 1, m: 3, h: 3 },
  { id: 'customcheckout', label: 'Custom checkout flow', s: 0, m: 3, h: 3 },
  { id: 'nofees', label: 'No revenue-based fees', s: 0, m: 2, h: 2 },
  { id: 'speed', label: 'App-like speed when browsing', s: 1, m: 0, h: 3 },
] as const;

export const journeyLine = jt('headless') != null
  ? `In our shopping-trip test the headless store finished in ${fmtMs(jt('headless'))}, against ${fmtMs(jt('shopify'))} for Shopify and ${fmtMs(jt('m2'))} for classic Magento.`
  : '';
