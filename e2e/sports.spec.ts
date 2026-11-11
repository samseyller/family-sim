import { expect, test } from '@playwright/test';

test('pick a sport, buy gear, and see sports activities', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /start a new family/i }).click();
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.keyboard.press('2');
  await page.locator('summary', { hasText: /Take up a hobby|Hobby:|Sport:/ }).click();
  await page.getByRole('button', { name: /Sports…/ }).click();
  await page.getByRole('button', { name: /^⛳ Golf/ }).click();
  await expect(page.locator('.sub-head', { hasText: 'Golf · skill' })).toBeVisible();
  await page.getByRole('button', { name: /Custom-fit clubs/ }).click();
  await expect(page.getByText('training 1.2× faster')).toBeVisible();
  await page.screenshot({ path: 'e2e/out/sports-plan.png', fullPage: true });
  await page.keyboard.press('6');
  await page.getByRole('radio', { name: /Sports/ }).click();
  await expect(page.getByRole('button', { name: /Enter a race or tournament/ })).toBeEnabled();
  expect(errors).toEqual([]);
});
