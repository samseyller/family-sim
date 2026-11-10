import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_BY_ID } from '../content/achievements';
import { HOBBIES } from '../content/actions';
import { CAREER_BY_ID, PROGRAMS, programBlocker, salaryOf, titleOf } from '../content/careers';
import { GEAR, RESTORED_VALUE } from '../content/gear';
import { performActivity } from './activities';
import { parkingFree } from './cars';
import { estimateYear } from './budget';
import { EVENT_BY_ID } from './events';
import { die, settleEstates } from './family';
import { financeAction, financeBlocker } from './finance';
import { newGame } from './generate';
import { gearOf, hobbyCareerYear, isCoastal, makeGear, practiceBoost, restoreProgress, takeUpHobby } from './hobbies';
import { listings } from './jobMarket';
import { applyPlan } from './systems';
import { makeRng } from './rng';
import type { GameState } from './types';
import { active, ageOf, childrenOf, getBond, membersOf, parentsOf } from './util';

const hhOf = (s: GameState) => s.households[active(s).householdId];
const rich = (seed: number) => { const s = newGame(seed); hhOf(s).wallet = 2_000_000; return s; };
const got = (s: GameState, id: string) => ACHIEVEMENT_BY_ID[id].test(s);
const fresh = (s: GameState) => ({ ...s, energy: { year: s.year, max: 100, used: 0 }, activityLog: [] });

describe('hobbies', () => {
  it('nine hobbies; adults can take one up, keep old skills, and some have an age minimum', () => {
    expect(HOBBIES.map((h) => h.id)).toEqual(expect.arrayContaining(['flying', 'woodworking', 'fishing', 'cooking', 'mechanics', 'gardening', 'music']));
    let s = newGame(1601);
    active(s).skills.music = 40;
    s = takeUpHobby(s, 'woodworking');
    expect(active(s).hobby).toBe('woodworking');
    expect(active(s).skills.music).toBe(40);
    const kid = newGame(1602, 'child');
    expect(takeUpHobby(kid, 'flying')).toBe(kid); // too young
  });

  it('practice costs money for some hobbies, and a plane makes flying hours cheaper', () => {
    let s = takeUpHobby(rich(1603), 'flying');
    s.plan.alloc.practice = 2;
    expect(estimateYear(s).expenses.find((l) => l.label === 'Hobby costs')?.amount).toBe(800);
    s = financeAction(s, { kind: 'buyGear', gear: 'plane' });
    expect(estimateYear(s).expenses.find((l) => l.label === 'Hobby costs')?.amount).toBe(240);
    expect(estimateYear(s).expenses.find((l) => l.label === 'Gear upkeep')?.amount).toBe(GEAR.plane.upkeep);
  });

  it('the right setup speeds up practice (a workshop doubles woodworking)', () => {
    let s = takeUpHobby(rich(1604), 'woodworking');
    expect(practiceBoost(s, active(s), 'woodworking')).toBe(1);
    s = financeAction(s, { kind: 'buyHome', tier: 'family', downPct: 0.2 });
    s = financeAction(s, { kind: 'upgradeHome', upgrade: 'workshop' });
    expect(practiceBoost(s, active(s), 'woodworking')).toBe(2);
    const t: GameState = structuredClone(s);
    t.plan.alloc = { practice: 2 };
    const before = active(t).skills.woodworking ?? 0;
    applyPlan(t, makeRng(1));
    expect((active(t).skills.woodworking ?? 0) - before).toBeGreaterThanOrEqual(14);
  });
});

describe('credentials', () => {
  it('pilot licenses need skill, age, and the license before them', () => {
    const me = active(newGame(1610));
    me.stats.smarts = 80;
    me.skills.flying = 10;
    expect(programBlocker(me, PROGRAMS.ppl, 30)).toMatch(/flying skill 20/);
    me.skills.flying = 60;
    expect(programBlocker(me, PROGRAMS.ppl, 16)).toMatch(/age 17/);
    expect(programBlocker(me, PROGRAMS.ppl, 30)).toBeNull();
    expect(programBlocker(me, PROGRAMS.cpl, 30)).toMatch(/pilot license first/);
  });

  it('trade credentials count as a trade certificate and add skill', () => {
    const s = takeUpHobby(rich(1611), 'woodworking');
    const me = active(s);
    me.skills.woodworking = 20;
    me.education = { program: 'carpentry_cert', progress: 5, required: 6, startYear: s.year };
    s.plan.alloc = { study: 1 };
    applyPlan(s, makeRng(2));
    expect(me.flags.carpentry_cert).toBe(1);
    expect(me.flags.trade_cert).toBe(1);
    expect(me.skills.woodworking).toBeGreaterThanOrEqual(35);
  });
});

