import { expect, test, type Page } from '@playwright/test';
import { newGame } from '../src/engine/generate';
import type { GameState } from '../src/engine/types';
import { active, kidsAtHome } from '../src/engine/util';
import { serializeGame } from '../src/persistence/exportImport';

async function load(page: Page, save: GameState, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: /saves & backups/i }).click();
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(serializeGame(save)) });
  await page.getByRole('button', { name: 'Load save' }).click();
}

test('the year in review leads with a story that came back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Game night in three different recent years: this year it becomes a family tradition.
  const save = newGame(4242);
  save.activityLog = [save.year - 3, save.year - 1, save.year].map((year) => ({ year, id: 'game_night' }));
  await load(page, save, 'tradition.json');
  await expect(page.locator('.hero h2')).toBeVisible();

  await page.keyboard.press('2');
  await page.locator('.end-year').click();
  await page.getByRole('button', { name: 'Live the year' }).click();
  const modal = page.locator('.modal');
  // Answer whatever this year brings until the year in review shows.
  for (let i = 0; i < 8 && !(await modal.getByText('Year in review').count()); i++) {
    const choice = modal.locator('button.choice:not([disabled])').first();
    if (await choice.count()) await choice.click();
    const ok = modal.getByRole('button', { name: /Continue|OK|Nice|Got it/ });
    if (await ok.count()) await ok.first().click();
  }
  await expect(modal.getByText('Year in review')).toBeVisible();
  const story = modal.locator('.recap-story');
  await expect(story).toBeVisible();
  await expect(story).toContainText('Game night has become a family tradition.');
  // The story comes before everything else in the review.
  const order = await modal.locator('.recap-list > *').evaluateAll((els) => els.map((e) => e.className));
  expect(order[0]).toContain('recap-story');
  await page.screenshot({ path: `e2e/out/stories-recap-${test.info().project.name}.png` });
  expect(errors).toEqual([]);
});

test('a memorial tells the life actually lived', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // A finished family: the first character backed a child's music for years, and the child said so.
  const save = newGame(4343);
  const me = active(save);
  const kid = kidsAtHome(save, me)[0];
  kid.hobby = 'music';
  save.threads = [{ kind: 'encouraged', ownerId: me.id, subjectId: kid.id, detail: 'music', since: save.year - 12, hits: [save.year - 12, save.year - 11, save.year - 10], closed: save.year - 2, outcome: 'thanked' }];
  me.deathYear = save.year;
  save.phase = 'GAME_OVER';
  await load(page, save, 'ended.json');

  const story = page.getByRole('list', { name: `${me.firstName} ${me.lastName}'s story` });
  await expect(story).toBeVisible();
  await expect(story).toContainText(`${me.firstName} backed ${kid.firstName}’s music for years, and ${kid.firstName} never forgot it.`);
  await page.screenshot({ path: 'e2e/out/stories-memorial.png' });
  expect(errors).toEqual([]);
});
