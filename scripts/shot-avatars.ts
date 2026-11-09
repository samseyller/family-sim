/** Screenshot the dev avatar gallery (dev server must be running). */
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'msedge' });
for (const scheme of ['light', 'dark'] as const) {
  const page = await browser.newPage({ viewport: { width: Number(process.argv[3] ?? 72) * 8 + 120, height: 560 }, colorScheme: scheme });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto(`http://localhost:5173/dev/avatars.html?seed=${process.argv[2] ?? 7}&size=${process.argv[3] ?? 72}`);
  await page.waitForSelector('svg');
  await page.screenshot({ path: `e2e/out/avatars-${scheme}.png`, fullPage: true });
  await page.close();
}
await browser.close();
