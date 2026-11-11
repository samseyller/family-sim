/**
 * Hobbies as paths: practice builds skill (faster with the right gear or home upgrade, and
 * some hobbies cost money per block), credentials and careers build on that skill, gear can be
 * bought, kept up, restored, and passed down. Own-business careers have income that swings
 * with skill and luck; touring musicians spend long stretches away from home.
 */
import { HOBBY_BY_ID } from '../content/actions';
import { CAREER_BY_ID, type Career } from '../content/careers';
import { COASTAL, GEAR, RESTORED_VALUE, type GearId } from '../content/gear';
import type { UpgradeId } from '../content/finance';
import { cityOfHousehold } from './location';
import { sportBoost } from './sports';
import { SPORTS } from '../content/sports';
import type { Rng } from './rng';
import { unlockedTabs } from './tutorial';
import type { Asset, GameState, Hobby, Household, Person } from './types';
import { active, adjustBond, ageOf, clamp, journal, membersOf, money, newId, stat } from './util';

/** Home upgrades that speed up practice for a hobby. */
export const HOME_BOOST: Partial<Record<Hobby, { upgrade: UpgradeId; boost: number }>> = {
  woodworking: { upgrade: 'workshop', boost: 2 },
  music: { upgrade: 'studio', boost: 1.5 },
  cooking: { upgrade: 'chef_kitchen', boost: 1.5 },
  gardening: { upgrade: 'greenhouse', boost: 1.5 },
  mechanics: { upgrade: 'garage_lift', boost: 1.5 },
};

export const gearOf = (hh: Household) => hh.assets.filter((a) => a.kind === 'gear');
export const ownsGear = (hh: Household, id: GearId) => gearOf(hh).some((a) => a.gear === id);
const home = (hh: Household) => hh.assets.find((a) => a.kind === 'house');

/** How much faster you improve at a hobby with your gear and home setup (best one counts). */
export function practiceBoost(s: GameState, p: Person, hobby: Hobby): number {
  if (hobby === 'sports') return sportBoost(s, p);
  const hh = s.households[p.householdId];
  let best = 1;
  for (const a of gearOf(hh)) if (a.gear && GEAR[a.gear].hobby === hobby) best = Math.max(best, GEAR[a.gear].boost);
  const hb = HOME_BOOST[hobby];
  if (hb && home(hh)?.upgrades?.includes(hb.upgrade)) best = Math.max(best, hb.boost);
  return best;
}

/** Cost of one practice block (owning a plane makes flying hours much cheaper). */
export function practiceCostPerBlock(s: GameState, p: Person): number {
  if (!p.hobby) return 0;
  if (p.hobby === 'flying' && ownsGear(s.households[p.householdId], 'plane')) return 120;
  if (p.hobby === 'sports' && p.sport) return SPORTS[p.sport].cost;
  return HOBBY_BY_ID[p.hobby].cost;
}

export const isCoastal = (city: string) => (COASTAL as readonly string[]).includes(city);

// ── Taking up a hobby ────────────────────────────────────────────────

export function hobbyBlocker(s: GameState, hobby: Hobby): string | null {
  const me = active(s);
  if (s.phase !== 'PLANNING') return 'Decided while planning.';
  if (me.hobby === hobby) return 'Already your hobby.';
  const def = HOBBY_BY_ID[hobby];
  if (!def) return 'Unknown hobby.';
  return ageOf(me, s.year) < def.minAge ? `From age ${def.minAge}.` : null;
}

/** Take up (or switch to) a hobby. Skill in earlier hobbies is kept. */
export function takeUpHobby(state: GameState, hobby: Hobby): GameState {
  if (hobbyBlocker(state, hobby)) return state;
  const s: GameState = structuredClone(state);
  const me = active(s);
  me.hobby = hobby;
  me.skills[hobby] = me.skills[hobby] ?? 0;
  journal(s, `You took up ${HOBBY_BY_ID[hobby].label.toLowerCase()}.`, 'info');
  return s;
}

// ── Gear ─────────────────────────────────────────────────────────────

export function makeGear(s: GameState, id: GearId): Asset {
  const g = GEAR[id];
  return { id: newId(s, 'a'), kind: 'gear', gear: id, name: g.label, value: g.price, upkeep: g.upkeep, mortgage: 0, restore: id === 'project_car' ? 0 : undefined };
}

/** Why gear can't be bought now, or null. */
export function gearBlocker(s: GameState, id: GearId, parkingFree: number): string | null {
  const me = active(s);
  const hh = s.households[me.householdId];
  if (s.phase !== 'PLANNING') return 'Decided while planning.';
  if (ageOf(me, s.year) < 18) return 'You need to be an adult.';
  if (!unlockedTabs(s).includes('money')) return 'Opens with the Money tab.';
  const g = GEAR[id];
  if (g.coastal && !isCoastal(cityOfHousehold(hh))) return 'Offshore boats need a coastal city.';
  if (g.parks && parkingFree <= 0) return 'No parking spot free.';
  return hh.wallet < g.price ? `Costs ${money(g.price)}.` : null;
}

