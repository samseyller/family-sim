import { expect, test } from '@playwright/test';

test('adopt a puppy, see it in the family, and walk it', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /start a new family/i }).click();
  await page.getByRole('button', { name: 'Begin' }).click();

  await page.keyboard.press('3');
  const dogs = page.locator('section', { has: page.getByRole('heading', { name: /Dogs/ }) });
  await dogs.getByRole('button', { name: /Adopt a dog/ }).click();
  await dogs.getByLabel('Name').fill('Waffles');
  await dogs.locator('.breed', { hasText: 'Beagle' }).getByRole('button', { name: /Adopt:/ }).click();
  await expect(dogs.locator('.dog-row')).toContainText('Waffles');
  await expect(dogs.locator('.dog-row')).toContainText('puppy');
  await expect(dogs.locator('.dog-row svg.dog-face')).toBeVisible();
  await dogs.getByRole('button', { name: 'Done' }).click();
  await dogs.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `e2e/out/${info.project.name}-dogs.png`, fullPage: true });

  // Walk the dog from Activities → Dogs.
  await page.keyboard.press('6');
  await page.getByRole('button', { name: /Walk the dog/ }).first().click();
  await page.getByRole('button', { name: 'Do it' }).click();
  await page.getByRole('button', { name: 'Nice' }).click();
  await page.keyboard.press('3');
  await expect(dogs.locator('.dog-row')).toContainText('walked');
  expect(errors).toEqual([]);
});
