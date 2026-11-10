import { describe, expect, it } from 'vitest';
import { die, settleEstates } from './family';
import { newGame } from './generate';
import { siblingCount } from './start';
import type { GameState, Person } from './types';
import { active, ageOf, alive, childrenOf, parentsOf } from './util';

const siblingsOf = (s: GameState, me: Person) => {
  const ids = new Set<string>();
  for (const p of parentsOf(s, me)) for (const c of childrenOf(s, p.id)) if (c.id !== me.id) ids.add(c.id);
  return [...ids].map((id) => s.people[id]);
};

describe('siblings', () => {
  it('the mix is about 25% only children, 40% one, 25% two, 10% three', () => {
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 1000; i++) counts[siblingCount(i / 1000)]++;
    expect(counts).toEqual([250, 400, 250, 100]);
    // In real games (where a parent's age can rule a sibling out) the spread stays close.
    const real = [0, 0, 0, 0];
    for (let seed = 1; seed <= 300; seed++) real[Math.min(3, siblingsOf(newGame(seed), active(newGame(seed))).length)]++;
    expect(real[0]).toBeGreaterThan(40);
    expect(real[1]).toBeGreaterThan(real[3]);
    expect(real[3]).toBeGreaterThan(5);
  });

  it('siblings share your parents and surname; grown ones have their own homes and jobs', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = newGame(seed);
      const me = active(s);
      for (const sib of siblingsOf(s, me)) {
        expect(sib.lastName).toBe(me.lastName);
        expect(sib.firstName).not.toBe(me.firstName);
        expect(sib.biologicalParents.sort()).toEqual(me.biologicalParents.sort());
        if (ageOf(sib, s.year) >= 18) {
          expect(sib.householdId).not.toBe(me.householdId);
          expect(s.households[sib.householdId].city).toBeTruthy();
        }
      }
    }
  });

  it('a child start has younger and older siblings at home or nearby', () => {
    let found = false;
    for (let seed = 1; seed < 40 && !found; seed++) {
      const s = newGame(seed, 'child');
      found = siblingsOf(s, active(s)).some((sib) => sib.householdId === active(s).householdId);
    }
    expect(found).toBe(true);
  });

  it('parents’ estate is split between you and your siblings', () => {
    let s: GameState | undefined;
    for (let seed = 1; seed < 60 && !s; seed++) {
      const g = newGame(seed);
      const sibs = siblingsOf(g, active(g)).filter((x) => x.householdId !== active(g).householdId);
      if (sibs.length >= 2) s = g;
    }
    const g = s!;
    const me = active(g);
    const parents = parentsOf(g, me);
    const home = g.households[parents[0].householdId];
    home.wallet = 900_000;
    home.investments = 0;
    home.assets = [];
    for (const p of parents) p.retirementSavings = 0; // keep the estate exactly the cash above
    for (const p of parents) if (alive(p)) die(g, p, 'old age');
    const heirs = siblingsOf(g, me).filter((x) => alive(x) && x.householdId !== home.id).length + 1;
    const before = g.households[me.householdId].wallet;
    settleEstates(g);
    expect(g.households[me.householdId].wallet - before).toBe(Math.round(900_000 / heirs));
  });

  it('an heir still living at home does not keep everything: siblings elsewhere get their share', () => {
    let s: GameState | undefined;
    for (let seed = 1; seed < 80 && !s; seed++) {
      const g = newGame(seed);
      if (siblingsOf(g, active(g)).filter((x) => ageOf(x, g.year) >= 18 && x.householdId !== active(g).householdId).length >= 1) s = g;
    }
    const g = s!;
    const me = active(g);
    const parents = parentsOf(g, me).filter(alive);
    const home = g.households[parents[0].householdId];
    // You live with your widowed parent, who brought in all the money.
    for (const p of parents.slice(1)) die(g, p, 'old age');
    const parent = parents[0];
    me.householdId = home.id;
    me.stake = 0;
    parent.stake = 100;
    parent.retirementSavings = 0;
    home.wallet = 600_000;
    home.investments = 0;
    const away = siblingsOf(g, me).filter((x) => alive(x) && x.householdId !== home.id);
    const before = away.map((x) => g.households[x.householdId].wallet);
    die(g, parent, 'old age');
    const each = 600_000 / (away.length + 1);
    away.forEach((x, i) => expect(g.households[x.householdId].wallet - before[i]).toBe(Math.round(each)));
    expect(home.wallet).toBeCloseTo(each, -1);
  });
});
