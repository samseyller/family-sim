import { expect, test, type Page } from '@playwright/test';
import { newGame } from '../src/engine/generate';
import { devKill } from '../src/engine/phases';
import type { GameState, Thread } from '../src/engine/types';
import { active, kidsAtHome } from '../src/engine/util';
import { serializeGame } from '../src/persistence/exportImport';

async function load(page: Page, save: GameState, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: /saves & backups/i }).click();
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(serializeGame(save)) });
  await page.getByRole('button', { name: 'Load save' }).click();
}

/** Game night kept for eleven years (not yet this year), with the first child taking part every year. */
function withTradition(seed: number): { save: GameState; kidId: string } {
  const save = newGame(seed);
  const me = active(save);
  const kid = kidsAtHome(save, me)[0];
  const t: Thread = { kind: 'tradition', ownerId: me.id, detail: 'game_night', since: save.year - 11, hits: Array.from({ length: 8 }, (_, i) => save.year - 8 + i), count: 11, takers: { [kid.id]: 11 } };
  save.threads = [t];
  return { save, kidId: kid.id };
}

test('a live tradition shows its badge, and the result card says so', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { save } = withTradition(5151);
  await load(page, save, 'tradition.json');
  await expect(page.locator('.hero h2')).toBeVisible();

  await page.keyboard.press('6');
  const card = page.locator('.activity', { hasText: 'Game night' });
  await expect(card.locator('.tradition-badge')).toHaveText('🏷️ Tradition · 12th year');
  await card.click();
  await page.locator('.pick').first().click();
  await page.getByRole('button', { name: 'Do it' }).click();
  const result = page.getByRole('dialog', { name: 'Game night' });
  await expect(result).toContainText(`Game night: a family tradition since ${save.year - 11} (12th year).`);
  await page.screenshot({ path: 'e2e/out/tradition-result.png' });
  expect(errors).toEqual([]);
});

test('the family tree shows what lives were about: two icons on the node, every badge in words', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { save } = withTradition(5353);
  const me = active(save);
  const friend = Object.values(save.people).find((p) => p.id !== me.id && p.deathYear === undefined)!;
  save.threads!.push(
    { kind: 'aspiration', ownerId: me.id, detail: 'mastery', since: save.year - 9, hits: [save.year - 1], closed: save.year, outcome: 'milestone' },
    { kind: 'pattern', ownerId: me.id, subjectId: friend.id, detail: `friend:${friend.id}`, since: save.year - 31, hits: [save.year], closed: save.year, outcome: 'recognized' },
  );
  await load(page, save, 'badges.json');
  await expect(page.locator('.hero h2')).toBeVisible();
  await page.keyboard.press('3');
  await page.getByRole('radio', { name: /tree/i }).click();
  const node = page.locator('.tree-node.active');
  await expect(node.locator('.tree-badge')).toHaveText('⭐🏷️');
  await expect(node).toHaveAttribute('aria-label', /Lived for mastery, and found it\. Kept game night \(11 years\)\. Friends with .+ for 31\+ years/);
  await node.click();
  const detail = page.locator('.tree-detail');
  await expect(detail).toContainText('⭐ Lived for mastery, and found it');
  await expect(detail).toContainText('🏷️ Kept game night (11 years)');
  await expect(detail).toContainText(`🤝 Friends with ${friend.firstName} for 31+ years`);
  await page.screenshot({ path: 'e2e/out/tree-badges.png' });
  expect(errors).toEqual([]);
});

test('a tradition passes to the heir who grew up with it', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { save, kidId } = withTradition(5252);
  save.people[kidId].birthYear = save.year - 25;
  const ended = devKill(save);
  const heir = ended.people[kidId];
  await load(page, ended, 'succession.json');

  await page.locator('button.heir', { hasText: heir.firstName }).click();
  await page.keyboard.press('4');
  await expect(page.getByText(new RegExp(`Game night is ${heir.firstName}’s to keep now; ${heir.firstName} took part 11 times growing up\\.`))).toBeVisible();
  expect(errors).toEqual([]);
});
