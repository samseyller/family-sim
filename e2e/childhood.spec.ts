import { expect, test } from '@playwright/test';

test('start as a child: kid plan, parents, and a year of childhood', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('family-sim'));
  await page.reload();
  await page.getByRole('button', { name: /start as a child/i }).click();
  await expect(page.locator('.hero')).toContainText('Age 6');
  await expect(page.locator('.hero')).toContainText('In school');

  await page.keyboard.press('2');
  await expect(page.getByText(/^Mom: /)).toBeVisible();
  await expect(page.getByText(/^Dad: /)).toBeVisible();
  await expect(page.getByText('Study', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /work/i })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /lifestyle/i })).toHaveCount(0);
  await page.waitForTimeout(4500); // let the first toast clear
  await page.screenshot({ path: `e2e/out/${info.project.name}-child-plan.png`, fullPage: true });

  await page.locator('.end-year').click();
  await page.getByRole('button', { name: 'Live the year' }).click();
  for (let i = 0; i < 12 && (await page.locator('.modal').count()); i++) {
    await page.locator('.modal button:not([disabled])').first().click();
    await page.waitForTimeout(60);
  }
  await expect(page.locator('.topbar-mid')).toContainText(', 7');
  expect(errors).toEqual([]);
});
