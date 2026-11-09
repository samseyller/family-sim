import { expect, test } from '@playwright/test';

test('tree view, memorial with editable epitaph, download, and archive', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('family-sim'));
  await page.reload();
  await page.getByRole('button', { name: /start a new family/i }).click();

  // Family tree renders with the player ringed.
  await page.keyboard.press('3');
  await page.getByRole('radio', { name: /tree/i }).click();
  await expect(page.locator('.tree-node.active')).toHaveCount(1);
  await expect(page.locator('.tree-node').first()).toBeVisible();
  await page.screenshot({ path: `e2e/out/${info.project.name}-tree.png`, fullPage: true });

  // Fast-forward, die, and end the story.
  await page.keyboard.press('`');
  await page.getByRole('button', { name: /skip 10 years/i }).click();
  await page.keyboard.press('`');
  await page.getByRole('button', { name: /kill main character/i }).click();
  await page.getByRole('button', { name: /end the family's story/i }).click();
  await expect(page.getByRole('heading', { name: /The .+ Family/ })).toBeVisible();

  // Rewrite the first epitaph.
  await page.getByRole('button', { name: /edit epitaph/i }).first().click();
  const box = page.locator('.epitaph-edit textarea');
  await box.fill('Taught us all to laugh at the rain.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.epitaph').first()).toContainText('laugh at the rain');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `e2e/out/${info.project.name}-memorial.png`, fullPage: true });

  // Download the memorial page.
  if (info.project.name === 'desktop') {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /download memorial/i }).click()]);
    expect(download.suggestedFilename()).toMatch(/^memorial-.+-\d{4}-\d{4}\.html$/);
    const file = info.outputPath('memorial.html');
    await download.saveAs(file);
    const html = await (await import('node:fs/promises')).readFile(file, 'utf8');
    expect(html).toContain('laugh at the rain');
    expect(html).not.toMatch(/<script/i);
  }

  // The archive keeps the edited epitaph.
  await page.getByRole('button', { name: /title screen/i }).click();
  await page.getByRole('button', { name: /achievements/i }).click();
  await page.locator('.archive-item').first().click();
  await expect(page.locator('.epitaph').first()).toContainText('laugh at the rain');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `e2e/out/${info.project.name}-archive.png` });
  expect(errors).toEqual([]);
});
