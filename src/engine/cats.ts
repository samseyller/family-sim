/**
 * Pet cats. Like dogs they belong to a household and follow their owner, cost money every
 * year, lift everyone's mood, and age kitten → adult → senior. Unlike dogs they need no walks:
 * playtime and a cat tree keep them close, and they bond on their own terms (aloof cats drift
 * slowly and warm slowly). They live long lives, and sometimes a stray picks you.
 */
import {
  CAT_BREEDS, CAT_JOY, CAT_NAMES, CAT_SENIOR_VET_EXTRA, CAT_SHELTER_FEE, CAT_TREE_COST, CAT_YEARLY, MAX_CATS, SMALL_RENTAL_CATS, type CatBreed,
} from '../content/cats';
import { makeRng, type Rng } from './rng';
import { unlockedTabs } from './tutorial';
import type { Cat, GameState, Household } from './types';
import { active, ageOf, clamp, flag, journal, membersOf, money, newId, stat } from './util';

export const catsOf = (hh: Household) => (hh.cats ?? []).filter((c) => c.deathYear === undefined);
export const catAge = (c: Cat, year: number) => year - c.birthYear;
export const catBreedOf = (c: Cat) => CAT_BREEDS[c.breed];

export type CatStage = 'kitten' | 'adult' | 'senior';
/** Kitten for the first year; senior for the last ~30% of a typical life. */
export function catStage(c: Cat, year: number): CatStage {
  const a = catAge(c, year);
  if (a < 1) return 'kitten';
  return a >= Math.round(catBreedOf(c).lifespan * 0.7) ? 'senior' : 'adult';
}

/** What a cat costs per year. */
export const catYearlyCost = (c: Cat, year: number) =>
  Math.round((catBreedOf(c).longHair ? CAT_YEARLY.long : CAT_YEARLY.short) * (catStage(c, year) === 'senior' ? 1 + CAT_SENIOR_VET_EXTRA : 1));

/** How many cats this home allows. */
export const maxCats = (hh: Household) => (!hh.assets.some((a) => a.kind === 'house') && (hh.rentTier ?? 'apartment') === 'small' ? SMALL_RENTAL_CATS : MAX_CATS);

export const randomCatName = (rng: Rng) => rng.pick(CAT_NAMES);

export function makeCat(s: GameState, rng: Rng, breed: CatBreed, name: string, age: number, ownerId: string, how: 'breeder' | 'shelter' | 'stray' = 'breeder'): Cat {
  return {
    id: newId(s, 'c'), name: name.trim() || randomCatName(rng), breed, coat: rng.int(0, CAT_BREEDS[breed].coats.length - 1),
    birthYear: s.year - age, bond: how === 'breeder' ? 50 : 30, health: how === 'stray' ? 60 : how === 'shelter' ? 75 : 90, ownerId,
    rescued: how !== 'breeder' || undefined, stray: how === 'stray' || undefined,
  };
}

// ── Player actions ───────────────────────────────────────────────────

export type CatAction =
  | { kind: 'adoptKitten'; breed: CatBreed; name: string }
  | { kind: 'adoptShelterCat'; name: string }
  | { kind: 'rehomeCat'; catId: string }
  | { kind: 'catTree' };

export function catBlocker(s: GameState, a: CatAction): string | null {
  if (s.phase !== 'PLANNING') return 'Decided while planning.';
  const me = active(s);
  if (ageOf(me, s.year) < 18) return 'Ask your parents first.';
  if (!unlockedTabs(s).includes('family')) return 'Opens with the Family tab.';
  const hh = s.households[me.householdId];
  if (a.kind === 'rehomeCat') return catsOf(hh).some((c) => c.id === a.catId) ? null : 'No such cat.';
  if (a.kind === 'catTree') {
    if (hh.catTree) return 'You already have one.';
    if (!catsOf(hh).length) return 'Get a cat first.';
    return hh.wallet < CAT_TREE_COST ? `Needs ${money(CAT_TREE_COST)}.` : null;
  }
  if (catsOf(hh).length >= maxCats(hh)) return maxCats(hh) === SMALL_RENTAL_CATS ? 'A small apartment allows only two cats.' : `${MAX_CATS} cats is plenty.`;
  const price = a.kind === 'adoptKitten' ? CAT_BREEDS[a.breed].price : CAT_SHELTER_FEE;
  return hh.wallet < price ? `Needs ${money(price)}.` : null;
}

