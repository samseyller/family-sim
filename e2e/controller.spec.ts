import { expect, test, type Page } from '@playwright/test';

/** Replace the Gamepad API with a scripted standard-mapping controller. */
async function fakePad(page: Page) {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const axes = [0, 0, 0, 0];
    (window as unknown as { __pad: unknown }).__pad = { buttons, axes };
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [{ id: 'Scripted pad', index: 0, connected: true, mapping: 'standard', buttons, axes, timestamp: performance.now() }],
    });
  });
}

async function tap(page: Page, button: number) {
  await page.evaluate((b) => { (window as any).__pad.buttons[b].pressed = true; }, button);
  await page.waitForTimeout(80);
  await page.evaluate((b) => { (window as any).__pad.buttons[b].pressed = false; }, button);
  await page.waitForTimeout(80);
}

const A = 0, B = 1, LB = 4, RB = 5, SELECT = 8, START = 9, DOWN = 13;

test('a full year with only a controller', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'controller flow tested on desktop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await fakePad(page);
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('family-sim'));
  await page.reload();
  // First-ever game: the guided life is offered first; move down to a regular new family.
  await expect(page.getByRole('button', { name: /guided first life/i })).toBeFocused();
  await tap(page, DOWN);
  await expect(page.getByRole('button', { name: /start a new family/i })).toBeFocused();

  await tap(page, A); // start a new family → naming dialog
  await tap(page, A); // Begin (focused)
  await expect(page.locator('.hero h2')).toBeVisible();
  const year = Number(await page.locator('.topbar-mid strong').innerText());

  await tap(page, RB); // next tab → Plan
  await expect(page.getByRole('button', { name: /^.*Plan\s*2$/ })).toHaveAttribute('aria-current', 'page');
  await tap(page, LB); // back to Home
  await expect(page.getByRole('button', { name: /^.*Home\s*1$/ })).toHaveAttribute('aria-current', 'page');

  await tap(page, SELECT); // menu
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
  await tap(page, B); // back out
  await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0);

  await tap(page, DOWN); // D-pad moves focus and turns on the controller focus ring
  await expect(page.locator('html')).toHaveClass(/using-pad/);

  await tap(page, START); // end the year
  await expect(page.getByRole('dialog', { name: /^End \d{4}\?$/ })).toBeVisible();
  await tap(page, A); // "Live the year" is focused
  for (let i = 0; i < 15 && (await page.locator('.modal').count()); i++) await tap(page, A);
  await expect(page.locator('.modal')).toHaveCount(0);
  expect(Number(await page.locator('.topbar-mid strong').innerText())).toBe(year + 1);
  expect(errors).toEqual([]);
});

test('typing an epitaph does not trigger shortcuts', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'keyboard flow tested on desktop');
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('family-sim'));
  await page.reload();
  await page.getByRole('button', { name: /start a new family/i }).click();
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.keyboard.press('`');
  await page.getByRole('button', { name: /kill main character/i }).click();
  await page.getByRole('button', { name: /end the family's story/i }).click();
  await page.getByRole('button', { name: /edit epitaph/i }).first().click();
  const box = page.locator('.epitaph-edit textarea');
  await box.fill('');
  await box.pressSequentially('Made me laugh [every] evening');
  await expect(box).toHaveValue('Made me laugh [every] evening');
  await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0);
});
