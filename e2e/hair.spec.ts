import { expect, test } from '@playwright/test';

/** Every face shape × hairstyle × sex × age must have its crown fully covered by hair. */
test('hair covers the crown for every face, style, and age', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'pure rendering check; desktop is enough');
  await page.goto('/dev/hair-check.html');
  await page.waitForSelector('svg[data-spec]');
  const failures = await page.evaluate(() => window.__hairCheck());
  expect(failures, JSON.stringify(failures)).toEqual([]);
});
