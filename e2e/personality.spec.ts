import { expect, test } from '@playwright/test';

test('personality: trait tooltips, family check-ins, and choosing an aspiration', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /start a new family/i }).click();
  await page.getByRole('button', { name: 'Begin' }).click();

  // Home: traits explain themselves; the suggested aspiration shows.
  const trait = page.locator('.hero .traits .chip').first();
  await expect(trait).toHaveAttribute('title', /.{20,}/);
  await expect(page.getByText(/Aspiration: .+ \(suggested\)/)).toBeVisible();

  // Family: ask your partner what they need; the answer reveals their preference.
  await page.keyboard.press('3');
  const partner = page.locator('article.person', { has: page.locator('.chip', { hasText: /Spouse|Partner/ }) }).first();
  await partner.getByRole('button', { name: /Options/ }).click();
  await partner.getByRole('button', { name: /Ask what they need/ }).click();
  const result = page.getByRole('dialog');
  await expect(result).toContainText('thought about it');
  await result.getByRole('button', { name: 'Nice' }).click();
  await expect(partner.getByText(/^💡 /)).toBeVisible();

  // The year: you're asked what you want from life, with a suggestion first.
  await page.keyboard.press('2');
  await page.locator('.end-year').click();
  await page.getByRole('button', { name: 'Live the year' }).click();
  const modal = page.locator('.modal');
  for (let i = 0; i < 6 && !(await modal.getByText('What do you want from life?').count()); i++) {
    await modal.locator('button.choice:not([disabled])').first().click();
    const ok = modal.getByRole('button', { name: /Continue|OK|Nice/ });
    if (await ok.count()) await ok.first().click();
  }
  await expect(modal.getByText('What do you want from life?')).toBeVisible();
  await expect(modal.locator('button.choice').first()).toContainText('(suggested)');
  expect(errors).toEqual([]);
});
