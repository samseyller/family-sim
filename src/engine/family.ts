import { CAREER_BY_ID, salaryOf } from '../content/careers';
import { makeHousehold } from './generate';
import type { Rng } from './rng';
import type { GameState, Person } from './types';
import {
  active, activePartnership, adjustBond, ageOf, alive, childrenOf, clamp, fullName, getBond,
  journal, membersOf, money, newId, partnerOf,
} from './util';

/** Is this person close enough to the player to show up in the journal? */
export function isCloseKin(s: GameState, p: Person) {
  const me = active(s);
  if (p.id === me.id || p.householdId === me.householdId) return true;
  if (p.biologicalParents.includes(me.id) || me.biologicalParents.includes(p.id)) return true;
  return childrenOf(s, me.id).some((c) => p.biologicalParents.includes(c.id));
}

/** How likely a child is to follow a parent's guidance. */
export function receptiveness(s: GameState, parent: Person, child: Person) {
  const b = getBond(s, parent.id, child.id);
  let r = 0.45 + b.trust / 150 + b.affinity / 300;
  if (child.traits.includes('stubborn')) r -= 0.2;
  if (child.traits.includes('easygoing')) r += 0.1;
  const a = ageOf(child, s.year);
  if (a >= 13 && a <= 17) r -= 0.15;
  r -= (child.flags.resents ?? 0) * 0.05;
  return clamp(r, 0.05, 0.95);
}

export const receptivenessLabel = (r: number) => (r >= 0.65 ? 'Listens to you' : r >= 0.4 ? 'Sometimes listens' : 'Rarely listens');

/** Moves `from` household's money/assets into `into`. Marks `from` settled so it never pays out again. */
export function mergeHouseholds(s: GameState, fromId: string, intoId: string) {
  if (fromId === intoId) return;
  const from = s.households[fromId];
  const into = s.households[intoId];
  if (!from || !into || from.settled) return;
  into.wallet += from.wallet;
  into.assets.push(...from.assets);
  from.wallet = 0;
  from.assets = [];
  from.settled = true;
  for (const p of Object.values(s.people)) if (p.householdId === fromId) p.householdId = intoId;
}

/** Marry two people; `b` moves into `a`'s household and finances merge exactly once. */
export function marry(s: GameState, a: Person, b: Person) {
  const ps = { id: newId(s, 'r'), a: a.id, b: b.id, status: 'married' as const, startYear: s.year, merged: false };
  s.partnerships.push(ps);
  adjustBond(s, a.id, b.id, 45, 35);
  mergeHouseholds(s, b.householdId, a.householdId);
  ps.merged = true;
}

export function separate(s: GameState, a: Person, b: Person) {
  const ps = activePartnership(s, a.id);
  if (ps) {
    ps.status = 'divorced';
    ps.endYear = s.year;
  }
  const old = s.households[a.householdId];
  const half = Math.max(0, Math.round(old.wallet / 2));
  old.wallet -= half;
  const hh = makeHousehold(s, half);
  b.householdId = hh.id;
  adjustBond(s, a.id, b.id, -20, -15);
}

/** Adult child leaves home with their fund plus any gift. */
export function moveOut(s: GameState, p: Person, startingMoney: number) {
  const hh = makeHousehold(s, startingMoney);
  p.fund = 0;
  p.householdId = hh.id;
}

export function retire(p: Person) {
  if (p.jobId) p.pension = Math.round(salaryOf(CAREER_BY_ID[p.jobId], p.jobLevel) * 0.4);
  p.jobId = undefined;
  p.retired = true;
}

export function die(s: GameState, p: Person, cause: string) {
  if (!alive(p)) return;
  p.deathYear = s.year;
  p.deathCause = cause;
  const ps = activePartnership(s, p.id);
  if (ps) {
    ps.status = 'widowed';
    ps.endYear = s.year;
  }
  if (isCloseKin(s, p)) {
    const who = p.id === s.activeId ? 'You' : fullName(p);
    journal(s, `${who} passed away at age ${ageOf(p, s.year)} (${cause}).`, 'death');
  }
}

/**
 * When every member of a household has died, its estate is split among the
 * deceased members' living children, exactly once (household.settled).
 */
export function settleEstates(s: GameState) {
  for (const hh of Object.values(s.households)) {
    if (hh.settled) continue;
    const everyone = Object.values(s.people).filter((p) => p.householdId === hh.id);
    if (!everyone.length || everyone.some(alive)) continue;
    const estate = hh.wallet + hh.assets.reduce((sum, a) => sum + a.value - a.mortgage, 0);
    const heirs = new Map<string, Person>();
    for (const d of everyone) for (const c of childrenOf(s, d.id)) if (alive(c) && c.householdId !== hh.id) heirs.set(c.id, c);
    hh.settled = true;
    hh.wallet = 0;
    hh.assets = [];
    if (!heirs.size || estate <= 0) continue;
    const share = Math.round(estate / heirs.size);
    for (const h of heirs.values()) {
      s.households[h.householdId].wallet += share;
      if (isCloseKin(s, h)) journal(s, `${h.id === s.activeId ? 'You' : fullName(h)} inherited ${money(share)}.`, 'good');
    }
  }
}

export type LifePath = 'university' | 'trade' | 'passion';

export function preferredPath(p: Person): LifePath {
  const skill = p.hobby ? p.skills[p.hobby] ?? 0 : 0;
  if (skill >= 55 && (p.traits.includes('creative') || p.traits.includes('athletic') || skill >= 70)) return 'passion';
  if (p.stats.smarts >= 58) return 'university';
  return 'trade';
}

export function startPath(s: GameState, p: Person, path: LifePath) {
  p.flags.came_of_age = 1;
  if (path === 'university') {
    p.studyingUntil = s.year + 4;
    p.studyKind = 'university';
  } else if (path === 'trade') {
    p.studyingUntil = s.year + 2;
    p.studyKind = 'trade';
  } else {
    p.flags.passion = 1;
  }
}

/** Coming of age for children nobody is actively parenting (NPC branches). */
export function autoComeOfAge(s: GameState, rng: Rng, p: Person, leaveHome: boolean) {
  startPath(s, p, preferredPath(p));
  if (leaveHome) moveOut(s, p, p.fund + rng.int(0, 3000));
}

export function partnerInHome(s: GameState, p: Person) {
  const pt = partnerOf(s, p.id);
  return pt && pt.householdId === p.householdId ? pt : undefined;
}

export const householdOf = (s: GameState, p: Person) => s.households[p.householdId];
export const householdSize = (s: GameState, p: Person) => membersOf(s, p.householdId).length;
