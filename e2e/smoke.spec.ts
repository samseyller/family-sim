import { expect, test, type Page } from '@playwright/test';

const yearText = async (page: Page) => Number(await page.locator('.topbar-mid strong').innerText());

/** Resolve all decisions/recap of the current year using the keyboard. */
async function finishYearWithKeyboard(page: Page) {
  for (let i = 0; i < 12; i++) {
    const modal = page.locator('.modal');
    if (!(await modal.count())) return;
    // Focus is placed on the first enabled control in the modal; Enter activates it.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(80);
  }
}

test('new game, play 5 years by keyboard, reload resumes', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /start a new family/i }).click();
  await expect(page.locator('.hero h2')).toBeVisible();
  const start = await yearText(page);

  for (let y = 0; y < 5; y++) {
    if (info.project.name === 'mobile') {
      await page.getByRole('button', { name: /plan/i }).first().tap();
      await page.locator('.end-year').tap();
      await page.getByRole('button', { name: 'Live the year' }).tap();
      for (let i = 0; i < 12 && (await page.locator('.modal').count()); i++) {
        await page.locator('.modal button:not([disabled])').first().tap();
        await page.waitForTimeout(80);
      }
    } else {
      await page.keyboard.press('e');
      await expect(page.getByRole('dialog', { name: /^End \d{4}\?$/ })).toBeVisible();
      await page.keyboard.press('Enter');
      await finishYearWithKeyboard(page);
    }
    await expect(page.locator('.modal')).toHaveCount(0);
  }
  expect(await yearText(page)).toBe(start + 5);

  // Mid-decision reload: end a year, reload before answering.
  await page.keyboard.press('e');
  await page.getByRole('button', { name: 'Live the year' }).click();
  await page.waitForTimeout(300); // let the autosave land
  const before = await page.locator('.modal h2').first().innerText();
  await page.reload();
  await page.getByRole('button', { name: /continue as/i }).click();
  await expect(page.locator('.modal h2').first()).toHaveText(before);
  for (let i = 0; i < 12 && (await page.locator('.modal').count()); i++) {
    await page.locator('.modal button:not([disabled])').first().click();
    await page.waitForTimeout(80);
  }
  expect(await yearText(page)).toBe(start + 6);

  // Family tab renders, dev kill leads to succession.
  await page.keyboard.press('3');
  await expect(page.locator('.person').first()).toBeVisible();
  await page.screenshot({ path: `e2e/out/${info.project.name}-family.png`, fullPage: true });
  await page.keyboard.press('2');
  await page.screenshot({ path: `e2e/out/${info.project.name}-plan.png`, fullPage: true });
  await page.keyboard.press('`');
  await page.getByRole('button', { name: 'Kill main character' }).click();
  await expect(page.getByText(/whose story continues|no one is able/i)).toBeVisible();
  await page.screenshot({ path: `e2e/out/${info.project.name}-succession.png` });
  const heir = page.locator('.choice.heir').first();
  if (await heir.count()) {
    await heir.click();
    await expect(page.locator('.hero h2')).toBeVisible();
  }
  expect(errors).toEqual([]);
});
