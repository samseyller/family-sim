/**
 * Money actions the player takes immediately during planning (not part of the
 * time budget): homes, rentals, cars, investments, and college funds. Each is a
 * pure (state, …) → state transition, validated here so the UI can't cheat.
 */
import {
  annuityPayment, BUY_COSTS, CARS, COLLEGE_FUND_CAP, GARAGE_BUILD, HOME_UPGRADES, HOMES, MORTGAGE_RATE, MORTGAGE_YEARS, MOVING_COST,
  type UpgradeId,
  RENOVATION, RENTALS, SELL_COSTS, type CarKind, type HomeTier, type RentTier,
} from '../content/finance';
import type { Asset, GameState, Household, Person } from './types';
import { financeable, garageOf, makeCar, parkingFree, parkingSpots } from './cars';
import { cityName, cityOfHousehold, homePriceIn, homeUpkeepIn, rentIn } from './location';
import { CITIES, RELOCATION, type CityId } from '../content/cities';
import { runsHousehold } from './household';
import { gearBlocker, makeGear } from './hobbies';
import type { GearId } from '../content/gear';
import { retirePerson } from './retirement';
import { unlockedTabs } from './tutorial';
import { sanitizePlan } from './generate';
import { EARLY_RETIREMENT_AGE } from '../content/retirement';
import { active, ageOf, alive, journal, kidsAtHome, membersOf, money, newId, stat } from './util';
import { bestSkill, diyFactor } from './handy';

export type FinanceAction =
  | { kind: 'rent'; tier: RentTier }
  | { kind: 'buyHome'; tier: HomeTier; downPct: number }
  | { kind: 'sellHome' }
  | { kind: 'renovate' }
  | { kind: 'buildGarage' }
  | { kind: 'upgradeHome'; upgrade: UpgradeId }
  | { kind: 'floodInsurance'; on: boolean }
  | { kind: 'buyGear'; gear: GearId }
  | { kind: 'sellGear'; assetId: string }
  | { kind: 'payLoan'; assetId: string; amount: number }
  | { kind: 'buyCar'; car: CarKind; financed: boolean }
  | { kind: 'sellCar'; assetId: string }
  | { kind: 'invest'; amount: number }
  | { kind: 'withdraw'; amount: number }
  | { kind: 'fundDeposit'; childId: string; amount: number }
  | { kind: 'retire' }
  | { kind: 'moveCity'; city: CityId };

export const homeOf = (hh: Household) => hh.assets.find((a) => a.kind === 'house');
/** What selling the home would leave after fees and the mortgage (0 when renting). */
export const homeEquity = (hh: Household) => { const h = homeOf(hh); return h ? Math.round(h.value * (1 - SELL_COSTS) - h.mortgage) : 0; };
export const carsOf = (hh: Household) => hh.assets.filter((a) => a.kind === 'car');
export const rentTierOf = (hh: Household): RentTier => hh.rentTier ?? 'apartment';
export const capacityOf = (hh: Household) => {
  const home = homeOf(hh);
  return home ? (home.capacity ?? 5) + upgradeCount(home, 'expansion') : RENTALS[rentTierOf(hh)].capacity;
};
export const upgradeCount = (home: Asset, id: UpgradeId) => (home.upgrades ?? []).filter((u) => u === id).length;
/** An upgrade's price in a city. */
export const upgradeCost = (id: UpgradeId, city: CityId) => Math.round((HOME_UPGRADES[id].cost * CITIES[city].living) / 500) * 500;
/** A woodworker at home does the building: renovations and additions cost less with their skill. */
const diy = (s: GameState, hh: Household, cost: number) => Math.round((cost * diyFactor(bestSkill(s, hh.id, 'woodworking'))) / 500) * 500;
/** What an upgrade costs this household (additions are cheaper with a woodworker at home). */
export const homeUpgradeCost = (s: GameState, hh: Household, id: UpgradeId) =>
  id === 'expansion' ? diy(s, hh, upgradeCost(id, cityOfHousehold(hh))) : upgradeCost(id, cityOfHousehold(hh));
