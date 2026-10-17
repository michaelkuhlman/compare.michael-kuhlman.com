// Browser side: device/page switches (same numbers + scales as the server render), scroll reveals,
// counters, the filmstrip race player and the journey replay. No framework, ~one small module.
import { placing, fmtInp, STACK_IDS, METRICS, WEIGHT_KEYS, fmtMetric, fmtMs, fmtBytes, fmtSec, metricMax, ticks, tickLabel, pct, bestOf, scoreBand, PAGE_META, type PageId } from '../lib/model';

const D = JSON.parse(document.getElementById('data')!.textContent!);
const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll(sel)) as T[];
const state = { form: 'mobile', page: 'home' as PageId };
const cell = (s: string, form = state.form, page = state.page) => D.lh[form]?.[page]?.[s] ?? null;
const setText = (el: Element | null, t: string) => { if (el && el.textContent !== t) el.textContent = t; };

/* ---------------- reveal + counters ---------------- */
const counted = new WeakSet<Element>();
function countTo(el: HTMLElement, to: number, from = 0, dur = 1200) {
  if (!motion) { el.textContent = String(Math.round(to)); return; }
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 4);
    el.textContent = String(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const io = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const el = e.target as HTMLElement;
    el.classList.add('in');
    io.unobserve(el);
    $$('[data-count]', el).forEach(c => { if (!counted.has(c)) { counted.add(c); countTo(c, +(c.textContent || 0)); } });
    if (el.matches('.board')) setTimeout(() => el.classList.add('ready'), 1600);
    if (el.matches('[data-journey]')) playJourney();
  }
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
$$('.rv').forEach(el => io.observe(el));

/* ---------------- scroll progress + active nav ---------------- */
const bar = $('.progress i');
const navLinks = $$<HTMLAnchorElement>('.nav a');
const secs = navLinks.map(a => $(a.getAttribute('href')!)).filter(Boolean) as HTMLElement[];
let ticking = false;
addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const h = document.documentElement;
    bar?.style.setProperty('--p', String(h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)));
    let on = -1;
    secs.forEach((s, i) => { if (s.getBoundingClientRect().top < 140) on = i; });
    navLinks.forEach((a, i) => a.classList.toggle('on', i === on));
    ticking = false;
  });
}, { passive: true });

/* ---------------- hero ---------------- */
const C = 2 * Math.PI * 52;
function updateHero() {
  const a = D.avg[state.form];
  for (const s of STACK_IDS) {
    const card = $(`.sc[data-stack="${s}"]`);
    if (!card) continue;
    const v = a[s];
    const num = $('[data-h="perf"]', card)!;
    const prev = +(num.textContent || 0);
    countTo(num, Math.round(v.perf ?? 0), prev, 800);
    ($('[data-h="ring"]', card) as unknown as SVGElement).style.setProperty('--off', (C * (1 - (v.perf ?? 0) / 100)).toFixed(1));
    const pl = placing(Object.fromEntries(STACK_IDS.map(x => [x, a[x].perf])), s);
    const rk = $('[data-h="rank"]', card)!;
    rk.className = `rank r${pl.r}`;
    setText(rk, pl.label);
    setText($('[data-h="lcp"]', card), fmtMs(v.lcp));
    setText($('[data-h="tbt"]', card), fmtMs(v.tbt));
    setText($('[data-h="total"]', card), fmtBytes(v.total));
    setText($('[data-h="wins"]', card), `${v.wins} of 6`);
  }
  const vd = $('[data-verdict]');
  if (vd) vd.innerHTML = D.verdicts[state.form];
  setText($('[data-form-label]'), state.form === 'mobile' ? 'Mobile: moto g class phone, 4× slower CPU, throttled 4G.' : 'Desktop: Lighthouse desktop preset, fast connection, no CPU slowdown.');
}

