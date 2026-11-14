/**
 * Activities: one-off things to do during planning, separate from the 12 time blocks.
 * Each costs energy (a yearly pool of up to 100, lower when unhealthy or stressed,
 * never below 50) and usually money. Results are immediate and deterministic.
 */
import { grandchildrenTookPart } from './grandchildren';
import { TRADITIONS, traditionYear } from './traditions';
import { makeRng } from './rng';
import type { ActivityResult, GameState, Person, StatKey } from './types';
import { active, adjustBond, ageOf, clamp, getBond, journal, kidsAtHome, membersOf, money, partnerOf, stat } from './util';
import { homeParents } from './generate';
import { isNear } from './location';
import { friendsOf } from './friends';
import { exesOf } from './romance';
import { unlockedTabs } from './tutorial';
import { relativesOutside, type ActivityDef } from './activityKit';
import { HOME_ACTIVITIES } from './activitiesHome';
import { SPORTS_ACTIVITIES } from './activitiesSports';
import { HOBBY_ACTIVITIES } from './activitiesHobbies';
import { PET_ACTIVITIES } from './activitiesPets';
import { ROMANCE_ACTIVITIES } from './activitiesRomance';
import { SOCIAL_ACTIVITIES } from './activitiesSocial';
import { charge, hasCash } from './money';
import { reaction, type Situation } from './personality';
import { activitySituation } from './activitySituations';
import { connectionOf, connectionPhrase, formOf, receiverFactor } from './relationships';

export { CATEGORIES, distanceOf, relativesOutside } from './activityKit';
export type { ActivityCtx, ActivityDef, Category, Who } from './activityKit';

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

/** Every activity, in the order the Activities tab lists them. */
export const ACTIVITIES: ActivityDef[] = [...HOME_ACTIVITIES, ...SPORTS_ACTIVITIES, ...HOBBY_ACTIVITIES, ...PET_ACTIVITIES, ...ROMANCE_ACTIVITIES, ...SOCIAL_ACTIVITIES];

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
  else if (def.who === 'close') {
    const p = partnerOf(s, me.id);
    list = [...membersOf(s, me.householdId).filter((x) => x.id !== me.id), ...(p && p.householdId !== me.householdId ? [p] : []), ...relativesOutside(s, me)];
  }
  else if (def.who === 'ex') list = exesOf(s, me);
  else if (def.who === 'friends') list = friendsOf(s, me).filter((f) => def.where === 'near' ? isNear(s, f) : def.where === 'far' ? !isNear(s, f) : true);
  return def.eligible ? list.filter((p) => def.eligible!(s, p)) : list;
}

export const timesThisYear = (s: GameState, id: string) => (s.activityLog ?? []).filter((x) => x.year === s.year && x.id === id).length;

/** Why this activity can't be done (with these people) right now, or null. */
/** The label to show (some depend on who's around). */
export const activityLabel = (s: GameState, def: ActivityDef) => def.labelFor?.(s, active(s)) ?? def.label;

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
  if (def.hidden?.(s, me)) return 'Not available yet.';
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
  if (cost > 0 && !hasCash(s.households[me.householdId], cost)) return `Costs ${money(cost)}.`;
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
  // Tradition activities remember how many took part (a solo run never counts toward a tradition).
  s.activityLog = [...(s.activityLog ?? []), { year: s.year, id, ...(TRADITIONS[id] ? { with: people.length } : {}) }].slice(-300);

  const before = { stats: { ...me.stats }, wallet: hh.wallet, bonds: people.map((p) => getBond(s, me.id, p.id).affinity) };
  let result: { text: string; tone: ActivityResult['tone'] };
  // Kids ask first; parents say yes more often when trust is high.
  const parents = homeParents(s, me);
  const trust = parents.length ? parents.reduce((sum, p) => sum + getBond(s, me.id, p.id).trust, 0) / parents.length : 0;
  if (def.kidAsk && !rng.chance(clamp(0.45 + trust / 150, 0.15, 0.95))) {
    stat(me, 'happiness', -2);
    result = { text: 'You asked nicely. Your parents said "maybe next year."', tone: 'neutral' };
  } else {
    charge(hh, cost);
    result = def.run({ s, rng, me, people });
    // Personality: someone like this gets a little more (or less) out of it. Only the reaction changes, never the price.
    const isNew = !(s.activityLog ?? []).slice(0, -1).some((x) => x.id === id);
    const options = [activitySituation(id), isNew ? 'newThing' : undefined].filter(Boolean) as Situation[];
    const r = options.map((sit) => reaction(me, sit)).sort((a, b) => Math.abs(b.factor - 1) - Math.abs(a.factor - 1))[0];
    if (r && r.factor !== 1) {
      const extra = r.factor - 1;
      stat(me, 'happiness', (me.stats.happiness - before.stats.happiness) * extra);
      stat(me, 'stress', (me.stats.stress - before.stats.stress) * extra);
      people.forEach((p, i) => adjustBond(s, me.id, p.id, (getBond(s, me.id, p.id).affinity - before.bonds[i]) * extra, 0));
      if (r.note && Math.abs(extra) >= 0.1) result = { ...result, text: `${result.text} ${r.note}` };
    }
    // Each person receives it their own way (a preferred form of care helps a bit more).
    const form = formOf(activitySituation(id));
    let explained = false;
    people.forEach((p, i) => {
      const f = receiverFactor(p, form);
      const gained = getBond(s, me.id, p.id).affinity - before.bonds[i];
      if (f === 1 || gained <= 0) return;
      adjustBond(s, me.id, p.id, gained * (f - 1), 0);
      if (f >= 1.15 && !explained && connectionOf(p) === form) {
        explained = true;
        p.flags.pref_known = 1;
        result = { ...result, text: `${result.text} ${p.firstName} loves ${connectionPhrase[form!]}.` };
      }
    });
    // A family tradition: a small yearly boost and a line on the card.
    const tradition = traditionYear(s, me, id, people);
    if (tradition) result = { ...result, text: `${result.text} ${tradition}` };
    // Time with grandchildren is part of both your stories.
    grandchildrenTookPart(s, me, people, id === 'teach_grandchild' ? me.hobby : undefined);
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

  const label = activityLabel(state, def);
  s.lastActivity = { id, title: label, text: result.text, tone: result.tone, changes };
  journal(s, `${def.icon} ${label}: ${result.text}`, result.tone === 'bad' ? 'bad' : 'info');
  s.rngState = rng.state();
  return s;
}

export function dismissActivity(state: GameState): GameState {
  return state.lastActivity ? { ...state, lastActivity: undefined } : state;
}