/** What renovating the kitchen costs this household. */
export const renovationCost = (s: GameState, hh: Household) => diy(s, hh, RENOVATION.cost);

/** Everything the household owns minus what it owes (college funds belong to the kids). */
export function netWorth(s: GameState, householdId: string) {
  const hh = s.households[householdId];
  const savings = membersOf(s, householdId).reduce((sum, p) => sum + (p.retirementSavings ?? 0), 0);
  return Math.round(hh.wallet + (hh.investments ?? 0) + savings + hh.assets.reduce((sum, a) => sum + a.value - a.mortgage, 0));
}

/** Upfront cash needed to buy a home with a given down payment. */
export { homePriceIn, homeUpkeepIn, rentIn };
export const homeUpfront = (tier: HomeTier, downPct: number, city: CityId) => Math.round(homePriceIn(tier, city) * (downPct + BUY_COSTS));

/** A newly bought home as an asset (with a mortgage unless `downPct` is 1). */
export function makeHome(s: GameState, tier: HomeTier, city: CityId, downPct: number): Asset {
  const h = HOMES[tier];
  const price = homePriceIn(tier, city);
  const loan = Math.round(price * (1 - downPct));
  return {
    id: newId(s, 'a'), kind: 'house', name: h.label, value: price, upkeep: homeUpkeepIn(tier, city), capacity: h.capacity, garage: h.garage,
    mortgage: loan, rate: loan ? MORTGAGE_RATE : undefined, payment: loan ? annuityPayment(loan, MORTGAGE_RATE, MORTGAGE_YEARS) : 0,
  };
}

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
      if (home && home.name === HOMES[a.tier].label) return 'You already live in one.';
      if (![0.1, 0.2].includes(a.downPct)) return 'Choose a 10% or 20% down payment.';
      // Moving house: the current home is sold first and its equity goes toward the new one.
      return hh.wallet + homeEquity(hh) < homeUpfront(a.tier, a.downPct, cityOfHousehold(hh)) ? `You need ${money(homeUpfront(a.tier, a.downPct, cityOfHousehold(hh)))} up front${home ? ' (counting the sale of this home)' : ''}.` : null;
    case 'sellHome':
      return home ? null : 'You do not own a home.';
    case 'upgradeHome': {
      if (!home) return 'Upgrades are for a home you own.';
      const u = HOME_UPGRADES[a.upgrade];
      if (!u) return 'Unknown upgrade.';
      if (upgradeCount(home, a.upgrade) >= u.max) return u.max === 1 ? 'You already have one.' : `At most ${u.max}.`;
      if (a.upgrade === 'garage_lift' && garageOf(home) < 1) return 'Needs a garage (add a garage space first).';
      return hh.wallet < homeUpgradeCost(s, hh, a.upgrade) ? `Costs ${money(homeUpgradeCost(s, hh, a.upgrade))}.` : null;
    }
    case 'buyGear':
      return gearBlocker(s, a.gear, parkingFree(hh));
    case 'sellGear':
      return hh.assets.some((x) => x.id === a.assetId && x.kind === 'gear') ? null : 'No such gear.';
    case 'floodInsurance':
      if (!home) return 'Flood insurance is for a home you own.';
      return !!hh.floodInsurance === a.on ? (a.on ? 'Already insured.' : 'Not insured.') : null;
    case 'buildGarage':
      if (!home) return 'You do not own a home.';
      if (garageOf(home) >= GARAGE_BUILD.max) return 'There is no room on the lot for more garage.';
      return hh.wallet < GARAGE_BUILD.cost ? `A garage space costs ${money(GARAGE_BUILD.cost)}.` : null;
    case 'renovate':
      if (!home) return 'You do not own a home.';
      return hh.wallet < renovationCost(s, hh) ? `Renovating costs ${money(renovationCost(s, hh))}.` : null;
    case 'payLoan': {
      const asset = hh.assets.find((x) => x.id === a.assetId);
      if (!asset || asset.mortgage <= 0) return 'Nothing is owed on that.';
      return a.amount <= 0 || hh.wallet < Math.min(a.amount, asset.mortgage) ? 'Not enough cash.' : null;
    }
    case 'buyCar':
      if (!CARS[a.car]) return 'No such car.';
      if (parkingFree(hh) <= 0) return `No parking left (${parkingSpots(hh)} spots). Sell a car or add a garage.`;
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
    case 'moveCity': {
      if (!runsHousehold(s, me)) return 'Move out of this household first (Money → Household).';
      if (!CITIES[a.city]) return 'Unknown city.';
      if (a.city === cityOfHousehold(hh)) return 'You already live here.';
      return hh.wallet < relocationCost(s, hh) ? `Moving costs ${money(relocationCost(s, hh))}.` : null;
    }
    case 'fundDeposit': {
      const kid = kidsAtHome(s, me).find((k) => k.id === a.childId);
      if (!kid) return 'That child is not at home.';
      if (kid.fund >= COLLEGE_FUND_CAP) return `${kid.firstName}'s fund is full (${money(COLLEGE_FUND_CAP)}).`;
      if (kid.fund + a.amount > COLLEGE_FUND_CAP) return `Only ${money(COLLEGE_FUND_CAP - kid.fund)} more fits (max ${money(COLLEGE_FUND_CAP)}).`;
      return a.amount > 0 && hh.wallet >= a.amount ? null : 'Not enough cash.';
    }
  }
}

