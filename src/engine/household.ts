/**
 * Who runs a household, who owns what share of its savings, and the moves between
 * households the player can make: moving out, taking charge of the family home,
 * helping parents into a place of their own, asking grown children to leave, and
 * inviting family to live with you.
 *
 * Money model: everyone's earnings go into one shared pot (wallet + investments).
 * Each adult's `stake` grows with what they bring in (pay, pensions, savings
 * draw-downs), so when someone leaves, their fair share of the pot is
 * stake / total stake. The home itself stays with whoever runs the household.
 */
import { BUY_COSTS, HOMES, MOVING_COST, RENTALS, SELL_COSTS, type HomeTier, type RentTier } from '../content/finance';
import { makeHousehold } from './generate';
import { makeHome } from './finance';
import { cityOfHousehold, homePriceIn } from './location';
import type { CityId } from '../content/cities';
import { unlockedTabs } from './tutorial';
import type { GameState, Household, Person } from './types';
import {
  active, adjustBond, ageOf, alive, childrenOf, fullName, getBond, journal, membersOf, money, parentsOf, partnerOf, stat,
} from './util';

/** Parents at this age or older can be asked to let you take over, or to move. */
export const ELDERLY_AGE = 70;
/** How close a relationship must be (affinity) before someone will move in with you. */
export const INVITE_AFFINITY = 25;
/** Share of last year's stake kept each year before new contributions are added (recent pay counts most). */
export const STAKE_KEEP = 0.9;

const isAdultIn = (s: GameState, p: Person) => ageOf(p, s.year) >= 18;
const oldestFirst = (a: Person, b: Person) => a.birthYear - b.birthYear;

/** The person who runs the household: the recorded head, else their partner there, else the oldest adult. */
export function headOf(s: GameState, householdId: string): Person | undefined {
  const hh = s.households[householdId];
  const mem = membersOf(s, householdId);
  if (!hh || !mem.length) return undefined;
  const recorded = hh.headId ? s.people[hh.headId] : undefined;
  if (recorded && alive(recorded) && recorded.householdId === householdId) return recorded;
  if (recorded) {
    const pt = partnerOf(s, recorded.id);
    if (pt && pt.householdId === householdId) return pt;
  }
  const adults = mem.filter((p) => isAdultIn(s, p)).sort(oldestFirst);
  return adults[0] ?? [...mem].sort(oldestFirst)[0];
}

/** True if `p` (or their partner) runs the household they live in. */
export function runsHousehold(s: GameState, p: Person) {
  const head = headOf(s, p.householdId);
  if (!head) return false;
  if (head.id === p.id) return true;
  return partnerOf(s, p.id)?.id === head.id;
}

const isChildOf = (kid: Person, ...parents: (Person | undefined)[]) =>
  parents.some((par) => par && (kid.biologicalParents.includes(par.id) || kid.adoptiveParents.includes(par.id)));

/**
 * Who leaves with `p`: their partner if they live together, and every minor child of
 * either of them in the household, plus anyone listed in `extra`.
 */
export function moverGroup(s: GameState, p: Person, extra: string[] = []): Person[] {
  const pt = partnerOf(s, p.id);
  const partner = pt && pt.householdId === p.householdId ? pt : undefined;
  const group = new Map<string, Person>([[p.id, p]]);
  if (partner) group.set(partner.id, partner);
  for (const m of membersOf(s, p.householdId)) {
    if (!isAdultIn(s, m) && isChildOf(m, p, partner)) group.set(m.id, m);
  }
  for (const id of extra) {
    const x = s.people[id];
    if (x && alive(x) && x.householdId === p.householdId) {
      for (const y of moverGroup(s, x)) group.set(y.id, y);
    }
  }
  return [...group.values()];
}

