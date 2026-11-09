import { expect, test } from '@playwright/test';

test('activities: energy, choosing who comes, and the outcome card', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('family-sim'));
  await page.reload();
  await page.getByRole('button', { name: /start a new family/i }).click();
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.keyboard.press('6');
  await expect(page.locator('.energy')).toContainText('Energy');
  const before = await page.locator('.energy .row span').innerText();

  // Game night with someone at home.
  await page.locator('.activity', { hasText: 'Game night' }).click();
  await page.locator('.pick').first().click();
  await page.getByRole('button', { name: 'Do it' }).click();
  await expect(page.getByRole('dialog', { name: 'Game night' })).toBeVisible();
  await expect(page.locator('.changes')).toContainText('Energy -8');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `e2e/out/${info.project.name}-activity-result.png` });
  await page.getByRole('button', { name: 'Nice' }).click();
  expect(await page.locator('.energy .row span').innerText()).not.toBe(before);

  await page.waitForTimeout(4500); // let the toast clear
  await page.screenshot({ path: `e2e/out/${info.project.name}-activities.png`, fullPage: true });
  expect(errors).toEqual([]);
});
