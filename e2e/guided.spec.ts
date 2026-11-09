import { expect, test } from '@playwright/test';

test('guided first life: starts at 18 with only Home and Plan, with tips', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('family-sim'));
  await page.reload();
  await page.getByRole('button', { name: /guided first life/i }).click();
  await page.getByRole('button', { name: 'Begin' }).click();

  await expect(page.locator('.topbar-mid')).toContainText(', 18');
  const tabs = page.locator('.tabbar button');
  await expect(tabs).toHaveCount(2);
  await expect(page.locator('.coach')).toContainText('Welcome to your first life');
  await page.waitForTimeout(4500); // toast clears
  await page.screenshot({ path: `e2e/out/${info.project.name}-guided-home.png`, fullPage: true });
  await page.getByRole('button', { name: 'Got it' }).click();

  await page.keyboard.press('2');
  await expect(page.locator('.coach')).toContainText('Planning your year');
  await page.getByRole('button', { name: 'Got it' }).click();
  // Locked tabs can't be reached by shortcut.
  await page.keyboard.press('5');
  await expect(page.getByRole('heading', { name: /net worth/i })).toHaveCount(0);

  // First year: the after-high-school choice comes up.
  await page.locator('.end-year').click();
  await page.getByRole('button', { name: 'Live the year' }).click();
  await expect(page.locator('.modal h2').first()).toHaveText("You're 18");
  expect(errors).toEqual([]);
});
