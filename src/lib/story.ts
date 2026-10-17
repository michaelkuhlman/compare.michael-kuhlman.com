// Headline sentences, computed from the numbers so a re-measure can never leave a stale claim behind.
import { STACK_IDS, STACK_META, fmtMs, fmtBytes, type Form } from './model';
import { avg, ranking, journey } from './data';

const nm = (s: string) => STACK_META[s as keyof typeof STACK_META].name;
const by = (form: Form, k: 'lcp' | 'tbt' | 'total') => [...STACK_IDS].sort((x, y) => (avg[form][x][k] ?? 1e12) - (avg[form][y][k] ?? 1e12));

function verdict(form: Form): string {
  const r = ranking(form);
  const a = avg[form];
  const [w, second, third] = r;
  const score = (s: string) => Math.round(a[s].perf ?? 0);
  const device = form === 'mobile' ? 'On a mid-range phone' : 'On a desktop';
  if (score(w) - score(third) <= 2) {
    const light = by(form, 'total')[0];
    return `${device} it is a dead heat: all three average <span class="hl">${score(third)}–${score(w)}</span>. Fast hardware hides the differences, though <b>${nm(light)}</b> still downloads the least (${fmtBytes(a[light].total)} a page).`;
  }
  const lcpBest = by(form, 'lcp')[0], tbtBest = by(form, 'tbt')[0], lightBest = by(form, 'total')[0];
  if (score(w) - score(second) <= 2) {
    const strengths = (s: string) => {
      const out: string[] = [];
      if (s === lcpBest) out.push(`paints the main content first (${fmtMs(a[s].lcp)})`);
      if (s === tbtBest) out.push(`blocks the least (${fmtMs(a[s].tbt)})`);
      if (s === lightBest) out.push(`ships the fewest bytes (${fmtBytes(a[s].total)})`);
      return out.length ? out.join(' and ') : `wins ${a[s].wins} of 6 pages`;
    };
    return `${device}, <b>${nm(w)}</b> and <b>${nm(second)}</b> are neck and neck (<span class="hl">${score(w)}</span> vs ${score(second)}). ${nm(w)} ${strengths(w)}; ${nm(second)} ${strengths(second)}. ${nm(third)} trails at ${score(third)}.`;
  }
  const lcpPart = lcpBest === w ? `and paints the main content first (${fmtMs(a[w].lcp)} on average)` : `though <b>${nm(lcpBest)}</b> paints the main content first (${fmtMs(a[lcpBest].lcp)} on average)`;
  return `${device}, <b>${nm(w)}</b> is fastest, averaging <span class="hl">${score(w)}</span> and winning ${a[w].wins} of 6 pages, ${lcpPart}. ${nm(second)} follows at ${score(second)}; ${nm(third)} trails at ${score(third)}.`;
}

export const verdicts: Record<Form, string> = { mobile: verdict('mobile'), desktop: verdict('desktop') };

function deskNote() {
  const v = STACK_IDS.map(s => Math.round(avg.desktop?.[s]?.perf ?? 0));
  const lo = Math.min(...v), hi = Math.max(...v);
  return hi - lo <= 2 ? `On desktop all three average ${lo === hi ? lo : `${lo}–${hi}`}: fast hardware hides it.` : `On desktop the scores spread from ${lo} to ${hi}.`;
}

/** Three numbered take-aways under the hero (mobile numbers: that is where the stacks differ). */
export function findings(): { title: string; body: string }[] {
  const a = avg.mobile;
  const out: { title: string; body: string }[] = [];
  const r = ranking('mobile');
  const lcpBest = by('mobile', 'lcp')[0], tbtBest = by('mobile', 'tbt')[0], light = by('mobile', 'total')[0], heavy = by('mobile', 'total')[2];
  out.push({
    title: lcpBest !== tbtBest ? 'Different strengths, similar scores' : `${nm(lcpBest)} leads on the vitals`,
    body: lcpBest !== tbtBest
      ? `${nm(lcpBest)} gets the main image on screen first (${fmtMs(a[lcpBest].lcp)} average LCP), ${nm(tbtBest)} keeps the main thread freest (${fmtMs(a[tbtBest].tbt)} blocking vs ${fmtMs(a[lcpBest].tbt)}). Their Lighthouse scores land within ${Math.abs(Math.round((a[r[0]].perf ?? 0) - (a[r[1]].perf ?? 0)))} point${Math.abs(Math.round((a[r[0]].perf ?? 0) - (a[r[1]].perf ?? 0))) === 1 ? '' : 's'}.`
      : `${nm(lcpBest)} has both the fastest main paint (${fmtMs(a[lcpBest].lcp)}) and the least blocking (${fmtMs(a[lcpBest].tbt)}).`,
  });
  const jm = journey?.results;
  if (jm) {
    const tot = (s: string) => jm[`mobile/${s}`]?.total ?? null;
    const order = [...STACK_IDS].filter(s => tot(s) != null).sort((x, y) => tot(x)! - tot(y)!);
    if (order.length === 3) {
      const nav = (s: string) => ['category', 'product', 'cart'].reduce((t, k) => t + (jm[`mobile/${s}`]?.steps?.[k] ?? 0), 0);
      const navBest = [...order].sort((x, y) => nav(x) - nav(y))[0];
      out.push({
        title: navBest === 'headless' ? 'Clicking around is where headless wins' : `${nm(order[0])} finishes the shopping trip first`,
        body: `In the scripted five-step shopping trip on a phone, ${nm(order[0])} reaches the filled bag in ${fmtMs(tot(order[0]))}, ${nm(order[1])} in ${fmtMs(tot(order[1]))} and ${nm(order[2])} in ${fmtMs(tot(order[2]))}. Page-to-page moves take ${nm(navBest)} ${fmtMs(nav(navBest))} in total.`,
      });
    }
  }
  out.push({
    title: `${nm(heavy)} carries the most baggage`,
    body: `${nm(heavy)} pages average ${fmtBytes(a[heavy].total)} and ${Math.round(a[heavy].requests ?? 0)} requests, against ${fmtBytes(a[light].total)} for ${nm(light)}.${heavy === 'shopify' ? ' Most of the difference is Shopify’s own analytics and checkout preloading, which no theme can remove.' : ''} ${deskNote()}`,
  });
  return out;
}
