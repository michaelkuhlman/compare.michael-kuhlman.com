# compare.michael-kuhlman.com - "Speed Trial"

Performance comparison of the Third Shot Supply Co. demo store on three stacks: m2.michael-kuhlman.com (Magento 2 / Luma),
headless.michael-kuhlman.com (Next.js on the same Magento) and shopify.michael-kuhlman.com (Shopify dev store, password
`demo123`, was `thirdshot` until 2026-10-19). Full record: /home/kai/vault/kai-brain/projects/compare-site.md.

**The GitHub repository is PUBLIC.** Everything committed, including commit messages, is world-readable for good.

## Layout
- Static Astro 7 site. `npm run build` -> `dist/` (+ `measure/postbuild.mjs`: sitemap, .br/.gz siblings). nginx serves
  **only `dist/`** (vhost /etc/nginx/sites-available/compare.michael-kuhlman.com, headers snippet
  /etc/nginx/snippets/compare_headers.conf). No Node process, nothing to reload after a build. Deploy with
  `~/bin/cmp-deploy` (see below), which builds into `.dist-next` and swaps it in, so `dist/` is never half-written.
- `src/` page + components; `src/lib/model.ts` is shared by the server render and the browser script
  (`src/scripts/app.ts`), so view switches use the same scales. `src/lib/story.ts` computes the headline sentences.
- `measure/` harness: `lighthouse.mjs` (CLI matrix, interleaved, 5 runs), `race.mjs` (real Chrome, applied throttling,
  screencast -> `public/race/*.webp` sprites), `journey.mjs` (scripted shopper + Event Timing), `psi.mjs` (PageSpeed
  Insights cross-check via pagespeed.web.dev, often rate-limited), `aggregate.mjs` (-> `data/results.json`,
  `public/data/*`, `public/reports/*.html`), `og.mjs` (social card), `run-all.sh` (all of it, flock'd).
- `data/` = committed measurement results (the site is built from these). `runs/` = raw runs, git-ignored.
  `public/reports/` (full Lighthouse reports) is generated from `runs/` and git-ignored too: it exists only here.

## Rules
- Re-measure: `npm run measure` (~2 h, sequential, never parallel: do not hammer the stores; keep the box quiet while it
  runs, other CPU load skews TBT). Then review the page and commit `data/` + `public/race` + `public/data` + `public/og.png`.
- Shopify is unlocked by `measure/shopify-auth.mjs` (password form -> `_shopify_essential` cookie). The password comes from
  `~/.config/shopify/account.env`; never commit it, any other value from that file, any token or any cookie
  (`.githooks/pre-commit` checks). The storefront password `demo123` is public (the site prints it); the Shopify
  ACCOUNT password and the Cloudflare token are not.
- Never modify the three stores from here (read/measure only).
- On this box `NODE_ENV=production` is exported: use `npm ci --include=dev` if dev deps are ever added (all deps are
  regular dependencies today).
- Playwright: `/opt/playwright/node_modules/playwright` with Chrome for Testing from ~/.cache/puppeteer (`chromePath()`).
- Lighthouse score of this site itself should stay ~100 (keep JS small, fonts preloaded, hero not hidden behind JS).

## Git, GitHub and deploy
This site is written only by AI (Claude Code sessions on this server and on Michael's laptop); nobody edits files or
runs git by hand. Git is the record of what changed and why: every change is a commit, and every commit is on GitHub
within seconds.

- **GitHub: PUBLIC** `michaelkuhlman/compare.michael-kuhlman.com` (https://github.com/michaelkuhlman/compare.michael-kuhlman.com),
  one branch `main`, no PRs, no CI (the hooks run the checks, cmp-deploy builds). A ruleset on `main` refuses
  force-pushes and deletion; secret scanning with push protection is on. Since it is public, keep out anything that is
  not already fine to publish: no secrets, cookies, raw runs, private notes about people, or server internals beyond
  what this file already says.
- **On this server git is `cmpgit`** (`~/bin/cmpgit`): `GIT_DIR=/home/kai/backups/compare/site.git`, this directory as
  the work tree, so nothing under `/var/www` can serve repository internals. Plain `git` here says "not a git
  repository": expected, never `git init`. Push/pull use the repo-only deploy key `~/.ssh/id_cmp_github` via the ssh
  alias `github.com-cmp` (`ssh -T git@github.com-cmp` answers "Hi michaelkuhlman/compare.michael-kuhlman.com!").
  Commits use Michael's GitHub noreply address, never a real mailbox (the history is public).
- **Every change, in order:**
  1. `cmpgit pull --ff-only` before you start. If it refuses, the laptop pushed while this tree has unpushed commits:
     run `~/bin/cmp-deploy --sync-only`, which merges and pushes.
  2. Edit, then `~/bin/cmp-deploy --no-sync` to put it live and look at the page.
  3. `cmpgit add <each file by name>` and `cmpgit commit -m "<what changed and why>"`. Never `add -A` / `add .`, never
     `--no-verify`: another session may have live, uncommitted edits in this tree.
  4. The post-commit hook pushes to GitHub by itself and prints `pushed to GitHub`. If it prints `AUTO-PUSH FAILED`
     (the laptop pushed first), run `~/bin/cmp-deploy --sync-only`.
  Never `--force`, never rewrite pushed history, never `stash` / `reset --hard` / `checkout -- <file>` / `clean` here.
- **Hooks** (`.githooks/`, active through `core.hooksPath`, also in laptop clones):
  - `pre-commit` checks the STAGED files and blocks: token-shaped secrets and the real values from
    `~/.config/shopify/account.env` and the Cloudflare env (storefront password excepted); credential, session-cookie,
    database and dump files; leftovers (`.bak .old .orig .rej .save .swp .tmp`); generated output (`node_modules/`,
    `dist/`, `.dist-*`, `.astro/`, `runs/`, `public/reports/`, `*.log`); files over 5 MB; merge-conflict markers; hooks
    or deploy scripts without the executable bit; invalid JSON / XML / SVG; JavaScript and shell syntax errors; and a
    failing `astro build` of the work tree (about 3 s, into a temp folder) when the commit touches `src/`, `public/`,
    `data/` or the build config. The build check is skipped while a measurement runs and where `node_modules` is
    missing. Audit every tracked file: `CMP_PRECOMMIT_ALL=1 cmpgit hook run pre-commit`.
  - `post-commit` / `post-merge` / `post-rewrite` push `main` to GitHub (`CMP_NO_AUTOPUSH=1` skips it once).
  - `pre-push` refuses force-pushes and branch deletions.
- **Deploy = `~/bin/cmp-deploy`** (symlink to the tracked `deploy/cmp-deploy`): syncs with GitHub (fast-forward, push,
  or merge), runs `npm ci --include=dev` if the lockfile changed, builds into `.dist-next`, checks it, swaps it in
  (the old build stays in `.dist-prev`), checks that nginx serves it, and purges this host from the Cloudflare cache
  (filmstrips and `/data/` have fixed names and are edge-cached for a day). `--sync-only`, `--no-sync`, `--rollback`.
  It refuses while a measurement runs. `measure/run-all.sh` still uses a plain `npm run build` in place (the page is
  empty for those 3 s); everything else should go through cmp-deploy.
- **Laptop clone** (Windows): `C:\xampp\htdocs\compare.michael-kuhlman.com`, origin
  `git@github.com:michaelkuhlman/compare.michael-kuhlman.com.git`, `pull.rebase`, the same hooks. It has no
  `node_modules` (so no build check there), and it cannot measure. After a push from it: `ssh atlas bin/cmp-deploy`.
