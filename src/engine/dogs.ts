/**
 * Pet dogs. Dogs belong to a household and follow their owner when the owner moves.
 * Every year they cost money (food, vet, more for seniors), lift everyone's mood at
 * home, grow closer when walked and drift when ignored, age through puppy → adult →
 * senior, and eventually pass away.
 */
import {
  BREEDS, DOG_JOY, DOG_NAMES, DOG_YEARLY, MAX_DOGS, SENIOR_VET_EXTRA, SHELTER_FEE, SMALL_RENTAL_DOGS, type DogBreed,
} from '../content/dogs';
import { makeRng, type Rng } from './rng';
import { unlockedTabs } from './tutorial';
import type { Dog, GameState, Household } from './types';
import { active, ageOf, clamp, flag, journal, membersOf, money, newId, stat } from './util';
import { charge, hasCash } from './money';

export const dogsOf = (hh: Household) => (hh.dogs ?? []).filter((d) => d.deathYear === undefined);
export const dogAge = (d: Dog, year: number) => year - d.birthYear;
export const breedOf = (d: Dog) => BREEDS[d.breed];

export type DogStage = 'puppy' | 'adult' | 'senior';
/** Puppy for the first two years; senior for the last ~30% of a typical life. */
export function dogStage(d: Dog, year: number): DogStage {
  const a = dogAge(d, year);
  if (a < 2) return 'puppy';
  return a >= Math.round(breedOf(d).lifespan * 0.7) ? 'senior' : 'adult';
}

/** What a dog costs per year. */
export const dogYearlyCost = (d: Dog, year: number) =>
  Math.round(DOG_YEARLY[breedOf(d).size] * (dogStage(d, year) === 'senior' ? 1 + SENIOR_VET_EXTRA : 1));

/** How many dogs this home allows. */
export const maxDogs = (hh: Household) => (!hh.assets.some((a) => a.kind === 'house') && (hh.rentTier ?? 'apartment') === 'small' ? SMALL_RENTAL_DOGS : MAX_DOGS);

export const randomDogName = (rng: Rng) => rng.pick(DOG_NAMES);

/** Make a dog (not yet in any household). */
export function makeDog(s: GameState, rng: Rng, breed: DogBreed, name: string, age: number, ownerId: string, rescued = false): Dog {
  return {
    id: newId(s, 'd'), name: name.trim() || randomDogName(rng), breed, coat: rng.int(0, BREEDS[breed].coats.length - 1),
    birthYear: s.year - age, bond: rescued ? 35 : 55, health: rescued ? 70 : 90, ownerId, rescued: rescued || undefined,
  };
}

// ── Player actions ───────────────────────────────────────────────────

export type DogAction =
  | { kind: 'adoptPuppy'; breed: DogBreed; name: string }
  | { kind: 'adoptShelter'; name: string }
  | { kind: 'rehome'; dogId: string };

export function dogBlocker(s: GameState, a: DogAction): string | null {
  if (s.phase !== 'PLANNING') return 'Decided while planning.';
  const me = active(s);
  if (ageOf(me, s.year) < 18) return 'Ask your parents first.';
  if (!unlockedTabs(s).includes('family')) return 'Opens with the Family tab.';
  const hh = s.households[me.householdId];
  if (a.kind === 'rehome') return dogsOf(hh).some((d) => d.id === a.dogId) ? null : 'No such dog.';
  if (dogsOf(hh).length >= maxDogs(hh)) return maxDogs(hh) === 1 ? 'A small apartment allows only one dog.' : `${MAX_DOGS} dogs is a full pack.`;
  const price = a.kind === 'adoptPuppy' ? BREEDS[a.breed].price : SHELTER_FEE;
  return !hasCash(hh, price) ? `Needs ${money(price)}.` : null;
}

