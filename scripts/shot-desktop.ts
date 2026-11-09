/** Screenshot the main tabs at desktop width (dev server must be running). */
import { chromium } from '@playwright/test';

const width = Number(process.argv[2] ?? 1280);
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width, height: 860 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:5173');
await page.evaluate(() => indexedDB.deleteDatabase('family-sim'));
await page.reload();
await page.getByRole('button', { name: /start a new family/i }).click();
await page.getByRole('button', { name: 'Begin' }).click();
await page.waitForTimeout(4500); // let the first toast clear
for (const [key, name] of [['1', 'home'], ['2', 'plan'], ['3', 'family']] as const) {
  await page.keyboard.press(key);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `e2e/out/desktop-${name}-${width}.png`, fullPage: name === 'plan' });
}
await browser.close();
