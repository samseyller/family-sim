import { expect, test } from '@playwright/test';

test('export, import into a new game, and restore the previous autosave', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'file download flow covered on desktop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.getByRole('button', { name: /start a new family/i }).click();
  const firstName = (await page.locator('.hero h2').innerText()).trim();

  // Export from Menu → Saves & backups.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: /saves & backups/i }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /export this game only/i }).click(),
  ]);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Menu' }).click();
  expect(download.suggestedFilename()).toMatch(/^family-tree-.+-\d{4}\.json$/);
  const file = info.outputPath('backup.json');
  await download.saveAs(file);

  // Start a different family, then import the backup over it.
  await page.getByRole('button', { name: /title screen/i }).click();
  await page.getByRole('button', { name: /start a new family/i }).click();
  const secondName = (await page.locator('.hero h2').innerText()).trim();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: /saves & backups/i }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByRole('heading', { name: 'Load this save?' })).toBeVisible();
  await page.getByRole('button', { name: 'Load save' }).click();
  await expect(page.locator('.hero h2')).toHaveText(firstName);

  // The game replaced by the import is recoverable.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: /title screen/i }).click();
  await page.getByRole('button', { name: /saves & backups/i }).click();
  await page.getByRole('button', { name: /restore previous autosave/i }).click();
  await page.getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('button', { name: /continue as/i }).click();
  await expect(page.locator('.hero h2')).toHaveText(secondName);

  // A damaged file is rejected with an explanation.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: /saves & backups/i }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":') });
  await expect(page.getByRole('alert')).toContainText("isn't valid JSON");
  await page.screenshot({ path: 'e2e/out/saves-panel.png' });

  expect(errors).toEqual([]);
});
