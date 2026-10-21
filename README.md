# Speed Trial: compare.michael-kuhlman.com

One demo store, Third Shot Supply Co. (a fictional pickleball brand), built three ways and measured the same way.
The results are at **https://compare.michael-kuhlman.com**.

| Stack | Live store | Source |
|---|---|---|
| Magento 2: Mage-OS 3.5 (Magento 2.4.9), Luma child theme | https://m2.michael-kuhlman.com | [michaelkuhlman/m2.michael-kuhlman.com](https://github.com/michaelkuhlman/m2.michael-kuhlman.com) |
| Headless: Next.js 16 storefront on the same Magento | https://headless.michael-kuhlman.com | [michaelkuhlman/headless.michael-kuhlman.com](https://github.com/michaelkuhlman/headless.michael-kuhlman.com) |
| Shopify: custom theme on a development store | https://shopify.michael-kuhlman.com (storefront password `demo123`) | theme lives in Shopify |

Each stack serves the same six pages: home, a category (Paddles), a configurable product (Kitchen Line Carbon 16),
a content page (Our Story), a search ("paddle") and the empty cart.

## How it is measured

All runs come from one server, one page load at a time, interleaved across the stacks so a slow minute on the
network hits all three alike.

- **Lighthouse** (`measure/lighthouse.mjs`): the CLI with its default mobile config and the desktop preset, every
  page x stack x form factor, several runs each. The site shows the median.
- **Race** (`measure/race.mjs`): a real Chrome with applied throttling (562.5 ms latency, 1.47 Mbps, 4x CPU, phone
  viewport). It records a screencast and measures FCP, LCP, CLS, long tasks and bytes in the page. The median run
  becomes the filmstrip in `public/race/`.
- **Journey** (`measure/journey.mjs`): a scripted shopper goes home, Paddles, product, picks a colour, adds to bag,
  opens the bag. Each step is timed until the next screen is usable, so a client-side navigation (headless) and a
  full page load (Magento, Shopify) compare on equal terms. Event Timing records the taps (the data INP is built from).
- **PageSpeed Insights** (`measure/psi.mjs`): an optional cross-check against Google's own lab.

`measure/aggregate.mjs` turns the raw runs (in `runs/`, not committed) into `data/*.json`, which the site is built
from, plus downloads in `public/data/`.

## Repository layout

```
src/            the page: components/, lib/ (model.ts is shared by the server render and the browser script), scripts/
data/           committed measurement results; the site renders these
public/         static files: race filmstrips, fonts, og.png, downloadable data
measure/        the measurement harness and postbuild.mjs (sitemap, precompressed .br/.gz)
deploy/         cmp-deploy: GitHub sync, build, atomic swap, Cloudflare purge
.githooks/      pre-commit checks and auto-push (see CLAUDE.md)
```

## Build

Node 24 (`.nvmrc`).

```
npm ci
npm run build      # static site in dist/
npm run dev        # local preview
```

The build needs only this repository. Measuring (`npm run measure`, about two hours) needs the production server:
Playwright, Chrome for Testing and the Shopify storefront unlock, all described in `CLAUDE.md`.

## Who works on it

The code, the measurements and this README are written by AI coding agents (Claude Code), working on the production
server and on a laptop clone. People don't edit the files. Agents start with [`CLAUDE.md`](CLAUDE.md), and
[`AGENTS.md`](AGENTS.md) points other agents there. Every change is a commit. The hooks in `.githooks/` check each
commit (secrets, generated files, syntax, a full build) and push it to GitHub, and `deploy/cmp-deploy` puts it live.

## Credentials

There are none in this repository. The Shopify storefront password above is public on purpose, since the comparison
links to the store. Everything else stays on the server, outside the repository, and the pre-commit hook blocks
token-shaped strings and the server's real secret values.

Built by [Michael Kuhlman](https://www.michael-kuhlman.com), Magento 2 / Adobe Commerce developer.
