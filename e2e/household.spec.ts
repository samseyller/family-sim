import { expect, test } from '@playwright/test';
import { newGame } from '../src/engine/generate';
import { runsHousehold } from '../src/engine/household';
import { autoplayYear, updatePlan } from '../src/engine/phases';
import { strategyPlan } from '../src/engine/strategies';
import type { GameState } from '../src/engine/types';
import { active, ageOf, alive, parentsOf } from '../src/engine/util';
import { serializeGame } from '../src/persistence/exportImport';

/** A life spent at home: grown, with a young child, a big invested pot, still in the parents' house. */
function livingWithParents(): GameState {
  for (let seed = 1; seed < 60; seed++) {
    let s = newGame(seed, 'child');
    let ok = true;
    while (ok && ageOf(active(s), s.year) < 40) {
      if (s.phase !== 'PLANNING') ok = false;
      else {
        s = updatePlan(s, strategyPlan(s, 'balanced'));
        s = autoplayYear(s, (pe) => (pe.eventId === 'own_leaving_home' ? 'stay' : pe.choices.find((c) => !c.disabled)!.id));
      }
    }
    const me = active(s);
    const parentsHome = parentsOf(s, me).filter((p) => alive(p) && p.householdId === me.householdId);
    if (!ok || s.phase !== 'PLANNING' || runsHousehold(s, me) || !parentsHome.length) continue;
    s.households[me.householdId].investments = 2_500_000;
    s.people.kid1 = { ...structuredClone(me), id: 'kid1', firstName: 'Robin', birthYear: s.year - 7, biologicalParents: [me.id], adoptiveParents: [], stake: 0, jobId: undefined, partJobId: undefined, fund: 0, flags: {} };
    return s;
  }
  throw new Error('no seed found');
}

test('move out of your parents’ home with your share and your child', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const save = livingWithParents();
  const me = active(save);

  await page.goto('/');
  await page.getByRole('button', { name: /saves & backups/i }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'home.json', mimeType: 'application/json', buffer: Buffer.from(serializeGame(save)) });
  await page.getByRole('button', { name: 'Load save' }).click();
  await expect(page.locator('.hero h2')).toContainText(me.firstName);

  await page.keyboard.press('5');
  const card = page.locator('section', { has: page.getByRole('heading', { name: /Household/ }) });
  await expect(card).toContainText('your parent');
  await card.getByRole('button', { name: /Move out…/ }).click();
  await expect(card).toContainText('Robin (child, 7)');
  await expect(card).toContainText('Take your share');
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'e2e/out/household-move-out.png', fullPage: true });
  await card.getByRole('button', { name: '🧳 Move out' }).click();
  await card.getByRole('button', { name: /Confirm: move out/ }).click();

  // Now it's your own household: you run it, Robin lives with you, and the investments came along.
  await expect(card).toContainText('Run by You');
  await expect(page.locator('.networth')).not.toContainText('Investments$0');
  await page.keyboard.press('3');
  await expect(page.getByText('Robin').first()).toBeVisible();
  expect(errors).toEqual([]);
});