/** Give a household's adults their starting stakes (equal shares of what it already has). */
export function seedStakes(s: GameState, householdId: string) {
  const hh = s.households[householdId];
  const adults = membersOf(s, householdId).filter((p) => isAdultIn(s, p));
  if (!hh || !adults.length || adults.some((p) => (p.stake ?? 0) > 0)) return;
  const each = Math.max(1, wealthOf(hh)) / adults.length;
  for (const p of adults) p.stake = Math.round(each);
}

const wealthOf = (hh: Household) => Math.max(0, hh.wallet) + Math.max(0, hh.investments ?? 0);

/** The share (0–1) of the household's savings that belongs to `group`. */
export function shareOf(s: GameState, householdId: string, group: Person[]): number {
  const adults = membersOf(s, householdId).filter((p) => isAdultIn(s, p));
  const ids = new Set(group.map((p) => p.id));
  const total = adults.reduce((sum, p) => sum + Math.max(0, p.stake ?? 0), 0);
  if (total <= 0) {
    // Nothing recorded yet: split equally between the adults.
    const mine = adults.filter((p) => ids.has(p.id)).length;
    return adults.length ? mine / adults.length : 0;
  }
  const mine = adults.filter((p) => ids.has(p.id)).reduce((sum, p) => sum + Math.max(0, p.stake ?? 0), 0);
  return mine / total;
}

/** The money a group would take as its fair share. */
export function shareAmounts(s: GameState, householdId: string, group: Person[]) {
  const hh = s.households[householdId];
  const f = shareOf(s, householdId, group);
  return { fraction: f, cash: Math.round(Math.max(0, hh.wallet) * f), invest: Math.round(Math.max(0, hh.investments ?? 0) * f) };
}

const rentTierFor = (n: number): RentTier =>
  (Object.keys(RENTALS) as RentTier[]).find((t) => RENTALS[t].capacity >= n) ?? 'house';

/**
 * Move `group` into a new household with `cash` and `invest` taken from the old one.
 * Adults' personal savings (`fund`) come along; children keep their college funds.
 * The first person in the group runs the new household.
 */
export function splitOff(s: GameState, group: Person[], cash: number, invest: number): Household {
  const from = s.households[group[0].householdId];
  from.wallet -= cash;
  from.investments = Math.max(0, (from.investments ?? 0) - invest);
  const adults = group.filter((p) => isAdultIn(s, p));
  const savings = adults.reduce((sum, p) => sum + Math.max(0, p.fund), 0);
  const hh = makeHousehold(s, cash + savings, from.city); // a move within the same city
  hh.investments = invest;
  hh.headId = group[0].id;
  hh.rentTier = rentTierFor(group.length);
  // Stakes in the new home: what they brought, split by their old stakes (or equally).
  const old = adults.reduce((sum, p) => sum + Math.max(0, p.stake ?? 0), 0);
  for (const p of adults) {
    const w = old > 0 ? Math.max(0, p.stake ?? 0) / old : 1 / adults.length;
    p.stake = Math.round(Math.max(1, cash + invest + savings) * w);
    p.fund = 0;
  }
  for (const p of group) p.householdId = hh.id;
  // Dogs go with their owner.
  const ids = new Set(group.map((p) => p.id));
  const going = (from.dogs ?? []).filter((d) => d.deathYear === undefined && d.ownerId && ids.has(d.ownerId));
  if (going.length) {
    hh.dogs = going;
    from.dogs = (from.dogs ?? []).filter((d) => !going.includes(d));
  }
  // Cats too.
  const cats = (from.cats ?? []).filter((c) => c.deathYear === undefined && c.ownerId && ids.has(c.ownerId));
  if (cats.length) {
    hh.cats = cats;
    from.cats = (from.cats ?? []).filter((c) => !cats.includes(c));
  }
  if (from.headId && group.some((p) => p.id === from.headId)) from.headId = undefined;
  return hh;
}

// ── Player actions ───────────────────────────────────────────────────

