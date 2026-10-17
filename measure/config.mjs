// Shared measurement config: the three stacks and the equivalent page on each.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';

export const STACKS = [
  { id: 'm2', name: 'Magento 2 (Luma)', short: 'Magento', origin: 'https://m2.michael-kuhlman.com' },
  { id: 'headless', name: 'Headless (Next.js + Magento)', short: 'Headless', origin: 'https://headless.michael-kuhlman.com' },
  { id: 'shopify', name: 'Shopify (custom theme)', short: 'Shopify', origin: 'https://shopify.michael-kuhlman.com' },
];

export const PAGES = [
  { id: 'home', name: 'Home', paths: { m2: '/', headless: '/', shopify: '/' } },
  { id: 'category', name: 'Category', note: 'Paddles', paths: { m2: '/paddles.html', headless: '/paddles.html', shopify: '/collections/paddles' } },
  { id: 'product', name: 'Product', note: 'Kitchen Line Carbon 16 (configurable)', paths: { m2: '/kitchen-line-carbon-16.html', headless: '/kitchen-line-carbon-16.html', shopify: '/products/kitchen-line-carbon-16' } },
  { id: 'cms', name: 'Content', note: 'Our Story', paths: { m2: '/about', headless: '/about', shopify: '/pages/about' } },
  { id: 'search', name: 'Search', note: '"paddle"', paths: { m2: '/catalogsearch/result/?q=paddle', headless: '/catalogsearch/result?q=paddle', shopify: '/search?q=paddle' } },
  { id: 'cart', name: 'Cart', note: 'empty bag', paths: { m2: '/checkout/cart/', headless: '/checkout/cart', shopify: '/cart' } },
];

export const url = (stackId, pageId) => STACKS.find(s => s.id === stackId).origin + PAGES.find(p => p.id === pageId).paths[stackId];

export function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = `${homedir()}/.cache/puppeteer/chrome`;
  const v = readdirSync(base).filter(d => d.startsWith('linux-')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
  const p = `${base}/${v}/chrome-linux64/chrome`;
  if (!existsSync(p)) throw new Error('Chrome not found: ' + p);
  return p;
}
