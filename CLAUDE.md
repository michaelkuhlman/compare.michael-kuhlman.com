# compare.michael-kuhlman.com - "Speed Trial"

Performance comparison of the Third Shot Supply Co. demo store on three stacks: m2.michael-kuhlman.com (Magento 2 / Luma),
headless.michael-kuhlman.com (Next.js on the same Magento) and shopify.michael-kuhlman.com (Shopify dev store, password
`thirdshot`). Full record: /home/kai/vault/kai-brain/projects/compare-site.md.

## Layout
- Static Astro 7 site. `npm run build` -> `dist/` (+ `measure/postbuild.mjs`: sitemap, .br/.gz siblings). nginx serves
  **only `dist/`** (vhost /etc/nginx/sites-available/compare.michael-kuhlman.com, headers snippet
  /etc/nginx/snippets/compare_headers.conf). No Node process, nothing to reload after a build.
- `src/` page + components; `src/lib/model.ts` is shared by the server render and the browser script
  (`src/scripts/app.ts`), so view switches use the same scales. `src/lib/story.ts` computes the headline sentences.
- `measure/` harness: `lighthouse.mjs` (CLI matrix, interleaved, 5 runs), `race.mjs` (real Chrome, applied throttling,
  screencast -> `public/race/*.webp` sprites), `journey.mjs` (scripted shopper + Event Timing), `psi.mjs` (PageSpeed
  Insights cross-check via pagespeed.web.dev, often rate-limited), `aggregate.mjs` (-> `data/results.json`,
  `public/data/*`, `public/reports/*.html`), `og.mjs` (social card), `run-all.sh` (all of it, flock'd).
- `data/` = committed measurement results (the site is built from these). `runs/` = raw runs, git-ignored.

## Rules
- Re-measure: `npm run measure` (~2 h, sequential, never parallel: do not hammer the stores; keep the box quiet while it
  runs, other CPU load skews TBT). Then review the page and commit `data/` + `public/race` + `public/data` + `public/og.png`.
- Shopify is unlocked by `measure/shopify-auth.mjs` (password form -> `_shopify_essential` cookie). The password comes from
  `~/.config/shopify/account.env`; never commit it or any token (pre-commit hook in `.githooks/` checks).
- Never modify the three stores from here (read/measure only).
- On this box `NODE_ENV=production` is exported: use `npm ci --include=dev` if dev deps are ever added (all deps are
  regular dependencies today).
- Playwright: `/opt/playwright/node_modules/playwright` with Chrome for Testing from ~/.cache/puppeteer (`chromePath()`).
- Lighthouse score of this site itself should stay ~100 (keep JS small, fonts preloaded, hero not hidden behind JS).
- Git: `~/bin/cmpgit` (repo ~/backups/compare/site.git, work tree = this folder). Local only, no GitHub repo yet.
  Commit files by name, never `add -A`, never force/reset/stash/clean here.