export type HouseholdAction =
  /** Leave the household you don't run. Partner and minor kids come; listed adult kids too. */
  | { kind: 'moveOut'; bring: string[]; take: 'share' | 'savings' }
  /** Become the one who runs your parents' household. */
  | { kind: 'takeCharge' }
  /** Your parents (living with you, in a home you run) move to their own place, bought or rented. */
  | { kind: 'parentsOut'; buy: HomeTier | null }
  /** A grown child (with their partner and kids) leaves, with a gift or their share. */
  | { kind: 'askToLeave'; personId: string; gift: number | 'share' }
  /** A grown child or parent, and everyone in their home, moves in with you. */
  | { kind: 'invite'; personId: string };

const myPartner = (s: GameState) => partnerOf(s, active(s).id);
const parentsHere = (s: GameState) => {
  const me = active(s);
  const pt = myPartner(s);
  const ids = new Set<string>();
  const out: Person[] = [];
  for (const par of [...parentsOf(s, me), ...(pt ? parentsOf(s, pt) : [])]) {
    if (alive(par) && par.householdId === me.householdId && !ids.has(par.id)) {
      ids.add(par.id);
      out.push(par);
    }
  }
  return out;
};
const adultKidsHere = (s: GameState) => {
  const me = active(s);
  const pt = myPartner(s);
  return membersOf(s, me.householdId).filter((m) => m.id !== me.id && m.id !== pt?.id && isAdultIn(s, m) && isChildOf(m, me, pt));
};

/** Who you could invite to live with you (alive, grown, not already here). */
export function invitable(s: GameState): Person[] {
  const me = active(s);
  const pt = myPartner(s);
  const pool = new Map<string, Person>();
  for (const base of [me, pt]) {
    if (!base) continue;
    for (const c of childrenOf(s, base.id)) pool.set(c.id, c);
    for (const par of parentsOf(s, base)) pool.set(par.id, par);
  }
  return [...pool.values()].filter((p) => alive(p) && p.householdId !== me.householdId && isAdultIn(s, p) && p.id !== pt?.id);
}

/** Cash to buy a home outright in a city (price plus closing costs). */
export const homeUpfrontCash = (tier: HomeTier, city: CityId) => Math.round(homePriceIn(tier, city) * (1 + BUY_COSTS));

/** What the household tab shows about your place in the household. */
export function householdView(s: GameState) {
  const me = active(s);
  const head = headOf(s, me.householdId);
  const runs = runsHousehold(s, me);
  const parents = parentsHere(s);
  const elderly = parents.filter((p) => ageOf(p, s.year) >= ELDERLY_AGE);
  const mine = moverGroup(s, me);
  return { head, runs, parents, elderly, adultKids: adultKidsHere(s), myShare: shareAmounts(s, me.householdId, mine), group: mine };
}

/** Preview of a move-out: who goes, and what money goes with them. */
export function moveOutPreview(s: GameState, bring: string[]) {
  const me = active(s);
  const group = moverGroup(s, me, bring);
  const share = shareAmounts(s, me.householdId, group);
  const savings = group.filter((p) => isAdultIn(s, p)).reduce((sum, p) => sum + Math.max(0, p.fund), 0);
  return { group, share, savings };
}

