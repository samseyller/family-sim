/** Check the production build is installable and playable offline. Needs `npx vite preview --port 4173`. */
import { chromium } from '@playwright/test';

const URL = 'http://localhost:4173/';
const browser = await chromium.launch({ channel: 'msedge' });
const context = await browser.newContext();
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(URL);

const manifest = await page.evaluate(async () => {
  const href = document.querySelector('link[rel=manifest]')?.getAttribute('href');
  return href ? (await fetch(href)).json() : null;
});
console.log('manifest:', manifest?.name, '| display:', manifest?.display, '| icons:', manifest?.icons?.map((i: { sizes: string }) => i.sizes).join(','));

await page.evaluate(() => navigator.serviceWorker.ready);
const controlled = await page.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 500));
  return !!(await navigator.serviceWorker.getRegistration());
});
console.log('service worker registered:', controlled);

// Reload once so the SW controls the page, then go offline and reload again.
await page.reload();
await context.setOffline(true);
await page.reload();
const offlineOk = await page.getByRole('button', { name: /start a new family/i }).isVisible();
console.log('works offline:', offlineOk);
if (offlineOk) {
  await page.getByRole('button', { name: /start a new family/i }).click();
  console.log('can start a game offline:', await page.locator('.hero h2').isVisible());
}
await browser.close();
