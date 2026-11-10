/**
 * Where a new game starts: the player's home is in a random city; parents who live on
 * their own are usually nearby but sometimes across the country; and the player starts
 * with a couple of friends (classmates for a child start).
 */
import { makeFriend } from './friends';
import { marry } from './family';
import { assignJob, giveEducation, inheritLooks, makeAdultStranger, makeHousehold, makePerson, pickCareer } from './generate';
import { FEMALE_NAMES, MALE_NAMES } from '../content/names';
import { cityOfHousehold, otherCity, randomCity } from './location';
import { makeRng, type Rng } from './rng';
import type { GameState } from './types';
import { active, adjustBond, ageOf, bondKey, membersOf, parentsOf } from './util';

/** How many brothers and sisters: only child 25%, one 40%, two 25%, three 10%. */
export function siblingCount(r: number) {
  return r < 0.25 ? 0 : r < 0.65 ? 1 : r < 0.9 ? 2 : 3;
}

/**
 * Give the player brothers and sisters: children of the same parents, a few years apart.
 * Grown siblings have their own homes (mostly in the same city) and jobs, and some are
 * married; younger ones live at home. Estates split between all of them.
 */
export function addSiblings(s: GameState, rng: Rng) {
  const me = active(s);
  const parents = parentsOf(s, me);
  if (!parents.length) return;
  const mom = parents.find((p) => p.sex === 'F') ?? parents[0];
  const parentHome = s.households[mom.householdId] ?? s.households[me.householdId];
  const n = siblingCount(rng.next());
  const taken = new Set([me.birthYear]);
  for (let i = 0; i < n; i++) {
    let birthYear: number | undefined;
    for (let t = 0; t < 30 && birthYear === undefined; t++) {
      const y = me.birthYear + rng.pick([-8, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 8]);
      if (!taken.has(y) && y <= s.year && y - mom.birthYear >= 19 && y - mom.birthYear <= 43) birthYear = y;
    }
    if (birthYear === undefined) continue;
    taken.add(birthYear);
    const adult = s.year - birthYear >= 18;
    const hh = adult ? makeHousehold(s, rng.int(3000, 40000), rng.chance(0.7) ? cityOfHousehold(parentHome) : otherCity(rng, cityOfHousehold(parentHome))) : parentHome;
    const sib = makePerson(s, rng, {
      birthYear,
      lastName: me.lastName,
      householdId: hh.id,
      generation: me.generation,
      parents: parents.map((p) => p.id) as [string, string] | [string],
      looks: inheritLooks(rng, parents[0].looks, (parents[1] ?? parents[0]).looks),
    });
    if (sib.firstName === me.firstName) sib.firstName = rng.pick(sib.sex === 'F' ? FEMALE_NAMES : MALE_NAMES);
    adjustBond(s, me.id, sib.id, rng.int(15, 45), rng.int(10, 35));
    for (const p of parents) adjustBond(s, p.id, sib.id, rng.int(30, 55), rng.int(25, 50));
    if (adult) {
      hh.headId = sib.id;
      sib.flags.came_of_age = 1;
      giveEducation(rng, sib);
      const job = pickCareer(rng, sib);
      if (job) assignJob(sib, job);
      if (s.year - birthYear >= 24 && rng.chance(0.5)) marry(s, sib, makeAdultStranger(s, rng, sib));
    }
  }
}

export function placeStart(s: GameState, seed: number) {
  // A separate stream so the rest of the start (people, jobs) is unchanged by location.
  const rng = makeRng((seed ^ 0x0c17e5) >>> 0);
  const me = active(s);
  // The guided first life always starts somewhere with average costs.
  const home = s.tutorial ? 'philadelphia' : randomCity(rng);
  const parentHomes = new Set(parentsOf(s, me).map((p) => p.householdId).filter((h) => h !== me.householdId));
  for (const hh of Object.values(s.households)) {
    hh.city = parentHomes.has(hh.id) && rng.chance(0.3) ? otherCity(rng, home) : home;
  }
  // Record who runs each home from the start, so a parent moving in later doesn't take over.
  const myHome = s.households[me.householdId];
  const elders = membersOf(s, myHome.id).filter((p) => parentsOf(s, me).includes(p)).sort((a, b) => a.birthYear - b.birthYear);
  myHome.headId = ageOf(me, s.year) >= 18 && !elders.length ? me.id : (elders[0]?.id ?? me.id);
  // Brothers and sisters (a separate random stream so the rest of the start is unchanged).
  addSiblings(s, makeRng((seed ^ 0x51b5) >>> 0));
  const age = ageOf(me, s.year);
  const how = age < 18 ? 'from school' : age < 23 ? 'from high school' : 'old friends';
  const count = age < 6 ? 0 : 2;
  for (let i = 0; i < count; i++) makeFriend(s, rng, me, how);
  // Old friends are already close; most still live nearby.
  for (const fs of s.friends ?? []) {
    const b = s.bonds[bondKey(me.id, fs.id)];
    if (b) b.affinity = Math.max(b.affinity, 45 - (s.friends!.indexOf(fs) * 10));
    if (age >= 23 && rng.chance(0.25)) s.households[s.people[fs.id].householdId].city = otherCity(rng, home);
  }
  // Starting friends shouldn't fill the opening journal.
  s.journal = s.journal.filter((j) => !j.text.startsWith('You became friends with'));
}
