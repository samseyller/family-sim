import { retirePerson } from './retirement';
import { ESTATE_EXEMPTION, ESTATE_TAX_RATE } from '../content/economy';
import { makeHousehold } from './generate';
import { headOf, moverGroup, splitOff } from './household';
import { otherCity } from './location';
import { admissionGpa, enroll } from './school';
import type { Rng } from './rng';
import type { GameState, Person } from './types';
import {
  active, activePartnership, adjustBond, ageOf, alive, childrenOf, clamp, fullName, getBond,
  journal, membersOf, money, newId, partnerOf, stat,
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
  into.investments = (into.investments ?? 0) + (from.investments ?? 0);
  from.investments = 0;
  from.assets = [];
  into.dogs = [...(into.dogs ?? []), ...(from.dogs ?? [])];
  from.dogs = [];
  from.settled = true;
  for (const p of Object.values(s.people)) if (p.householdId === fromId) p.householdId = intoId;
}

const between = (s: GameState, a: string, b: string) =>
  [...s.partnerships].reverse().find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));

/** Start dating. Each keeps their own household and money until marriage. */
export function startDating(s: GameState, a: Person, b: Person) {
  // Count each new person someone dates (getting back together doesn't count twice).
  if (!between(s, a.id, b.id)) for (const p of [a, b]) p.flags.dated = (p.flags.dated ?? 0) + 1;
  s.partnerships.push({ id: newId(s, 'r'), a: a.id, b: b.id, status: 'dating', startYear: s.year, merged: false });
  adjustBond(s, a.id, b.id, 35, 20);
}

/**
 * Marry two people; `b` moves into `a`'s household and finances merge exactly once.
 * An existing dating relationship is upgraded rather than duplicated.
 */
export function marry(s: GameState, a: Person, b: Person) {
  let ps = between(s, a.id, b.id);
  if (ps && ps.status === 'dating') {
    ps.status = 'married';
    ps.startYear = s.year;
    adjustBond(s, a.id, b.id, 10, 10);
  } else {
    ps = { id: newId(s, 'r'), a: a.id, b: b.id, status: 'married', startYear: s.year, merged: false };
    s.partnerships.push(ps);
    adjustBond(s, a.id, b.id, 45, 35);
  }
  if (!ps.merged) {
    mergeHouseholds(s, b.householdId, a.householdId);
    ps.merged = true;
  }
}

/** End a dating relationship. */
export function breakUp(s: GameState, a: Person, b: Person) {
  const ps = between(s, a.id, b.id);
  if (ps && ps.status === 'dating') {
    ps.status = 'ended';
    ps.endYear = s.year;
  }
  adjustBond(s, a.id, b.id, -15, -10);
}

/** A married couple separates: `b` moves out with half the savings. Divorce is decided later. */
export function separate(s: GameState, a: Person, b: Person) {
  const ps = activePartnership(s, a.id);
  if (ps) ps.status = 'separated';
  const old = s.households[a.householdId];
  const half = Math.max(0, Math.round(old.wallet / 2));
  old.wallet -= half;
  const halfInv = Math.round((old.investments ?? 0) / 2);
  old.investments = (old.investments ?? 0) - halfInv;
  const hh = makeHousehold(s, half, old.city);
  hh.investments = halfInv;
  hh.headId = b.id;
  b.householdId = hh.id;
  b.stake = half + halfInv;
  if (old.headId === b.id) old.headId = a.id;
  adjustBond(s, a.id, b.id, -20, -15);
}

export function separatedFrom(s: GameState, id: string): Person | undefined {
  const ps = [...s.partnerships].reverse().find((x) => (x.a === id || x.b === id) && x.status === 'separated');
  if (!ps) return undefined;
  const other = s.people[ps.a === id ? ps.b : ps.a];
  return other && alive(other) ? other : undefined;
}

/** Equity owed to an ex at divorce: half of the home's value minus the mortgage. */
export function homeEquityShare(s: GameState, p: Person) {
  const house = s.households[p.householdId].assets.find((x) => x.kind === 'house');
  return house ? Math.max(0, Math.round((house.value - house.mortgage) / 2)) : 0;
}

/** Finalize a divorce. The ex is paid half the home equity in cash. */
export function divorce(s: GameState, a: Person, b: Person) {
  const ps = between(s, a.id, b.id);
  if (ps) {
    ps.status = 'divorced';
    ps.endYear = s.year;
  }
  const share = homeEquityShare(s, a);
  s.households[a.householdId].wallet -= share;
  s.households[b.householdId].wallet += share;
  return share;
}

/** Get back together: the ex moves home and their household merges back in. */
export function reconcile(s: GameState, a: Person, b: Person) {
  const ps = between(s, a.id, b.id);
  if (ps) ps.status = 'married';
  mergeHouseholds(s, b.householdId, a.householdId);
  adjustBond(s, a.id, b.id, 20, 15);
}

/**
 * Someone leaves home with their own savings plus `gift` (already taken from wherever it
 * came from). Their partner and minor children in the same home go with them.
 */
export function moveOut(s: GameState, p: Person, gift: number) {
  const hh = splitOff(s, moverGroup(s, p), 0, 0);
  hh.wallet += gift;
  for (const m of membersOf(s, hh.id)) if (ageOf(m, s.year) >= 18) m.stake = Math.max(1, (m.stake ?? 0) + gift / Math.max(1, membersOf(s, hh.id).length));
}

