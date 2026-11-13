/** What every activity file shares: the activity types, categories, who can come along, and small helpers. */
import type { Rng } from './rng';
import type { ActivityResult, GameState, Hobby, Person, StatKey } from './types';
import { HOBBY_BY_ID } from '../content/actions';
import { CAREER_BY_ID } from '../content/careers';
import type { UpgradeId } from '../content/finance';
import { adjustBond, ageOf, alive, childrenOf, flag, money, parentsOf, stat } from './util';
import { dogsOf } from './dogs';
import { catsOf } from './cats';
import { isNear } from './location';
import { afterTogether, willJoin } from './friends';
import { dateWhileAttached, isSingle, jobBlurb, meetSomeone } from './romance';

/** Living relatives who don't share the player's home. */
export function relativesOutside(s: GameState, me: Person): Person[] {
  const ids = new Set<string>();
  const add = (p?: Person) => { if (p && alive(p) && p.id !== me.id && p.householdId !== me.householdId) ids.add(p.id); };
  const parents = parentsOf(s, me);
  parents.forEach(add);
  for (const par of parents) {
    childrenOf(s, par.id).forEach(add); // siblings
    parentsOf(s, par).forEach(add); // grandparents
  }
  for (const c of childrenOf(s, me.id)) {
    add(c);
    childrenOf(s, c.id).forEach(add); // grandchildren
  }
  return [...ids].map((id) => s.people[id]);
}

/** "near" when the person lives in the player's city, "far" otherwise. */
export function distanceOf(s: GameState, p: Person): 'near' | 'far' {
  return isNear(s, p) ? 'near' : 'far';
}

// ── Catalog ──────────────────────────────────────────────────────────

export type Category = 'home' | 'sports' | 'hobby' | 'pets' | 'health' | 'learning' | 'leisure' | 'visits' | 'romance' | 'social' | 'risk' | 'vices' | 'kid';
export const CATEGORIES: Record<Category, { label: string; icon: string }> = {
  home: { label: 'At home', icon: '🏡' },
  sports: { label: 'Sports', icon: '🏅' },
  hobby: { label: 'Hobbies & side gigs', icon: '🧰' },
  pets: { label: 'Pets', icon: '🐾' },
  health: { label: 'Health', icon: '🩺' },
  learning: { label: 'Learning', icon: '📚' },
  leisure: { label: 'Fun & travel', icon: '🌴' },
  visits: { label: 'Family visits', icon: '🚗' },
  romance: { label: 'Love & dating', icon: '💘' },
  social: { label: 'Social', icon: '🎉' },
  risk: { label: 'Money & luck', icon: '🎲' },
  vices: { label: 'Vices', icon: '⚠️' },
  kid: { label: 'Kid stuff', icon: '🧸' },
};

export type Who = 'solo' | 'household' | 'partner' | 'kids' | 'relative' | 'guests' | 'ex' | 'friends';

export interface ActivityCtx {
  s: GameState;
  rng: Rng;
  me: Person;
  people: Person[];
}

export interface ActivityDef {
  id: string;
  category: Category;
  icon: string;
  label: string;
  desc: string;
  who: Who;
  /** Participants allowed (for non-solo activities). Defaults: min 1, max unlimited. */
  min?: number;
  max?: number;
  /** Actor age range. Defaults to adults (18+). */
  ages?: [number, number];
  perYear?: number;
  energy: (s: GameState, people: Person[]) => number;
  cost: (s: GameState, people: Person[]) => number;
  /** A label that depends on the situation (e.g. "Do Sam's chores"). */
  labelFor?: (s: GameState, me: Person) => string;
  /** Secret activities stay out of the list until this is false. */
  hidden?: (s: GameState, me: Person) => boolean;
  /** Allowed, but shown with a caution (orange) so you know what you're doing. */
  warning?: (s: GameState, me: Person) => string | null;
  /** Extra reason the activity can't happen right now. */
  requires?: (s: GameState, me: Person) => string | null;
  /** Extra filter on who can come. */
  eligible?: (s: GameState, p: Person) => boolean;
  /** Friends only: who can join, by where they live ("near" = your city, "far" = elsewhere). Default any. */
  where?: 'near' | 'far' | 'any';
  /** Kids must ask: parents say yes based on trust; money only spent if they do. */
  kidAsk?: boolean;
  run: (c: ActivityCtx) => { text: string; tone: ActivityResult['tone'] };
}

export const flat = (n: number) => () => n;
export const each = (base: number, per: number) => (_s: GameState, ppl: Person[]) => base + per * ppl.length;
export const names = (ppl: Person[]) => (ppl.length <= 2 ? ppl.map((p) => p.firstName).join(' and ') : `${ppl.slice(0, -1).map((p) => p.firstName).join(', ')} and ${ppl[ppl.length - 1].firstName}`);
export const bondAll = (c: ActivityCtx, a: number, t: number) => c.people.forEach((p) => adjustBond(c.s, c.me.id, p.id, a, t));
export const moodAll = (c: ActivityCtx, k: StatKey, d: number) => [c.me, ...c.people].forEach((p) => stat(p, k, d));
export const hasHobby = (_s: GameState, me: Person) => (me.hobby ? null : 'Pick up a hobby first.');
export const working = (_s: GameState, me: Person) => (me.jobId ? null : 'You need a job for this.');
/** A full-time career that requires a degree (engineer, nurse, lawyer...). */
export const professional = (_s: GameState, me: Person) => {
  const c = me.jobId && !me.retired ? CAREER_BY_ID[me.jobId] : undefined;
  return !!c && c.hours === 'full' && (c.requires === 'degree' || c.requires === 'top_degree');
};
/** Requires a hobby skill (from any hobby you've had, not just your current one). */
export const needSkill = (hobby: Hobby, min: number) => (_s: GameState, me: Person) =>
  (me.skills[hobby] ?? 0) >= min ? null : `Needs ${HOBBY_BY_ID[hobby].label.toLowerCase()} skill ${min}+ (yours: ${me.skills[hobby] ?? 0}).`;
