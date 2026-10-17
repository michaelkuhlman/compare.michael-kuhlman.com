// Unlocks the password-protected Shopify development store the way a visitor does: GET /password, POST the form,
// keep the _shopify_essential cookie. The password is read from ~/.config/shopify/account.env (never stored in git).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const ORIGIN = 'https://shopify.michael-kuhlman.com';

function password() {
  if (process.env.STOREFRONT_PASSWORD) return process.env.STOREFRONT_PASSWORD;
  const env = readFileSync(`${homedir()}/.config/shopify/account.env`, 'utf8');
  const m = env.match(/^STOREFRONT_PASSWORD=['"]?([^'"\n]+)/m);
  if (!m) throw new Error('STOREFRONT_PASSWORD missing');
  return m[1];
}

const cookieMap = new Map();
const take = res => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); cookieMap.set(kv.slice(0, i), kv.slice(i + 1)); } };
const header = () => [...cookieMap].map(([k, v]) => `${k}=${v}`).join('; ');

export async function shopifyCookies() {
  cookieMap.clear();
  const r1 = await fetch(`${ORIGIN}/password`, { redirect: 'manual' });
  take(r1);
  const html = await r1.text();
  const token = html.match(/name="authenticity_token" value="([^"]+)"/)?.[1];
  if (!token) throw new Error('no authenticity_token on /password');
  const body = new URLSearchParams({ form_type: 'storefront_password', utf8: '✓', authenticity_token: token, password: password() });
  const r2 = await fetch(`${ORIGIN}/password`, { method: 'POST', body, redirect: 'manual', headers: { cookie: header(), 'content-type': 'application/x-www-form-urlencoded' } });
  take(r2);
  const essential = cookieMap.get('_shopify_essential');
  if (!essential) throw new Error('password POST gave no _shopify_essential cookie');
  // prove it: the home page must be the store, not the password page
  const r3 = await fetch(`${ORIGIN}/`, { redirect: 'manual', headers: { cookie: `_shopify_essential=${essential}` } });
  const t = await r3.text();
  if (r3.status !== 200 || /\/password/.test(r3.headers.get('location') || '') || !/Third Shot Supply/.test(t) || /storefront_password/.test(t)) throw new Error('cookie did not unlock the store');
  return { cookieHeader: `_shopify_essential=${essential}`, cookies: [{ name: '_shopify_essential', value: essential, domain: 'shopify.michael-kuhlman.com', path: '/', httpOnly: true, secure: true }] };
}

if (import.meta.url === `file://${process.argv[1]}`) shopifyCookies().then(c => console.log('ok, cookie length', c.cookieHeader.length));