describe('career ladders and businesses', () => {
  it('careers have their own ranks and pay', () => {
    const carp = CAREER_BY_ID.carpenter;
    expect([1, 2, 3].map((l) => titleOf(carp, l))).toEqual(['Apprentice Carpenter', 'Journeyman Carpenter', 'Master Carpenter']);
    expect(salaryOf(CAREER_BY_ID.pilot, 3)).toBe(210000);
    expect(titleOf(CAREER_BY_ID.pilot, 3)).toBe('Airline Captain');
    expect(titleOf(CAREER_BY_ID.nurse, 2)).toBe('Senior Nurse');
  });

  it('promotions on a hobby ladder need the skill', () => {
    const s = rich(1620);
    const me = active(s);
    Object.assign(me, { jobId: 'carpenter', jobLevel: 1, jobYears: 3, workPerf: 80 });
    me.skills.woodworking = 30;
    const ctx = { s, rng: makeRng(1), me };
    expect(EVENT_BY_ID.promotion_offer.candidates!(ctx)).toHaveLength(0);
    me.skills.woodworking = 45;
    expect(EVENT_BY_ID.promotion_offer.candidates!(ctx)).toHaveLength(1);
  });

  it('opening a business costs its startup money; income swings year to year', () => {
    const s = rich(1621);
    const me = active(s);
    me.skills.cooking = 80;
    const city = s.households[me.householdId].city!;
    let year = s.year;
    while (!listings(s.seed, city, year, 'full').some((c) => c.id === 'restaurant_owner') && year < s.year + 60) year++;
    s.year = year;
    me.jobId = undefined;
    s.plan.jobIntents = [{ kind: 'apply', careerId: 'restaurant_owner' }];
    const w0 = hhOf(s).wallet;
    applyPlan(s, makeRng(3));
    expect(me.jobId).toBe('restaurant_owner');
    expect(hhOf(s).wallet).toBe(w0 - 250000);
    const swings = new Set<number>();
    for (let i = 0; i < 6; i++) { const t: GameState = structuredClone(s); hobbyCareerYear(t, hhOf(t), makeRng(10 + i)); swings.add(hhOf(t).wallet); }
    expect(swings.size).toBeGreaterThan(3);
    expect(got(s, 'chefs_table')).toBe(true);
  });

  it('charter captains need a coastal city and their own offshore boat', () => {
    let inland = 0;
    for (let y = 2026; y < 2060; y++) inland += listings(1, 'denver', y, 'full').filter((c) => c.id === 'charter_captain').length;
    expect(inland).toBe(0);
    expect(isCoastal('miami')).toBe(true);
    const s = rich(1622);
    s.households[active(s).householdId].city = 'denver';
    expect(financeBlocker(s, { kind: 'buyGear', gear: 'offshore_boat' })).toMatch(/coastal/);
  });

  it('touring musicians strain family bonds', () => {
    const s = rich(1623);
    const me = active(s);
    Object.assign(me, { jobId: 'musician', jobLevel: 2 });
    const other = membersOf(s, me.householdId).find((p) => p.id !== me.id)!;
    const b0 = getBond(s, me.id, other.id).affinity;
    hobbyCareerYear(s, hhOf(s), makeRng(4));
    expect(getBond(s, me.id, other.id).affinity).toBeLessThan(b0);
  });
});

describe('gear', () => {
  it('trailered boats take a parking spot', () => {
    let s = rich(1630);
    const free = parkingFree(hhOf(s));
    s = financeAction(s, { kind: 'buyGear', gear: 'small_boat' });
    expect(parkingFree(hhOf(s))).toBe(free - 1);
  });

  it('a project car gains value as you restore it', () => {
    let s = takeUpHobby(rich(1631), 'mechanics');
    active(s).skills.mechanics = 60;
    s = financeAction(s, { kind: 'buyGear', gear: 'project_car' });
    for (let i = 0; i < 10; i++) s = performActivity(fresh(s), 'restore_car', []);
    const car = gearOf(hhOf(s))[0];
    expect(car.restore).toBe(100);
    expect(car.value).toBe(RESTORED_VALUE);
    expect(got(s, 'back_on_the_road')).toBe(true);
    const half = makeGear(s, 'project_car');
    restoreProgress(half, 50);
    expect(half.value).toBeGreaterThan(GEAR.project_car.price);
    expect(half.value).toBeLessThan(RESTORED_VALUE);
  });

  it('gear passes down to the heir instead of being sold', () => {
    const s = rich(1632);
    const me = active(s);
    const parents = parentsOf(s, me);
    const home = s.households[parents[0].householdId];
    home.assets.push(makeGear(s, 'bass_boat'));
    for (const p of parents) die(s, p, 'old age');
    settleEstates(s);
    expect(gearOf(hhOf(s)).some((a) => a.gear === 'bass_boat')).toBe(true);
    expect(childrenOf(s, parents[0].id).length).toBeGreaterThan(0);
    expect(ageOf(me, s.year)).toBeGreaterThan(18);
  });

  it('side gigs pay by skill', () => {
    const s = takeUpHobby(rich(1633), 'music');
    active(s).skills.music = 70;
    const w0 = hhOf(s).wallet;
    const t = performActivity(fresh(s), 'play_gig', []);
    expect(hhOf(t).wallet).toBeGreaterThan(w0);
  });
});
