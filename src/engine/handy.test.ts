/** Hobby skills that pay off at home, plus the small additions that came with them. */
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_BY_ID } from '../content/achievements';
import { activityBlocker, performActivity } from './activities';
import { estimateYear } from './budget';
import { breakdownChance, makeCar, repairCost } from './cars';
import { EVENT_BY_ID } from './events';
import { financeAction, homeOf, homeUpgradeCost, renovationCost, upgradeCost } from './finance';
import { newGame } from './generate';
import { bestSkill, gardenHarvest, HANDY } from './handy';
import { cityOfHousehold } from './location';
import { makeRng } from './rng';
import type { GameState } from './types';
import { active, kidsAtHome } from './util';

const hhOf = (s: GameState) => s.households[active(s).householdId];
const homeowner = (seed: number) => {
  const s = newGame(seed);
  hhOf(s).wallet = 2_000_000;
  return financeAction(s, { kind: 'buyHome', tier: 'family', downPct: 0.2 });
};
const harvestLine = (s: GameState) => estimateYear(s).income.find((l) => l.label === 'Garden harvest')?.amount ?? 0;

describe('a mechanic at home', () => {
  it('cuts repair bills (half at skill 100) and makes breakdowns rarer', () => {
    const s = newGame(5101);
    const car = makeCar(s, 'used', { age: 8 });
    expect(repairCost(car, 100)).toBeCloseTo(repairCost(car) * (1 - HANDY.mechanicRepairCut), -2);
    expect(repairCost(car, 50)).toBeLessThan(repairCost(car));
    expect(breakdownChance(car, false, 100)).toBeCloseTo(breakdownChance(car) * (1 - HANDY.mechanicBreakdownCut), 5);
  });

  it('counts the best skill among the adults at home, not the kids', () => {
    const s = newGame(5102);
    const kid = kidsAtHome(s, active(s))[0];
    kid.skills.mechanics = 90;
    expect(bestSkill(s, hhOf(s).id, 'mechanics')).toBe(0);
    active(s).skills.mechanics = 60;
    expect(bestSkill(s, hhOf(s).id, 'mechanics')).toBe(60);
  });
});

describe('a woodworker at home', () => {
  it('makes renovations and additions cheaper, but not other upgrades', () => {
    const s = homeowner(5103);
    const hh = hhOf(s);
    const city = cityOfHousehold(hh);
    expect(renovationCost(s, hh)).toBe(30000);
    expect(homeUpgradeCost(s, hh, 'expansion')).toBe(upgradeCost('expansion', city));
    active(s).skills.woodworking = 100;
    expect(renovationCost(s, hh)).toBeLessThan(30000 * (1 - HANDY.diyCut) + 500);
    expect(homeUpgradeCost(s, hh, 'expansion')).toBeLessThan(upgradeCost('expansion', city));
    expect(homeUpgradeCost(s, hh, 'pool')).toBe(upgradeCost('pool', city));
  });

  it('pays the discounted price when renovating', () => {
    const s = homeowner(5104);
    active(s).skills.woodworking = 80;
    const before = hhOf(s).wallet;
    const cost = renovationCost(s, hhOf(s));
    const t = financeAction(s, { kind: 'renovate' });
    expect(hhOf(t).wallet).toBe(before - cost);
  });
});

describe('a gardener with a yard', () => {
  it('grows some of the groceries, more with skill and a greenhouse', () => {
    const s = homeowner(5105);
    const me = active(s);
    expect(harvestLine(s)).toBe(0);
    me.hobby = 'gardening';
    me.skills.gardening = 60;
    const base = gardenHarvest(s, hhOf(s));
    expect(base).toBe(Math.round(HANDY.gardenMax * 0.6));
    expect(harvestLine(s)).toBeGreaterThan(0);
    homeOf(hhOf(s))!.upgrades = ['greenhouse'];
    expect(gardenHarvest(s, hhOf(s))).toBe(Math.round(base * HANDY.greenhouseBoost));
  });

  it('needs a yard: nothing for renters', () => {
    const s = newGame(5106);
    active(s).hobby = 'gardening';
    active(s).skills.gardening = 80;
    expect(homeOf(hhOf(s))).toBeUndefined();
    expect(gardenHarvest(s, hhOf(s))).toBe(0);
  });
});

describe('quick additions', () => {
  it('kids can ask for a sleepover; grown-ups cannot', () => {
    const s = newGame(5107, 'child');
    expect(activityBlocker(s, 'sleepover')).toBeNull();
    const t = performActivity(s, 'sleepover');
    expect(t.lastActivity?.text).toBeTruthy();
    expect(activityBlocker(newGame(5108), 'sleepover')).not.toBeNull();
  });

  it('five clean check-ups earn Clean Bill of Health', () => {
    const s = newGame(5109);
    expect(ACHIEVEMENT_BY_ID.clean_bill.test(s)).toBe(false);
    active(s).flags.clean_checkups = 5;
    expect(ACHIEVEMENT_BY_ID.clean_bill.test(s)).toBe(true);
  });

  it('a lottery jackpot earns the hidden Lucky Ticket', () => {
    const s = newGame(5110);
    expect(ACHIEVEMENT_BY_ID.lucky_ticket.hidden).toBe(true);
    active(s).flags.lottery_win = 1;
    expect(ACHIEVEMENT_BY_ID.lucky_ticket.test(s)).toBe(true);
  });

  it('winning a big audition takes a session musician on tour', () => {
    const ev = EVENT_BY_ID.big_audition;
    let promoted = false;
    for (let seed = 1; seed < 20 && !promoted; seed++) {
      const s = newGame(5111);
      const me = active(s);
      me.skills.music = 90;
      me.jobId = 'musician';
      me.jobLevel = 1;
      ev.resolve({ s, rng: makeRng(seed), me }, 'go');
      promoted = me.jobLevel === 2 && !!me.flags.audition_won;
    }
    expect(promoted).toBe(true);
  });
});
