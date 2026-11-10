/**
 * Where a new game starts: the player's home is in a random city; parents who live on
 * their own are usually nearby but sometimes across the country; and the player starts
 * with a couple of friends (classmates for a child start).
 */
import { makeFriend } from './friends';
import { otherCity, randomCity } from './location';
import { makeRng } from './rng';
import type { GameState } from './types';
import { active, ageOf, bondKey, membersOf, parentsOf } from './util';

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