/** Why the action can't happen now, or null. */
export function householdBlocker(s: GameState, a: HouseholdAction): string | null {
  if (s.phase !== 'PLANNING') return 'Household changes are made while planning.';
  const me = active(s);
  if (ageOf(me, s.year) < 18) return 'You are too young to decide this.';
  if (!unlockedTabs(s).includes('money')) return 'Household decisions open with the Money tab.';
  const hh = s.households[me.householdId];
  const runs = runsHousehold(s, me);
  switch (a.kind) {
    case 'moveOut': {
      if (runs) return 'This is your household. To live somewhere else, rent or buy in the Home section.';
      const kids = adultKidsHere(s).map((k) => k.id);
      if (a.bring.some((id) => !kids.includes(id))) return 'Only your grown children here can come with you.';
      return null;
    }
    case 'takeCharge': {
      if (runs) return 'You already run this household.';
      const head = headOf(s, me.householdId);
      if (!head || !parentsHere(s).some((p) => p.id === head.id)) return 'Only a household your parents run can be taken over.';
      const elderly = parentsHere(s).some((p) => ageOf(p, s.year) >= ELDERLY_AGE);
      const share = shareOf(s, me.householdId, moverGroup(s, me));
      if (!elderly && share < 0.5) return `Possible once a parent is ${ELDERLY_AGE}+, or once you've put in most of the household's money.`;
      return null;
    }
    case 'parentsOut': {
      if (!runs) return 'You need to run the household first.';
      if (!parentsHere(s).length) return 'No parents live with you.';
      if (a.buy && hh.wallet < homeUpfrontCash(a.buy, cityOfHousehold(hh))) return `Needs ${money(homeUpfrontCash(a.buy, cityOfHousehold(hh)))} in cash.`;
      return null;
    }
    case 'askToLeave': {
      if (!runs) return 'Only the people who run the household can ask someone to leave.';
      if (!adultKidsHere(s).some((k) => k.id === a.personId)) return 'They are not a grown child living with you.';
      if (typeof a.gift === 'number' && a.gift > Math.max(0, hh.wallet)) return 'Not enough cash for that gift.';
      return null;
    }
    case 'invite': {
      if (!runs) return 'You can invite people once you run your own household.';
      const p = invitable(s).find((x) => x.id === a.personId);
      if (!p) return 'They can’t move in.';
      const aff = getBond(s, me.id, p.id).affinity;
      if (aff < INVITE_AFFINITY) return `You aren’t close enough (relationship ${Math.round(aff)}; needs ${INVITE_AFFINITY}).`;
      return null;
    }
  }
}

const names = (ps: Person[]) => {
  const n = ps.map((p) => p.firstName);
  return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
};

