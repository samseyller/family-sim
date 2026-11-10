import { expect, test } from '@playwright/test';

test('friends are named people in a city; calling one, then moving to another city', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /start a new family/i }).click();
  await page.getByRole('button', { name: 'Begin' }).click();

  // Two starting friends, each with a city.
  await page.keyboard.press('3');
  const friends = page.locator('section', { has: page.getByRole('heading', { name: /Friends/ }) });
  await expect(friends.locator('article.person')).toHaveCount(2);
  await expect(friends.locator('article.person').first()).toContainText(/📍|✈️/);
  const firstName = (await friends.locator('article.person strong').first().innerText()).split(' ')[0];

  // Call a friend (works from anywhere).
  await page.keyboard.press('6');
  await page.getByRole('button', { name: /Call a friend/ }).first().click();
  await page.getByRole('radio', { name: new RegExp(firstName) }).or(page.getByRole('checkbox', { name: new RegExp(firstName) })).first().check().catch(() => undefined);
  await page.getByRole('button', { name: 'Do it' }).click();
  await page.getByRole('button', { name: 'Nice' }).click();
  await page.keyboard.press('3');
  await expect(friends).toContainText('saw them this year');
  await friends.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `e2e/out/${info.project.name}-friends.png`, fullPage: true });

  // Move to another city from the Money tab.
  await page.keyboard.press('5');
  const before = (await page.locator('.topbar-city').innerText().catch(() => '')).trim();
  await page.getByRole('button', { name: /Compare cities and move/ }).click();
  const target = page.locator('.money-act', { hasText: /Seattle|Denver/ }).first();
  const label = await target.innerText();
  await target.click();
  await target.click(); // confirm
  const city = label.includes('Seattle') ? 'Seattle' : 'Denver';
  await expect(page.locator('section h2').filter({ hasText: city }).first()).toBeVisible();
  if (info.project.name === 'desktop') await expect(page.locator('.topbar-city')).not.toHaveText(before);
  expect(errors).toEqual([]);
});