/** Adopt a dog into the active household. */
export function adoptInto(s: GameState, rng: Rng, breed: DogBreed, name: string, age: number, rescued: boolean): Dog {
  const me = active(s);
  const hh = s.households[me.householdId];
  const dog = makeDog(s, rng, breed, name, age, me.id, rescued);
  hh.dogs = [...(hh.dogs ?? []), dog];
  for (const m of membersOf(s, hh.id)) stat(m, 'happiness', 6);
  flag(me, rescued ? 'rescued_dog' : 'adopted_dog');
  journal(s, `${dog.name} the ${BREEDS[breed].label.toLowerCase()} joined the family${rescued ? ' from the shelter' : ''}!`, 'major');
  return dog;
}

export function dogAction(state: GameState, a: DogAction): GameState {
  if (dogBlocker(state, a)) return state;
  const s: GameState = structuredClone(state);
  const rng = makeRng(s.rngState);
  const me = active(s);
  const hh = s.households[me.householdId];
  if (a.kind === 'adoptPuppy') {
    charge(hh, BREEDS[a.breed].price);
    adoptInto(s, rng, a.breed, a.name, 0, false);
  } else if (a.kind === 'adoptShelter') {
    charge(hh, SHELTER_FEE);
    const breed = rng.pick(Object.keys(BREEDS) as DogBreed[]);
    adoptInto(s, rng, breed, a.name, rng.int(2, 6), true);
  } else {
    const dog = (hh.dogs ?? []).find((d) => d.id === a.dogId)!;
    hh.dogs = (hh.dogs ?? []).filter((d) => d !== dog);
    for (const m of membersOf(s, hh.id)) stat(m, 'happiness', -6);
    journal(s, `${dog.name} went to live with a new family.`, 'info');
  }
  s.rngState = rng.state();
  return s;
}

// ── Each year ────────────────────────────────────────────────────────

/** Bond drift without walks, by how much exercise the breed needs. */
const DRIFT = { low: -2, medium: -5, high: -8 } as const;

/** Yearly effects for every household's dogs (mood, bond, health, aging, passing away). */
export function dogYear(s: GameState, rng: Rng) {
  const me = active(s);
  for (const hh of Object.values(s.households)) {
    const dogs = dogsOf(hh);
    if (!dogs.length) continue;
    const mine = hh.id === me.householdId;
    const people = membersOf(s, hh.id);
    for (const p of people) {
      stat(p, 'happiness', DOG_JOY * Math.min(2, dogs.length));
      stat(p, 'stress', -Math.min(2, dogs.length));
    }
    for (const d of dogs) {
      // If the owner died or moved away, the dog belongs to whoever is still home (you first).
      const owner = d.ownerId ? s.people[d.ownerId] : undefined;
      if (!owner || owner.deathYear !== undefined || owner.householdId !== hh.id) d.ownerId = mine ? me.id : people[0]?.id;
      const age = dogAge(d, s.year);
      const walked = d.lastWalkYear === s.year;
      d.bond = clamp(d.bond + (walked ? 4 : DRIFT[breedOf(d).energy]) + (mine ? 0 : 3), 0, 100);
      const stage = dogStage(d, s.year);
      d.health = clamp(d.health + (stage === 'senior' ? -7 : stage === 'puppy' ? 2 : -1) + (walked ? 2 : 0), 0, 100);
      if (mine && age >= 14) flag(me, 'old_dog');
      // Passing away: likelier past the breed's typical lifespan, or when very unwell.
      const over = age - breedOf(d).lifespan;
      const chance = d.health <= 0 ? 1 : over < -1 ? 0 : clamp(0.2 + 0.2 * (over + 1), 0, 0.95);
      if (chance > 0 && rng.chance(chance)) {
        d.deathYear = s.year;
        for (const p of people) stat(p, 'happiness', -8);
        if (mine) journal(s, `🌈 ${d.name} crossed the rainbow bridge at ${age}. The house is too quiet.`, 'bad');
      }
    }
  }
}

/** Yearly pet costs for a household (budget line "Pet care"). */
export const petCosts = (s: GameState, hh: Household) => dogsOf(hh).reduce((sum, d) => sum + dogYearlyCost(d, s.year), 0);

/** The dog most in need of a vet (oldest, then least healthy). */
export const frailestDog = (hh: Household) => [...dogsOf(hh)].sort((a, b) => a.birthYear - b.birthYear || a.health - b.health)[0];
