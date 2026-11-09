import { describe, expect, it } from 'vitest';
import { newGame } from './generate';
import { autoplayYear, updatePlan } from './phases';
import { strategyPlan } from './strategies';
import {
  ELDERLY_AGE, headOf, householdAction, householdBlocker, householdView, invitable, moveOutPreview, runsHousehold, shareOf,
} from './household';
import { die, moveOut } from './family';
import type { GameState } from './types';
import { active, ageOf, adjustBond, alive, childrenOf, membersOf, parentsOf } from './util';

/** Play a child-start life, always choosing to stay at home, until `age`. */
function stayHomeUntil(seed: number, age: number): GameState {
  let s = newGame(seed, 'child');
  for (let i = 0; i < 80 && ageOf(active(s), s.year) < age; i++) {
    if (s.phase === 'SUCCESSION' || s.phase === 'GAME_OVER') throw new Error('life ended early');
    s = updatePlan(s, strategyPlan(s, 'balanced'));
    s = autoplayYear(s, (pe) => (pe.eventId === 'own_leaving_home' ? 'stay' : pe.eventId === 'leaving_home' ? 'stay' : pe.choices.find((c) => !c.disabled)!.id));
  }
  return s;
}

const wealth = (s: GameState, hid: string) => s.households[hid].wallet + (s.households[hid].investments ?? 0);
const living = (s: GameState) => parentsOf(s, active(s)).filter(alive);

/** Find a seed where both parents are alive and still at home when the player is `age`. */
function withParentsAt(age: number) {
  for (let seed = 1; seed < 60; seed++) {
    try {
      const s = stayHomeUntil(seed, age);
      const me = active(s);
      if (living(s).length && living(s).every((p) => p.householdId === me.householdId)) return s;
    } catch {
      /* try the next seed */
    }
  }
  throw new Error('no seed found');
}

describe('who runs a household', () => {
  it('a grown child living at home does not run it; their parent does', () => {
    const s = withParentsAt(30);
    const me = active(s);
    expect(runsHousehold(s, me)).toBe(false);
    expect(parentsOf(s, me).map((p) => p.id)).toContain(headOf(s, me.householdId)!.id);
  });

  it('an adult start runs their own household', () => {
    const s = newGame(5);
    expect(runsHousehold(s, active(s))).toBe(true);
  });
});

describe('moving out of your parents’ home', () => {
  it('takes your fair share of savings and investments, and your partner and minor kids', () => {
    let s = withParentsAt(30);
    // Give the household a big invested pot (as in a long life at home).
    const hid = active(s).householdId;
    s.households[hid].investments = 2_000_000;
    const me = active(s);
    const share = shareOf(s, hid, [me]);
    expect(share).toBeGreaterThan(0.05); // years of the player's pay count
    // A young child of the player, living at home.
    const kidId = Object.keys(s.people).length + 'k';
    s.people[kidId] = { ...structuredClone(me), id: kidId, firstName: 'Kid', birthYear: s.year - 6, biologicalParents: [me.id], adoptiveParents: [], stake: 0, jobId: undefined, partJobId: undefined, fund: 500 };
    const before = wealth(s, hid);
    const preview = moveOutPreview(s, []);
    expect(preview.group.map((p) => p.id)).toContain(kidId);

    s = householdAction(s, { kind: 'moveOut', bring: [], take: 'share' });
    const me2 = active(s);
    expect(me2.householdId).not.toBe(hid);
    expect(s.people[kidId].householdId).toBe(me2.householdId);
    expect(s.people[kidId].fund).toBe(500); // college fund stays the child's
    const mine = s.households[me2.householdId];
    expect(mine.investments).toBeCloseTo(2_000_000 * preview.share.fraction, -2);
    expect(runsHousehold(s, me2)).toBe(true);
    // Money is conserved (apart from the moving cost).
    expect(wealth(s, hid) + mine.investments! + mine.wallet).toBeCloseTo(before + preview.savings - 2000, -1);
  });

  it('leaving the savings behind takes only your own savings and warms the relationship', () => {
    let s = withParentsAt(30);
    const hid = active(s).householdId;
    s.households[hid].investments = 500_000;
    const parent = living(s)[0];
    const bond = (x: GameState) => x.bonds[[active(x).id, parent.id].sort().join('|')]?.affinity ?? 0;
    const b0 = bond(s);
    s = householdAction(s, { kind: 'moveOut', bring: [], take: 'savings' });
    expect(s.households[active(s).householdId].investments).toBe(0);
    expect(s.households[hid].investments).toBe(500_000);
    expect(bond(s)).toBeGreaterThanOrEqual(b0);
  });

  it('can bring grown children along when you choose to', () => {
    let s = withParentsAt(30);
    const me = active(s);
    const kidId = 'adultkid';
    s.people[kidId] = { ...structuredClone(me), id: kidId, firstName: 'Grown', birthYear: s.year - 19, biologicalParents: [me.id], adoptiveParents: [], stake: 0 };
    expect(householdView(s).adultKids.map((k) => k.id)).toContain(kidId);
    s = householdAction(s, { kind: 'moveOut', bring: [kidId], take: 'share' });
    expect(s.people[kidId].householdId).toBe(active(s).householdId);
  });
});