export const needSport = (_s: GameState, me: Person) => (me.hobby === 'sports' && me.sport ? null : 'Pick a sport first (Plan → Hobby).');
export const projectCar = (s: GameState, me: Person) => s.households[me.householdId].assets.find((a) => a.kind === 'gear' && a.gear === 'project_car');
/** A paid side gig: income grows with skill (and a home setup), with some luck; practice too. */
export function earn(c: ActivityCtx, hobby: Hobby, base: number, perSkill: number, good: string, setup: UpgradeId): { text: string; tone: ActivityResult['tone'] } {
  const skill = c.me.skills[hobby] ?? 0;
  const hasSetup = c.s.households[c.me.householdId].assets.some((a) => a.kind === 'house' && (a.upgrades ?? []).includes(setup));
  const pay = Math.round(((base + skill * perSkill) * (hasSetup ? 1.3 : 1) * (0.7 + c.rng.next() * 0.6)) / 10) * 10;
  c.s.households[c.me.householdId].wallet += pay;
  c.me.skills[hobby] = Math.min(100, skill + 1);
  flag(c.me, 'side_income', pay);
  return { text: `${good}: ${money(pay)}.`, tone: 'good' };
}
export const hasDog =(s: GameState, me: Person) => (dogsOf(s.households[me.householdId]).length ? null : 'You need a dog (adopt one in the Family tab).');
export const myDogs = (c: ActivityCtx) => dogsOf(c.s.households[c.me.householdId]);
export const hasCat = (s: GameState, me: Person) => (catsOf(s.households[me.householdId]).length ? null : 'You need a cat (adopt one in the Family tab).');
export const myCats = (c: ActivityCtx) => catsOf(c.s.households[c.me.householdId]);
export const dogNames = (dogs: { name: string }[]) => (dogs.length <= 2 ? dogs.map((d) => d.name).join(' and ') : `${dogs.slice(0, -1).map((d) => d.name).join(', ')} and ${dogs[dogs.length - 1].name}`);
/**
 * Time with friends: those who come get closer (distant friends may say no). Spending time
 * together keeps the friendship from fading and can reconnect a friend who drifted away.
 */
export function hangOut(c: ActivityCtx, aff: number, trust: number, text: (who: string) => string, decline: 'no-show' | 'no-answer' = 'no-show'): { text: string; tone: ActivityResult['tone'] } {
  const came = c.people.filter((f) => willJoin(c.s, c.rng, c.me, f));
  const skipped = c.people.filter((f) => !came.includes(f));
  for (const f of came) {
    adjustBond(c.s, c.me.id, f.id, aff, trust);
    afterTogether(c.s, c.me, f);
  }
  for (const f of skipped) adjustBond(c.s, c.me.id, f.id, -1, -1);
  const no = skipped.length ? ` ${names(skipped)} ${decline === 'no-answer' ? "didn't pick up" : 'never replied'}.` : '';
  if (!came.length) return { text: `${names(skipped)} ${decline === 'no-answer' ? "didn't pick up" : 'never replied'}. Maybe they've moved on.`, tone: 'bad' };
  stat(c.me, 'happiness', 2);
  return { text: text(names(came)) + no, tone: skipped.length ? 'neutral' : 'good' };
}
export const attached = (s: GameState, me: Person) => (isSingle(s, me) ? null : 'You are already seeing someone.');
/** Try to meet someone; on success you start dating them. */
export function tryToMeet(c: ActivityCtx, chance: number, how: string, misses: string[]): { text: string; tone: ActivityResult['tone'] } {
  flag(c.me, 'met_people');
  const odds = chance + (c.me.stats.happiness - 50) / 400;
  if (!isSingle(c.s, c.me)) {
    // Already seeing someone: this is sneaking around, and it gets riskier every time.
    const sp = dateWhileAttached(c.s, c.rng, c.me, odds);
    stat(c.me, 'stress', 3);
    if (sp) return { text: `You hit it off with ${sp.firstName}${jobBlurb(sp)}. Now you have a secret to keep.`, tone: 'neutral' };
    return { text: `${c.rng.pick(misses)} You checked your phone the whole way home.`, tone: 'neutral' };
  }
  if (c.rng.chance(odds)) {
    const sp = meetSomeone(c.s, c.rng, c.me, how);
    return { text: `You hit it off with ${sp.firstName}${jobBlurb(sp)}. You're dating now.`, tone: 'good' };
  }
  stat(c.me, 'happiness', -1);
  return { text: c.rng.pick(misses), tone: 'neutral' };
}
export const kidAges =(p: Person, s: GameState, lo: number, hi: number) => ageOf(p, s.year) >= lo && ageOf(p, s.year) <= hi;
