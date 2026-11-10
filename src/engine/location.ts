/**
 * Where people live. Every household is in one of the 15 cities; that sets home prices,
 * rent, living costs, pay, and how hard it is to get around without a car. Two people
 * are "near" when their households are in the same city.
 */
import { CITIES, CITY_IDS, type CityId } from '../content/cities';
import { HOMES, RENTALS, type HomeTier, type RentTier } from '../content/finance';
import type { Rng } from './rng';
import type { GameState, Household, Person } from './types';
import { active } from './util';

/** Stable fallback for a household without a city (older saves before migration). */
const hashCity = (key: string) => CITY_IDS[[...key].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % CITY_IDS.length];

export const cityOfHousehold = (hh: Household | undefined): CityId => (hh?.city ?? hashCity(hh?.id ?? 'x'));
export const cityOf = (s: GameState, p: Person): CityId => cityOfHousehold(s.households[p.householdId]);
export const cityDef = (id: CityId) => CITIES[id];
export const cityName = (id: CityId) => CITIES[id].name;
export const myCity = (s: GameState) => cityOf(s, active(s));

/** Same city as the player? */
export const isNear = (s: GameState, p: Person, other: Person = active(s)) => cityOf(s, p) === cityOf(s, other);

/** A different city than `not` (or any city). */
export function otherCity(rng: Rng, not?: CityId): CityId {
  const pool = CITY_IDS.filter((c) => c !== not);
  return rng.pick(pool);
}

export const randomCity = (rng: Rng): CityId => rng.pick(CITY_IDS);

/** Scale a base price by a city's housing index (rounded to $1,000). The mansion is priced the same everywhere. */
export const housingPrice = (base: number, city: CityId) => Math.round((base * CITIES[city].housing) / 1000) * 1000;

/** A home's price in a city (the mansion costs the same everywhere). */
export const homePriceIn = (tier: HomeTier, city: CityId) => (tier === 'mansion' ? HOMES.mansion.price : housingPrice(HOMES[tier].price, city));
/** Yearly upkeep of a home in a city. */
export const homeUpkeepIn = (tier: HomeTier, city: CityId) => (tier === 'mansion' ? HOMES.mansion.upkeep : Math.round(HOMES[tier].upkeep * CITIES[city].living));
/** Yearly rent in a city. */
export const rentIn = (tier: RentTier, city: CityId) => Math.round((RENTALS[tier].rent * CITIES[city].housing) / 100) * 100;
