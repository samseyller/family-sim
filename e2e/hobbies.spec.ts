import { expect, test } from '@playwright/test';

test('take up a hobby, see practice costs, and browse hobby gear', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /start a new family/i }).click();
  await page.getByRole('button', { name: 'Begin' }).click();

  await page.keyboard.press('2');
  await page.locator('summary', { hasText: /Take up a hobby|Hobby:/ }).click();
  await page.getByRole('button', { name: /Woodworking/ }).click();
  await expect(page.locator('summary', { hasText: 'Hobby: Woodworking' })).toBeVisible();
  await expect(page.getByText(/Practice woodworking/)).toBeVisible();
  await expect(page.getByText('$120 per block').first()).toBeVisible();
  await page.screenshot({ path: 'e2e/out/hobby-plan.png', fullPage: true });

  await page.keyboard.press('5');
  const gear = page.locator('section', { has: page.getByRole('heading', { name: /Hobby gear/ }) });
  await expect(gear).toContainText('Single-engine plane');
  await expect(gear).toContainText('Project car');
  await gear.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'e2e/out/hobby-gear.png' });
  expect(errors).toEqual([]);
});
