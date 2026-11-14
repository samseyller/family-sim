/**
 * Friends: named people you meet (at work, school, clubs, the dog park...) who live in a
 * specific city. Friendships fade without contact; at affinity 0 or below a friend becomes
 * distant and may turn down invitations. Friends sometimes move away (rarely your best
 * friend), which limits what you can do together to calls, games online, or a planned trip.
 */
import { connectionOf } from './relationships';
import { makeHousehold, makePerson, giveEducation, pickCareer, assignJob } from './generate';
import { cityName, cityOf, isNear, otherCity } from './location';
import { LAST_NAMES } from '../content/names';
import { unlockedTabs } from './tutorial';
import type { CityId } from '../content/cities';
import type { Rng } from './rng';
import type { Friendship, GameState, Person } from './types';
import { active, adjustBond, ageOf, alive, clamp, fullName, getBond, journal, stat } from './util';

export const MAX_FRIENDS = 15;
/** Best friend: the closest friend, if at least this close. */
export const BEST_FRIEND_AT = 50;
/** Yearly fade without any contact. */
export const FRIEND_FADE = 10;

export const friendshipsOf = (s: GameState, me: Person = active(s)) =>
  (s.friends ?? []).filter((f) => f.of === me.id && s.people[f.id] && alive(s.people[f.id]));
export const friendsOf = (s: GameState, me: Person = active(s)) => friendshipsOf(s, me).map((f) => s.people[f.id]);
export const friendship = (s: GameState, me: Person, id: string) => (s.friends ?? []).find((f) => f.of === me.id && f.id === id);
export const isFriend = (s: GameState, me: Person, id: string) => !!friendship(s, me, id);
export const closeness = (s: GameState, me: Person, f: Person) => getBond(s, me.id, f.id).affinity;
export const isDistant = (s: GameState, me: Person, f: Person) => closeness(s, me, f) <= 0;

export function bestFriend(s: GameState, me: Person = active(s)): Person | undefined {
  const best = [...friendsOf(s, me)].sort((a, b) => closeness(s, me, b) - closeness(s, me, a))[0];
  return best && closeness(s, me, best) >= BEST_FRIEND_AT ? best : undefined;
}

/** "Best friend", "Close friend", "Friend", "Acquaintance" or "Drifted apart". */
export function friendLabel(s: GameState, me: Person, f: Person) {
  const a = closeness(s, me, f);
  if (a <= 0) return 'Drifted apart';
  if (bestFriend(s, me)?.id === f.id) return 'Best friend';
  return a >= 40 ? 'Close friend' : a >= 15 ? 'Friend' : 'Acquaintance';
}

export const canMakeFriends = (s: GameState, me: Person = active(s)) => friendsOf(s, me).length < MAX_FRIENDS;

/** A new person of about `me`'s age who becomes `me`'s friend. Lives in `city` (default: `me`'s city). */
export function makeFriend(s: GameState, rng: Rng, me: Person, how: string, city?: CityId): Person | undefined {
  if (!canMakeFriends(s, me)) return undefined;
  const myAge = ageOf(me, s.year);
  const minor = myAge < 18;
  const age = minor ? clamp(myAge + rng.int(-1, 1), 5, 17) : clamp(myAge + rng.int(-5, 5), 18, 95);
  const hh = makeHousehold(s, rng.int(2000, 25000), city ?? cityOf(s, me));
  const p = makePerson(s, rng, { birthYear: s.year - age, lastName: rng.pick(LAST_NAMES), householdId: hh.id, generation: me.generation });
  hh.headId = p.id;
  if (!minor) {
    p.flags.came_of_age = 1;
    giveEducation(rng, p);
    const job = age < 66 ? pickCareer(rng, p) : undefined;
    if (job) assignJob(p, job);
    else if (age >= 66) p.retired = true;
  }
  s.friends = [...(s.friends ?? []), { id: p.id, of: me.id, since: s.year, lastSeen: s.year, how }];
  adjustBond(s, me.id, p.id, rng.int(22, 38), rng.int(12, 28));
  journal(s, `You became friends with ${fullName(p)} (${how}).`, 'good');
  return p;
}

/** Try to make a friend; returns the new friend or undefined. */
export function maybeMeetFriend(s: GameState, rng: Rng, me: Person, chance: number, how: string) {
  return canMakeFriends(s, me) && rng.chance(chance) ? makeFriend(s, rng, me, how) : undefined;
}

/** Record that you spent time with a friend this year. */
export function sawFriend(s: GameState, me: Person, f: Person) {
  const fs = friendship(s, me, f.id);
  if (fs) fs.lastSeen = s.year;
}

/** Would this friend come along? Distant friends often say no; close ones almost always say yes. */
/** How often someone who needs space declines an invitation despite a good bond. */
export const SPACE_DECLINE = 0.12;

export function willJoin(s: GameState, rng: Rng, me: Person, f: Person) {
  const b = getBond(s, me.id, f.id);
  // Someone who needs space sometimes says no, even to someone they like.
  if (b.affinity > 0) return connectionOf(f) !== 'space' || !rng.chance(SPACE_DECLINE);
  return rng.chance(clamp(0.3 + b.trust / 250 + b.affinity / 200, 0.1, 0.6));
}

/** Follow the friendship up after something you did together (reconnecting a distant friend). */
export function afterTogether(s: GameState, me: Person, f: Person) {
  sawFriend(s, me, f);
  const fs = friendship(s, me, f.id);
  if (fs?.distant && closeness(s, me, f) > 0) {
    fs.distant = false;
    me.flags.reconnected = (me.flags.reconnected ?? 0) + 1;
    journal(s, `You and ${f.firstName} reconnected. It's like no time has passed.`, 'good');
  }
}

/** Yearly: friendships fade without contact; some become distant; some friends move away. */
export function friendsYear(s: GameState, rng: Rng) {
  const me = active(s);
  if (!alive(me)) return;
  const best = bestFriend(s, me);
  const canSocialize = unlockedTabs(s).includes('activities');
  for (const fs of friendshipsOf(s, me)) {
    const f = s.people[fs.id];
    // No fading until you can do things with friends (the guided life opens Activities at 30).
    if (fs.lastSeen < s.year && canSocialize) adjustBond(s, me.id, f.id, -FRIEND_FADE, -3);
    const a = closeness(s, me, f);
    if (a <= 0 && !fs.distant) {
      fs.distant = true;
      journal(s, `You and ${f.firstName} have drifted apart.`, 'info');
    } else if (a > 0 && fs.distant) {
      fs.distant = false;
    }
    // Moving away: rare for your best friend, likelier for friends you've lost touch with.
    const hh = s.households[f.householdId];
    if (!hh) continue;
    const isBest = best?.id === f.id;
    const away = !isNear(s, f, me);
    const chance = isBest ? 0.02 : fs.distant ? 0.08 : 0.05;
    if (rng.chance(chance)) {
      const to = away && rng.chance(0.25) ? cityOf(s, me) : otherCity(rng, cityOf(s, f));
      hh.city = to;
      if (to === cityOf(s, me)) journal(s, `${f.firstName} moved to ${cityName(to)}, right in your city!`, 'good');
      else if (!away) {
        journal(s, `${f.firstName} moved away to ${cityName(to)}.`, isBest ? 'bad' : 'info');
        stat(me, 'happiness', isBest ? -6 : -2);
      }
    }
  }
}

/** The friendship record list without a person (when someone dies, the record stays for history). */
export const friendSince = (fs: Friendship, year: number) => year - fs.since;
