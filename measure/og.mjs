// Renders dist/og/index.html to public/og.png (1200x630) and the apple-touch-icon from the favicon.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { chromePath } from './config.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/playwright/node_modules/playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
// served by nginx so the root-relative font URLs resolve
await p.goto('https://compare.michael-kuhlman.com/og/', { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
const png = await p.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } });
await sharp(png).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(join(ROOT, 'public/og.png'));
await b.close();
await sharp(join(ROOT, 'public/favicon.svg'), { density: 600 }).resize(140, 140).extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#f4f2ec' }).flatten({ background: '#f4f2ec' }).png().toFile(join(ROOT, 'public/apple-touch-icon.png'));
console.log('og.png + apple-touch-icon.png written');
