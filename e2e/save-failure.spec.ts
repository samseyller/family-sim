import { expect, test } from '@playwright/test';

/** Make IndexedDB writes fail on demand (as a full disk would), in the real browser. */
test('a failing save shows a persistent warning; retry recovers once storage works', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'storage behavior covered on desktop');
  await page.addInitScript(() => {
    const w = window as unknown as { __failSaves: boolean };
    w.__failSaves = false;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
      if (w.__failSaves) throw new DOMException('Quota exceeded (test)', 'QuotaExceededError');
      return put.apply(this, args);
    } as typeof put;
  });
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('family-sim'));
  await page.reload();
  await page.getByRole('button', { name: /start a new family/i }).click();
  await page.getByRole('button', { name: 'Begin' }).click();
  await expect(page.locator('.hero h2')).toBeVisible();
  await expect(page.locator('.save-status')).toHaveCount(0);

  // Storage starts failing: the next change shows a warning that stays.
  await page.evaluate(() => { (window as unknown as { __failSaves: boolean }).__failSaves = true; });
  await page.keyboard.press('2');
  await page.getByRole('button', { name: /Less Relax/i }).first().click();
  await expect(page.locator('.save-status')).toContainText('not being saved');
  await expect(page.locator('.save-status')).toContainText('out of storage');
  await page.getByRole('button', { name: 'Try saving again' }).click();
  await expect(page.locator('.save-status')).toContainText('Still failing');
  await page.screenshot({ path: 'e2e/out/save-failure.png' });

  // Storage recovers: retry clears the warning, and a reload keeps the latest plan.
  await page.evaluate(() => { (window as unknown as { __failSaves: boolean }).__failSaves = false; });
  await page.getByRole('button', { name: 'Try saving again' }).click();
  await expect(page.locator('.save-status')).toHaveCount(0);
  const relaxBefore = await page.locator('.stepper', { hasText: 'Relax' }).locator('.stepper-val').innerText();
  await page.reload();
  await page.getByRole('button', { name: /continue as/i }).click();
  await page.keyboard.press('2');
  await expect(page.locator('.stepper', { hasText: 'Relax' }).locator('.stepper-val')).toHaveText(relaxBefore);
});