/** Apply a household action. Returns the same state if it isn't allowed. */
export function householdAction(state: GameState, a: HouseholdAction): GameState {
  if (householdBlocker(state, a)) return state;
  const s: GameState = structuredClone(state);
  const me = active(s);
  const hh = s.households[me.householdId];
  switch (a.kind) {
    case 'moveOut': {
      const group = moverGroup(s, me, a.bring);
      const stayers = membersOf(s, hh.id).filter((p) => !group.includes(p));
      const take = a.take === 'share' ? shareAmounts(s, hh.id, group) : { cash: 0, invest: 0 };
      splitOff(s, group, take.cash, take.invest);
      s.households[me.householdId].wallet -= MOVING_COST;
      for (const p of stayers) {
        if (!isAdultIn(s, p)) continue;
        if (a.take === 'savings') adjustBond(s, me.id, p.id, 4, 3);
      }
      const others = group.filter((p) => p.id !== me.id);
      const moneyNote = take.cash + take.invest > 0 ? `, taking your share of the savings (${money(take.cash + take.invest)})` : '';
      journal(s, `You moved out${others.length ? ` with ${names(others)}` : ''}${moneyNote}.`, 'major');
      break;
    }
    case 'takeCharge': {
      const head = headOf(s, hh.id)!;
      hh.headId = me.id;
      adjustBond(s, me.id, head.id, ageOf(head, s.year) >= ELDERLY_AGE ? 2 : -3, 0);
      journal(s, `You took over running the household from ${head.firstName}.`, 'major');
      break;
    }
    case 'parentsOut': {
      const parents = parentsHere(s);
      // Parents bring each other and any of their own minor children (your younger siblings).
      const group = moverGroup(s, parents[0], parents.slice(1).map((p) => p.id));
      const take = shareAmounts(s, hh.id, group);
      if (a.buy) {
        const cost = homeUpfrontCash(a.buy, cityOfHousehold(hh));
        hh.wallet -= cost;
      }
      const theirs = splitOff(s, group, take.cash, take.invest);
      if (a.buy) {
        const h = HOMES[a.buy];
        theirs.assets.push(makeHome(s, a.buy, cityOfHousehold(theirs), 1));
        theirs.rentTier = undefined;
        for (const p of group) {
          stat(p, 'happiness', 8);
          adjustBond(s, me.id, p.id, 10, 6);
        }
        journal(s, `You bought ${names(parents)} a ${h.label.toLowerCase()} of their own.`, 'major');
      } else {
        for (const p of group) {
          stat(p, 'happiness', -10);
          adjustBond(s, me.id, p.id, -20, -12);
        }
        journal(s, `${names(parents)} moved out to a place of their own${take.cash + take.invest ? ` with their share (${money(take.cash + take.invest)})` : ''}.`, 'major');
      }
      break;
    }
    case 'askToLeave': {
      const kid = s.people[a.personId];
      const group = moverGroup(s, kid);
      let cash = 0;
      let invest = 0;
      if (a.gift === 'share') ({ cash, invest } = shareAmounts(s, hh.id, group));
      else cash = a.gift;
      const working = !!kid.jobId || !!kid.studyingUntil;
      const total = cash + invest;
      const hurt = a.gift === 'share' || total >= 15000 ? -2 : total >= 5000 ? -5 : working ? -12 : -20;
      adjustBond(s, me.id, kid.id, hurt, Math.min(0, hurt / 2));
      delete kid.flags.invited_home;
      delete kid.flags.lives_at_home;
      splitOff(s, group, cash, invest);
      const others = group.filter((p) => p.id !== kid.id);
      journal(s, `${kid.firstName}${others.length ? ` and ${names(others)}` : ''} moved out${total ? ` with ${money(total)} from home` : ''}.`, 'info');
      break;
    }
    case 'invite': {
      const target = s.people[a.personId];
      const theirs = s.households[target.householdId];
      const movers = membersOf(s, theirs.id);
      // Their home is sold; the money and cars come along.
      const home = theirs.assets.find((x) => x.kind === 'house');
      if (home) {
        theirs.wallet += Math.round(home.value * (1 - SELL_COSTS) - home.mortgage);
        theirs.assets = theirs.assets.filter((x) => x !== home);
      }
      // Keep stakes comparable: each side's stakes are scaled to what it brings.
      const scale = (ps: Person[], worth: number) => {
        const adults = ps.filter((p) => isAdultIn(s, p));
        const tot = adults.reduce((sum, p) => sum + Math.max(0, p.stake ?? 0), 0);
        for (const p of adults) p.stake = Math.round(Math.max(1, worth) * (tot > 0 ? Math.max(0, p.stake ?? 0) / tot : 1 / adults.length));
      };
      scale(membersOf(s, hh.id), wealthOf(hh));
      scale(movers, wealthOf(theirs));
      hh.wallet += theirs.wallet;
      hh.investments = (hh.investments ?? 0) + (theirs.investments ?? 0);
      hh.assets.push(...theirs.assets);
      theirs.wallet = 0;
      theirs.investments = 0;
      theirs.assets = [];
      hh.dogs = [...(hh.dogs ?? []), ...(theirs.dogs ?? [])];
      theirs.dogs = [];
      hh.cats = [...(hh.cats ?? []), ...(theirs.cats ?? [])];
      theirs.cats = [];
      theirs.settled = true;
      for (const p of movers) {
        p.householdId = hh.id;
        if (isAdultIn(s, p)) {
          p.flags.invited_home = s.year;
          adjustBond(s, me.id, p.id, 6, 4);
        }
      }
      journal(s, `${names(movers)} moved in with you.`, 'major');
      break;
    }
  }
  return s;
}

/** Name for the head line ("You", "You and Sam", or "Mom (Ana Lee)"). */
export function headLabel(s: GameState, head: Person | undefined) {
  if (!head) return 'Nobody';
  const me = active(s);
  if (head.id === me.id) return 'You';
  if (partnerOf(s, me.id)?.id === head.id) return `${head.firstName} (your partner)`;
  if (parentsOf(s, me).some((p) => p.id === head.id)) return `${head.firstName} (your parent)`;
  return fullName(head);
}