describe('taking charge and housing your parents', () => {
  it('needs an elderly parent or most of the money', () => {
    const s = withParentsAt(30);
    const me = active(s);
    for (const p of living(s)) p.birthYear = s.year - 60;
    for (const p of membersOf(s, me.householdId)) p.stake = p.id === me.id ? 1 : 100;
    expect(householdBlocker(s, { kind: 'takeCharge' })).toMatch(/70/);
    living(s)[0].birthYear = s.year - ELDERLY_AGE;
    expect(householdBlocker(s, { kind: 'takeCharge' })).toBeNull();
  });

  it('take charge, then buy your parents a home of their own', () => {
    let s = withParentsAt(30);
    for (const p of living(s)) p.birthYear = s.year - 75;
    const hid = active(s).householdId;
    s.households[hid].wallet = 400_000;
    s = householdAction(s, { kind: 'takeCharge' });
    expect(runsHousehold(s, active(s))).toBe(true);
    const parents = living(s);
    s = householdAction(s, { kind: 'parentsOut', buy: 'starter' });
    const theirs = s.households[s.people[parents[0].id].householdId];
    expect(theirs.id).not.toBe(hid);
    expect(theirs.assets.some((a) => a.kind === 'house' && a.mortgage === 0)).toBe(true);
    expect(parents.every((p) => s.people[p.id].householdId === theirs.id)).toBe(true);
    expect(active(s).householdId).toBe(hid); // you keep the family home
  });
});

describe('grown children', () => {
  function parentWithGrownKid() {
    for (let seed = 1; seed < 40; seed++) {
      let s = newGame(seed);
      for (let i = 0; i < 20; i++) {
        s = updatePlan(s, strategyPlan(s, 'balanced'));
        s = autoplayYear(s, (pe) => (pe.eventId === 'leaving_home' ? 'stay' : pe.choices.find((c) => !c.disabled)!.id));
        if (s.phase !== 'PLANNING') break;
        const me = active(s);
        const grown = childrenOf(s, me.id).find((k) => alive(k) && k.householdId === me.householdId && ageOf(k, s.year) >= 18);
        if (grown) return { s, kid: grown };
      }
    }
    throw new Error('no grown kid at home');
  }

  it('can be asked to leave (with or without money) and invited back when close', () => {
    let { s, kid } = parentWithGrownKid();
    const me = active(s);
    const cash = s.households[me.householdId].wallet;
    s = householdAction(s, { kind: 'askToLeave', personId: kid.id, gift: 5000 });
    expect(s.people[kid.id].householdId).not.toBe(me.householdId);
    expect(s.households[me.householdId].wallet).toBe(cash - 5000);

    // Not close enough: blocked with a reason. Close: they come home, with their household.
    adjustBond(s, me.id, kid.id, -100, 0);
    expect(householdBlocker(s, { kind: 'invite', personId: kid.id })).toMatch(/close enough/);
    adjustBond(s, me.id, kid.id, 200, 0);
    expect(invitable(s).map((p) => p.id)).toContain(kid.id);
    s = householdAction(s, { kind: 'invite', personId: kid.id });
    expect(s.people[kid.id].householdId).toBe(active(s).householdId);
    expect(s.people[kid.id].flags.invited_home).toBe(s.year);
  });

  it('a child moving out takes their partner and their own young kids', () => {
    const { s, kid } = parentWithGrownKid();
    const g = structuredClone(s);
    const k = g.people[kid.id];
    const babyId = 'baby';
    g.people[babyId] = { ...structuredClone(k), id: babyId, birthYear: g.year - 1, biologicalParents: [k.id], adoptiveParents: [], stake: 0 };
    moveOut(g, k, 0);
    expect(g.people[babyId].householdId).toBe(k.householdId);
  });
});

describe('savings stakes', () => {
  it('grow with what each adult earns, and pass to a spouse on death', () => {
    let s = newGame(11);
    for (let i = 0; i < 3; i++) {
      s = updatePlan(s, strategyPlan(s, 'balanced'));
      s = autoplayYear(s, (pe) => pe.choices.find((c) => !c.disabled)!.id);
    }
    const adults = membersOf(s, active(s).householdId).filter((p) => ageOf(p, s.year) >= 18);
    expect(adults.every((p) => (p.stake ?? 0) > 0)).toBe(true);
    const me = active(s);
    const spouse = adults.find((p) => p.id !== me.id)!;
    const total = (me.stake ?? 0) + (spouse.stake ?? 0);
    die(s, spouse, 'test');
    expect(me.stake).toBe(total);
    expect(spouse.stake).toBe(0);
  });
});

describe('a long life at home (the reported case)', () => {
  it('by 55, the player owns a large share and leaves with it, kids in tow', () => {
    let s: GameState | undefined;
    for (let seed = 1; seed < 40 && !s; seed++) {
      try {
        const x = stayHomeUntil(seed, 55);
        if (!runsHousehold(x, active(x))) s = x;
      } catch {
        /* next seed */
      }
    }
    expect(s).toBeDefined();
    const g = s!;
    const hid = active(g).householdId;
    g.households[hid].investments = 3_000_000;
    const f = shareOf(g, hid, [active(g)]);
    expect(f).toBeGreaterThan(0.4);
    const out = householdAction(g, { kind: 'moveOut', bring: [], take: 'share' });
    expect(out.households[active(out).householdId].investments).toBeGreaterThan(1_200_000);
  });
});
