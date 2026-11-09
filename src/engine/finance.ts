/**
 * Money actions the player takes immediately during planning (not part of the
 * time budget): homes, rentals, cars, investments, and college funds. Each is a
 * pure (state, …) → state transition, validated here so the UI can't cheat.
 */
import {
  annuityPayment, BUY_COSTS, CARS, GARAGE_BUILD, HOMES, MORTGAGE_RATE, MORTGAGE_YEARS, MOVING_COST,
  RENOVATION, RENTALS, SELL_COSTS, type CarKind, type HomeTier, type RentTier,
} from '../content/finance';
import type { Asset, GameState, Household } from './types';
import { financeable, garageOf, makeCar, parkingSpots } from './cars';
import { retirePerson } from './retirement';
import { unlockedTabs } from './tutorial';
import { sanitizePlan } from './generate';
import { EARLY_RETIREMENT_AGE } from '../content/retirement';
import { active, ageOf, alive, journal, kidsAtHome, membersOf, money, newId, stat } from './util';

export type FinanceAction =
  | { kind: 'rent'; tier: RentTier }
  | { kind: 'buyHome'; tier: HomeTier; downPct: number }
  | { kind: 'sellHome' }
  | { kind: 'renovate' }
  | { kind: 'buildGarage' }
  | { kind: 'payLoan'; assetId: string; amount: number }
  | { kind: 'buyCar'; car: CarKind; financed: boolean }
  | { kind: 'sellCar'; assetId: string }
  | { kind: 'invest'; amount: number }
  | { kind: 'withdraw'; amount: number }
  | { kind: 'fundDeposit'; childId: string; amount: number }
  | { kind: 'retire' };

export const homeOf = (hh: Household) => hh.assets.find((a) => a.kind === 'house');
export const carsOf = (hh: Household) => hh.assets.filter((a) => a.kind === 'car');
export const rentTierOf = (hh: Household): RentTier => hh.rentTier ?? 'apartment';
export const capacityOf = (hh: Household) => homeOf(hh)?.capacity ?? (homeOf(hh) ? 5 : RENTALS[rentTierOf(hh)].capacity);

/** Everything the household owns minus what it owes (college funds belong to the kids). */
export function netWorth(s: GameState, householdId: string) {
  const hh = s.households[householdId];
  const savings = membersOf(s, householdId).reduce((sum, p) => sum + (p.retirementSavings ?? 0), 0);
  return Math.round(hh.wallet + (hh.investments ?? 0) + savings + hh.assets.reduce((sum, a) => sum + a.value - a.mortgage, 0));
}

/** Upfront cash needed to buy a home with a given down payment. */
export const homeUpfront = (tier: HomeTier, downPct: number) => Math.round(HOMES[tier].price * (downPct + BUY_COSTS));

/** Why an action can't happen right now, or null if it can. */
export function financeBlocker(s: GameState, a: FinanceAction): string | null {
  if (s.phase !== 'PLANNING') return 'Money decisions are made while planning.';
  const me = active(s);
  if (ageOf(me, s.year) < 18) return 'Your parents handle the money for now.';
  if (!unlockedTabs(s).includes('money')) return 'The Money tab opens at 24.';
  const hh = s.households[me.householdId];
  const home = homeOf(hh);
  switch (a.kind) {
    case 'rent':
      if (home) return 'Sell your home first.';
      if (rentTierOf(hh) === a.tier) return 'You already live here.';
      return hh.wallet < MOVING_COST ? `Moving costs ${money(MOVING_COST)}.` : null;
    case 'buyHome':
      if (home) return 'You already own a home.';
      if (![0.1, 0.2].includes(a.downPct)) return 'Choose a 10% or 20% down payment.';
      return hh.wallet < homeUpfront(a.tier, a.downPct) ? `You need ${money(homeUpfront(a.tier, a.downPct))} up front.` : null;
    case 'sellHome':
      return home ? null : 'You do not own a home.';
    case 'buildGarage':
      if (!home) return 'You do not own a home.';
      if (garageOf(home) >= GARAGE_BUILD.max) return 'There is no room on the lot for more garage.';
      return hh.wallet < GARAGE_BUILD.cost ? `A garage space costs ${money(GARAGE_BUILD.cost)}.` : null;
    case 'renovate':
      if (!home) return 'You do not own a home.';
      return hh.wallet < RENOVATION.cost ? `Renovating costs ${money(RENOVATION.cost)}.` : null;
    case 'payLoan': {
      const asset = hh.assets.find((x) => x.id === a.assetId);
      if (!asset || asset.mortgage <= 0) return 'Nothing is owed on that.';
      return a.amount <= 0 || hh.wallet < Math.min(a.amount, asset.mortgage) ? 'Not enough cash.' : null;
    }
    case 'buyCar':
      if (!CARS[a.car]) return 'No such car.';
      if (carsOf(hh).length >= parkingSpots(hh)) return `No parking left (${parkingSpots(hh)} spots). Sell a car or add a garage.`;
      if (a.financed && !financeable(a.car)) return 'Loans are only for new cars.';
      return !a.financed && hh.wallet < CARS[a.car].price ? `You need ${money(CARS[a.car].price)}.`
        : a.financed && hh.wallet < CARS[a.car].price * 0.1 ? `A loan needs ${money(CARS[a.car].price * 0.1)} down.` : null;
    case 'sellCar':
      return hh.assets.some((x) => x.id === a.assetId && x.kind === 'car') ? null : 'No such car.';
    case 'invest':
      return a.amount > 0 && hh.wallet >= a.amount ? null : 'Not enough cash.';
    case 'withdraw':
      return a.amount > 0 && (hh.investments ?? 0) >= a.amount ? null : 'Not that much invested.';
    case 'retire':
      if (me.retired) return 'You are already retired.';
      return ageOf(me, s.year) < EARLY_RETIREMENT_AGE ? `Retirement is possible from ${EARLY_RETIREMENT_AGE}.` : null;
    case 'fundDeposit': {
      const kid = kidsAtHome(s, me).find((k) => k.id === a.childId);
      if (!kid) return 'That child is not at home.';
      return a.amount > 0 && hh.wallet >= a.amount ? null : 'Not enough cash.';
    }
  }
}

