import { expect, test } from '@playwright/test';

test('adopt a kitten, see it in the family, and play with it', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /start a new family/i }).click();
  await page.getByRole('button', { name: 'Begin' }).click();

  await page.keyboard.press('3');
  const cats = page.locator('section', { has: page.getByRole('heading', { name: /Cats/ }) });
  await expect(cats).toContainText('No cat yet');
  await cats.getByRole('button', { name: /Adopt a cat/ }).click();
  await cats.getByLabel('Name').fill('Noodle');
  await cats.locator('.breed', { hasText: 'Domestic Shorthair' }).getByRole('button', { name: /Adopt:/ }).click();
  await expect(cats.locator('.dog-row')).toContainText('Noodle');
  await expect(cats.locator('.dog-row')).toContainText('kitten');
  await expect(cats.locator('.dog-row svg.dog-face')).toBeVisible();
  await cats.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `e2e/out/${info.project.name}-cats.png`, fullPage: true });

  // Play from Activities → Pets.
  await page.keyboard.press('6');
  await page.getByRole('button', { name: /Play with the cats/ }).first().click();
  await page.getByRole('button', { name: 'Do it' }).click();
  await page.getByRole('button', { name: 'Nice' }).click();
  await page.keyboard.press('3');
  await expect(cats.locator('.dog-row')).toContainText('played');
  expect(errors).toEqual([]);
});
