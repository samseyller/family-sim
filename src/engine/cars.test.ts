import { describe, expect, it } from 'vitest';
import { CARS, GARAGE_BUILD, HOMES, SCRAP_VALUE } from '../content/finance';
import { ageCars, allCars, breakdownChance, carAge, conditionOf, garageOf, makeCar, parkingSpots, workingCars } from './cars';
import { estimateYear } from './budget';
import { financeAction, financeBlocker } from './finance';
import { newGame } from './generate';
import { migrate } from './migrations';
import { makeRng } from './rng';
import type { GameState } from './types';
import { active } from './util';

const rich = (seed: number, cash = 2_000_000) => {
  const s = newGame(seed);
  s.households[active(s).householdId].wallet = cash;
  return s;
};
const hhOf = (s: GameState) => s.households[active(s).householdId];

describe('cars age', () => {
  it('a new car is only new once: it ages, loses value and costs more each year', () => {
    const s = newGame(701);
    const car = makeCar(s, 'new');
    expect(car.name).toBe(`${s.year} ${CARS.new.label}`);
    expect(conditionOf(car).label).toBe('Like new');
    const hh = hhOf(s);
    hh.assets = [car];
    const v0 = car.value;
    const u0 = car.upkeep;
    for (let i = 0; i < 6; i++) ageCars(s, hh);
    expect(carAge(car)).toBe(6);
    expect(car.value).toBeLessThan(v0 * 0.5);
    expect(car.upkeep).toBeGreaterThan(u0);
    expect(conditionOf(car).label).not.toBe('Like new');
  });

  it('breaks down more as it gets older; a garage helps; reliable models break less', () => {
    const s = newGame(702);
    const young = makeCar(s, 'compact');
    const old = makeCar(s, 'compact', { age: 14 });
    expect(breakdownChance(old)).toBeGreaterThan(breakdownChance(young) * 3);
    expect(breakdownChance(old, true)).toBeLessThan(breakdownChance(old));
    expect(breakdownChance(makeCar(s, 'pickup', { age: 10 }))).toBeLessThan(breakdownChance(makeCar(s, 'sports', { age: 10 })));
  });

  it('eventually dies for good; then it is worth scrap and no longer gets you to work', () => {
    const s = newGame(703);
    const hh = hhOf(s);
    hh.assets = hh.assets.filter((a) => a.kind !== 'car');
    hh.assets.push(makeCar(s, 'beater'));
    const rng = makeRng(42);
    for (let i = 0; i < 20 && !allCars(hh)[0].broken; i++) ageCars(s, hh, rng);
    const car = allCars(hh)[0];
    expect(car.broken).toBe(true);
    expect(car.value).toBe(SCRAP_VALUE);
    expect(workingCars(hh)).toHaveLength(0);
    s.phase = 'PLANNING';
    expect(estimateYear(s).expenses.some((l) => l.label === 'Transit')).toBe(true);
    const scrapped = financeAction({ ...s, households: { ...s.households, [hh.id]: hh } }, { kind: 'sellCar', assetId: car.id });
    expect(allCars(hhOf(scrapped))).toHaveLength(0);
  });

  it('only new cars can be financed', () => {
    const s = rich(704);
    expect(financeBlocker(s, { kind: 'buyCar', car: 'used_suv', financed: true })).toMatch(/new cars/);
    expect(financeBlocker(s, { kind: 'buyCar', car: 'minivan', financed: true })).toBeNull();
  });
});

describe('parking and garages', () => {
  it('two spots without a garage; buying past that is blocked; a garage adds spots', () => {
    let s = rich(711);
    expect(parkingSpots(hhOf(s))).toBe(2);
    s = financeAction(s, { kind: 'buyCar', car: 'compact', financed: false });
    expect(allCars(hhOf(s))).toHaveLength(2);
    expect(financeBlocker(s, { kind: 'buyCar', car: 'compact', financed: false })).toMatch(/parking/);
    s = financeAction(s, { kind: 'buyHome', tier: 'starter', downPct: 0.2 });
    expect(garageOf(hhOf(s).assets.find((a) => a.kind === 'house'))).toBe(0);
    s = financeAction(s, { kind: 'buildGarage' });
    expect(parkingSpots(hhOf(s))).toBe(3);
    expect(financeBlocker(s, { kind: 'buyCar', car: 'compact', financed: false })).toBeNull();
  });

  it('bigger homes come with garages; garages are capped', () => {
    expect(HOMES.family.garage).toBeGreaterThan(0);
    let s = financeAction(rich(712), { kind: 'buyHome', tier: 'estate', downPct: 0.2 });
    expect(parkingSpots(hhOf(s))).toBe(2 + HOMES.estate.garage);
    for (let i = 0; i < 3; i++) s = financeAction(s, { kind: 'buildGarage' });
    expect(garageOf(hhOf(s).assets.find((a) => a.kind === 'house'))).toBe(GARAGE_BUILD.max);
  });

  it('cars beyond the parking spots pay for street parking', () => {
    const s = rich(713);
    const hh = hhOf(s);
    hh.assets.push(makeCar(s, 'compact'), makeCar(s, 'compact'));
    expect(estimateYear(s).expenses.find((l) => l.label === 'Street parking')?.amount).toBeGreaterThan(0);
  });
});

describe('older saves', () => {
  it('old "New car" / "Used car" get a model and an age; old homes get their garage', () => {
    const s = newGame(721) as GameState & { schemaVersion: number };
    const raw = structuredClone(s) as any;
    raw.schemaVersion = 10;
    const hh = raw.households[active(s).householdId];
    hh.assets = [
      { id: 'c1', kind: 'car', name: 'New car', value: 20000, upkeep: 900, mortgage: 0 },
      { id: 'c2', kind: 'car', name: 'Used car', value: 5000, upkeep: 1800, mortgage: 0 },
      { id: 'h1', kind: 'house', name: 'Family home', value: 340000, upkeep: 4500, mortgage: 0, capacity: 5 },
    ];
    const m = migrate(raw)!;
    const assets = m.households[active(s).householdId].assets;
    expect(assets[0]).toMatchObject({ model: 'new', age: 3 });
    expect(assets[1]).toMatchObject({ model: 'used', age: 8 });
    expect(assets[2].garage).toBe(HOMES.family.garage);
  });
});