/** Restoration progress on a project car: value climbs toward a restored classic. */
export function restoreProgress(car: Asset, amount: number) {
  car.restore = clamp((car.restore ?? 0) + amount, 0, 100);
  car.value = Math.round(GEAR.project_car.price + (RESTORED_VALUE - GEAR.project_car.price) * Math.pow((car.restore ?? 0) / 100, 1.3));
  if (car.restore >= 100) car.name = 'Restored classic car';
}

/** Yearly: gear loses value (a project car only changes when you work on it). */
export function ageGear(hh: Household) {
  for (const a of gearOf(hh)) {
    if (!a.gear || a.gear === 'project_car') continue;
    a.value = Math.round(a.value * (1 - GEAR[a.gear].depreciation));
  }
}

// ── Careers built on hobbies ─────────────────────────────────────────

/** Own businesses (and charters) have income that swings with skill and luck. */
export const isBusiness = (c: Career) => !!c.variance;
/** Can this career promote you further? (Flat-pay businesses can't.) */
export const hasLadder = (c: Career) => !c.levelPay || c.levelPay[0] !== c.levelPay[2];

/** Skill needed for the next promotion in this career (0 if none). */
export function promoSkillFor(c: Career, level: number) {
  return c.promoSkill && level < 3 ? c.promoSkill[level - 1] : 0;
}

/** Why `p` couldn't take this job beyond `qualifies` (gear, startup money), or null. */
export function jobExtraBlocker(s: GameState, p: Person, c: Career): string | null {
  const hh = s.households[p.householdId];
  if (c.needsGear && !ownsGear(hh, c.needsGear)) return `Needs your own ${GEAR[c.needsGear].label.toLowerCase()}`;
  if (c.formerPro && !p.flags.former_pro) return 'Only for former pro athletes';
  if (c.startup && hh.wallet < c.startup) return `Needs ${money(c.startup)} to start`;
  return null;
}

/**
 * Yearly results for own businesses and charters (with an rng: real swings), plus the toll of
 * touring on family. Called once per household from the economy.
 */
export function hobbyCareerYear(s: GameState, hh: Household, rng: Rng) {
  const me = active(s);
  const people = membersOf(s, hh.id);
  for (const p of people) {
    const c = p.jobId ? CAREER_BY_ID[p.jobId] : undefined;
    if (!c) continue;
    if (c.needsGear && !ownsGear(hh, c.needsGear)) {
      p.jobId = undefined;
      if (p.id === me.id) journal(s, `Without a ${GEAR[c.needsGear].label.toLowerCase()}, you had to stop working as a ${c.name.toLowerCase()}.`, 'bad');
      continue;
    }
    if (c.variance) {
      const skill = c.skill ? p.skills[c.skill] ?? 0 : 50;
      const swing = (rng.next() * 2 - 1) * c.variance + (skill - 75) / 100;
      const delta = Math.round(c.salary * swing);
      hh.wallet += delta;
      if (p.id === me.id && Math.abs(delta) >= 5000) {
        journal(s, delta > 0 ? `A great year for your business: ${money(delta)} more than usual.` : `A tough year for your business: ${money(-delta)} less than usual.`, delta > 0 ? 'good' : 'bad');
      }
    }
    if (c.touring && p.jobLevel >= 2) {
      stat(p, 'stress', 4);
      for (const o of people) if (o.id !== p.id) adjustBond(s, p.id, o.id, -4, -2);
      if (p.id === me.id) journal(s, 'Months on the road again. Home feels a little farther each time.', 'info');
    }
  }
}

/** When an estate is settled, the gear goes to one heir (you, if you're one of them). */
export function passDownGear(s: GameState, from: Household, heirs: Person[]) {
  const gear = gearOf(from);
  if (!gear.length || !heirs.length) return;
  const me = active(s);
  const heir = heirs.find((h) => h.id === me.id) ?? heirs[0];
  const to = s.households[heir.householdId];
  to.assets.push(...gear);
  from.assets = from.assets.filter((a) => a.kind !== 'gear');
  if (heir.id === me.id) journal(s, `You inherited the family's ${gear.map((g) => g.name.toLowerCase()).join(' and ')}.`, 'good');
}

/** Skill gained per practice block (before diminishing returns), with gear and setup. */
export const practiceGain = (s: GameState, p: Person) => (p.hobby ? 4 * practiceBoost(s, p, p.hobby) : 0);
