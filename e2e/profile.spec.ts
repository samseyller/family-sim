import { expect, test } from '@playwright/test';

test('settings persist, achievements unlock, full backup round-trips', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  // Settings apply immediately and survive a reload.
  await page.getByRole('button', { name: /settings/i }).click();
  await page.getByRole('radio', { name: 'Dark' }).click();
  await page.getByRole('radio', { name: 'Large' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: 'e2e/out/settings-dark.png' });
  // Wait until the profile write has landed in IndexedDB before reloading.
  await expect
    .poll(() => page.evaluate(() => new Promise<string | undefined>((resolve) => {
      const open = indexedDB.open('family-sim');
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('profile')) return resolve(undefined);
        const get = db.transaction('profile').objectStore('profile').get('main');
        get.onsuccess = () => { resolve(get.result?.current?.settings?.textSize); db.close(); };
        get.onerror = () => resolve(undefined);
      };
      open.onerror = () => resolve(undefined);
    })))
    .toBe('large');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-text', 'large');

  // Play a year: "First Steps" unlocks with a toast.
  await page.getByRole('button', { name: /start a new family/i }).click();
  await page.keyboard.press('e');
  await page.getByRole('button', { name: 'Live the year' }).click();
  for (let i = 0; i < 12 && (await page.locator('.modal').count()); i++) {
    await page.locator('.modal button:not([disabled])').first().click();
    await page.waitForTimeout(60);
  }
  await expect(page.locator('.toast')).toContainText('First Steps');

  // Achievements panel shows it and the lifetime stats.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: /achievements & stats/i }).click();
  await expect(page.locator('.ach-list li.on')).toContainText(['First Steps']);
  await expect(page.getByRole('row', { name: /years lived/i })).toContainText('1');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'e2e/out/achievements.png' });
  await page.keyboard.press('Escape');

  // Full backup out...
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: /saves & backups/i }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /export full backup/i }).click()]);
  expect(download.suggestedFilename()).toMatch(/^family-tree-full-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = info.outputPath('full.json');
  await download.saveAs(file);

  // ...wipe all browser storage, then restore it.
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('family-sim');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.reload();
  await expect(page.getByRole('button', { name: /continue as/i })).toHaveCount(0);
  await page.getByRole('button', { name: /saves & backups/i }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByRole('heading', { name: 'Restore full backup?' })).toBeVisible();
  await page.getByRole('checkbox', { name: /use the settings/i }).check();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('heading', { name: /backup restored/i })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: /continue as/i })).toBeVisible();
  await page.getByRole('button', { name: /achievements/i }).click();
  await expect(page.locator('.ach-list li.on')).toContainText(['First Steps']);

  expect(errors).toEqual([]);
});
