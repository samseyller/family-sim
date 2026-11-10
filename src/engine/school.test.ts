import { describe, expect, it } from 'vitest';
import { CAREER_BY_ID, qualifies } from '../content/careers';
import { COLLEGE_FUND_CAP } from '../content/finance';
import { estimateYear } from './budget';
import { financeAction, financeBlocker } from './finance';
import { newGame } from './generate';
import { makeRng } from './rng';
import {
  admissionGpa, admitChance, canAfford, collegeChoice, enroll, expectedSmarts, gpaOf, highSchoolGpa, scholarshipOf, schoolYear, TUITION, yearlyTuition,
} from './school';
import { runEconomy } from './systems';
import type { GameState, Person } from './types';
import { active, kidsAtHome } from './util';

const hhOf = (s: GameState) => s.households[active(s).householdId];

/** A child going through school with a chosen effort each year (smarts grow with effort, as in the game). */
function schoolLife(seed: number, effortFor: (age: number) => number): { s: GameState; kid: Person } {
  const s = newGame(seed);
  const kid = kidsAtHome(s, active(s))[0];
  kid.grades = {};
  kid.stats.stress = 20;
  kid.birthYear = s.year - 6;
  kid.stats.smarts = Math.round(expectedSmarts(6));
  const rng = makeRng(seed);
  for (let age = 6; age <= 17; age++) {
    const effort = effortFor(age);
    kid.stats.smarts = Math.min(100, kid.stats.smarts + effort);
    schoolYear(s, rng, kid, effort);
    s.year++;
  }
  return { s, kid };
}

describe('grades', () => {
  it('a typical young child gets typical grades: nobody is expected to be smart at 6', () => {
    const s = newGame(1301);
    const kid = kidsAtHome(s, active(s))[0];
    kid.birthYear = s.year - 6;
    kid.stats.smarts = Math.round(expectedSmarts(6));
    kid.grades = {};
    schoolYear(s, makeRng(1), kid, 2.5);
    expect(kid.grades['6']).toBeGreaterThan(2.2);
    expect(kid.grades['6']).toBeLessThan(3.0);
  });

  it('slacking early is hard to recover from, but high school counts most', () => {
    const steady = schoolLife(1302, () => 5).kid;
    const lateStart = schoolLife(1302, (a) => (a < 12 ? 0 : 7)).kid;
    expect(gpaOf(lateStart)!).toBeLessThan(gpaOf(steady)!);
    // Early habits drag on high school a little (the first high-school year especially)...
    expect(lateStart.grades!['14']).toBeLessThan(steady.grades!['14'] + 0.6);
    // ...yet admissions weigh high school 70%, so the late bloomer recovers part of the gap.
    expect(steady.grades!['8'] - lateStart.grades!['8']).toBeGreaterThan(admissionGpa(steady) - admissionGpa(lateStart));
  });

  it('with the same overall average, strong high-school grades beat strong early grades', () => {
    const p = (grades: Record<string, number>) => ({ grades, stats: { smarts: 60 } }) as unknown as Person;
    const early = p({ 10: 3.8, 11: 3.8, 12: 3.8, 13: 3.8, 14: 2.4, 15: 2.4, 16: 2.4, 17: 2.4 });
    const late = p({ 10: 2.4, 11: 2.4, 12: 2.4, 13: 2.4, 14: 3.8, 15: 3.8, 16: 3.8, 17: 3.8 });
    expect(gpaOf(early)).toBe(gpaOf(late));
    expect(admissionGpa(late)).toBeGreaterThan(admissionGpa(early));
    expect(highSchoolGpa(late)).toBe(3.8);
  });
});

