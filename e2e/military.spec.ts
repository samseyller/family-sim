import { expect, test } from '@playwright/test';
import { newGame } from '../src/engine/generate';
import { active } from '../src/engine/util';
import { serializeGame } from '../src/persistence/exportImport';

test('visit a recruiter and enlist', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // A 25-year-old (recruiters take 18–34).
  const save = newGame(77);
  active(save).birthYear = save.year - 25;
  await page.goto('/');
  await page.getByRole('button', { name: /saves & backups/i }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'young.json', mimeType: 'application/json', buffer: Buffer.from(serializeGame(save)) });
  await page.getByRole('button', { name: 'Load save' }).click();
  await expect(page.locator('.hero h2')).toBeVisible();

  await page.keyboard.press('2');
  await page.locator('summary', { hasText: 'Visit a military recruiter' }).click();
  await page.getByRole('button', { name: /^🎖️ Enlist/ }).click();
  await page.getByRole('button', { name: /Confirm: 4-year tour/ }).click();
  await expect(page.getByText(/Private · 0 years of service · tour ends/)).toBeVisible();
  await page.screenshot({ path: 'e2e/out/military.png' });
  expect(errors).toEqual([]);
});
