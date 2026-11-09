/** Fast-forward a family with dev tools and screenshot the tree (needs a dev server started with VITE_ENABLE_DEV_TOOLS=true). */
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: Number(process.argv[2] ?? 420), height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:5173');
await page.evaluate(() => indexedDB.deleteDatabase('family-sim'));
await page.reload();
await page.getByRole('button', { name: /start a new family/i }).click();
await page.getByRole('button', { name: 'Begin' }).click();
for (let i = 0; i < Number(process.argv[3] ?? 6); i++) {
  await page.keyboard.press('`');
  await page.getByRole('button', { name: /skip 10 years/i }).click();
  // Continue past a death if needed.
  const heir = page.locator('.choice.heir').first();
  if (await heir.count()) await heir.click();
  if (await page.getByText(/family memorial|The .* Family/).count()) break;
}
await page.keyboard.press('3');
await page.getByRole('radio', { name: /tree/i }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: 'e2e/out/tree.png', fullPage: true });
await browser.close();