/** Apply a money action. Returns the same state if it isn't allowed. */
export function financeAction(state: GameState, a: FinanceAction): GameState {
  if (financeBlocker(state, a)) return state;
  const s: GameState = structuredClone(state);
  applyFinance(s, a);
  return s;
}

/** Carry out a money action on `s` in place, with no checks (life events that decide for you use this). */
export function applyFinance(s: GameState, a: FinanceAction) {
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
      const old = home ? { name: home.name, equity: homeEquity(hh) } : undefined;
      if (home) { applyFinance(s, { kind: 'sellHome' }); s.journal.pop(); } // moving: sell the old place first
      const city = cityOfHousehold(hh);
      hh.wallet -= homeUpfront(a.tier, a.downPct, city);
      const bought = makeHome(s, a.tier, city, a.downPct);
      hh.assets.push(bought);
      for (const m of membersOf(s, hh.id)) stat(m, 'happiness', 6);
      journal(s, `${old ? `You sold the ${old.name.toLowerCase()} (${money(old.equity)} after the mortgage) and bought` : 'You bought'} a ${HOMES[a.tier].label.toLowerCase()} in ${cityName(city)} for ${money(bought.value)}.`, 'major');
      break;
    }
    case 'sellHome': {
      const proceeds = Math.round(home!.value * (1 - SELL_COSTS) - home!.mortgage);
      hh.wallet += proceeds;
      hh.assets = hh.assets.filter((x) => x !== home);
      hh.rentTier = membersOf(s, hh.id).length > 4 ? 'house' : 'apartment';
      hh.floodInsurance = undefined;
      journal(s, `You sold the house${proceeds >= 0 ? ` and cleared ${money(proceeds)}` : `, still owing ${money(-proceeds)}`}. Back to renting.`, 'major');
      break;
    }
    case 'upgradeHome': {
      const u = HOME_UPGRADES[a.upgrade];
      const cost = homeUpgradeCost(s, hh, a.upgrade);
      hh.wallet -= cost;
      home!.upgrades = [...(home!.upgrades ?? []), a.upgrade];
      home!.upkeep += u.upkeep;
      home!.value += Math.round(u.value * CITIES[cityOfHousehold(hh)].housing);
      for (const m of membersOf(s, hh.id)) stat(m, 'happiness', 5);
      journal(s, `You added ${u.label.toLowerCase() === 'home addition' ? 'an addition to the house' : `a ${u.label.toLowerCase()}`} (${money(cost)}).`, 'good');
      break;
    }
    case 'buyGear': {
      const item = makeGear(s, a.gear);
      hh.wallet -= item.value;
      hh.assets.push(item);
      stat(me, 'happiness', 6);
      journal(s, `You bought a ${item.name.toLowerCase()} (${money(item.value)}).`, 'good');
      break;
    }
    case 'sellGear': {
      const item = hh.assets.find((x) => x.id === a.assetId)!;
      hh.wallet += item.value;
      hh.assets = hh.assets.filter((x) => x !== item);
      journal(s, `You sold the ${item.name.toLowerCase()} for ${money(item.value)}.`, 'info');
      break;
    }
    case 'floodInsurance':
      hh.floodInsurance = a.on;
      journal(s, a.on ? 'You bought flood insurance for the house.' : 'You dropped the flood insurance.', 'info');
      break;
    case 'buildGarage': {
      hh.wallet -= GARAGE_BUILD.cost;
      home!.garage = garageOf(home) + 1;
      home!.value += GARAGE_BUILD.valueGain;
      journal(s, `You added a garage space (${home!.garage} now).`, 'info');
      break;
    }
    case 'renovate': {
      hh.wallet -= renovationCost(s, hh);
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
    case 'moveCity': {
      hh.wallet -= relocationCost(s, hh);
      const note = relocate(s, hh, a.city);
      s.plan = sanitizePlan(s, s.plan);
      journal(s, `You moved to ${cityName(a.city)}, ${CITIES[a.city].state}.${note}`, 'major');
      break;
    }
  }
}

