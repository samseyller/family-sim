import { expect, test } from '@playwright/test';

test('investing: $50k option, withdraw options that grow with the balance, and bigger college-fund deposits', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  await page.goto('/');
  await page.getByRole('button', { name: /start a new family/i }).click();
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.keyboard.press('5');
  const inv = page.locator('section', { has: page.getByRole('heading', { name: /Investments/ }) });
  await expect(inv.getByRole('button', { name: /Invest \$50,000/ })).toBeVisible();
  await expect(inv.locator('hr.money-sep')).toHaveCount(1);
  // With nothing invested, only the smallest withdraw option shows.
  await expect(inv.getByRole('button', { name: /^Withdraw \$/ })).toHaveCount(1);
  await inv.getByRole('button', { name: /Invest \$1,000/ }).click();
  await expect(inv.getByRole('button', { name: /Withdraw all/ })).toBeVisible();
  const funds = page.locator('section', { has: page.getByRole('heading', { name: /College funds/ }) });
  await expect(funds.getByRole('button', { name: 'Add $10,000' }).first()).toBeVisible();
  await expect(funds.getByRole('button', { name: 'Add $20,000' }).first()).toBeVisible();
  await expect(funds).toContainText('$500,000');
});
