/** The rest of the hobby career plan: food truck, treehouse, harvest sharing, gardening careers, new moments. */
import { describe, expect, it } from 'vitest';
import { CAREER_BY_ID, qualifies } from '../content/careers';
import { activityBlocker, performActivity } from './activities';
import { EVENT_BY_ID } from './events';
import { financeAction, homeOf } from './finance';
import { newGame } from './generate';
import { makeRng } from './rng';
import type { GameState } from './types';
import { active, kidsAtHome } from './util';

const hhOf = (s: GameState) => s.households[active(s).householdId];
const homeowner = (seed: number) => {
  const s = newGame(seed);
  hhOf(s).wallet = 500_000;
  active(s).stats.health = 80;
  active(s).stats.stress = 30;
  return financeAction(s, { kind: 'buyHome', tier: 'family', downPct: 0.2 });
};

describe('food truck', () => {
  it('is hobby gear for cooks, and a side business once you own one', () => {
    let s = homeowner(7001);
    expect(activityBlocker(s, 'run_food_truck')).toMatch(/food truck/);
    active(s).hobby = 'cooking';
    active(s).skills.cooking = 60;
    s = financeAction(s, { kind: 'buyGear', gear: 'food_truck' });
    expect(hhOf(s).assets.some((a) => a.gear === 'food_truck')).toBe(true);
    const before = hhOf(s).wallet;
    s = performActivity(s, 'run_food_truck');
    expect(hhOf(s).wallet).toBeGreaterThan(before);
  });
});

describe('treehouse and harvest', () => {
  it('a treehouse needs woodworking skill, a yard and young kids, and is built once', () => {
    let s = homeowner(7002);
    const kids = kidsAtHome(s, active(s));
    kids[0].birthYear = s.year - 7;
    const ids = [kids[0].id];
    expect(activityBlocker(s, 'build_treehouse', ids)).toMatch(/woodworking/);
    active(s).skills.woodworking = 40;
    expect(activityBlocker(s, 'build_treehouse', ids)).toBeNull();
    s = performActivity(s, 'build_treehouse', ids);
    expect(active(s).flags.treehouse).toBe(1);
    expect(activityBlocker(s, 'build_treehouse', ids)).not.toBeNull();
  });

  it('sharing the harvest needs a home garden', () => {
    const s = homeowner(7003);
    expect(activityBlocker(s, 'share_harvest')).toMatch(/garden/);
    active(s).hobby = 'gardening';
    active(s).skills.gardening = 50;
    expect(homeOf(hhOf(s))).toBeDefined();
    expect(activityBlocker(s, 'share_harvest')).toBeNull();
    expect(active(performActivity(s, 'share_harvest')).flags.shared_harvest).toBe(1);
  });
});

describe('gardening careers', () => {
  it('landscaping needs gardening skill; the nursery is a business', () => {
    const s = newGame(7004);
    const me = active(s);
    me.skills.gardening = 10;
    expect(qualifies(me, CAREER_BY_ID.landscaper)).toBe(false);
    me.skills.gardening = 40;
    expect(qualifies(me, CAREER_BY_ID.landscaper)).toBe(true);
    expect(CAREER_BY_ID.nursery_owner.startup).toBeGreaterThan(0);
  });
});

describe('hobby moments', () => {
  it('restoring the car together teaches the kid and brings you closer', () => {
    const s = homeowner(7005);
    const me = active(s);
    const kid = kidsAtHome(s, me)[0];
    kid.birthYear = s.year - 12;
    hhOf(s).assets.push({ id: 'pc', kind: 'gear', gear: 'project_car', name: 'Project car', value: 8000, mortgage: 0, upkeep: 600, restore: 20 } as never);
    const c = { s, rng: makeRng(1), me };
    expect(EVENT_BY_ID.restore_with_kid.candidates!(c).map((x) => x.subject?.id)).toContain(kid.id);
    EVENT_BY_ID.restore_with_kid.resolve(c, 'together', kid);
    expect(kid.skills.mechanics).toBeGreaterThanOrEqual(8);
    expect(kid.flags.car_with_parent).toBe(1);
  });

  it('Thanksgiving for twenty needs a good cook with family nearby or far', () => {
    const s = homeowner(7006);
    const c = { s, rng: makeRng(1), me: active(s) };
    active(s).skills.cooking = 10;
    expect(EVENT_BY_ID.thanksgiving_for_20.candidates!(c)).toEqual([]);
    active(s).skills.cooking = 60;
    const built = EVENT_BY_ID.thanksgiving_for_20.build(c);
    expect(built.choices.map((x) => x.id)).toEqual(['host', 'potluck', 'decline']);
  });
});
