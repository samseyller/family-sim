import { expect, test } from '@playwright/test';

test('name your character and family when starting', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('family-sim'));
  await page.reload();
  await page.getByRole('button', { name: /start a new family/i }).click();
  await expect(page.getByRole('button', { name: 'Begin' })).toBeFocused();
  await page.getByLabel('Your first name', { exact: true }).fill('wren');
  await page.getByLabel('Family name', { exact: true }).fill('Larkspur');
  // Typing letters that are also shortcuts must stay in the field.
  await page.getByLabel('Family name', { exact: true }).press('End');
  await page.screenshot({ path: `e2e/out/${info.project.name}-new-family.png` });
  await page.getByRole('button', { name: 'Begin' }).click();
  await expect(page.locator('.hero h2')).toHaveText('Wren Larkspur');

  // The whole family shares the name.
  await page.keyboard.press('3');
  const family = page.locator('section', { has: page.getByRole('heading', { name: 'Family', exact: true }) });
  const surnames = await family.locator('.person strong').allInnerTexts();
  expect(surnames.length).toBeGreaterThan(0);
  for (const n of surnames) expect(n).toMatch(/Larkspur$/);
  expect(errors).toEqual([]);
});
