import { expect, test } from '@playwright/test';

test('suggesting a hobby to a child: every label fits its button', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: /start a new family/i }).click();
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.keyboard.press('2');
  const group = page.getByRole('radiogroup', { name: /Suggest a hobby to/ }).first();
  test.skip(!(await group.count()), 'this family has no child without a hobby');
  await group.scrollIntoViewIfNeeded();
  const overflowing = await group.locator('button').evaluateAll((bs) => bs.filter((b) => b.scrollWidth > b.clientWidth).map((b) => b.textContent));
  expect(overflowing, `${info.project.name}: labels wider than their buttons`).toEqual([]);
});
