/** Memorials judged on the whole life (docs/plans/next-stories.md §2). */
import { describe, expect, it } from 'vitest';
import { newGame } from './generate';
import { rememberedFor } from './narrative';
import { threadsYear } from './threads';
import type { GameState, Person } from './types';
import { active, kidsAtHome } from './util';

const setBond = (s: GameState, a: Person, b: Person, affinity: number) => { s.bonds[[a.id, b.id].sort().join('|')] = { affinity, trust: 20 }; };

describe('the lifetime tally', () => {
  it('counts only years with children at home, and family time among them', () => {
    const s = newGame(62001);
    const me = active(s);
    const kids = kidsAtHome(s, me);
    s.plan.alloc = { work: 4, relax: 4, ...Object.fromEntries(kids.map((k) => [`child_time:${k.id}`, 2])) };
    threadsYear(s);
    expect(me.flags.parent_years).toBe(1);
    expect(me.flags.family_years).toBe(1);
    s.plan.alloc = { work: 10, relax: 2 };
    threadsYear(s);
    expect(me.flags.parent_years).toBe(2);
    expect(me.flags.family_years).toBe(1);
    for (const k of kids) k.householdId = 'elsewhere';
    threadsYear(s);
    expect(me.flags.parent_years).toBe(2); // no children at home: not a parenting year
  });

  it('records the bond with each child at 18, once', () => {
    const s = newGame(62002);
    const me = active(s);
    const kid = kidsAtHome(s, me)[0];
    kid.birthYear = s.year - 18;
    setBond(s, me, kid, 61);
    threadsYear(s);
    expect(kid.flags.bond18).toBe(61);
    setBond(s, me, kid, 5);
    threadsYear(s);
    expect(kid.flags.bond18).toBe(61);
  });
});

describe('remembered for', () => {
  it('a devoted parent is remembered for family even after the grown kids drift', () => {
    const s = newGame(62003);
    const me = active(s);
    Object.assign(me.flags, { parent_years: 20, family_years: 19 });
    for (const k of kidsAtHome(s, me)) { k.flags.bond18 = 60; setBond(s, me, k, 10); }
    expect(rememberedFor(s, me)).toBe('a life devoted to family');
  });

  it('a top rank alone is not a driven career; a mostly-absent parent with a long career is', () => {
    const s = newGame(62004);
    const me = active(s);
    me.jobId = 'lawyer';
    me.jobLevel = 3;
    me.aspiration = 'security';
    for (const k of kidsAtHome(s, me)) setBond(s, me, k, 10);
    expect(rememberedFor(s, me)).toBeUndefined();
    Object.assign(me.flags, { parent_years: 18, family_years: 2 });
    me.careerYears = 35;
    expect(rememberedFor(s, me)).toMatch(/^a driven career/);
  });
});
