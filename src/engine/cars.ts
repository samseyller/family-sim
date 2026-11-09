/**
 * Cars age: every year they lose value, cost more to keep up, and break down more often.
 * Near the end of their lifespan they can die for good, and stay broken until scrapped.
 * Homes have a garage; parking spots = BASE_PARKING + garage spaces. Garaged cars break
 * down less; cars beyond your spots pay for street parking.
 */
import {
  BASE_PARKING, CAR_LOAN_RATE, CAR_LOAN_YEARS, CARS, HOMES, SCRAP_VALUE, STREET_PARKING_COST, annuityPayment, type CarKind,
} from '../content/finance';
import type { Rng } from './rng';
import type { Asset, GameState, Household } from './types';
import { journal, money, newId } from './util';

/** The model of a car (older saves only knew "Used car" and "New car"). */
export const carModel = (a: Asset): CarKind => a.model ?? (a.name === 'New car' ? 'new' : 'used');
export const carDef = (a: Asset) => CARS[carModel(a)];
export const carAge = (a: Asset) => a.age ?? 0;

/** Yearly upkeep for a model at a given age: 10% more for every year on the road. */
export const upkeepAt = (model: CarKind, age: number) => Math.round(CARS[model].upkeep * (1 + 0.1 * age));

/** A new car asset (`age` defaults to the model's age when bought). */
export function makeCar(s: GameState, model: CarKind, opts: { financed?: boolean; age?: number; value?: number } = {}): Asset {
  const def = CARS[model];
  const age = opts.age ?? def.age;
  const loan = opts.financed ? Math.round(def.price * 0.9) : 0;
  return {
    id: newId(s, 'a'), kind: 'car', name: `${s.year - age} ${def.label}`, model, age,
    value: opts.value ?? def.price, upkeep: upkeepAt(model, age), mortgage: loan,
    rate: loan ? CAR_LOAN_RATE : undefined, payment: loan ? annuityPayment(loan, CAR_LOAN_RATE, CAR_LOAN_YEARS) : undefined,
  };
}

/** Only brand-new cars can be bought on a loan. */
export const financeable = (model: CarKind) => CARS[model].age === 0;

// ── Parking ──────────────────────────────────────────────────────────

/** Garage spaces of a home (older saves are matched by the home's name). */
export function garageOf(house: Asset | undefined) {
  if (!house) return 0;
  if (house.garage !== undefined) return house.garage;
  return Object.values(HOMES).find((h) => h.label === house.name)?.garage ?? 0;
}
const houseOf = (hh: Household) => hh.assets.find((a) => a.kind === 'house');
export const parkingSpots = (hh: Household) => BASE_PARKING + garageOf(houseOf(hh));
export const allCars = (hh: Household) => hh.assets.filter((a) => a.kind === 'car');
/** Cars that still run. */
export const workingCars = (hh: Household) => allCars(hh).filter((a) => !a.broken);
/** The ids of cars that get a garage space (newest and most valuable first). */
export function garagedIds(hh: Household): Set<string> {
  const n = garageOf(houseOf(hh));
  return new Set([...workingCars(hh)].sort((a, b) => b.value - a.value).slice(0, n).map((a) => a.id));
}
/** Yearly cost of parking the cars that don't fit. */
export const streetParkingCost = (hh: Household) => Math.max(0, allCars(hh).length - parkingSpots(hh)) * STREET_PARKING_COST;

// ── Wear and tear ────────────────────────────────────────────────────

/** Chance (0–1) that the car breaks down this year. */
export function breakdownChance(a: Asset, garaged = false): number {
  if (a.broken) return 0;
  const age = carAge(a);
  const def = carDef(a);
  const base = 0.03 + 0.008 * age + (age > 8 ? 0.015 * (age - 8) : 0);
  return Math.min(0.65, (base / def.reliability) * (garaged ? 0.7 : 1));
}

/** What a typical repair costs for this car. */
export const repairCost = (a: Asset) => Math.round(((600 + 140 * carAge(a)) * carDef(a).repairMult) / 50) * 50;

/** A short condition label for the car. */
export function conditionOf(a: Asset): { label: string; tone: 'good' | 'ok' | 'bad' } {
  if (a.broken) return { label: 'Dead for good', tone: 'bad' };
  const age = carAge(a);
  const life = carDef(a).lifespan;
  if (age <= 1) return { label: 'Like new', tone: 'good' };
  if (age <= 5) return { label: 'Good', tone: 'good' };
  if (age < life * 0.6) return { label: 'Worn', tone: 'ok' };
  if (age < life - 2) return { label: 'Old', tone: 'ok' };
  return { label: 'On its last legs', tone: 'bad' };
}

/** Chance the car dies for good this year once it's near the end of its life. */
export function deathChance(a: Asset) {
  const over = carAge(a) - carDef(a).lifespan;
  return over < -2 ? 0 : Math.min(0.9, 0.2 + 0.15 * (over + 2));
}

/**
 * One year of wear for every car in the household: age, value, upkeep, plus (with an
 * rng) small repairs and cars dying for good. Repairs are paid from the wallet.
 */
export function ageCars(s: GameState, hh: Household, rng?: Rng, isMine = false) {
  const garaged = garagedIds(hh);
  for (const a of allCars(hh)) {
    if (a.broken) continue;
    const def = carDef(a);
    a.model = carModel(a);
    a.age = carAge(a) + 1;
    a.value = Math.max(SCRAP_VALUE, Math.round(a.value * (1 - def.depreciation)));
    a.upkeep = upkeepAt(a.model, a.age);
    if (!rng) continue;
    if (rng.chance(deathChance(a))) {
      a.broken = true;
      a.value = SCRAP_VALUE;
      a.upkeep = 0;
      if (isMine) journal(s, `The ${a.name} died for good after ${a.age} years. Scrap it in the Money tab.`, 'bad');
    } else if (rng.chance(breakdownChance(a, garaged.has(a.id)) * 0.6)) {
      const cost = repairCost(a);
      hh.wallet -= cost;
      if (isMine) journal(s, `The ${a.name} needed ${money(cost)} in repairs.`, 'info');
    }
  }
}

/** The car most likely to break down (for the car-trouble event). */
export function shakiestCar(hh: Household) {
  const garaged = garagedIds(hh);
  return [...workingCars(hh)].sort((a, b) => breakdownChance(b, garaged.has(b.id)) - breakdownChance(a, garaged.has(a.id)))[0];
}
