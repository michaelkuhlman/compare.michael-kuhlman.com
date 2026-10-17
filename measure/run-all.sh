#!/usr/bin/env bash
# Re-runs the whole trial and rebuilds the site. Strictly sequential (one page load at a time), ~90-120 min.
#   npm run measure            # everything
#   SKIP_LH=1 npm run measure  # keep the newest Lighthouse runs, redo race + journey
# Raw runs land in runs/ (git-ignored); data/*.json and the site are regenerated. Then commit data/ with cmpgit.
set -euo pipefail
cd "$(dirname "$0")/.."
exec 9>/tmp/compare-measure.lock
flock -n 9 || { echo "another measurement is running"; exit 1; }
stamp=$(date +%Y-%m-%d-%H%M)
[ -n "${SKIP_LH:-}" ] || node measure/lighthouse.mjs --runs "${RUNS:-5}" --out "runs/lh-$stamp"
[ -n "${SKIP_RACE:-}" ] || node measure/race.mjs --runs 3 --out "runs/race-$stamp"
[ -n "${SKIP_JOURNEY:-}" ] || node measure/journey.mjs --runs 3
[ -z "${WITH_PSI:-}" ] || node measure/psi.mjs || echo "PSI cross-check failed (quota?), keeping the old data/psi.json"
node measure/aggregate.mjs
npm run build
node measure/og.mjs || true
npm run build >/dev/null
echo "done: review https://compare.michael-kuhlman.com/ then commit data/ (cmpgit add data && cmpgit commit)"