/** Stop working; the employer pension is set from years of service (reduced if before 65). */
export function retire(p: Person, year: number) {
  retirePerson(p, year);
}

export function die(s: GameState, p: Person, cause: string) {
  if (!alive(p)) return;
  p.deathYear = s.year;
  p.deathCause = cause;
  // Their claim on the household savings passes to whoever carries the household on.
  if ((p.stake ?? 0) > 0) {
    const pt = partnerOf(s, p.id);
    const heir = pt && pt.householdId === p.householdId ? pt : headOf(s, p.householdId);
    if (heir && heir.id !== p.id) heir.stake = (heir.stake ?? 0) + p.stake!;
    p.stake = 0;
  }
  // Their retirement savings pass to the household (and on through the estate).
  if ((p.retirementSavings ?? 0) > 0) {
    s.households[p.householdId].wallet += p.retirementSavings!;
    p.retirementSavings = 0;
  }
  const ps = activePartnership(s, p.id);
  if (ps) {
    // Only spouses are widowed (and can carry the story on); dating simply ends.
    ps.status = ps.status === 'married' ? 'widowed' : 'ended';
    ps.endYear = s.year;
  }
  if (isCloseKin(s, p)) {
    const who = p.id === s.activeId ? 'You' : fullName(p);
    journal(s, `${who} passed away at age ${ageOf(p, s.year)} (${cause}).`, 'death');
  } else if ((s.friends ?? []).some((f) => f.id === p.id && f.of === s.activeId)) {
    const me = s.people[s.activeId];
    journal(s, `Your friend ${fullName(p)} passed away at age ${ageOf(p, s.year)}.`, 'death');
    if (me && alive(me)) stat(me, 'happiness', getBond(s, me.id, p.id).affinity >= 40 ? -10 : -4);
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
    const estate = hh.wallet + (hh.investments ?? 0) + hh.assets.reduce((sum, a) => sum + a.value - a.mortgage, 0);
    const heirs = new Map<string, Person>();
    for (const d of everyone) for (const c of childrenOf(s, d.id)) if (alive(c) && c.householdId !== hh.id) heirs.set(c.id, c);
    hh.settled = true;
    hh.wallet = 0;
    hh.investments = 0;
    hh.assets = [];
    if (!heirs.size || estate <= 0) continue;
    const tax = estateTax(estate);
    if (tax && [...heirs.values()].some((h) => isCloseKin(s, h))) journal(s, `Estate tax took ${money(tax)} of the inheritance.`, 'info');
    const share = Math.round((estate - tax) / heirs.size);
    for (const h of heirs.values()) {
      s.households[h.householdId].wallet += share;
      if (isCloseKin(s, h)) journal(s, `${h.id === s.activeId ? 'You' : fullName(h)} inherited ${money(share)}.`, 'good');
    }
  }
}

export type LifePath = 'top_university' | 'university' | 'trade' | 'passion';

/** What a young adult would pick on their own: grades and smarts point the way. */
export function preferredPath(p: Person): LifePath {
  const skill = p.hobby ? p.skills[p.hobby] ?? 0 : 0;
  if (skill >= 55 && (p.traits.includes('creative') || p.traits.includes('athletic') || skill >= 70)) return 'passion';
  if (admissionGpa(p) >= 3.5 && p.stats.smarts >= 66) return 'top_university';
  if (p.stats.smarts >= 58 || admissionGpa(p) >= 3.0) return 'university';
  return 'trade';
}

/**
 * Start a path. University paths go through admissions (and can fall back to state
 * university or trade school); returns a description of where they ended up.
 */
export function startPath(s: GameState, p: Person, path: LifePath, rng?: Rng): string {
  p.flags.came_of_age = 1;
  if ((path === 'top_university' || path === 'university') && rng) {
    return enroll(s, rng, p, path === 'top_university' ? 'top' : 'state', s.households[p.householdId]).note;
  }
  if (path === 'top_university') {
    p.studyingUntil = s.year + 4;
    p.studyKind = 'top';
  } else if (path === 'university') {
    p.studyingUntil = s.year + 4;
    p.studyKind = 'university';
  } else if (path === 'trade') {
    p.studyingUntil = s.year + 2;
    p.studyKind = 'trade';
  } else {
    p.flags.passion = 1;
  }
  return path === 'trade' ? 'trade school' : path === 'passion' ? `a life in ${p.hobby ?? 'their passion'}` : path === 'top_university' ? 'a top university' : 'university';
}

/** Coming of age for children nobody is actively parenting (NPC branches). */
export function autoComeOfAge(s: GameState, rng: Rng, p: Person, leaveHome: boolean) {
  startPath(s, p, preferredPath(p), rng);
  if (leaveHome) {
    moveOut(s, p, rng.int(0, 3000));
    // Some young adults move away for school or work.
    if (rng.chance(0.3)) s.households[p.householdId].city = otherCity(rng, s.households[p.householdId].city);
  }
}

export function partnerInHome(s: GameState, p: Person) {
  const pt = partnerOf(s, p.id);
  return pt && pt.householdId === p.householdId ? pt : undefined;
}

export const householdOf = (s: GameState, p: Person) => s.households[p.householdId];
export const householdSize = (s: GameState, p: Person) => membersOf(s, p.householdId).length;

/** Tax on the part of an estate above the exemption. */
export const estateTax = (estate: number) => Math.round(Math.max(0, estate - ESTATE_EXEMPTION) * ESTATE_TAX_RATE);