describe('college admissions', () => {
  const student = (gpa: number, smarts: number) =>
    ({ grades: { 14: gpa, 15: gpa, 16: gpa, 17: gpa }, stats: { smarts }, fund: 0, flags: {} }) as unknown as Person;

  it('a top university is selective; state university is broad', () => {
    expect(admitChance(student(3.95, 85), 'top')).toBeGreaterThan(0.8);
    expect(admitChance(student(2.6, 50), 'top')).toBeLessThan(0.05);
    expect(admitChance(student(2.6, 50), 'state')).toBeGreaterThan(0.5);
    expect(admitChance(student(2.6, 50), 'trade')).toBe(1);
  });

  it('money matters: tuition must be payable, and great grades earn scholarships', () => {
    const star = student(3.9, 85);
    const poorHome = { wallet: 10000 } as never;
    expect(scholarshipOf(star, 'top')).toBe(0.5);
    expect(yearlyTuition(star, 'top')).toBe(TUITION.top / 2);
    expect(canAfford(star, poorHome, 'top')).toBe(false);
    const choice = collegeChoice(star, poorHome, 'top', 'top', 'Top');
    expect(choice.disabled).toBe(true);
    expect(choice.hint).toMatch(/Can't afford/);
    star.fund = 30000;
    expect(canAfford(star, poorHome, 'top')).toBe(true);
  });

  it('enrolling rolls admission, falls back, and moves the fund to pay tuition', () => {
    const s = newGame(1310);
    const kid = kidsAtHome(s, active(s))[0];
    kid.grades = { 14: 2.0, 15: 2.0, 16: 2.0, 17: 2.0 };
    kid.stats.smarts = 40;
    kid.fund = 20000;
    hhOf(s).wallet = 100000;
    const res = enroll(s, makeRng(1), kid, 'top', hhOf(s));
    expect(res.tier).not.toBe('top');
    expect(res.note).toMatch(/said no/);
    expect(kid.fund).toBe(0);
    expect(hhOf(s).wallet).toBe(120000);
  });

  it('a top-university degree opens doctor, lawyer and engineer; a state degree does not', () => {
    const s = newGame(1311);
    const me = active(s);
    me.stats.smarts = 90;
    me.flags.degree = 1;
    delete me.flags.top_degree;
    for (const id of ['doctor', 'lawyer', 'engineer']) expect(qualifies(me, CAREER_BY_ID[id])).toBe(false);
    me.flags.top_degree = 1;
    for (const id of ['doctor', 'lawyer', 'engineer']) expect(qualifies(me, CAREER_BY_ID[id])).toBe(true);
  });

  it('studying at a top university charges top tuition, less any scholarship', () => {
    const s = newGame(1312);
    const me = active(s);
    me.studyingUntil = s.year + 3;
    me.studyKind = 'top';
    me.flags.scholarship = 25;
    expect(estimateYear(s).expenses.find((l) => l.label === 'Tuition')?.amount).toBe(TUITION.top * 0.75);
  });
});

describe('college funds', () => {
  it('top out at $500,000: deposits, yearly contributions and growth all stop at the cap', () => {
    const s = newGame(1320);
    hhOf(s).wallet = 1_000_000;
    const kid = kidsAtHome(s, active(s))[0];
    kid.fund = COLLEGE_FUND_CAP - 5000;
    expect(financeBlocker(s, { kind: 'fundDeposit', childId: kid.id, amount: 10000 })).toMatch(/Only \$5,000 more fits/);
    const t = financeAction(s, { kind: 'fundDeposit', childId: kid.id, amount: 5000 });
    expect(t.people[kid.id].fund).toBe(COLLEGE_FUND_CAP);
    expect(financeBlocker(t, { kind: 'fundDeposit', childId: kid.id, amount: 1000 })).toMatch(/full/);
    t.plan.children[kid.id] = { ...t.plan.children[kid.id], fundContribution: 5000 };
    expect(estimateYear(t).expenses.find((l) => l.label === 'College funds')).toBeUndefined();
    runEconomy(t, 0);
    expect(t.people[kid.id].fund).toBe(COLLEGE_FUND_CAP);
  });
});