/** What it costs to move a household across the country. */
export const relocationCost = (s: GameState, hh: Household) => RELOCATION.base + RELOCATION.perPerson * membersOf(s, hh.id).length;

/**
 * Move a whole household to another city: any home is sold (you rent at first), working
 * adults leave their jobs except `keepJob` (who transfers), and kids change schools.
 * Pets, cars and savings come along. Returns a short note for the journal.
 */
export function relocate(s: GameState, hh: Household, city: CityId, keepJob?: Person): string {
  const notes: string[] = [];
  const home = homeOf(hh);
  if (home) {
    const proceeds = Math.round(home.value * (1 - SELL_COSTS) - home.mortgage);
    hh.wallet += proceeds;
    hh.assets = hh.assets.filter((x) => x !== home);
    notes.push(`The house sold for ${money(proceeds)} after fees and the mortgage`);
  }
  const people = membersOf(s, hh.id);
  hh.rentTier = people.length > 4 ? 'house' : people.length > 2 ? 'apartment' : 'small';
  hh.city = city;
  hh.floodInsurance = undefined;
  let jobs = 0;
  for (const p of people) {
    if (p === keepJob || ageOf(p, s.year) < 16 || p.retired) continue;
    if (p.jobId || p.partJobId) jobs++;
    p.jobId = undefined;
    p.partJobId = undefined;
    p.jobYears = 0;
    if (ageOf(p, s.year) < 18) {
      stat(p, 'happiness', -5);
      p.flags.moved = (p.flags.moved ?? 0) + 1;
    }
  }
  for (const p of people) {
    if (ageOf(p, s.year) >= 16) continue;
    stat(p, 'happiness', -5);
    p.flags.moved = (p.flags.moved ?? 0) + 1;
  }
  if (jobs) notes.push(jobs === 1 ? 'One job was left behind; time to look for work' : `${jobs} jobs were left behind; time to look for work`);
  const me = active(s);
  if (me.householdId === hh.id) {
    me.flags.moved_year = s.year;
    me.flags.cities_lived = (me.flags.cities_lived ?? 1) + 1;
  }
  return notes.length ? ` ${notes.join('. ')}.` : '';
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

/** How much of `amount` still fits in a child's college fund (the fund tops out at the cap). */
export const fundRoom = (kid: Person, amount: number) => Math.max(0, Math.min(amount, COLLEGE_FUND_CAP - kid.fund));
