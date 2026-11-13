import { expect, test } from '@playwright/test';

test('family options: separate from your spouse, then file for divorce', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /start a new family/i }).click();
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.keyboard.press('3');
  const spouse = page.locator('article.person', { has: page.locator('.chip', { hasText: 'Spouse' }) });
  await expect(spouse.getByRole('button', { name: /Separate/ })).toHaveCount(0); // compact until opened
  await spouse.getByRole('button', { name: /Options/ }).click();
  await expect(spouse.getByRole('button', { name: /Date night/ })).toBeVisible();
  await expect(spouse.getByRole('button', { name: /Make love/ })).toBeVisible();
  await expect(spouse.getByRole('button', { name: /Try for a baby/ })).toBeVisible();
  const separate = spouse.getByRole('button', { name: /separate/i });
  await separate.click();
  await expect(separate).toContainText('Confirm: separate');
  await separate.click();
  const ex = page.locator('article.person', { has: page.locator('.chip', { hasText: 'Separated' }) });
  await expect(ex).toBeVisible();
  const opts = ex.getByRole('button', { name: /Options/ });
  if ((await opts.getAttribute('aria-expanded')) !== 'true') await opts.click(); // stays open after separating
  await expect(ex.getByRole('button', { name: /File for divorce/ })).toBeEnabled();
  await page.screenshot({ path: 'e2e/out/family-options.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('family options: visit a parent who lives elsewhere', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /start a new family/i }).click();
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.keyboard.press('3');
  const parent = page.locator('article.person', { has: page.locator('.chip', { hasText: /^(Mother|Father)$/ }) }).first();
  await parent.getByRole('button', { name: /Options/ }).click();
  const visit = parent.getByRole('button', { name: /(Visit|Fly to see) / }).first();
  await expect(visit).toBeEnabled();
  const affinity = parent.getByRole("meter", { name: "Affinity" });
  const before = Number(await affinity.getAttribute("aria-valuenow"));
  await visit.click();
  await expect.poll(async () => Number(await affinity.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
  expect(errors).toEqual([]);
});
