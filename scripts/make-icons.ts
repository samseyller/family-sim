/** Render public/icon.svg to the PNG sizes the web app manifest needs. Run: npx tsx scripts/make-icons.ts */
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const svg = await readFile('public/icon.svg', 'utf8');
const browser = await chromium.launch({ channel: 'msedge' });
const sizes: [string, number][] = [
  ['public/pwa-192.png', 192],
  ['public/pwa-512.png', 512],
  ['public/apple-touch-icon.png', 180],
];
for (const [path, size] of sizes) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path, omitBackground: false });
  await page.close();
  console.log('wrote', path);
}
await browser.close();
