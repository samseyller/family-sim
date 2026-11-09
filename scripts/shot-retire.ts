/** Screenshot the Money tab's retirement card (dev server must be running). */
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:5173');
await page.evaluate(() => indexedDB.deleteDatabase('family-sim'));
await page.reload();
await page.getByRole('button', { name: /start a new family/i }).click();
await page.getByRole('button', { name: 'Begin' }).click();
await page.waitForTimeout(4500);
await page.keyboard.press('5');
await page.getByRole('radio', { name: '10%' }).click();
const card = page.locator('section', { has: page.getByRole('heading', { name: /retirement/i }) });
await card.scrollIntoViewIfNeeded();
await card.screenshot({ path: 'e2e/out/retirement-card.png' });
await browser.close();
