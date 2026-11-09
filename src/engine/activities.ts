/**
 * Activities: one-off things to do during planning, separate from the 12 time blocks.
 * Each costs energy (a yearly pool of up to 100, lower when unhealthy or stressed,
 * never below 50) and usually money. Results are immediate and deterministic.
 */
import { makeRng, type Rng } from './rng';
import type { ActivityResult, GameState, Person, StatKey } from './types';
import {
  active, activePartnership, adjustBond, ageOf, alive, childrenOf, clamp, flag, getBond, journal, kidsAtHome, membersOf, money,
  parentsOf, partnerOf, stat,
} from './util';
import { homeParents } from './generate';
import { breakUp, mergeHouseholds, startDating } from './family';
import { shareAmounts, splitOff } from './household';
import { dogsOf } from './dogs';
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

/** Households are "near" (same area) or "far"; stable per household. */
export function distanceOf(householdId: string): 'near' | 'far' {
  const h = [...householdId].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return h % 10 < 7 ? 'near' : 'far';
}

// ── Catalog ──────────────────────────────────────────────────────────

export type Category = 'home' | 'pets' | 'health' | 'learning' | 'leisure' | 'visits' | 'romance' | 'social' | 'risk' | 'vices' | 'kid';
export const CATEGORIES: Record<Category, { label: string; icon: string }> = {
  home: { label: 'At home', icon: '🏡' },
  pets: { label: 'Dogs', icon: '🐕' },
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

export type Who = 'solo' | 'household' | 'partner' | 'kids' | 'relative' | 'guests' | 'ex';

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
const hasDog = (s: GameState, me: Person) => (dogsOf(s.households[me.householdId]).length ? null : 'You need a dog (adopt one in the Family tab).');
const myDogs = (c: ActivityCtx) => dogsOf(c.s.households[c.me.householdId]);
const dogNames = (dogs: { name: string }[]) => (dogs.length <= 2 ? dogs.map((d) => d.name).join(' and ') : `${dogs.slice(0, -1).map((d) => d.name).join(', ')} and ${dogs[dogs.length - 1].name}`);
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
    run: (c) => { stat(c.me, 'fitness', 8); stat(c.me, 'health', 3); return { text: 'Sore for a week, then hooked.', tone: 'good' }; },
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
    energy: (_s, ppl) => (ppl[0] && distanceOf(ppl[0].householdId) === 'far' ? 35 : 10),
    cost: (_s, ppl) => (ppl[0] && distanceOf(ppl[0].householdId) === 'far' ? 600 : 40),
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
      return { text: `${dogNames(dogs)} ran laps until they flopped down in the shade.`, tone: 'good' };
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
    id: 'night_out', category: 'social', icon: '🍻', label: 'Night out with friends', who: 'solo', desc: 'Catch up, laugh, stay out late.',
    energy: flat(12), cost: flat(100),
    run: (c) => {
      stat(c.me, 'happiness', 6);
      stat(c.me, 'stress', -6);
      if (!partnerOf(c.s, c.me.id)) flag(c.me, 'met_people');
      return { text: 'Your face hurts from laughing.', tone: 'good' };
    },
  },
  {
    id: 'volunteer', category: 'social', icon: '🤝', label: 'Volunteer', who: 'household', min: 0, ages: [12, 120], desc: 'Give an afternoon to a good cause.',
    energy: flat(12), cost: flat(0),
    run: (c) => { moodAll(c, 'happiness', 5); bondAll(c, 3, 3); flag(c.me, 'volunteer'); return { text: 'You helped at the food bank. It helped you too.', tone: 'good' }; },
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
    run: (c) => { stat(c.me, 'happiness', 7); stat(c.me, 'fitness', 4); if (c.me.hobby) c.me.skills[c.me.hobby] = Math.min(100, (c.me.skills[c.me.hobby] ?? 0) + 4); return { text: 'Campfires, bug bites, and a friend for life.', tone: 'good' }; },
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
    if (pool.length === 0 && min > 0) return def.who === 'partner' ? 'You need a partner.' : def.who === 'ex' ? 'No exes to call.' : def.who === 'relative' || def.who === 'guests' ? 'No relatives live elsewhere.' : 'Nobody here can join.';
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
