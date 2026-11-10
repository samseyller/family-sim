/** Retirement: pensions, state pension, savings, readiness. */
import { describe, expect, it } from 'vitest';
import { DEBT_RATE, SAVINGS_RATE } from '../content/economy';
import { STATE_PENSION } from '../content/retirement';
import { estimateYear } from './budget';
import { financeAction, financeBlocker } from './finance';
import { newGame } from './generate';
import { die } from './family';
import { contributionFor, pensionFor, readiness, statePension } from './retirement';
import { makeRng } from './rng';
import { applyPlan, runEconomy } from './systems';
import { resolveYear, updatePlan } from './phases';
import type { GameState } from './types';
import { active } from './util';

const at = (seed: number, age: number) => {
  const s = newGame(seed);
  active(s).birthYear = s.year - age;
  return s;
};

describe('pensions', () => {
  it('need 10 years to vest, pay 1.5% of best salary per year, and shrink 5%/yr before 65', () => {
    expect(pensionFor({ pensionYears: 9, pensionSalary: 60000 }, 65)).toBe(0);
    expect(pensionFor({ pensionYears: 20, pensionSalary: 60000 }, 65)).toBe(18000);
    expect(pensionFor({ pensionYears: 20, pensionSalary: 60000 }, 55)).toBe(9000);
    expect(pensionFor({ pensionYears: 20, pensionSalary: 60000 }, 50)).toBe(0);
  });

  it('pension jobs accrue years of service; others do not', () => {
    let s = at(901, 40);
    const me = active(s);
    me.jobId = 'teacher'; me.jobLevel = 1; me.pensionYears = 0; me.careerYears = 0;
    s = resolveYear(s);
    expect(active(s).pensionYears).toBe(1);
    expect(active(s).careerYears).toBe(1);
    let t = at(902, 40);
    active(t).jobId = 'developer';
    t = resolveYear(t);
    expect(active(t).pensionYears ?? 0).toBe(0);
  });

  it('the state pension starts at 65 after 10 working years', () => {
    expect(statePension({ careerYears: 30 }, 64)).toBe(0);
    expect(statePension({ careerYears: 30 }, 65)).toBe(STATE_PENSION);
    expect(statePension({ careerYears: 5 }, 70)).toBe(0);
  });
});

describe('retirement savings', () => {
  it('non-pension jobs match half of contributions up to 6%', () => {
    const s = newGame(903);
    const me = active(s);
    me.jobId = 'developer';
    expect(contributionFor(me, 100000, 0.1)).toEqual({ employee: 10000, match: 3000 });
    me.jobId = 'nurse';
    expect(contributionFor(me, 100000, 0.1)).toEqual({ employee: 10000, match: 0 });
  });

  it('contributions lower taxes, fill the account, and the estimate still matches the economy', () => {
    const base = newGame(904);
    const s = updatePlan(base, { ...base.plan, retireContribution: 0.1 });
    const est0 = estimateYear(base);
    const est = estimateYear(s);
    const tax = (e: typeof est) => e.expenses.find((l) => l.label === 'Taxes')?.amount ?? 0;
    expect(tax(est)).toBeLessThan(tax(est0));
    expect(est.expenses.find((l) => l.label === 'Retirement contributions')?.amount).toBeGreaterThan(0);
    const d: GameState = structuredClone(s);
    const hh = d.households[active(d).householdId];
    const w0 = hh.wallet;
    runEconomy(d, applyPlan(d, makeRng(d.rngState)));
    const raw = w0 + est.net;
    expect(hh.wallet).toBe(Math.round(raw * (raw > 0 ? 1 + SAVINGS_RATE : 1 + DEBT_RATE)));
    expect(active(d).retirementSavings ?? 0).toBeGreaterThan(0);
  });

  it('pass to the household when someone dies', () => {
    const s = newGame(905);
    const me = active(s);
    me.retirementSavings = 50000;
    const w = s.households[me.householdId].wallet;
    die(s, me, 'test');
    expect(s.households[me.householdId].wallet).toBe(w + 50000);
  });
});

describe('retiring', () => {
  it('is possible from 55, and early pensions are smaller', () => {
    expect(financeBlocker(at(906, 54), { kind: 'retire' })).toMatch(/from 55/);
    const s = at(907, 55);
    const me = active(s);
    me.jobId = 'nurse'; me.pensionYears = 25; me.pensionSalary = 70000;
    const after = financeAction(s, { kind: 'retire' });
    const r = active(after);
    expect(r.retired).toBe(true);
    expect(r.jobId).toBeUndefined();
    expect(r.pension).toBe(pensionFor({ pensionYears: 25, pensionSalary: 70000 }, 55));
    expect(after.plan.alloc.work).toBeUndefined();
  });

  it('readiness: a long-serving saver is on track at 65; no pension and no savings at 55 is not', () => {
    const saver = at(908, 50);
    const me = active(saver);
    me.jobId = 'nurse'; me.pensionYears = 20; me.pensionSalary = 70000; me.careerYears = 25; me.retirementSavings = 400000;
    saver.plan.retireContribution = 0.1;
    saver.households[me.householdId].city = 'philadelphia'; // an average-cost city
    expect(readiness(saver, me, 65).status).toBe('ready');
    const broke = at(909, 50);
    const b = active(broke);
    b.jobId = 'retail'; b.pensionYears = 0; b.careerYears = 5; b.retirementSavings = 0;
    expect(readiness(broke, b, 55).status).toBe('not_yet');
  });

  it('retirees collect their pension, the state pension, and savings withdrawals', () => {
    const s = at(910, 67);
    const me = active(s);
    me.retired = true; me.jobId = undefined; me.pension = 15000; me.careerYears = 30; me.retirementSavings = 100000;
    const inc = estimateYear(s).income;
    expect(inc.find((l) => l.label === 'Pensions')?.amount).toBe(15000);
    expect(inc.find((l) => l.label === 'State pension')?.amount).toBe(STATE_PENSION);
    expect(inc.find((l) => l.label === 'Savings withdrawals')?.amount).toBeGreaterThan(0);
  });
});

describe('plan', () => {
  it('keeps the chosen contribution rate (and rejects odd values)', () => {
    const s = newGame(911);
    expect(updatePlan(s, { ...s.plan, retireContribution: 0.1 }).plan.retireContribution).toBe(0.1);
    expect(updatePlan(s, { ...s.plan, retireContribution: 0.37 }).plan.retireContribution).toBeUndefined();
  });
});
