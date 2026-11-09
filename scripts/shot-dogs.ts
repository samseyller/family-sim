/** Screenshot the dog gallery (dev server must be running on the given port, default 5173). */
import { chromium } from '@playwright/test';

const port = process.argv[2] ?? '5173';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1250, height: 900 } });
await page.goto(`http://localhost:${port}/dev/dogs.html?size=${process.argv[3] ?? 96}`);
await page.waitForSelector('.dog-face');
await page.screenshot({ path: 'e2e/out/dogs-gallery.png', fullPage: true });
await browser.close();
console.log('saved e2e/out/dogs-gallery.png');
