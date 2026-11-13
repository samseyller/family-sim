/**
 * Dating: meeting someone, past partners, and the chance of an unplanned pregnancy
 * (decided in the `unplanned_pregnancy` event: have the baby, move in together,
 * place the baby for adoption, or not continue the pregnancy).
 */
import { CAREER_BY_ID } from '../content/careers';
import { startDating } from './family';
import { makeAdultStranger } from './generate';
import type { Rng } from './rng';
import type { GameState, Person } from './types';
import { activePartnership, ageOf, alive, fullName, getBond, journal, partnerOf, stat } from './util';

/** Oldest age at which a pregnancy can happen in the game. */
export const FERTILE_UNTIL = 44;

export const isSingle = (s: GameState, p: Person) => !partnerOf(s, p.id) && !s.partnerships.some((x) => (x.a === p.id || x.b === p.id) && x.status === 'separated');

/** Everyone `me` has dated or been married to before (alive, and not the current partner). */
export function exesOf(s: GameState, me: Person): Person[] {
  const current = partnerOf(s, me.id)?.id;
  const ids = new Set<string>();
  for (const x of s.partnerships) {
    if (x.a !== me.id && x.b !== me.id) continue;
    if (x.status !== 'ended' && x.status !== 'divorced') continue;
    const other = x.a === me.id ? x.b : x.a;
    if (other !== current && s.people[other] && alive(s.people[other])) ids.add(other);
  }
  return [...ids].map((id) => s.people[id]);
}

/** How many different people `p` has dated or married. */
export const partnersEver = (s: GameState, p: Person) =>
  new Set(s.partnerships.filter((x) => x.a === p.id || x.b === p.id).map((x) => (x.a === p.id ? x.b : x.a))).size;

/** Meet a stranger and start dating them. */
export function meetSomeone(s: GameState, rng: Rng, me: Person, how: string): Person {
  const sp = makeAdultStranger(s, rng, me);
  startDating(s, me, sp);
  stat(me, 'happiness', 6);
  journal(s, `You started dating ${fullName(sp)} (${how}).`, 'major');
  return sp;
}

export const jobBlurb = (p: Person) => (p.jobId ? `, a ${CAREER_BY_ID[p.jobId].name.toLowerCase()}` : '');

/** Who would carry a pregnancy between these two, if anyone. */
export function carrierOf(s: GameState, a: Person, b: Person): Person | undefined {
  if (a.sex === b.sex) return undefined;
  const carrier = a.sex === 'F' ? a : b;
  const age = ageOf(carrier, s.year);
  if (age < 18 || age > FERTILE_UNTIL) return undefined;
  return carrier;
}

/** A pregnancy is possible now (right pair, nothing already on the way or being decided). */
export function canConceive(s: GameState, me: Person, partner: Person) {
  if (!carrierOf(s, me, partner)) return false;
  if (s.households[me.householdId].pendingBirth || s.households[partner.householdId].pendingBirth) return false;
  return !s.scheduled.some((x) => x.eventId === 'unplanned_pregnancy') && !s.pending.some((x) => x.eventId === 'unplanned_pregnancy');
}

/** Chance per night together, before luck. Married couples are assumed to be less careful. */
export const pregnancyChance = (s: GameState, me: Person) => (activePartnership(s, me.id)?.status === 'married' ? 0.15 : 0.08);
/** Chance per try when a married couple is trying for a baby on purpose. */
export const TRY_FOR_BABY_CHANCE = 0.45;

/**
 * A pregnancy happened: the partner decides now whether they'd like to keep it (shown to
 * the player), and the decision comes up when the year is lived.
 */
export function conceive(s: GameState, rng: Rng, me: Person, partner: Person) {
  const married = activePartnership(s, me.id)?.status === 'married';
  const close = getBond(s, me.id, partner.id).affinity;
  partner.flags.wants_baby = rng.chance(married ? 0.8 : close >= 60 ? 0.55 : 0.35) ? 1 : 0;
  s.scheduled.push({ dueYear: s.year, eventId: 'unplanned_pregnancy', subjectId: partner.id });
}