/** Apply a money action. Returns the same state if it isn't allowed. */
export function financeAction(state: GameState, a: FinanceAction): GameState {
  if (financeBlocker(state, a)) return state;
  const s: GameState = structuredClone(state);
  const me = active(s);
  const hh = s.households[me.householdId];
  const home = homeOf(hh);
  switch (a.kind) {
    case 'rent': {
      hh.wallet -= MOVING_COST;
      hh.rentTier = a.tier;
      journal(s, `You moved into a ${RENTALS[a.tier].label.toLowerCase()}.`, 'info');
      break;
    }
    case 'buyHome': {
      const h = HOMES[a.tier];
      const loan = Math.round(h.price * (1 - a.downPct));
      hh.wallet -= homeUpfront(a.tier, a.downPct);
      hh.assets.push({
        id: newId(s, 'a'), kind: 'house', name: h.label, value: h.price, upkeep: h.upkeep, capacity: h.capacity, garage: h.garage,
        mortgage: loan, rate: MORTGAGE_RATE, payment: annuityPayment(loan, MORTGAGE_RATE, MORTGAGE_YEARS),
      });
      for (const m of membersOf(s, hh.id)) stat(m, 'happiness', 6);
      journal(s, `You bought a ${h.label.toLowerCase()} for ${money(h.price)}.`, 'major');
      break;
    }
    case 'sellHome': {
      const proceeds = Math.round(home!.value * (1 - SELL_COSTS) - home!.mortgage);
      hh.wallet += proceeds;
      hh.assets = hh.assets.filter((x) => x !== home);
      hh.rentTier = membersOf(s, hh.id).length > 4 ? 'house' : 'apartment';
      journal(s, `You sold the house${proceeds >= 0 ? ` and cleared ${money(proceeds)}` : `, still owing ${money(-proceeds)}`}. Back to renting.`, 'major');
      break;
    }
    case 'buildGarage': {
      hh.wallet -= GARAGE_BUILD.cost;
      home!.garage = garageOf(home) + 1;
      home!.value += GARAGE_BUILD.valueGain;
      journal(s, `You added a garage space (${home!.garage} now).`, 'info');
      break;
    }
    case 'renovate': {
      hh.wallet -= RENOVATION.cost;
      home!.value += RENOVATION.valueGain;
      for (const m of membersOf(s, hh.id)) stat(m, 'happiness', RENOVATION.happiness);
      journal(s, 'You renovated the kitchen. Everyone gathers there now.', 'good');
      break;
    }
    case 'payLoan': {
      const asset = hh.assets.find((x) => x.id === a.assetId)!;
      const pay = Math.min(a.amount, asset.mortgage);
      hh.wallet -= pay;
      asset.mortgage -= pay;
      if (asset.mortgage <= 0) {
        asset.mortgage = 0;
        journal(s, `You paid off the ${asset.kind === 'house' ? 'mortgage' : 'car loan'}!`, 'good');
      }
      break;
    }
    case 'buyCar': {
      const c = CARS[a.car];
      const car = makeCar(s, a.car, { financed: a.financed });
      hh.wallet -= c.price - car.mortgage;
      hh.assets.push(car);
      stat(me, 'happiness', c.joy);
      journal(s, `You bought ${c.age ? 'a used' : 'a new'} ${c.label.toLowerCase()}${car.mortgage ? ' on a loan' : ''}.`, 'info');
      break;
    }
    case 'sellCar': {
      const car = hh.assets.find((x) => x.id === a.assetId)!;
      hh.wallet += Math.round(car.value - car.mortgage);
      hh.assets = hh.assets.filter((x) => x !== car);
      journal(s, car.broken ? `You scrapped the ${car.name}.` : `You sold the ${car.name}.`, 'info');
      break;
    }
    case 'invest':
      hh.wallet -= a.amount;
      hh.investments = (hh.investments ?? 0) + a.amount;
      break;
    case 'withdraw':
      hh.investments = (hh.investments ?? 0) - a.amount;
      hh.wallet += a.amount;
      break;
    case 'retire': {
      const age = ageOf(me, s.year);
      retirePerson(me, s.year);
      stat(me, 'happiness', 8);
      stat(me, 'stress', -15);
      s.plan = sanitizePlan(s, s.plan);
      journal(s, `You retired at ${age}${me.pension ? ` with a pension of ${money(me.pension)} a year` : ''}.`, 'major');
      break;
    }
    case 'fundDeposit': {
      const kid = s.people[a.childId];
      hh.wallet -= a.amount;
      kid.fund += a.amount;
      break;
    }
  }
  return s;
}

/** Yearly loan payment for an asset (older saves had a flat $18k mortgage cap). */
export function loanPayment(asset: Asset) {
  if (asset.mortgage <= 0) return 0;
  const rate = asset.rate ?? 0.04;
  const owed = asset.mortgage * (1 + rate);
  return Math.min(asset.payment ?? 18000, owed);
}

/** Living adults with a job in the household (they need to get to work). */
export const commuters = (s: GameState, householdId: string) =>
  membersOf(s, householdId).filter((p) => alive(p) && ageOf(p, s.year) >= 16 && (p.jobId || p.partJobId)).length;
