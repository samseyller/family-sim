import { describe, expect, it } from 'vitest';
import { startDating } from './family';
import { friendsOf, friendshipsOf, makeFriend } from './friends';
import { newGame } from './generate';
import { relationAction, relationBlocker } from './relations';
import { makeRng } from './rng';
import { active, activePartnership, adjustBond, getBond, kidsAtHome, partnerOf } from './util';

describe('ending relationships from the Family tab', () => {
  it('separate from a spouse (they move out with half), then divorce', () => {
    const s0 = newGame(6101);
    const me = active(s0);
    const spouse = partnerOf(s0, me.id)!;
    s0.households[me.householdId].wallet = 100_000;
    expect(relationBlocker(s0, { kind: 'divorce', personId: spouse.id })).toMatch(/after separating/);
    const s1 = relationAction(s0, { kind: 'separate', personId: spouse.id });
    expect(s1.people[spouse.id].householdId).not.toBe(me.householdId);
    expect(s1.households[me.householdId].wallet).toBe(50_000);
    for (const k of kidsAtHome(s1, active(s1))) expect(k.householdId).toBe(me.householdId); // the kids stay
    const s2 = relationAction(s1, { kind: 'divorce', personId: spouse.id });
    expect(s2.partnerships.some((p) => p.status === 'divorced')).toBe(true);
    expect(relationBlocker(s2, { kind: 'separate', personId: spouse.id })).not.toBeNull();
  });

  it('break up with someone you are dating', () => {
    const s0 = newGame(6102, 'child');
    const me = active(s0);
    me.birthYear = s0.year - 22;
    const date = makeFriend(s0, makeRng(1), me, 'test')!;
    startDating(s0, me, date);
    expect(relationBlocker(s0, { kind: 'separate', personId: date.id })).toMatch(/not married/);
    const s1 = relationAction(s0, { kind: 'breakUp', personId: date.id });
    expect(activePartnership(s1, me.id)).toBeUndefined();
    expect(getBond(s1, me.id, date.id).affinity).toBeLessThan(getBond(s0, me.id, date.id).affinity);
  });

  it('only friends you have drifted apart from can be let go, and they are gone for good', () => {
    const s0 = newGame(6103);
    const me = active(s0);
    const f = makeFriend(s0, makeRng(2), me, 'test')!;
    expect(relationBlocker(s0, { kind: 'forgetFriend', personId: f.id })).toMatch(/drifted apart/);
    adjustBond(s0, me.id, f.id, -200, 0);
    expect(getBond(s0, me.id, f.id).affinity).toBeLessThanOrEqual(0);
    const s1 = relationAction(s0, { kind: 'forgetFriend', personId: f.id });
    expect(friendsOf(s1).some((x) => x.id === f.id)).toBe(false);
    expect(friendshipsOf(s1).length).toBe(friendshipsOf(s0).length - 1);
  });
});

describe('asking a sibling to move out', () => {
  /** A player who runs a home their adult brother or sister lives in. */
  function withSibling(seed: number) {
    const s = newGame(seed, 'child');
    const me = active(s);
    me.birthYear = s.year - 30;
    const sib = Object.values(s.people).find((p) => p.id !== me.id && p.biologicalParents.some((id) => me.biologicalParents.includes(id)));
    if (!sib) return undefined;
    sib.birthYear = s.year - 27;
    sib.householdId = me.householdId;
    s.households[me.householdId].headId = me.id;
    return { s, me, sib };
  }

  it('works only for grown siblings at home, in a home you run, once a year', () => {
    let x;
    for (let seed = 6200; seed < 6260 && !x; seed++) x = withSibling(seed);
    const { s, sib } = x!;
    expect(relationBlocker(s, { kind: 'askSiblingToLeave', personId: sib.id })).toBeNull();
    const notHead = structuredClone(s);
    notHead.households[active(s).householdId].headId = sib.id;
    expect(relationBlocker(notHead, { kind: 'askSiblingToLeave', personId: sib.id })).toMatch(/runs the home/);
    const after = relationAction(s, { kind: 'askSiblingToLeave', personId: sib.id });
    if (after.people[sib.id].householdId === active(after).householdId) {
      expect(relationBlocker(after, { kind: 'askSiblingToLeave', personId: sib.id })).toMatch(/already asked/);
    }
  });

  it('sometimes they refuse, and trust always takes a hit (more when they refuse)', () => {
    let agreed = 0;
    let refused = 0;
    const lost = { agreed: 0, refused: 0 };
    for (let seed = 6300; seed < 6400; seed++) {
      const x = withSibling(seed);
      if (!x) continue;
      x.s.rngState = seed;
      const before = getBond(x.s, x.me.id, x.sib.id).trust;
      const after = relationAction(x.s, { kind: 'askSiblingToLeave', personId: x.sib.id });
      const drop = before - getBond(after, x.me.id, x.sib.id).trust;
      expect(drop).toBeGreaterThan(0);
      if (after.people[x.sib.id].householdId !== active(after).householdId) { agreed++; lost.agreed += drop; } else { refused++; lost.refused += drop; }
    }
    expect(agreed).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);
    expect(lost.refused / refused).toBeGreaterThan(lost.agreed / agreed);
  });
});