/* ---------------- scoreboard ---------------- */
function updateBoard() {
  const sec = $('#scoreboard');
  if (!sec) return;
  const lo = +(sec.dataset.lo || 0);
  const x = (v: number | null) => (v == null ? 0 : ((v - lo) / (100 - lo)) * 100);
  for (const row of $$('.row', sec)) {
    const id = row.dataset.row!;
    for (const s of STACK_IDS) {
      const c = id === 'avg' ? null : cell(s, state.form, id as PageId);
      const v = id === 'avg' ? D.avg[state.form][s].perf : c?.s[0] ?? null;
      const lane = $(`.lane[data-stack="${s}"]`, row)!;
      $('.dot', lane)!.style.setProperty('--x', `${x(v)}%`);
      const rng = $('.rng', lane)!;
      if (c) { rng.style.setProperty('--a', `${x(Math.min(...c.ps))}%`); rng.style.setProperty('--b', `${x(Math.max(...c.ps))}%`); }
      setText($(`.vals [data-stack="${s}"]`, row), v == null ? '–' : String(Math.round(v)));
      setText($(`[data-table="scores"] tr[data-row="${id}"] td[data-stack="${s}"]`), v == null ? '–' : String(Math.round(v)));
    }
  }
}

/* ---------------- vitals ---------------- */
function updateVitals() {
  for (const m of METRICS) {
    const card = $(`.metric[data-metric="${m.id}"]`);
    if (!card) continue;
    const cells = STACK_IDS.map(s => cell(s));
    const vals: (number | null)[] = cells.map(c => c?.m[m.id] ?? null);
    const runs = cells.flatMap(c => (c?.r[m.id] ?? []).filter((v: number | null) => v != null));
    const max = metricMax(m.id, m.poor, [...(vals.filter(v => v != null) as number[]), ...runs]);
    const best = bestOf(vals, false, m.id === 'cls' ? 0.005 : 0);
    const chart = $('.chart', card)!;
    chart.style.setProperty('--good', pct((m.good / max) * 100));
    chart.style.setProperty('--poor', pct((m.poor / max) * 100));
    STACK_IDS.forEach((s, i) => {
      const row = $(`.brow[data-stack="${s}"]`, card)!;
      const w = pct(((vals[i] ?? 0) / max) * 100);
      $('.bar', row)!.style.setProperty('--w', w);
      const bv = $('.bv', row)!;
      bv.style.setProperty('--w', w);
      bv.classList.toggle('is-best', best === i);
      bv.innerHTML = fmtMetric(m.id, vals[i]) + (best === i ? '<em> best</em>' : '');
      const rr: (number | null)[] = cells[i]?.r[m.id] ?? [];
      const box = $('.runs', row)!;
      while (box.children.length < rr.length) box.appendChild(document.createElement('i'));
      while (box.children.length > rr.length) box.lastElementChild!.remove();
      rr.forEach((r, j) => (box.children[j] as HTMLElement).style.left = pct((((r ?? 0) as number) / max) * 100));
      setText($(`[data-table="vitals"] tr[data-metric="${m.id}"] td[data-stack="${s}"]`), fmtMetric(m.id, vals[i]));
    });
    $('.bticks', card)!.innerHTML = ticks(max, m.id).map(t => `<span style="left:${pct((t / max) * 100)}">${tickLabel(m.id, t)}</span>`).join('');
  }
}

/* ---------------- weight ---------------- */
function updateWeight() {
  for (const k of WEIGHT_KEYS) {
    const tile = $(`.tile[data-wk="${k.id}"]`);
    if (!tile) continue;
    const vals: (number | null)[] = STACK_IDS.map(s => cell(s)?.w[k.id] ?? null);
    const max = Math.max(1, ...(vals.filter(v => v != null) as number[]));
    const b = bestOf(vals);
    const f = (v: number | null) => (v == null ? '–' : k.id === 'requests' ? String(Math.round(v)) : fmtBytes(v));
    STACK_IDS.forEach((s, i) => {
      const row = $(`.wrow[data-stack="${s}"]`, tile)!;
      $('.wbar', row)!.style.setProperty('--w', pct(((vals[i] ?? 0) / max) * 100));
      const wv = $('.wv', row)!;
      setText(wv, f(vals[i]));
      wv.classList.toggle('is-best', b === i);
      setText($(`[data-table="weight"] tr[data-wk="${k.id}"] td[data-stack="${s}"]`), f(vals[i]));
    });
  }
  const sh = cell('shopify');
  if (sh) { setText($('[data-co="total"]'), fmtBytes(sh.w.total)); setText($('[data-co="platform"]'), fmtBytes(sh.w.platform)); setText($('[data-co="idle"]'), fmtBytes(sh.w.idle)); }
}

