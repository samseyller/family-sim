/** Money tab rules: homes, rentals, cars, loans, investments, funds. */
import { cityOfHousehold, homePriceIn, rentIn } from './location';
import { describe, expect, it } from 'vitest';
import { annuityPayment, HOMES, MORTGAGE_RATE, MORTGAGE_YEARS, RENTALS, SELL_COSTS } from '../content/finance';
import { newGame } from './generate';
import { capacityOf, carsOf, financeAction, financeBlocker, homeOf, homeUpfront, netWorth } from './finance';
import { estimateYear } from './budget';
import { applyPlan, runEconomy } from './systems';
import { makeRng } from './rng';
import { resolveYear } from './phases';
import type { GameState } from './types';
import { active, kidsAtHome } from './util';
import { parseSaveFile, serializeGame } from '../persistence/exportImport';

const rich = (seed: number, cash = 500000) => {
  const s = newGame(seed);
  s.households[active(s).householdId].wallet = cash;
  return s;
};
const hhOf = (s: GameState) => s.households[active(s).householdId];

describe('homes', () => {
  it('buying takes the down payment + closing costs and sets an amortized mortgage', () => {
    const s = financeAction(rich(601), { kind: 'buyHome', tier: 'family', downPct: 0.2 });
    const h = homeOf(hhOf(s))!;
    const city = cityOfHousehold(hhOf(s));
    const price = homePriceIn('family', city);
    expect(hhOf(s).wallet).toBe(500000 - homeUpfront('family', 0.2, city));
    expect(h.mortgage).toBe(Math.round(price * 0.8));
    expect(h.payment).toBe(annuityPayment(Math.round(price * 0.8), MORTGAGE_RATE, MORTGAGE_YEARS));
    expect(capacityOf(hhOf(s))).toBe(HOMES.family.capacity);
    expect(estimateYear(s).expenses.some((l) => l.label === 'Rent')).toBe(false);
    expect(estimateYear(s).expenses.find((l) => l.label === 'Mortgage')?.amount).toBe(h.payment);
  });

  it('cannot buy without the cash, or twice', () => {
    const poor = rich(602, 5000);
    expect(financeBlocker(poor, { kind: 'buyHome', tier: 'starter', downPct: 0.1 })).toMatch(/up front/);
    expect(financeAction(poor, { kind: 'buyHome', tier: 'starter', downPct: 0.1 })).toBe(poor);
    const owner = financeAction(rich(603), { kind: 'buyHome', tier: 'starter', downPct: 0.1 });
    expect(financeBlocker(owner, { kind: 'buyHome', tier: 'large', downPct: 0.1 })).toMatch(/already own/);
  });

  it('selling returns value minus fees and the mortgage', () => {
    let s = financeAction(rich(604), { kind: 'buyHome', tier: 'starter', downPct: 0.1 });
    const h = homeOf(hhOf(s))!;
    const before = hhOf(s).wallet;
    s = financeAction(s, { kind: 'sellHome' });
    expect(homeOf(hhOf(s))).toBeUndefined();
    expect(hhOf(s).wallet).toBe(before + Math.round(h.value * (1 - SELL_COSTS) - h.mortgage));
  });

  it('mortgages amortize over the years and are paid off', () => {
    let s = financeAction(rich(605), { kind: 'buyHome', tier: 'starter', downPct: 0.2 });
    const start = homeOf(hhOf(s))!.mortgage;
    s = resolveYear(s);
    expect(homeOf(hhOf(s))!.mortgage).toBeLessThan(start);
  });

  it('renting a bigger place costs more and fits more people', () => {
    const s = financeAction(rich(606), { kind: 'rent', tier: 'house' });
    expect(hhOf(s).rentTier).toBe('house');
    expect(estimateYear(s).expenses.find((l) => l.label === 'Rent')?.amount).toBe(rentIn('house', cityOfHousehold(hhOf(s))));
    expect(capacityOf(hhOf(s))).toBe(RENTALS.house.capacity);
  });
});

describe('cars, loans, investments, funds', () => {
  it('new games include a car; selling it adds transit costs', () => {
    let s = rich(607);
    expect(carsOf(hhOf(s))).toHaveLength(1);
    s = financeAction(s, { kind: 'sellCar', assetId: carsOf(hhOf(s))[0].id });
    expect(carsOf(hhOf(s))).toHaveLength(0);
    expect(estimateYear(s).expenses.some((l) => l.label === 'Transit')).toBe(true);
  });

  it('financed cars carry a loan payment that can be paid off', () => {
    let s = financeAction(rich(608), { kind: 'buyCar', car: 'new', financed: true });
    const car = carsOf(hhOf(s)).find((c) => c.mortgage > 0)!;
    expect(estimateYear(s).expenses.find((l) => l.label === 'Car loan')?.amount).toBe(car.payment);
    s = financeAction(s, { kind: 'payLoan', assetId: car.id, amount: car.mortgage });
    expect(carsOf(hhOf(s)).find((c) => c.id === car.id)!.mortgage).toBe(0);
  });

  it('investing moves cash; net worth is unchanged; returns are deterministic per seed', () => {
    const s0 = rich(609);
    const nw = netWorth(s0, hhOf(s0).id);
    const s = financeAction(s0, { kind: 'invest', amount: 100000 });
    expect(hhOf(s).investments).toBe(100000);
    expect(netWorth(s, hhOf(s).id)).toBe(nw);
    const a = resolveYear(s);
    const b = resolveYear(s);
    expect(hhOf(a).investments).toBe(hhOf(b).investments);
    expect(hhOf(a).investments).not.toBe(100000);
  });

  it('college fund deposits go to the child', () => {
    const s0 = rich(610);
    const kid = kidsAtHome(s0, active(s0))[0];
    const s = financeAction(s0, { kind: 'fundDeposit', childId: kid.id, amount: 5000 });
    expect(s.people[kid.id].fund).toBe(kid.fund + 5000);
  });

  it('money actions only happen while planning and as an adult', () => {
    const child = newGame(611, 'child');
    expect(financeBlocker(child, { kind: 'invest', amount: 1 })).toMatch(/parents/);
    const s = rich(612);
    s.phase = 'RECAP';
    expect(financeBlocker(s, { kind: 'invest', amount: 1 })).toMatch(/planning/);
  });

  it('the estimate still matches the real economy with homes, cars, and rent tiers', () => {
    let s = financeAction(rich(613, 80000), { kind: 'buyHome', tier: 'starter', downPct: 0.1 });
    s = financeAction(s, { kind: 'buyCar', car: 'new', financed: true });
    const est = estimateYear(s);
    const d: GameState = structuredClone(s);
    const w0 = hhOf(d).wallet;
    runEconomy(d, applyPlan(d, makeRng(d.rngState)));
    const raw = w0 + est.net;
    expect(hhOf(d).wallet).toBe(Math.round(raw * (raw > 0 ? 1.015 : 1.08)));
  });

  it('finance fields survive a save round-trip', () => {
    let s = financeAction(rich(614), { kind: 'buyHome', tier: 'large', downPct: 0.2 });
    s = financeAction(s, { kind: 'invest', amount: 1234 });
    const res = parseSaveFile(serializeGame(s));
    expect(res.ok && res.kind === 'game' && res.state).toEqual(s);
  });
});