/** Bring a cat into the active household. */
export function adoptCatInto(s: GameState, rng: Rng, breed: CatBreed, name: string, age: number, how: 'breeder' | 'shelter' | 'stray'): Cat {
  const me = active(s);
  const hh = s.households[me.householdId];
  const cat = makeCat(s, rng, breed, name, age, me.id, how);
  hh.cats = [...(hh.cats ?? []), cat];
  for (const m of membersOf(s, hh.id)) stat(m, 'happiness', 5);
  flag(me, how === 'stray' ? 'stray_cat' : how === 'shelter' ? 'rescued_cat' : 'adopted_cat');
  const from = how === 'stray' ? ' (they picked you)' : how === 'shelter' ? ' from the shelter' : '';
  journal(s, `${cat.name} the ${CAT_BREEDS[breed].label.toLowerCase()} joined the family${from}!`, 'major');
  return cat;
}

export function catAction(state: GameState, a: CatAction): GameState {
  if (catBlocker(state, a)) return state;
  const s: GameState = structuredClone(state);
  const rng = makeRng(s.rngState);
  const me = active(s);
  const hh = s.households[me.householdId];
  if (a.kind === 'adoptKitten') {
    hh.wallet -= CAT_BREEDS[a.breed].price;
    adoptCatInto(s, rng, a.breed, a.name, 0, 'breeder');
  } else if (a.kind === 'adoptShelterCat') {
    hh.wallet -= CAT_SHELTER_FEE;
    // Shelters are mostly domestic shorthairs, with the odd purebred.
    const breed = rng.chance(0.7) ? 'tabby' : rng.pick(Object.keys(CAT_BREEDS) as CatBreed[]);
    adoptCatInto(s, rng, breed, a.name, rng.int(1, 8), 'shelter');
  } else if (a.kind === 'catTree') {
    hh.wallet -= CAT_TREE_COST;
    hh.catTree = true;
    for (const c of catsOf(hh)) c.bond = clamp(c.bond + 5, 0, 100);
    journal(s, 'You bought a cat tree. It was ignored for a day, then claimed forever.', 'good');
  } else {
    const cat = (hh.cats ?? []).find((c) => c.id === a.catId)!;
    hh.cats = (hh.cats ?? []).filter((c) => c !== cat);
    for (const m of membersOf(s, hh.id)) stat(m, 'happiness', -5);
    journal(s, `${cat.name} went to live with a new family.`, 'info');
  }
  s.rngState = rng.state();
  return s;
}

// ── Each year ────────────────────────────────────────────────────────

/** Bond drift without playtime: aloof cats barely notice; affectionate ones feel it. */
const DRIFT = { aloof: -1, playful: -3, affectionate: -4 } as const;

/** Yearly effects for every household's cats (mood, bond, health, aging, passing away). */
export function catYear(s: GameState, rng: Rng) {
  const me = active(s);
  for (const hh of Object.values(s.households)) {
    const cats = catsOf(hh);
    if (!cats.length) continue;
    const mine = hh.id === me.householdId;
    const people = membersOf(s, hh.id);
    for (const p of people) {
      stat(p, 'happiness', CAT_JOY * Math.min(2, cats.length));
      stat(p, 'stress', -Math.min(2, cats.length));
    }
    for (const c of cats) {
      const owner = c.ownerId ? s.people[c.ownerId] : undefined;
      if (!owner || owner.deathYear !== undefined || owner.householdId !== hh.id) c.ownerId = mine ? me.id : people[0]?.id;
      const age = catAge(c, s.year);
      const played = c.lastPlayYear === s.year;
      c.bond = clamp(c.bond + (played ? 4 : DRIFT[catBreedOf(c).temperament]) + (hh.catTree ? 1 : 0) + (mine ? 0 : 2), 0, 100);
      const stage = catStage(c, s.year);
      c.health = clamp(c.health + (stage === 'senior' ? -5 : stage === 'kitten' ? 2 : -1) + (played ? 1 : 0), 0, 100);
      if (mine && age >= 18) flag(me, 'old_cat');
      // Passing away: likelier past the breed's typical lifespan (cats often go well past it).
      const over = age - catBreedOf(c).lifespan;
      const chance = c.health <= 0 ? 1 : over < 0 ? 0 : clamp(0.15 + 0.12 * over, 0, 0.9);
      if (chance > 0 && rng.chance(chance)) {
        c.deathYear = s.year;
        for (const p of people) stat(p, 'happiness', -7);
        if (mine) journal(s, `🌈 ${c.name} passed away at ${age}, curled up in the sunny spot. The house is too quiet.`, 'bad');
      }
    }
  }
}

/** Yearly cat costs for a household (part of the budget's "Pet care"). */
export const catCosts = (s: GameState, hh: Household) => catsOf(hh).reduce((sum, c) => sum + catYearlyCost(c, s.year), 0);

/** The cat most in need of a vet (oldest, then least healthy). */
export const frailestCat = (hh: Household) => [...catsOf(hh)].sort((a, b) => a.birthYear - b.birthYear || a.health - b.health)[0];