/* ---------------- quality ---------------- */
function updateQuality() {
  const keys = ['a11y', 'bp', 'seo'];
  keys.forEach((k, ci) => {
    for (const s of STACK_IDS) {
      const li = $(`.qcat[data-q="${k}"] li[data-stack="${s}"]`);
      if (!li) continue;
      const q = D.quality[state.form][s];
      const v = q.scores[ci];
      const el = $('[data-qv]', li)!;
      el.className = `qv num b-${scoreBand(v ?? 0)}`;
      setText(el, v == null ? '–' : String(Math.round(v)));
      setText($('[data-qf]', li), q.fails[k].length ? q.fails[k].join(' · ') : 'No failed checks');
    }
  });
}

/* ---------------- journey ---------------- */
const STEP_KEYS = ['home', 'category', 'product', 'add', 'cart'];
function journeyMax() { return Math.max(...STACK_IDS.map(s => D.journey?.results?.[`${state.form}/${s}`]?.total ?? 0)) * 1.04 || 1; }
function updateJourney() {
  const box = $('[data-journey]');
  if (!box || !D.journey) return;
  const M = journeyMax();
  const ANIM = 2600;
  for (const s of STACK_IDS) {
    const j = D.journey.results[`${state.form}/${s}`];
    const lane = $(`.jlane[data-stack="${s}"]`, box)!;
    let acc = 0;
    STEP_KEYS.forEach(k => {
      const v = j?.steps?.[k] ?? 0;
      const seg = $(`.jseg[data-step="${k}"]`, lane)!;
      seg.style.setProperty('--l', pct((acc / M) * 100));
      seg.style.setProperty('--w', pct((v / M) * 100));
      seg.style.setProperty('--del', `${((acc / M) * ANIM) / 1000}s`);
      seg.style.setProperty('--dur', `${Math.max(0.05, ((v / M) * ANIM) / 1000)}s`);
      $('span', seg)!.style.visibility = (v / M) * lane.clientWidth > 26 ? 'visible' : 'hidden';
      acc += v;
    });
    const tot = $('.jtot', lane)!;
    tot.style.setProperty('--l', pct((acc / M) * 100));
    tot.style.setProperty('--tdel', `${((acc / M) * ANIM) / 1000}s`);
    setText(tot, fmtSec(j?.total, 1));
  }
  // axis
  const step = M > 20000 ? 5000 : M > 8000 ? 2000 : M > 4000 ? 1000 : 500;
  let html = '';
  for (let t = 0; t <= M; t += step) html += `<span style="left:${pct((t / M) * 100)}">${t / 1000} s</span>`;
  $('[data-jaxis]', box)!.innerHTML = html;
  // table
  for (const k of [...STEP_KEYS, 'total']) {
    const vals = STACK_IDS.map(s => { const j = D.journey.results[`${state.form}/${s}`]; return (k === 'total' ? j?.total : j?.steps?.[k]) ?? null; });
    const b = bestOf(vals);
    STACK_IDS.forEach((s, i) => { const td = $(`[data-table="journey"] tr[data-k="${k}"] td[data-stack="${s}"]`); if (td) { setText(td, fmtMs(vals[i])); td.classList.toggle('best', b === i); } });
  }
  // tap response
  const grid = $('.inp-grid', box)!;
  const imax = +(grid.dataset.inpmax || 600);
  for (const k of ['swatch', 'add']) for (const s of STACK_IDS) {
    const v = D.journey.results[`${state.form}/${s}`]?.inp?.[k] ?? null;
    const row = $(`.inp-g[data-ik="${k}"] .ib[data-stack="${s}"]`, grid)!;
    const w = pct(((v ?? 0) / imax) * 100);
    $('.ibar', row)!.style.setProperty('--w', w);
    const lab = $('.ibv', row)!; lab.style.setProperty('--w', w); setText(lab, fmtInp(v));
  }
}
function playJourney() {
  const box = $('[data-journey]');
  if (!box) return;
  box.classList.remove('play');
  void box.offsetWidth;
  box.classList.add('play');
}
$('[data-jreplay]')?.addEventListener('click', playJourney);

