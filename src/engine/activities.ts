/**
 * Activities: one-off things to do during planning, separate from the 12 time blocks.
 * Each costs energy (a yearly pool of up to 100, lower when unhealthy or stressed,
 * never below 50) and usually money. Results are immediate and deterministic.
 */
import { makeRng, type Rng } from './rng';
import type { ActivityResult, GameState, Hobby, Person, StatKey } from './types';
import { HOBBY_BY_ID } from '../content/actions';
import type { UpgradeId } from '../content/finance';
import { addHobbySkill, ownsGear, practiceBoost, restoreProgress } from './hobbies';
import { SPORTS } from '../content/sports';
import { chooseSport, trainSport } from './sports';
import {
  active, activePartnership, adjustBond, ageOf, alive, childrenOf, clamp, flag, getBond, journal, kidsAtHome, membersOf, money,
  parentsOf, partnerOf, stat,
} from './util';
import { homeParents } from './generate';
import { breakUp, mergeHouseholds, startDating } from './family';
import { shareAmounts, splitOff } from './household';
import { dogsOf } from './dogs';
import { adoptCatInto, catsOf, maxCats } from './cats';
import { CAT_BREEDS, CAT_SHELTER_FEE } from '../content/cats';
import { cityName, cityOf, isNear } from './location';
import { afterTogether, friendsOf, maybeMeetFriend, willJoin } from './friends';
import { canConceive, conceive, exesOf, isSingle, jobBlurb, meetSomeone, pregnancyChance } from './romance';
import { unlockedTabs } from './tutorial';

// ── Energy ───────────────────────────────────────────────────────────

export const ENERGY_FULL = 100;
export const ENERGY_FLOOR = 50;

/** Yearly energy: 100, minus a penalty for poor health and high stress (and old age); at least 50. */
export function maxEnergy(p: Person, year: number) {
  let e = ENERGY_FULL;
  e -= Math.max(0, 50 - p.stats.health) * 0.8;
  e -= Math.max(0, p.stats.stress - 60) * 0.8;
  if (ageOf(p, year) >= 75) e -= 10;
  return Math.round(clamp(e, ENERGY_FLOOR, ENERGY_FULL));
}

/** This year's energy (the pool is set the first time it's looked at in a year). */
export function energyOf(s: GameState) {
  const e = s.energy && s.energy.year === s.year ? s.energy : { year: s.year, max: maxEnergy(active(s), s.year), used: 0 };
  return { max: e.max, used: e.used, left: Math.max(0, e.max - e.used) };
}

// ── Who can come along ───────────────────────────────────────────────

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

const flat = (n: number) => () => n;
const each = (base: number, per: number) => (_s: GameState, ppl: Person[]) => base + per * ppl.length;
const names = (ppl: Person[]) => (ppl.length <= 2 ? ppl.map((p) => p.firstName).join(' and ') : `${ppl.slice(0, -1).map((p) => p.firstName).join(', ')} and ${ppl[ppl.length - 1].firstName}`);
const bondAll = (c: ActivityCtx, a: number, t: number) => c.people.forEach((p) => adjustBond(c.s, c.me.id, p.id, a, t));
const moodAll = (c: ActivityCtx, k: StatKey, d: number) => [c.me, ...c.people].forEach((p) => stat(p, k, d));
const hasHobby = (_s: GameState, me: Person) => (me.hobby ? null : 'Pick up a hobby first.');
const working = (_s: GameState, me: Person) => (me.jobId ? null : 'You need a job for this.');
/** Requires a hobby skill (from any hobby you've had, not just your current one). */
const needSkill = (hobby: Hobby, min: number) => (_s: GameState, me: Person) =>
  (me.skills[hobby] ?? 0) >= min ? null : `Needs ${HOBBY_BY_ID[hobby].label.toLowerCase()} skill ${min}+ (yours: ${me.skills[hobby] ?? 0}).`;
const needSport = (_s: GameState, me: Person) => (me.hobby === 'sports' && me.sport ? null : 'Pick a sport first (Plan → Hobby).');
const projectCar = (s: GameState, me: Person) => s.households[me.householdId].assets.find((a) => a.kind === 'gear' && a.gear === 'project_car');
/** A paid side gig: income grows with skill (and a home setup), with some luck; practice too. */
function earn(c: ActivityCtx, hobby: Hobby, base: number, perSkill: number, good: string, setup: UpgradeId): { text: string; tone: ActivityResult['tone'] } {
  const skill = c.me.skills[hobby] ?? 0;
  const hasSetup = c.s.households[c.me.householdId].assets.some((a) => a.kind === 'house' && (a.upgrades ?? []).includes(setup));
  const pay = Math.round(((base + skill * perSkill) * (hasSetup ? 1.3 : 1) * (0.7 + c.rng.next() * 0.6)) / 10) * 10;
  c.s.households[c.me.householdId].wallet += pay;
  c.me.skills[hobby] = Math.min(100, skill + 1);
  flag(c.me, 'side_income', pay);
  return { text: `${good}: ${money(pay)}.`, tone: 'good' };
}
const hasDog =(s: GameState, me: Person) => (dogsOf(s.households[me.householdId]).length ? null : 'You need a dog (adopt one in the Family tab).');
const myDogs = (c: ActivityCtx) => dogsOf(c.s.households[c.me.householdId]);
const hasCat = (s: GameState, me: Person) => (catsOf(s.households[me.householdId]).length ? null : 'You need a cat (adopt one in the Family tab).');
const myCats = (c: ActivityCtx) => catsOf(c.s.households[c.me.householdId]);
const dogNames = (dogs: { name: string }[]) => (dogs.length <= 2 ? dogs.map((d) => d.name).join(' and ') : `${dogs.slice(0, -1).map((d) => d.name).join(', ')} and ${dogs[dogs.length - 1].name}`);
/**
 * Time with friends: those who come get closer (distant friends may say no). Spending time
 * together keeps the friendship from fading and can reconnect a friend who drifted away.
 */
