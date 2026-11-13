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