/* ---------------- switches ---------------- */
function setForm(f: string) {
  if (f === state.form) return;
  state.form = f;
  $$('[data-form]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.form === f)));
  updateHero(); updateBoard(); updateVitals(); updateWeight(); updateQuality(); updateJourney();
  if ($('[data-journey]')?.classList.contains('in')) playJourney();
}
function setPage(p: PageId) {
  state.page = p;
  $$('[data-page-tabs]').forEach(g => $$('[data-page]', g).forEach(b => { const on = b.dataset.page === p; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }));
  $$('[data-page-note]').forEach(n => setText(n, PAGE_META[p].note));
  updateVitals(); updateWeight();
}
$$('[data-form]').forEach(b => b.addEventListener('click', () => setForm(b.dataset.form!)));
$$('[data-page-tabs] [data-page]').forEach(b => b.addEventListener('click', () => setPage(b.dataset.page as PageId)));
// arrow keys inside every tab list
$$('[role="tablist"]').forEach(list => list.addEventListener('keydown', e => {
  const ev = e as KeyboardEvent;
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
  const tabs = $$<HTMLButtonElement>('[role="tab"]', list);
  const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
  const n = ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[n].focus(); tabs[n].click(); ev.preventDefault();
}));

/* ---------------- race ---------------- */
const rbox = $('[data-race]');
if (rbox && D.race) {
  let rpage = 'home', T = +(rbox.dataset.t || 8000), t = T, speed = 1, playing = false, last = 0, raf = 0, armed = false;
  const lanes = STACK_IDS.map(s => ({ s, el: $(`.lane[data-stack="${s}"]`, rbox)!, screen: $('[data-film]', $(`.lane[data-stack="${s}"]`, rbox)!)! }));
  const scrub = $<HTMLInputElement>('[data-scrub]', rbox)!;
  const clock = $('[data-clock]', rbox)!;
  const head = $('[data-head]', rbox)!;
  const label = $('[data-play-label]', rbox)!;
  const playBtn = $('[data-play]', rbox)!;
  const res = (s: string) => D.race.results[`${rpage}/${s}`];
  const loaded = new Map<string, Promise<void>>();
  const loadImg = (src: string) => { if (!loaded.has(src)) loaded.set(src, new Promise(r => { const im = new Image(); im.onload = im.onerror = () => r(); im.src = src; })); return loaded.get(src)!; };
  function curve(s: string) {
    const r = res(s); if (!r) return '';
    let d = 'M0 200', py = 200;
    r.film.times.forEach((tt: number, i: number) => { const x = (tt / T) * 1000, y = 200 - r.film.done[i] * 200; d += ` L${x.toFixed(1)} ${py.toFixed(1)} L${x.toFixed(1)} ${y.toFixed(1)}`; py = y; });
    return d + ` L1000 ${py.toFixed(1)}`;
  }
  function axis() {
    const step = T > 12000 ? 2000 : 1000;
    let h = '';
    for (let x = 0; x <= T; x += step) h += `<span style="left:${pct((x / T) * 100)}">${x / 1000} s</span>`;
    $('[data-pc-axis]', rbox)!.innerHTML = h;
  }
  function render() {
    for (const L of lanes) {
      const r = res(L.s); if (!r) continue;
      const times: number[] = r.film.times;
      let i = 0; while (i + 1 < times.length && times[i + 1] <= t) i++;
      L.screen.style.setProperty('--i', String(i));
      for (const k of ['fcp', 'lcp', 'vc']) $(`[data-mile="${k}"]`, L.el)!.classList.toggle('hit', t >= r.median[k]);
      L.el.classList.toggle('finished', t >= r.median.vc);
    }
    clock.textContent = fmtSec(t, 1);
    scrub.value = String(t);
    scrub.setAttribute('aria-valuetext', fmtSec(t, 1));
    head.setAttribute('d', `M${((t / T) * 1000).toFixed(1)} 0V200`);
  }
  function stop(ended = false) {
    playing = false; cancelAnimationFrame(raf);
    rbox!.classList.remove('playing'); rbox!.classList.toggle('ended', ended);
    label.textContent = ended ? 'Replay' : 'Play';
    playBtn.setAttribute('aria-label', ended ? 'Replay the race' : 'Play the race');
  }
  function frame(now: number) {
    t = Math.min(T, t + (now - last) * speed); last = now;
    render();
    if (t >= T) return stop(true);
    raf = requestAnimationFrame(frame);
  }
  async function play() {
    await Promise.all(lanes.map(L => { const r = res(L.s); return r ? loadImg(`/race/${r.film.file}?v=${D.race.v}`) : null; }));
    if (t >= T) t = 0;
    playing = true; last = performance.now();
    rbox!.classList.add('playing'); rbox!.classList.remove('ended');
    label.textContent = 'Pause'; playBtn.setAttribute('aria-label', 'Pause the race');
    raf = requestAnimationFrame(frame);
  }
  function setRacePage(p: string) {
    rpage = p; stop(false);
    $$('[data-rpage]', rbox).forEach(b => { const on = b.dataset.rpage === p; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    T = Math.ceil((Math.max(...STACK_IDS.map(s => { const r = res(s); return r ? Math.max(r.median.vc, r.median.lcp, r.median.fcp) : 0; })) + 600) / 500) * 500;
    scrub.max = String(T);
    for (const L of lanes) {
      const r = res(L.s); if (!r) continue;
      L.screen.style.setProperty('--n', String(r.film.times.length));
      L.screen.style.backgroundImage = `url(/race/${r.film.file}?v=${D.race.v})`;
      $('[data-flag]', L.el)!.textContent = `Done ${fmtSec(r.median.vc, 1)}`;
      for (const k of ['fcp', 'lcp', 'vc']) setText($(`[data-mile="${k}"] b`, L.el), fmtSec(r.median[k], 1));
      $(`.pc-line[data-stack="${L.s}"]`, rbox)!.setAttribute('d', curve(L.s));
      const f: Record<string, (v: number) => string> = { fcp: fmtMs, lcp: fmtMs, si: fmtMs, vc: fmtMs, tbt: fmtMs, bytes: fmtBytes, requests: v => String(Math.round(v)) };
      for (const k of Object.keys(f)) setText($(`[data-table="race"] tr[data-k="${k}"] td[data-stack="${L.s}"]`), f[k](r.median[k]));
    }
    axis();
    t = motion ? 0 : T;
    render();
    if (motion && armed) play();
  }
  playBtn.addEventListener('click', () => (playing ? stop(false) : play()));
  scrub.addEventListener('input', () => { if (playing) stop(false); t = +scrub.value; rbox.classList.toggle('ended', t >= T); render(); });
  $$('[data-speed]', rbox).forEach(b => b.addEventListener('click', () => { speed = +b.dataset.speed!; $$('[data-speed]', rbox).forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
  $$('[data-rpage]', rbox).forEach(b => b.addEventListener('click', () => setRacePage(b.dataset.rpage!)));
  // sprites load only when the race gets near; it plays once by itself when scrolled into view (if motion is OK)
  const near = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { near.disconnect(); setRacePage(rpage); } }, { rootMargin: '600px 0px' });
  near.observe(rbox);
  const vis = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { vis.disconnect(); armed = true; if (motion) { t = 0; play(); } } }, { threshold: 0.45 });
  vis.observe($('.lanes', rbox)!);
}

/* ---------------- first paint is server-rendered for mobile/home; fill in what needs layout ---------------- */
updateJourney();
