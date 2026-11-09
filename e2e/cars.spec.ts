import { expect, test } from '@playwright/test';

test('car dealership: buy a new car on a loan until parking runs out', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /start a new family/i }).click();
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.keyboard.press('5');

  const cars = page.locator('section', { has: page.getByRole('heading', { name: /Cars/ }) });
  await expect(cars).toContainText('1/2 parking');
  await expect(cars).toContainText('Used compact');
  await expect(cars).toContainText('yrs old');

  await cars.getByRole('button', { name: 'Shop new cars' }).click();
  const minivan = cars.locator('.buy-home', { hasText: 'Minivan' });
  await minivan.getByRole('button', { name: /Loan:/ }).click();
  await expect(cars).toContainText('2/2 parking');
  await expect(cars).toContainText('Like new');

  // Parking is full: every purchase now explains why it's blocked.
  await cars.getByRole('button', { name: 'Shop used cars' }).click();
  await expect(cars.getByRole('button', { name: /Buy:/ }).first()).toBeDisabled();
  await expect(cars).toContainText('No parking left');
  await cars.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `e2e/out/${info.project.name}-cars.png`, fullPage: true });
  expect(errors).toEqual([]);
});
