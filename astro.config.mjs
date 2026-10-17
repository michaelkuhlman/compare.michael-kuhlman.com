import { defineConfig } from 'astro/config';

// Static site: `npm run build` writes dist/, which nginx serves. No Node process in production.
export default defineConfig({
  site: 'https://compare.michael-kuhlman.com',
  output: 'static',
  build: { inlineStylesheets: 'always', assets: '_assets' },
  compressHTML: true,
  devToolbar: { enabled: false },
  vite: { build: { assetsInlineLimit: 0 } },
});
