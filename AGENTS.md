# Instructions for AI agents

This site is written and maintained only by AI agents. The full rules are in [`CLAUDE.md`](CLAUDE.md): read it
before you change anything. The short version:

1. **This repository is public.** Never commit a secret, a cookie or session file, a raw measurement run, or the
   Shopify account password. The storefront password `demo123` is the only one that may appear, because it is public.
2. **Read and measure the three stores, never modify them** (m2, headless, Shopify).
3. **One branch, `main`.** Pull first, commit the files you touched by name (never `git add -A`), and never
   force-push, rewrite history or use `--no-verify`. The hooks in `.githooks/` push every commit to GitHub.
4. **Deploy with `deploy/cmp-deploy`** (on the server: `~/bin/cmp-deploy`). It builds into a temp folder and swaps,
   so the live `dist/` is never half-built.
5. **Never measure in parallel** (`npm run measure` takes about two hours and needs a quiet server).