function hangOut(c: ActivityCtx, aff: number, trust: number, text: (who: string) => string, decline: 'no-show' | 'no-answer' = 'no-show'): { text: string; tone: ActivityResult['tone'] } {
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
const single = (s: GameState, me: Person) => (isSingle(s, me) ? null : 'You are already seeing someone.');
/** Try to meet someone; on success you start dating them. */
function tryToMeet(c: ActivityCtx, chance: number, how: string, misses: string[]): { text: string; tone: ActivityResult['tone'] } {
  flag(c.me, 'met_people');
  const odds = chance + (c.me.stats.happiness - 50) / 400;
  if (c.rng.chance(odds)) {
    const sp = meetSomeone(c.s, c.rng, c.me, how);
    return { text: `You hit it off with ${sp.firstName}${jobBlurb(sp)}. You're dating now.`, tone: 'good' };
  }
  stat(c.me, 'happiness', -1);
  return { text: c.rng.pick(misses), tone: 'neutral' };
}
const kidAges =(p: Person, s: GameState, lo: number, hi: number) => ageOf(p, s.year) >= lo && ageOf(p, s.year) <= hi;

export const ACTIVITIES: ActivityDef[] = [
  // 🏡 At home — cheap, repeatable, great for bonds with anyone in the household (any age)
  {
    id: 'game_night', category: 'home', icon: '🎲', label: 'Game night', who: 'household', desc: 'Board games and snacks with people at home.',
    energy: flat(8), cost: flat(15),
    run: (c) => { bondAll(c, 4, 3); moodAll(c, 'happiness', 3); return { text: `Game night with ${names(c.people)}. Someone flipped the board (lovingly).`, tone: 'good' }; },
  },
  {
    id: 'cook_together', category: 'home', icon: '🍝', label: 'Cook dinner together', who: 'household', desc: 'Make a meal side by side.',
    energy: flat(8), cost: flat(40),
    run: (c) => {
      bondAll(c, 4, 4);
      if (c.rng.chance(0.15)) { moodAll(c, 'happiness', 1); return { text: 'The smoke alarm went off. Pizza was ordered. Still a great night.', tone: 'neutral' }; }
      moodAll(c, 'happiness', 3);
      return { text: `You and ${names(c.people)} made something genuinely delicious.`, tone: 'good' };
    },
  },
  {
    id: 'movie_marathon', category: 'home', icon: '🎬', label: 'Movie marathon', who: 'household', desc: 'Blankets, popcorn, too many sequels.',
    energy: flat(6), cost: flat(20),
    run: (c) => { bondAll(c, 3, 2); moodAll(c, 'stress', -4); return { text: 'Three movies in, everyone was asleep on the couch.', tone: 'good' }; },
  },
  {
    id: 'garden', category: 'home', icon: '🌱', label: 'Garden project', who: 'household', min: 0, desc: 'Plant something together (or alone).',
    energy: flat(12), cost: flat(120),
    run: (c) => { bondAll(c, 3, 3); stat(c.me, 'health', 2); stat(c.me, 'stress', -5); return { text: 'Dirt under the fingernails and tomatoes on the way.', tone: 'good' }; },
  },
  {
    id: 'park', category: 'home', icon: '🛝', label: 'Trip to the park', who: 'kids', desc: 'Swings, slides and a picnic with the little ones.',
    eligible: (s, p) => ageOf(p, s.year) <= 12, energy: flat(8), cost: flat(10),
    run: (c) => { bondAll(c, 5, 4); c.people.forEach((k) => stat(k, 'happiness', 4)); stat(c.me, 'fitness', 1); return { text: `${names(c.people)} ran until they couldn't anymore.`, tone: 'good' }; },
  },
  {
    id: 'teach_drive', category: 'home', icon: '🚘', label: 'Teach to drive', who: 'household', max: 1, desc: 'White knuckles, big trust.',
    eligible: (s, p) => kidAges(p, s, 15, 19), energy: flat(12), cost: flat(0),
    run: (c) => {
      const [t] = c.people;
      if (c.rng.chance(0.12)) {
        c.s.households[c.me.householdId].wallet -= 1500;
        adjustBond(c.s, c.me.id, t.id, 2, 4);
        return { text: `${t.firstName} met a mailbox. $1,500 later, you both laughed about it.`, tone: 'neutral' };
      }
      adjustBond(c.s, c.me.id, t.id, 5, 10);
      return { text: `${t.firstName} parallel parked on the first try. You pretended not to be impressed.`, tone: 'good' };
    },
  },
  {
    id: 'heart_to_heart', category: 'home', icon: '🫶', label: 'A heart-to-heart', who: 'household', max: 1, desc: 'Really talk with one person at home.',
    energy: flat(10), cost: flat(0),
    run: (c) => {
      const [p] = c.people;
      const b = getBond(c.s, c.me.id, p.id);
      if (c.rng.chance(0.5 + b.trust / 250)) { adjustBond(c.s, c.me.id, p.id, 6, 10); stat(p, 'stress', -5); return { text: `You and ${p.firstName} talked late into the night. Something lifted.`, tone: 'good' }; }
      adjustBond(c.s, c.me.id, p.id, -2, 1);
      return { text: `${p.firstName} wasn't ready to open up. At least you tried.`, tone: 'neutral' };
    },
  },

  // 🩺 Health
  {
    id: 'checkup', category: 'health', icon: '🩺', label: 'Doctor check-up', who: 'solo', perYear: 1, desc: 'Catch problems early.',
    energy: flat(10), cost: flat(150),
    run: (c) => {
      c.me.flags.checkup_year = c.s.year;
      if (ageOf(c.me, c.s.year) > 40 && c.me.stats.health < 60 && c.rng.chance(0.4)) {
        stat(c.me, 'health', 6);
        stat(c.me, 'stress', 6);
        return { text: 'The doctor caught something early. Treatment started right away.', tone: 'neutral' };
      }
      stat(c.me, 'health', 2);
      return { text: 'A clean bill of health. The doctor says keep it up.', tone: 'good' };
    },
  },
  {
    id: 'therapy', category: 'health', icon: '🛋️', label: 'Therapy session', who: 'solo', desc: 'Talk it through with a professional.',
    energy: flat(12), cost: flat(150),
    run: (c) => { stat(c.me, 'stress', -12); stat(c.me, 'happiness', 3); return { text: 'You left lighter than you arrived.', tone: 'good' }; },
  },
  {
    id: 'gym', category: 'health', icon: '🏋️', label: 'Gym membership', who: 'solo', perYear: 1, desc: 'A year of access; a big push to fitness.',
    energy: flat(20), cost: flat(600),
    run: (c) => {
      stat(c.me, 'fitness', 8);
      stat(c.me, 'health', 3);
      const f = maybeMeetFriend(c.s, c.rng, c.me, 0.15, 'at the gym');
      return { text: f ? `Sore for a week, then hooked. ${f.firstName} became your gym buddy.` : 'Sore for a week, then hooked.', tone: 'good' };
    },
  },
  {
    id: 'yoga', category: 'health', icon: '🧘', label: 'Yoga class', who: 'solo', desc: 'Stretch, breathe, unclench.',
    energy: flat(10), cost: flat(60),
    run: (c) => { stat(c.me, 'stress', -8); stat(c.me, 'fitness', 2); return { text: 'Namaste. Your shoulders came down from your ears.', tone: 'good' }; },
  },

  // 📚 Learning
  {
    id: 'read_book', category: 'learning', icon: '📖', label: 'Read a good book', who: 'solo', ages: [8, 120], desc: 'Get lost in a story.',
    energy: flat(6), cost: flat(15),
    run: (c) => { stat(c.me, 'smarts', 2); stat(c.me, 'stress', -3); return { text: 'You stayed up way too late to finish it.', tone: 'good' }; },
  },
  {
    id: 'language', category: 'learning', icon: '🗣️', label: 'Language course', who: 'solo', desc: 'Learn to order more than coffee abroad.',
    energy: flat(25), cost: flat(400),
    run: (c) => { stat(c.me, 'smarts', 4); flag(c.me, 'languages'); return { text: '¡Muy bien! Your accent is… getting there.', tone: 'good' }; },
  },
  {
    id: 'cooking_class', category: 'learning', icon: '👩‍🍳', label: 'Cooking class', who: 'solo', desc: 'Knife skills and a fancy sauce.',
    energy: flat(15), cost: flat(200),
    run: (c) => { stat(c.me, 'happiness', 4); flag(c.me, 'cook'); return { text: 'You can now make a béchamel. Nobody can stop you.', tone: 'good' }; },
  },
  {
    id: 'hobby_workshop', category: 'learning', icon: '🎯', label: 'Hobby workshop', who: 'solo', ages: [10, 120], desc: 'A weekend intensive for your hobby.',
    requires: hasHobby, energy: flat(20), cost: flat(250),
    run: (c) => { c.me.skills[c.me.hobby!] = Math.min(100, (c.me.skills[c.me.hobby!] ?? 0) + 7); stat(c.me, 'happiness', 3); return { text: 'You learned more in a weekend than in a year.', tone: 'good' }; },
  },

  // 🌴 Fun & travel — the big ones cost a lot of energy and money
  {
    id: 'concert', category: 'leisure', icon: '🎤', label: 'Concert', who: 'household', min: 0, desc: 'Live music, loud and happy.',
    energy: flat(12), cost: each(90, 90),
    run: (c) => { moodAll(c, 'happiness', 5); bondAll(c, 4, 2); return { text: 'Your ears are still ringing. Worth it.', tone: 'good' }; },
  },
  {
    id: 'ball_game', category: 'leisure', icon: '⚾', label: 'Ball game', who: 'household', min: 0, desc: 'Hot dogs and a seventh-inning stretch.',
    energy: flat(12), cost: each(60, 60),
    run: (c) => { moodAll(c, 'happiness', 4); bondAll(c, 4, 2); return { text: c.rng.chance(0.2) ? 'You caught a foul ball! Legend.' : 'The home team lost. Nobody cared.', tone: 'good' }; },
  },
  {
    id: 'spa_day', category: 'leisure', icon: '💆', label: 'Spa day', who: 'solo', desc: 'Massage, steam, silence.',
    energy: flat(10), cost: flat(250),
    run: (c) => { stat(c.me, 'stress', -15); stat(c.me, 'happiness', 3); return { text: 'You forgot what stress was for a whole afternoon.', tone: 'good' }; },
  },
  {
    id: 'getaway', category: 'leisure', icon: '🏕️', label: 'Weekend getaway', who: 'household', min: 0, desc: 'A cabin, a lake, no email.',
    energy: flat(25), cost: each(600, 250),
    run: (c) => { moodAll(c, 'happiness', 7); moodAll(c, 'stress', -10); bondAll(c, 6, 4); return { text: 'Two days, one lake, zero notifications.', tone: 'good' }; },
  },
  {
    id: 'vacation', category: 'leisure', icon: '🏖️', label: 'Beach vacation', who: 'household', min: 0, desc: 'A week of sun and sand.',
    energy: flat(45), cost: each(2000, 900),
    run: (c) => {
      moodAll(c, 'happiness', 10);
      moodAll(c, 'stress', -18);
      bondAll(c, 9, 6);
      if (c.rng.chance(0.12)) { c.s.households[c.me.householdId].wallet -= 400; return { text: 'The airline lost a suitcase, but the beach was perfect.', tone: 'neutral' }; }
      return { text: 'Sandcastles, sunsets, and a family photo worth framing.', tone: 'good' };
    },
  },
  {
    id: 'world_trip', category: 'leisure', icon: '✈️', label: 'Trip abroad', who: 'household', min: 0, desc: 'A once-in-a-while adventure overseas.',
    energy: flat(60), cost: each(4500, 2200),
    run: (c) => {
      moodAll(c, 'happiness', 14);
      moodAll(c, 'stress', -20);
      bondAll(c, 12, 8);
      flag(c.me, 'trips_abroad');
      if (c.rng.chance(0.15)) { moodAll(c, 'health', -4); return { text: 'Everyone caught the same stomach bug. Still, the views!', tone: 'neutral' }; }
      return { text: 'New food, new streets, stories you will tell for years.', tone: 'good' };
    },
  },

  // 🚗 Family visits
  {
    id: 'visit', category: 'visits', icon: '🚗', label: 'Visit a relative', who: 'relative', max: 1, desc: 'Drop by, or travel to see someone.',
    energy: (s, ppl) => (ppl[0] && distanceOf(s, ppl[0]) === 'far' ? 35 : 10),
    cost: (s, ppl) => (ppl[0] && distanceOf(s, ppl[0]) === 'far' ? 600 : 40),
    run: (c) => {
      const [p] = c.people;
      adjustBond(c.s, c.me.id, p.id, 8, 5);
      stat(p, 'happiness', 6);
      for (const m of membersOf(c.s, p.householdId)) if (m.id !== p.id) adjustBond(c.s, c.me.id, m.id, 3, 2);
      return { text: `${p.firstName} lit up when you walked in.`, tone: 'good' };
    },
  },
  {
    id: 'host_holiday', category: 'visits', icon: '🦃', label: 'Host a holiday dinner', who: 'guests', perYear: 1, desc: 'Invite family over for a big meal.',
    energy: flat(30), cost: each(300, 60),
    run: (c) => {
      bondAll(c, 5, 3);
      for (const m of membersOf(c.s, c.me.householdId)) if (m.id !== c.me.id) adjustBond(c.s, c.me.id, m.id, 3, 2);
      if (c.people.length >= 3 && c.rng.chance(0.25)) {
        const p = c.rng.pick(c.people);
        adjustBond(c.s, c.me.id, p.id, -12, -6);
        stat(c.me, 'stress', 6);
        return { text: `Dinner was lovely until ${p.firstName} brought up politics.`, tone: 'neutral' };
      }
      stat(c.me, 'happiness', 6);
      return { text: 'A full table, a fuller fridge, and leftovers for days.', tone: 'good' };
    },
  },

  // 🏅 Sports
  {
    id: 'pickup_game', category: 'sports', icon: '🏟️', label: 'Pickup game', who: 'friends', min: 0, max: 5, where: 'near', ages: [8, 90],
    requires: (_s, me) => (me.hobby === 'sports' && me.sport && SPORTS[me.sport].team ? null : 'Needs a team sport.'),
    desc: 'Show up, pick teams, play. Bring friends or meet some.',
    energy: flat(10), cost: flat(10),
    run: (c) => {
      stat(c.me, 'fitness', 3);
      trainSport(c.s, c.me, 2);
      if (!c.people.length) {
        const f = maybeMeetFriend(c.s, c.rng, c.me, 0.25, `playing pickup ${SPORTS[c.me.sport!].label.toLowerCase()}`);
        return { text: f ? `You and ${f.firstName} ended up on the same team, and now you play every week.` : 'A good sweat with strangers.', tone: 'good' };
      }
      return hangOut(c, 5, 3, (who) => `You and ${who} played until it got dark.`);
    },
  },
  {
    id: 'rec_league', category: 'sports', icon: '🥇', label: 'Join a rec league', who: 'solo', perYear: 1, ages: [16, 85],
    requires: needSport, desc: 'A season of games with a team (or a ladder, for solo sports).',
    energy: flat(14), cost: flat(150),
    run: (c) => {
      c.me.flags.league_year = c.s.year;
      stat(c.me, 'fitness', 4);
      stat(c.me, 'happiness', 3);
      trainSport(c.s, c.me, 3);
      const f = maybeMeetFriend(c.s, c.rng, c.me, 0.3, 'on your league team');
      return { text: f ? `A fun season, and ${f.firstName} from the team is a real friend now.` : 'A fun season. You never miss a game.', tone: 'good' };
    },
  },
  {
    id: 'sport_event', category: 'sports', icon: '🏁', label: 'Enter a race or tournament', who: 'solo', perYear: 3, ages: [10, 90],
    requires: (_s, me) => (me.hobby === 'sports' && me.sport && !SPORTS[me.sport].team ? null : 'Needs a solo sport (tennis, golf, swimming, running).'),
    desc: 'A marathon, a swim meet, a tournament: entry fee, prizes by skill.',
    energy: flat(16), cost: flat(100),
    run: (c) => {
      const sp = SPORTS[c.me.sport!];
      const skill = c.me.skills.sports ?? 0;
      stat(c.me, 'fitness', 3);
      if (c.me.sport === 'running') flag(c.me, 'marathon');
      if (c.me.sport === 'golf' && c.rng.chance(0.02 + skill / 2000)) {
        flag(c.me, 'hole_in_one');
        journal(c.s, 'A hole-in-one!', 'major');
      }
      if (c.rng.chance(skill / 140)) {
        const prize = Math.round((200 + skill * skill * 0.8) / 50) * 50;
        c.s.households[c.me.householdId].wallet += prize;
        flag(c.me, 'champion');
        return { text: `You won the ${sp.event}! ${money(prize)} in prize money.`, tone: 'good' };
      }
      return { text: c.me.sport === 'running' ? 'You crossed the finish line of the marathon. Legs like jelly, heart full.' : `A solid ${sp.event}. Not your day to win, but close.`, tone: 'good' };
    },
  },
  {
    id: 'private_coach', category: 'sports', icon: '🧑‍🏫', label: 'Hire a private coach', who: 'solo', perYear: 2, ages: [8, 90],
    requires: needSport, desc: 'Personal coaching: a real jump in skill.',
    energy: flat(10), cost: (s) => (ageOf(active(s), s.year) < 18 ? 0 : 1200),
    kidAsk: true,
    run: (c) => {
      trainSport(c.s, c.me, 6);
      return { text: `Your coach fixed one thing in your ${SPORTS[c.me.sport!].label.toLowerCase()} technique, and everything clicked.`, tone: 'good' };
    },
  },
  {
    id: 'coach_kids', category: 'sports', icon: '🧢', label: 'Coach your kid’s team', who: 'kids', max: 3, ages: [18, 80],
    eligible: (s, k) => ageOf(k, s.year) >= 5,
    requires: (_s, me) => ((me.skills.sports ?? 0) >= 15 ? null : 'Needs some sports skill (15+).'),
    desc: 'Volunteer coach: big bonding, and your kids improve (they may take up your sport).',
    energy: flat(14), cost: flat(100),
    run: (c) => {
      for (const k of c.people) {
        if (k.hobby !== 'sports' && c.me.sport) chooseSport(k, c.me.sport);
        trainSport(c.s, k, 4);
      }
      bondAll(c, 7, 5);
      flag(c.me, 'coached');
      trainSport(c.s, c.me, 1);
      return { text: `Orange slices, a whistle, and ${names(c.people)} beaming every time you yelled "nice hustle!"`, tone: 'good' };
    },
  },
  {
    id: 'sports_camp', category: 'sports', icon: '🏕️', label: 'Send kids to sports camp', who: 'kids', max: 2, perYear: 1, ages: [18, 90],
    eligible: (s, k) => ageOf(k, s.year) >= 7 && k.hobby === 'sports',
    desc: 'A week with real coaches: a big skill boost.',
    energy: flat(4), cost: (_s, ppl) => 1500 * Math.max(1, ppl.length),
    run: (c) => {
      for (const k of c.people) { trainSport(c.s, k, 8); stat(k, 'happiness', 5); }
      bondAll(c, 3, 2);
      return { text: `${names(c.people)} came home sunburned, exhausted, and much better.`, tone: 'good' };
    },
  },
  {
    id: 'watch_pro_game', category: 'sports', icon: '🎟️', label: 'Go to a pro game', who: 'household', min: 0, max: 5,
    desc: 'Tickets, hot dogs, and a foam finger.',
    energy: flat(8), cost: (_s, ppl) => 120 * (ppl.length + 1),
    run: (c) => { bondAll(c, 5, 3); moodAll(c, 'happiness', 5); return { text: c.people.length ? `You and ${names(c.people)} screamed yourselves hoarse.` : 'Great seats, great game.', tone: 'good' }; },
  },
  {
    id: 'play_catch', category: 'sports', icon: '🥎', label: 'Play catch in the yard', who: 'household', min: 1, ages: [6, 90],
    desc: 'Simple, free, and somehow the best talks happen here.',
    energy: flat(4), cost: flat(0),
    run: (c) => { bondAll(c, 4, 4); moodAll(c, 'stress', -2); return { text: `You and ${names(c.people)} talked about everything and nothing.`, tone: 'good' }; },
  },

  // 🧰 Hobbies & side gigs: earn by skill, restore, share with family
  {
    id: 'sell_furniture', category: 'hobby', icon: '🪑', label: 'Build and sell a piece', who: 'solo', perYear: 3,
    requires: needSkill('woodworking', 30), desc: 'A table, a bookshelf, a rocking chair. Pays by skill (more with a workshop).',
    energy: flat(12), cost: flat(300),
    run: (c) => earn(c, 'woodworking', 400, 45, 'Someone bought your piece', 'workshop'),
  },
  {
    id: 'play_gig', category: 'hobby', icon: '🎤', label: 'Play a gig', who: 'solo', perYear: 6,
    requires: needSkill('music', 30), desc: 'A bar, a wedding, a coffee shop. Pays by skill.',
    energy: flat(10), cost: flat(0),
    run: (c) => earn(c, 'music', 150, 18, 'The crowd sang along', 'studio'),
  },
  {
    id: 'cater_event', category: 'hobby', icon: '🍱', label: 'Cater an event', who: 'solo', perYear: 3,
    requires: needSkill('cooking', 35), desc: 'Feed a party of fifty. Pays by skill (more with a chef’s kitchen).',
    energy: flat(14), cost: flat(400),
    run: (c) => earn(c, 'cooking', 800, 32, 'Guests asked for your card', 'chef_kitchen'),
  },
  {
    id: 'fix_cars', category: 'hobby', icon: '🔧', label: 'Fix a neighbor’s car', who: 'solo', perYear: 4,
    requires: needSkill('mechanics', 25), desc: 'Cash for weekend repairs.',
    energy: flat(8), cost: flat(100),
    run: (c) => earn(c, 'mechanics', 200, 14, 'It purrs like new', 'garage_lift'),
  },
  {
    id: 'farmers_market', category: 'hobby', icon: '🧺', label: 'Sell at the farmers market', who: 'solo', perYear: 4,
    requires: needSkill('gardening', 25), desc: 'Tomatoes, herbs, and a lot of small talk.',
    energy: flat(8), cost: flat(50),
    run: (c) => { stat(c.me, 'stress', -3); return earn(c, 'gardening', 100, 9, 'You sold out by noon', 'greenhouse'); },
  },
  {
    id: 'restore_car', category: 'hobby', icon: '🚙', label: 'Work on the project car', who: 'household', min: 0, max: 2,
    requires: (s, me) => (projectCar(s, me) ? (projectCar(s, me)!.restore ?? 0) >= 100 ? 'It’s fully restored.' : null : 'Buy a project car first (Money → Hobby gear).'),
    desc: 'Parts and long weekends; the value climbs as it comes back to life. Bring a kid along.',
    energy: flat(15), cost: flat(1500),
    run: (c) => {
      const car = projectCar(c.s, c.me)!;
      const skill = c.me.skills.mechanics ?? 0;
      restoreProgress(car, Math.round((8 + skill / 5) * practiceBoost(c.s, c.me, 'mechanics')));
      c.me.skills.mechanics = Math.min(100, skill + 2);
      bondAll(c, 5, 4);
      if ((car.restore ?? 0) >= 100) {
        flag(c.me, 'restored_car');
        journal(c.s, `You finished restoring the classic. It's worth ${money(car.value)} now.`, 'major');
        return { text: `The engine turned over on the first try. A restored classic, worth ${money(car.value)}.`, tone: 'good' };
      }
      return { text: `${car.restore}% restored. ${c.people.length ? `${names(c.people)} handed you every wrench.` : 'Grease up to your elbows.'}`, tone: 'good' };
    },
  },
  {
    id: 'car_show', category: 'hobby', icon: '🏆', label: 'Enter a classic car show', who: 'solo', perYear: 1,
    requires: (s, me) => ((projectCar(s, me)?.restore ?? 0) >= 100 ? null : 'Needs a fully restored classic.'),
    desc: 'Polish, park, and hope for a trophy.', energy: flat(6), cost: flat(50),
    run: (c) => {
      if (c.rng.chance(0.3 + (c.me.skills.mechanics ?? 0) / 300)) {
        c.s.households[c.me.householdId].wallet += 2000;
        flag(c.me, 'car_show_win');
        return { text: 'Best in Show and a $2,000 prize!', tone: 'good' };
      }
      return { text: 'No trophy, but a crowd around your car all day.', tone: 'good' };
    },
  },
  {
    id: 'fishing_trip', category: 'hobby', icon: '🎣', label: 'Go fishing', who: 'household', min: 0, max: 3,
    requires: (_s, me) => (me.hobby === 'fishing' || (me.skills.fishing ?? 0) > 0 ? null : 'Take up fishing first.'),
    desc: 'Quiet water and good company (better with a boat).',
    energy: flat(8), cost: flat(40),
    run: (c) => {
      bondAll(c, 5, 4);
      stat(c.me, 'stress', -6);
      c.me.skills.fishing = Math.min(100, (c.me.skills.fishing ?? 0) + Math.round(2 * practiceBoost(c.s, c.me, 'fishing')));
      return { text: c.people.length ? `You and ${names(c.people)} caught nothing and loved every minute.` : 'Just you, the lake, and a very patient fish.', tone: 'good' };
    },
  },
  {
    id: 'fishing_tournament', category: 'hobby', icon: '🐟', label: 'Fishing tournament', who: 'solo', perYear: 2,
    requires: needSkill('fishing', 30), desc: 'Entry fee, early start, prize money by skill (a boat helps).',
    energy: flat(12), cost: flat(150),
    run: (c) => {
      const odds = ((c.me.skills.fishing ?? 0) / 160) * practiceBoost(c.s, c.me, 'fishing');
      if (c.rng.chance(Math.min(0.8, odds))) {
        const prize = c.rng.pick([500, 1000, 2500, 5000].filter((_, i) => i <= Math.floor(odds * 4)));
        c.s.households[c.me.householdId].wallet += prize;
        return { text: `You placed! ${money(prize)} in prize money.`, tone: 'good' };
      }
      return { text: 'Skunked. Next time.', tone: 'neutral' };
    },
  },
  {
    id: 'scenic_flight', category: 'hobby', icon: '🛩️', label: 'Take the family flying', who: 'household', min: 0, max: 3,
    requires: (_s, me) => (me.flags.ppl ? null : 'Needs a pilot license.'),
    desc: 'Up over the city at sunset (cheaper in your own plane).',
    energy: flat(10), cost: (s) => (ownsGear(s.households[active(s).householdId], 'plane') ? 150 : 450),
    run: (c) => {
      bondAll(c, 7, 5);
      moodAll(c, 'happiness', 6);
      c.me.skills.flying = Math.min(100, (c.me.skills.flying ?? 0) + 2);
      return { text: c.people.length ? `${names(c.people)} pressed their faces to the window the whole way.` : 'Clear skies and a perfect landing.', tone: 'good' };
    },
  },
  {
    id: 'garden_day', category: 'hobby', icon: '🌻', label: 'A day in the garden', who: 'household', min: 0,
    requires: (_s, me) => (me.hobby === 'gardening' || (me.skills.gardening ?? 0) > 0 ? null : 'Take up gardening first.'),
    desc: 'Dirt under your nails, peace in your head.',
    energy: flat(6), cost: flat(30),
    run: (c) => {
      moodAll(c, 'stress', -5);
      bondAll(c, 3, 2);
      c.me.skills.gardening = Math.min(100, (c.me.skills.gardening ?? 0) + Math.round(2 * practiceBoost(c.s, c.me, 'gardening')));
      return { text: 'The tomatoes are finally turning red.', tone: 'good' };
    },
  },
  {
    id: 'dinner_party', category: 'hobby', icon: '🍷', label: 'Host a dinner party', who: 'friends', min: 1, max: 6, where: 'near',
    requires: needSkill('cooking', 20), desc: 'Cook for your friends (better with a chef’s kitchen).',
    energy: flat(12), cost: (_s, ppl) => 60 + 30 * ppl.length,
    run: (c) => {
      c.me.skills.cooking = Math.min(100, (c.me.skills.cooking ?? 0) + 1);
      const great = (c.me.skills.cooking ?? 0) >= 50;
      return hangOut(c, great ? 7 : 4, 3, (who) => great ? `${who} are still talking about your risotto.` : `${who} were very polite about the casserole.`);
    },
  },

  // 🐈 Cats (everything here includes all your cats)
  {
    id: 'play_with_cats', category: 'pets', icon: '🧶', label: 'Play with the cats', who: 'household', min: 0, requires: hasCat, desc: 'A laser pointer, a feather wand, and sudden bursts of chaos.',
    energy: flat(3), cost: flat(0),
    run: (c) => {
      const cats = myCats(c);
      cats.forEach((x) => { x.lastPlayYear = c.s.year; x.bond = clamp(x.bond + 5, 0, 100); });
      moodAll(c, 'happiness', 3);
      moodAll(c, 'stress', -2);
      bondAll(c, 2, 1);
      return { text: `${dogNames(cats)} chased the red dot until they pretended they meant to stop.`, tone: 'good' };
    },
  },
  {
    id: 'cat_nap', category: 'pets', icon: '😴', label: 'Nap with the cat', who: 'solo', perYear: 3, requires: hasCat, desc: 'A warm cat on your chest. The best kind of rest.',
    energy: flat(2), cost: flat(0),
    run: (c) => {
      const cat = [...myCats(c)].sort((a, b) => b.bond - a.bond)[0];
      cat.bond = clamp(cat.bond + 3, 0, 100);
      stat(c.me, 'stress', -6);
      stat(c.me, 'happiness', 2);
      return { text: `${cat.name} purred like a tiny engine. You woke up two hours later, very rested.`, tone: 'good' };
    },
  },
  {
    id: 'cat_vet', category: 'pets', icon: '🩺', label: 'Cat vet check-up', who: 'solo', perYear: 2, requires: hasCat, desc: 'Shots, a once-over, and a carrier nobody wants to get into.',
    energy: flat(4), cost: (s) => 180 * catsOf(s.households[active(s).householdId]).length,
    run: (c) => {
      const cats = myCats(c);
      cats.forEach((x) => { x.health = clamp(x.health + 12, 0, 100); x.bond = clamp(x.bond - 1, 0, 100); });
      return { text: `${dogNames(cats)} ${cats.length > 1 ? 'are' : 'is'} healthy, and deeply offended by the thermometer.`, tone: 'good' };
    },
  },
  {
    id: 'cat_grooming', category: 'pets', icon: '🪮', label: 'Brush the long-haired cats', who: 'solo', requires: (s) => (catsOf(s.households[active(s).householdId]).some((x) => CAT_BREEDS[x.breed].longHair) ? null : 'Needs a long-haired cat.'),
    desc: 'Fewer hairballs, fewer mats, a little more trust.',
    energy: flat(3), cost: flat(0),
    run: (c) => {
      const cats = myCats(c).filter((x) => CAT_BREEDS[x.breed].longHair);
      cats.forEach((x) => { x.health = clamp(x.health + 3, 0, 100); x.bond = clamp(x.bond + 2, 0, 100); });
      return { text: `Enough fur came off ${dogNames(cats)} to build another cat.`, tone: 'good' };
    },
  },
  {
    id: 'cat_cafe', category: 'pets', icon: '☕', label: 'Visit a cat café', who: 'solo', ages: [12, 100], desc: 'Coffee among a dozen adoptable cats. Some people go home with one.',
    energy: flat(5), cost: flat(20),
    run: (c) => {
      stat(c.me, 'happiness', 4);
      stat(c.me, 'stress', -3);
      const hh = c.s.households[c.me.householdId];
      if (ageOf(c.me, c.s.year) >= 18 && catsOf(hh).length < maxCats(hh) && hh.wallet >= CAT_SHELTER_FEE && c.rng.chance(0.15)) {
        hh.wallet -= CAT_SHELTER_FEE;
        const cat = adoptCatInto(c.s, c.rng, 'tabby', '', c.rng.int(1, 6), 'shelter');
        return { text: `${cat.name} climbed into your lap and refused to leave. You signed the adoption papers.`, tone: 'good' };
      }
      if (isSingle(c.s, c.me) && ageOf(c.me, c.s.year) >= 18 && c.rng.chance(0.08)) {
        const sp = meetSomeone(c.s, c.rng, c.me, 'at the cat café');
        return { text: `You and ${sp.firstName} reached for the same kitten. Now you're dating.`, tone: 'good' };
      }
      const f = maybeMeetFriend(c.s, c.rng, c.me, 0.12, 'at the cat café');
      return { text: f ? `You got talking with ${f.firstName}, who knew every cat by name. Friends now.` : 'A calico fell asleep on your foot. You stayed an extra hour.', tone: 'good' };
    },
  },

  // 🐕 Dogs (everything here includes all your dogs)
  {
    id: 'walk_dogs', category: 'pets', icon: '🦮', label: 'Walk the dog', who: 'household', min: 0, requires: hasDog, desc: 'Fresh air for everyone. Energetic breeds need this most.',
    energy: flat(5), cost: flat(0),
    run: (c) => {
      const dogs = myDogs(c);
      dogs.forEach((d) => { d.lastWalkYear = c.s.year; d.bond = clamp(d.bond + 6, 0, 100); d.health = clamp(d.health + 2, 0, 100); });
      moodAll(c, 'fitness', 2);
      moodAll(c, 'stress', -3);
      bondAll(c, 2, 1);
      return { text: `${dogNames(dogs)} sniffed every single tree on the block.`, tone: 'good' };
    },
  },
  {
    id: 'play_fetch', category: 'pets', icon: '🎾', label: 'Play fetch', who: 'household', min: 0, requires: hasDog, desc: 'A ball, a yard, endless enthusiasm.',
    energy: flat(4), cost: flat(0),
    run: (c) => {
      const dogs = myDogs(c);
      dogs.forEach((d) => { d.bond = clamp(d.bond + 4, 0, 100); });
      moodAll(c, 'happiness', 3);
      bondAll(c, 2, 1);
      return { text: dogs.some((d) => d.breed === 'frenchie') ? 'One throw, one fetch, one long nap. Classic.' : `${dogNames(dogs)} brought the ball back 200 times.`, tone: 'good' };
    },
  },
  {
    id: 'dog_park', category: 'pets', icon: '🌳', label: 'Dog park', who: 'solo', requires: hasDog, desc: 'Zoomies, sniffing, and chatting with other dog people.',
    energy: flat(7), cost: flat(0),
    run: (c) => {
      const dogs = myDogs(c);
      dogs.forEach((d) => { d.lastWalkYear = c.s.year; d.bond = clamp(d.bond + 5, 0, 100); });
      stat(c.me, 'happiness', 4);
      // Dogs are great icebreakers.
      if (isSingle(c.s, c.me) && c.rng.chance(0.15)) {
        const sp = meetSomeone(c.s, c.rng, c.me, 'at the dog park');
        return { text: `${dogNames(dogs)} made friends with ${sp.firstName}'s dog, and you made friends with ${sp.firstName}. You're dating now.`, tone: 'good' };
      }
      const f = maybeMeetFriend(c.s, c.rng, c.me, 0.15, 'at the dog park');
      return { text: f ? `${dogNames(dogs)} made a best friend, and so did you: ${f.firstName}.` : `${dogNames(dogs)} ran laps until they flopped down in the shade.`, tone: 'good' };
    },
  },
  {
    id: 'obedience_class', category: 'pets', icon: '🎓', label: 'Obedience class', who: 'solo', perYear: 1, requires: hasDog, desc: 'Sit, stay, leave it. Fewer chewed shoes.',
    energy: flat(10), cost: (s) => 300 * dogsOf(s.households[active(s).householdId]).length,
    run: (c) => {
      const dogs = myDogs(c);
      dogs.forEach((d) => { d.trained = true; d.bond = clamp(d.bond + 5, 0, 100); });
      return { text: `${dogNames(dogs)} graduated! (Mostly for good behavior.)`, tone: 'good' };
    },
  },
  {
    id: 'vet_visit', category: 'pets', icon: '🩺', label: 'Vet check-up', who: 'solo', perYear: 2, requires: hasDog, desc: 'Shots, a once-over, and a treat for being brave.',
    energy: flat(4), cost: (s) => 250 * dogsOf(s.households[active(s).householdId]).length,
    run: (c) => {
      const dogs = myDogs(c);
      dogs.forEach((d) => { d.health = clamp(d.health + 12, 0, 100); });
      return { text: `The vet says ${dogNames(dogs)} ${dogs.length > 1 ? 'are' : 'is'} doing well. Treats all around.`, tone: 'good' };
    },
  },
  {
    id: 'dog_grooming', category: 'pets', icon: '🛁', label: 'Grooming day', who: 'solo', requires: hasDog, desc: 'A bath, a trim, and a bandana.',
    energy: flat(3), cost: (s) => 90 * dogsOf(s.households[active(s).householdId]).length,
    run: (c) => {
      const dogs = myDogs(c);
      dogs.forEach((d) => { d.bond = clamp(d.bond + 3, 0, 100); });
      stat(c.me, 'happiness', 2);
      return { text: `${dogNames(dogs)} came home fluffy and very proud of the bandana.`, tone: 'good' };
    },
  },

  // 💘 Love & dating — meeting someone (single)
  {
    id: 'dating_app', category: 'romance', icon: '📱', label: 'Try a dating app', who: 'solo', requires: single, desc: 'Swipe, chat, maybe meet up.',
    energy: flat(6), cost: flat(30),
    run: (c) => tryToMeet(c, 0.35, 'through a dating app', [
      'Three matches, two ghosted you, one only talked about crypto.',
      'You matched with your cousin’s ex. You deleted the app for a week.',
    ]),
  },
  {
    id: 'speed_dating', category: 'romance', icon: '⏱️', label: 'Speed dating', who: 'solo', requires: single, desc: 'Twelve five-minute conversations.',
    energy: flat(10), cost: flat(45),
    run: (c) => tryToMeet(c, 0.45, 'at a speed-dating night', [
      'The bell kept ringing right when things got interesting.',
      'You learned a lot about other people’s pets. No sparks tonight.',
    ]),
  },
  {
    id: 'blind_date', category: 'romance', icon: '🙈', label: 'Blind date', who: 'solo', requires: single, desc: 'A friend swears you two are perfect for each other.',
    energy: flat(8), cost: flat(80),
    run: (c) => tryToMeet(c, 0.4, 'on a blind date', [
      'Your friend has a very different idea of "perfect for you."',
      'Nice dinner, polite handshake, no second date.',
    ]),
  },
  {
    id: 'dance_class', category: 'romance', icon: '💃', label: 'Take a dance class', who: 'solo', requires: single, desc: 'Learn to salsa, and maybe meet someone.',
    energy: flat(12), cost: flat(200),
    run: (c) => {
      stat(c.me, 'fitness', 2);
      stat(c.me, 'happiness', 3);
      return tryToMeet(c, 0.3, 'in a dance class', ['You stepped on a lot of toes, but you can almost salsa now.']);
    },
  },

  // 💘 Love & dating — with your partner
  {
    id: 'date_night', category: 'romance', icon: '🌹', label: 'Date night', who: 'partner', max: 1, desc: 'Dinner for two.',
    energy: flat(10), cost: flat(120),
    run: (c) => { bondAll(c, 7, 4); moodAll(c, 'happiness', 3); return { text: `You and ${c.people[0].firstName} closed down the restaurant.`, tone: 'good' }; },
  },
  {
    id: 'picnic', category: 'romance', icon: '🧺', label: 'Picnic in the park', who: 'partner', max: 1, desc: 'Sandwiches, sunshine, no phones.',
    energy: flat(6), cost: flat(25),
    run: (c) => {
      bondAll(c, 5, 3);
      if (c.rng.chance(0.2)) return { text: 'It poured. You ate under a tree, soaked and laughing.', tone: 'good' };
      moodAll(c, 'stress', -3);
      return { text: `You and ${c.people[0].firstName} watched the clouds until sunset.`, tone: 'good' };
    },
  },
  {
    id: 'concert_date', category: 'romance', icon: '🎸', label: 'Concert date', who: 'partner', max: 1, desc: 'Loud music, sticky floors, one great night.',
    energy: flat(12), cost: flat(250),
    run: (c) => { bondAll(c, 6, 3); moodAll(c, 'happiness', 5); return { text: `You and ${c.people[0].firstName} sang every word. Your ears are still ringing.`, tone: 'good' }; },
  },
  {
    id: 'weekend_getaway', category: 'romance', icon: '🏖️', label: 'Weekend getaway', who: 'partner', max: 1, perYear: 2, desc: 'Two nights somewhere new, just the two of you.',
    energy: flat(18), cost: flat(1500),
    run: (c) => {
      bondAll(c, 10, 6);
      moodAll(c, 'stress', -8);
      moodAll(c, 'happiness', 5);
      return { text: `A cabin, a lake, and ${c.people[0].firstName}. You came back a little more in love.`, tone: 'good' };
    },
  },
  {
    id: 'spend_the_night', category: 'romance', icon: '🌙', label: 'Spend the night together', who: 'partner', max: 1, perYear: 4,
    desc: 'Things get romantic. There’s always some chance of a pregnancy.',
    energy: flat(8), cost: flat(0),
    eligible: (s, p) => getBond(s, active(s).id, p.id).affinity >= 20,
    run: (c) => {
      const p = c.people[0];
      bondAll(c, 6, 4);
      moodAll(c, 'happiness', 4);
      moodAll(c, 'stress', -3);
      flag(c.me, 'romantic_nights');
      if (canConceive(c.s, c.me, p) && c.rng.chance(pregnancyChance(c.s, c.me))) {
        conceive(c.s, c.rng, c.me, p);
        return { text: `A wonderful night with ${p.firstName}. A few weeks later, a surprise: a positive pregnancy test.`, tone: 'neutral' };
      }
      return { text: `A wonderful night with ${p.firstName}. Breakfast in bed the next morning.`, tone: 'good' };
    },
  },
  {
    id: 'move_in_together', category: 'romance', icon: '🔑', label: 'Move in together', who: 'partner', max: 1,
    desc: 'Share a home (and the bills). Their household joins yours.',
    energy: flat(10), cost: flat(2000),
    eligible: (s, p) => {
      const me = active(s);
      return activePartnership(s, me.id)?.status === 'dating' && p.householdId !== me.householdId && getBond(s, me.id, p.id).affinity >= 40;
    },
    run: (c) => {
      const p = c.people[0];
      mergeHouseholds(c.s, p.householdId, c.me.householdId);
      bondAll(c, 6, 5);
      moodAll(c, 'happiness', 5);
      journal(c.s, `${p.firstName} moved in with you.`, 'major');
      return { text: `Boxes everywhere, and ${p.firstName}'s mug next to yours.`, tone: 'good' };
    },
  },
  {
    id: 'break_up', category: 'romance', icon: '💔', label: 'Break up', who: 'partner', max: 1, desc: 'End a dating relationship. (Married couples separate through life events.)',
    energy: flat(4), cost: flat(0),
    eligible: (s) => activePartnership(s, active(s).id)?.status === 'dating',
    run: (c) => {
      const p = c.people[0];
      breakUp(c.s, c.me, p);
      // If they lived with you, they move back out.
      if (p.householdId === c.me.householdId) {
        // They leave with their own young kids (not yours) and their share of the savings.
        const mine = (k: Person) => k.biologicalParents.includes(c.me.id) || k.adoptiveParents.includes(c.me.id);
        const group = [p, ...membersOf(c.s, p.householdId).filter((k) => ageOf(k, c.s.year) < 18 && !mine(k) && (k.biologicalParents.includes(p.id) || k.adoptiveParents.includes(p.id)))];
        const share = shareAmounts(c.s, p.householdId, group);
        splitOff(c.s, group, share.cash, share.invest);
      }
      stat(c.me, 'happiness', -4);
      journal(c.s, `You and ${p.firstName} broke up.`, 'info');
      return { text: `A hard conversation with ${p.firstName}. It was the right call, but it still hurts.`, tone: 'neutral' };
    },
  },

  // 💘 Love & dating — exes
  {
    id: 'coffee_ex', category: 'romance', icon: '☕', label: 'Coffee with an ex', who: 'ex', max: 1, desc: 'Catch up with someone you used to date.',
    energy: flat(6), cost: flat(15),
    run: (c) => {
      const ex = c.people[0];
      bondAll(c, 5, 3);
      const spark = isSingle(c.s, c.me) && isSingle(c.s, ex) && getBond(c.s, c.me.id, ex.id).affinity >= 25;
      if (spark && c.rng.chance(0.35)) {
        startDating(c.s, c.me, ex);
        flag(c.me, 'rekindled');
        stat(c.me, 'happiness', 8);
        journal(c.s, `You and ${ex.firstName} are back together.`, 'major');
        return { text: `One coffee turned into dinner. You and ${ex.firstName} are giving it another try.`, tone: 'good' };
      }
      return { text: `You and ${ex.firstName} laughed about old times. It felt good to be friends.`, tone: 'good' };
    },
  },
  {
    id: 'text_ex', category: 'romance', icon: '💬', label: 'Late-night text to an ex', who: 'ex', max: 1, desc: '"u up?" What could go wrong?',
    energy: flat(2), cost: flat(0),
    run: (c) => {
      const ex = c.people[0];
      const partner = partnerOf(c.s, c.me.id);
      if (partner && c.rng.chance(0.35)) {
        adjustBond(c.s, c.me.id, partner.id, -12, -12);
        stat(c.me, 'stress', 6);
        return { text: `${partner.firstName} saw the message. That was a long, awkward week.`, tone: 'bad' };
      }
      if (c.rng.chance(0.5)) {
        adjustBond(c.s, c.me.id, ex.id, 4, 1);
        return { text: `${ex.firstName} replied with a laughing emoji and a memory you'd forgotten.`, tone: 'good' };
      }
      adjustBond(c.s, c.me.id, ex.id, -3, -2);
      return { text: `Left on read. You put the phone face-down and stared at the ceiling.`, tone: 'neutral' };
    },
  },

  // 🎉 Social
  {
    id: 'night_out', category: 'social', icon: '🍻', label: 'Night out with friends', who: 'friends', min: 0, max: 4, where: 'near',
    desc: 'Catch up, laugh, stay out late. Go alone and you might make a new friend.',
    energy: flat(12), cost: (_s, ppl) => 60 + 40 * ppl.length,
    run: (c) => {
      stat(c.me, 'happiness', 6);
      stat(c.me, 'stress', -6);
      if (!partnerOf(c.s, c.me.id)) flag(c.me, 'met_people');
      if (!c.people.length) {
        const f = maybeMeetFriend(c.s, c.rng, c.me, 0.35, 'on a night out');
        return { text: f ? `You got talking with ${f.firstName}${jobBlurb(f)} at the bar. You swapped numbers.` : 'A fun night with the regulars.', tone: 'good' };
      }
      return hangOut(c, 6, 3, (who) => `You and ${who} closed the place down. Your face hurts from laughing.`);
    },
  },
  {
    id: 'volunteer', category: 'social', icon: '🤝', label: 'Volunteer', who: 'household', min: 0, ages: [12, 120], desc: 'Give an afternoon to a good cause. You might make a friend.',
    energy: flat(12), cost: flat(0),
    run: (c) => {
      moodAll(c, 'happiness', 5);
      bondAll(c, 3, 3);
      flag(c.me, 'volunteer');
      const f = maybeMeetFriend(c.s, c.rng, c.me, 0.2, 'volunteering');
      return { text: f ? `You helped at the food bank, and ${f.firstName} asked if you'd come again next week.` : 'You helped at the food bank. It helped you too.', tone: 'good' };
    },
  },
  {
    id: 'join_club', category: 'social', icon: '📚', label: 'Join a club', who: 'solo', perYear: 2, desc: 'A book club, rec league, or trivia team. A great way to make friends.',
    energy: flat(10), cost: flat(120),
    run: (c) => {
      stat(c.me, 'happiness', 3);
      const f = maybeMeetFriend(c.s, c.rng, c.me, 0.55, c.rng.pick(['at book club', 'in a rec league', 'on a trivia team']));
      return { text: f ? `You and ${f.firstName} hit it off right away.` : 'Nice people, but no real connection yet.', tone: f ? 'good' : 'neutral' };
    },
  },

  // 👋 Friends: in person (same city), from anywhere (calls, games), or a planned trip
  {
    id: 'coffee_friend', category: 'social', icon: '☕', label: 'Coffee with a friend', who: 'friends', max: 1, where: 'near', desc: 'An hour to catch up.',
    energy: flat(4), cost: flat(12),
    run: (c) => hangOut(c, 5, 3, (who) => `You and ${who} talked until the coffee went cold.`),
  },
  {
    id: 'game_day', category: 'social', icon: '🏈', label: 'Watch the game together', who: 'friends', max: 5, where: 'near', desc: 'Snacks, yelling at the TV, high fives.',
    energy: flat(6), cost: (_s, ppl) => 20 + 15 * ppl.length,
    run: (c) => hangOut(c, 4, 2, (who) => `You and ${who} celebrated a last-second win.`),
  },
  {
    id: 'hike_friends', category: 'social', icon: '🥾', label: 'Go hiking with friends', who: 'friends', max: 3, where: 'near', desc: 'Fresh air and long talks.',
    energy: flat(12), cost: flat(15),
    run: (c) => { stat(c.me, 'fitness', 3); return hangOut(c, 5, 4, (who) => `You and ${who} made it to the top and shared the view.`); },
  },
  {
    id: 'help_friend_move', category: 'social', icon: '📦', label: 'Help a friend move', who: 'friends', max: 1, where: 'near', perYear: 2, desc: 'Lift boxes; earn eternal gratitude (and pizza).',
    energy: flat(14), cost: flat(0),
    run: (c) => { stat(c.me, 'stress', 2); return hangOut(c, 8, 7, (who) => `You carried ${who}'s couch up three flights. They owe you big.`); },
  },
  {
    id: 'host_party', category: 'social', icon: '🎂', label: 'Throw a party', who: 'friends', min: 2, max: 10, where: 'near', perYear: 2, desc: 'Invite your friends over.',
    energy: flat(15), cost: (_s, ppl) => 100 + 30 * ppl.length,
    run: (c) => { stat(c.me, 'happiness', 6); return hangOut(c, 4, 2, (who) => `A great party. ${who} stayed to help clean up.`); },
  },
  {
    id: 'call_friend', category: 'social', icon: '📞', label: 'Call a friend', who: 'friends', max: 1, where: 'any', desc: 'Works from anywhere.',
    energy: flat(2), cost: flat(0),
    run: (c) => hangOut(c, 3, 2, (who) => `An hour on the phone with ${who}. It felt like no time had passed.`, 'no-answer'),
  },
  {
    id: 'video_games', category: 'social', icon: '🎮', label: 'Play video games online', who: 'friends', max: 3, where: 'any', desc: 'Headsets on, wherever you all live.',
    energy: flat(4), cost: flat(0),
    run: (c) => { stat(c.me, 'stress', -3); return hangOut(c, 3, 1, (who) => `You and ${who} finally beat the final boss at 2 a.m.`, 'no-answer'); },
  },
  {
    id: 'visit_friend', category: 'social', icon: '✈️', label: 'Plan a trip to see a friend', who: 'friends', max: 1, where: 'far',
    desc: 'They live in another city: flights and a hotel, but a big boost to the friendship.',
    energy: flat(22), cost: flat(800),
    run: (c) => {
      stat(c.me, 'happiness', 6);
      stat(c.me, 'stress', -4);
      return hangOut(c, 12, 8, (who) => `A long weekend with ${who} in ${c.people[0] ? cityName(cityOf(c.s, c.people[0])) : 'their city'}. You didn't stop talking.`);
    },
  },

  // 🎲 Money & luck
  {
    id: 'lottery', category: 'risk', icon: '🎟️', label: 'Lottery ticket', who: 'solo', desc: 'Two dollars and a dream.',
    energy: flat(2), cost: flat(2),
    run: (c) => {
      const r = c.rng.next();
      const hh = c.s.households[c.me.householdId];
      if (r < 0.0005) { hh.wallet += 250000; flag(c.me, 'lottery_win'); return { text: 'JACKPOT. $250,000. You had to sit down.', tone: 'good' }; }
      if (r < 0.02) { hh.wallet += 100; return { text: 'Three numbers! You won $100.', tone: 'good' }; }
      return { text: 'Not a single number. Maybe next time.', tone: 'neutral' };
    },
  },
  {
    id: 'casino', category: 'risk', icon: '🎰', label: 'Casino weekend', who: 'solo', desc: 'Bright lights; the house usually wins.',
    energy: flat(25), cost: flat(1000),
    run: (c) => {
      const r = c.rng.next();
      const hh = c.s.households[c.me.householdId];
      if (r < 0.1) { hh.wallet += 3500; stat(c.me, 'happiness', 8); return { text: 'Hot streak at the blackjack table: you walked out $2,500 up.', tone: 'good' }; }
      if (r < 0.35) { hh.wallet += 1000; return { text: 'You broke even. A fun weekend for the price of the hotel.', tone: 'neutral' }; }
      stat(c.me, 'happiness', -3);
      return { text: 'The house won. It always seems to.', tone: 'bad' };
    },
  },
  {
    id: 'side_gig', category: 'risk', icon: '🧰', label: 'Weekend side gig', who: 'solo', ages: [16, 120], desc: 'Odd jobs for extra cash.',
    energy: flat(20), cost: flat(0),
    run: (c) => { const pay = c.rng.int(600, 1800); c.s.households[c.me.householdId].wallet += pay; stat(c.me, 'stress', 5); return { text: `You earned ${money(pay)} assembling furniture for strangers.`, tone: 'good' }; },
  },
  {
    id: 'garage_sale', category: 'risk', icon: '🏷️', label: 'Garage sale', who: 'solo', perYear: 1, desc: 'Turn clutter into cash.',
    energy: flat(15), cost: flat(0),
    run: (c) => { const pay = c.rng.int(200, 900); c.s.households[c.me.householdId].wallet += pay; stat(c.me, 'happiness', 2); return { text: `The old exercise bike finally went. ${money(pay)} richer.`, tone: 'good' }; },
  },

  // ⚠️ Vices — feel good now, cost later
  {
    id: 'party', category: 'vices', icon: '🪩', label: 'Party all night', who: 'solo', desc: 'Dance till dawn. Pay for it tomorrow.',
    energy: flat(15), cost: flat(150),
    run: (c) => { stat(c.me, 'happiness', 8); stat(c.me, 'health', -4); stat(c.me, 'stress', -4); return { text: 'Legendary night. Rough morning.', tone: 'neutral' }; },
  },
  {
    id: 'skip_work', category: 'vices', icon: '🛌', label: 'Call in sick', who: 'solo', desc: 'A day off you did not earn.',
    requires: working, energy: flat(5), cost: flat(0),
    run: (c) => { stat(c.me, 'stress', -10); c.me.workPerf = Math.max(0, c.me.workPerf - 8); return { text: 'Blissful. Your manager noticed, though.', tone: 'neutral' }; },
  },
  {
    id: 'retail_therapy', category: 'vices', icon: '🛍️', label: 'Shopping spree', who: 'solo', desc: 'Buy things you do not need.',
    energy: flat(8), cost: flat(800),
    run: (c) => { stat(c.me, 'happiness', 6); return { text: 'Bags everywhere. The glow lasted until the card statement.', tone: 'neutral' }; },
  },

  // 🧸 Kid stuff (the player as a child)
  {
    id: 'play_friends', category: 'kid', icon: '⚽', label: 'Play with friends', who: 'solo', ages: [5, 17], desc: 'Outside until the streetlights come on.',
    energy: flat(6), cost: flat(0),
    run: (c) => { stat(c.me, 'happiness', 4); stat(c.me, 'fitness', 2); return { text: 'Muddy knees, best day ever.', tone: 'good' }; },
  },
  {
    id: 'play_sibling', category: 'kid', icon: '🧩', label: 'Play with a sibling', who: 'household', max: 1, ages: [3, 17], desc: 'Forts, games, a little arguing.',
    eligible: (s, p) => ageOf(p, s.year) < 18, energy: flat(6), cost: flat(0),
    run: (c) => { bondAll(c, 5, 3); moodAll(c, 'happiness', 3); return { text: `You and ${c.people[0].firstName} built the greatest blanket fort in history.`, tone: 'good' }; },
  },
  {
    id: 'zoo', category: 'kid', icon: '🦁', label: 'Ask to go to the zoo', who: 'solo', ages: [3, 13], kidAsk: true, desc: 'Lions! (If your parents say yes.)',
    energy: flat(10), cost: flat(120),
    run: (c) => { stat(c.me, 'happiness', 6); for (const p of homeParents(c.s, c.me)) adjustBond(c.s, c.me.id, p.id, 4, 2); return { text: 'The penguins were your favorite. You will be talking about them for weeks.', tone: 'good' }; },
  },
  {
    id: 'sports_camp', category: 'kid', icon: '⛺', label: 'Ask to go to summer camp', who: 'solo', ages: [8, 16], kidAsk: true, desc: 'A week away with new friends.',
    energy: flat(20), cost: flat(500),
    run: (c) => { stat(c.me, 'happiness', 7); stat(c.me, 'fitness', 4); if (c.me.hobby) addHobbySkill(c.s, c.me, c.me.hobby, 4); return { text: 'Campfires, bug bites, and a friend for life.', tone: 'good' }; },
  },
  {
    id: 'science_fair', category: 'kid', icon: '🔬', label: 'Science fair project', who: 'solo', ages: [8, 17], perYear: 1, desc: 'A volcano? A robot? Glory awaits.',
    energy: flat(15), cost: flat(0),
    run: (c) => {
      stat(c.me, 'smarts', 4);
      if (c.rng.chance(c.me.stats.smarts / 150)) { stat(c.me, 'happiness', 6); flag(c.me, 'science_ribbon'); return { text: 'Blue ribbon! Your parents framed it.', tone: 'good' }; }
      return { text: 'The volcano erupted a little early. You still learned a lot.', tone: 'neutral' };
    },
  },
];

export const ACTIVITY_BY_ID: Record<string, ActivityDef> = Object.fromEntries(ACTIVITIES.map((a) => [a.id, a]));

// ── Rules ────────────────────────────────────────────────────────────

/** Everyone who could join this activity. */
export function candidatesFor(s: GameState, def: ActivityDef): Person[] {
  const me = active(s);
  let list: Person[] = [];
  if (def.who === 'household') list = membersOf(s, me.householdId).filter((p) => p.id !== me.id);
  else if (def.who === 'partner') list = partnerOf(s, me.id) ? [partnerOf(s, me.id)!] : [];
  else if (def.who === 'kids') list = kidsAtHome(s, me);
  else if (def.who === 'relative' || def.who === 'guests') list = relativesOutside(s, me);
  else if (def.who === 'ex') list = exesOf(s, me);
  else if (def.who === 'friends') list = friendsOf(s, me).filter((f) => def.where === 'near' ? isNear(s, f) : def.where === 'far' ? !isNear(s, f) : true);
  return def.eligible ? list.filter((p) => def.eligible!(s, p)) : list;
}

export const timesThisYear = (s: GameState, id: string) => (s.activityLog ?? []).filter((x) => x.year === s.year && x.id === id).length;

/** Why this activity can't be done (with these people) right now, or null. */
export function activityBlocker(s: GameState, id: string, ids: string[] = []): string | null {
  const def = ACTIVITY_BY_ID[id];
  if (!def) return 'Unknown activity.';
  if (s.phase !== 'PLANNING') return 'Activities happen while planning.';
  if (!unlockedTabs(s).includes('activities')) return 'Activities open at 30.';
  const me = active(s);
  const age = ageOf(me, s.year);
  const [lo, hi] = def.ages ?? [18, 120];
  if (age < lo || age > hi) return age < lo ? `From age ${lo}.` : 'Not at your age.';
  if (def.perYear && timesThisYear(s, id) >= def.perYear) return def.perYear === 1 ? 'Already done this year.' : `At most ${def.perYear} times a year.`;
  const req = def.requires?.(s, me);
  if (req) return req;
  const pool = candidatesFor(s, def);
  const people = ids.map((x) => s.people[x]).filter(Boolean);
  if (def.who !== 'solo') {
    const min = def.min ?? 1;
    if (pool.length === 0 && min > 0) return def.who === 'partner' ? 'You need a partner.' : def.who === 'ex' ? 'No exes to call.' : def.who === 'friends' ? (def.where === 'far' ? 'No friends live in other cities.' : def.where === 'near' ? 'No friends live in your city.' : 'Make some friends first.') : def.who === 'relative' || def.who === 'guests' ? 'No relatives live elsewhere.' : 'Nobody here can join.';
    if (people.length < min) return min === 1 ? 'Choose who comes.' : `Choose at least ${min}.`;
    if (def.max !== undefined && people.length > def.max) return `At most ${def.max}.`;
    if (people.some((p) => !pool.includes(p))) return 'Someone chosen cannot come.';
  }
  const { left } = energyOf(s);
  const e = def.energy(s, people);
  if (e > left) return `Needs ${e} energy (${left} left).`;
  const cost = def.cost(s, people);
  if (cost > 0 && s.households[me.householdId].wallet < cost) return `Costs ${money(cost)}.`;
  return null;
}

const STAT_LABEL: Record<StatKey, string> = { health: 'Health', happiness: 'Happiness', smarts: 'Smarts', fitness: 'Fitness', stress: 'Stress' };

/** Do an activity. Returns the same state if it isn't allowed. */
export function performActivity(state: GameState, id: string, ids: string[] = []): GameState {
  if (activityBlocker(state, id, ids)) return state;
  const def = ACTIVITY_BY_ID[id];
  const s: GameState = structuredClone(state);
  const rng = makeRng(s.rngState);
  const me = active(s);
  const people = ids.map((x) => s.people[x]);
  const hh = s.households[me.householdId];
  const energy = energyOf(s);
  const eCost = def.energy(s, people);
  const cost = def.cost(s, people);
  s.energy = { year: s.year, max: energy.max, used: energy.used + eCost };
  s.activityLog = [...(s.activityLog ?? []), { year: s.year, id }].slice(-300);

  const before = { stats: { ...me.stats }, wallet: hh.wallet, bonds: people.map((p) => getBond(s, me.id, p.id).affinity) };
  let result: { text: string; tone: ActivityResult['tone'] };
  // Kids ask first; parents say yes more often when trust is high.
  const parents = homeParents(s, me);
  const trust = parents.length ? parents.reduce((sum, p) => sum + getBond(s, me.id, p.id).trust, 0) / parents.length : 0;
  if (def.kidAsk && !rng.chance(clamp(0.45 + trust / 150, 0.15, 0.95))) {
    stat(me, 'happiness', -2);
    result = { text: 'You asked nicely. Your parents said "maybe next year."', tone: 'neutral' };
  } else {
    hh.wallet -= cost;
    result = def.run({ s, rng, me, people });
  }

  const changes: string[] = [];
  for (const k of Object.keys(STAT_LABEL) as StatKey[]) {
    const d = me.stats[k] - before.stats[k];
    if (d) changes.push(`${STAT_LABEL[k]} ${d > 0 ? '+' : ''}${d}`);
  }
  people.forEach((p, i) => {
    const d = getBond(s, me.id, p.id).affinity - before.bonds[i];
    if (d) changes.push(`${p.firstName} ❤ ${d > 0 ? '+' : ''}${d}`);
  });
  const dw = hh.wallet - before.wallet;
  if (dw) changes.push(`${dw > 0 ? '+' : '-'}${money(Math.abs(dw))}`);
  changes.push(`Energy -${eCost}`);

  s.lastActivity = { id, title: def.label, text: result.text, tone: result.tone, changes };
  journal(s, `${def.icon} ${def.label}: ${result.text}`, result.tone === 'bad' ? 'bad' : 'info');
  s.rngState = rng.state();
  return s;
}

export function dismissActivity(state: GameState): GameState {
  return state.lastActivity ? { ...state, lastActivity: undefined } : state;
}
