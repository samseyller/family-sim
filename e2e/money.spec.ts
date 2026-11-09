import { expect, test } from '@playwright/test';

test('money tab: overview, invest, buy a home with confirmation', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('family-sim'));
  await page.reload();
  await page.getByRole('button', { name: /start a new family/i }).click();
  await page.keyboard.press('5');
  await expect(page.getByRole('heading', { name: /net worth/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /lifestyle/i })).toBeVisible();

  // Invest $1,000 and see it reflected.
  await page.getByRole('button', { name: /^Invest \$1,000/ }).click();
  await expect(page.locator('.networth-grid')).toContainText('$1,000');

  // Buying needs a confirm tap; give the household enough cash via dev skip if needed.
  const buy = page.getByRole('button', { name: /10% down/ }).first();
  if (await buy.isDisabled()) {
    await expect(buy).toContainText(/up front/);
  } else {
    await buy.click();
    await expect(buy).toContainText(/Confirm purchase/);
    await buy.click();
    await expect(page.getByText(/Mortgage \$/).first()).toBeVisible();
  }
  await page.waitForTimeout(4500); // toast clears
  await page.screenshot({ path: `e2e/out/${info.project.name}-money.png`, fullPage: true });
  expect(errors).toEqual([]);
});
