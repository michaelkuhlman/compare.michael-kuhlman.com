// After `astro build`: write sitemap, precompress text assets (.br q11 + .gz -9) so nginx serves them statically.
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
// CMP_DIST: deploy/cmp-deploy builds into .dist-next and swaps it in; a plain `npm run build` writes dist/ itself.
const DIST = process.env.CMP_DIST ? resolve(process.env.CMP_DIST) : join(dirname(fileURLToPath(import.meta.url)), '../dist');
writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://compare.michael-kuhlman.com/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url></urlset>\n`);
let n = 0;
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(html|css|js|json|svg|csv|xml|txt)$/.test(f) && statSync(p).size > 1024) {
  const buf = readFileSync(p);
  writeFileSync(p + '.br', brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }));
  writeFileSync(p + '.gz', gzipSync(buf, { level: 9 }));
  n++;
} } };
walk(DIST);
console.log(`postbuild: sitemap + ${n} files precompressed`);
