/** Grandchildren's stories (docs/plans/next-stories.md §1). */
import { describe, expect, it } from 'vitest';
import { CAREER_BY_ID } from '../content/careers';
import { CITY_IDS } from '../content/cities';
import { activityBlocker, performActivity } from './activities';
import { travelDistance } from './location';
import { EVENT_BY_ID } from './events';
import { assignJob, makePerson, newGame } from './generate';
import { grandchildThread, noteGrandchild, yearsWith } from './grandchildren';
import { migrate } from './migrations';
import { childhoodFacts, successionNote } from './narrative';
import { findPatterns } from './patterns';
import { makeRng } from './rng';
import type { GameState, Person } from './types';
import { active, kidsAtHome } from './util';

/** A grandparent (the player) with a grown child and a grandchild of `age` living with that child (or at home). */
function family(seed: number, age = 10, atHome = false): { s: GameState; me: Person; kid: Person; g: Person } {
  const s = newGame(seed);
  const me = active(s);
  s.households[me.householdId].wallet = 200_000;
  const kid = kidsAtHome(s, me)[0];
  kid.birthYear = s.year - 35;
  if (!atHome) {
    // The grown child has a home of their own, in another city.
    const mine = s.households[me.householdId];
    const away = CITY_IDS.find((c) => c !== (mine.city ?? CITY_IDS[0]) && travelDistance(mine.city ?? CITY_IDS[0], c) === 'far')!;
    s.households.h_away = { ...structuredClone(mine), id: 'h_away', city: away, wallet: 0, investments: 0, assets: [] };
    kid.householdId = 'h_away';
  }
  const g = makePerson(s, makeRng(seed), { birthYear: s.year - age, lastName: kid.lastName, generation: kid.generation + 1, parents: [kid.id], householdId: atHome ? me.householdId : kid.householdId });
  return { s, me, kid, g };
}
const ctx = (s: GameState) => ({ s, rng: makeRng(1), me: active(s) });

describe('time together', () => {
  it('one year a year, and the story starts on the second year', () => {
    const { s, me, g } = family(63001);
    noteGrandchild(s, me, g);
    noteGrandchild(s, me, g);
    expect(grandchildThread(s, me, g)).toBeUndefined();
    s.year++;
    noteGrandchild(s, me, g);
    noteGrandchild(s, me, g);
    expect(grandchildThread(s, me, g)!.hits).toEqual([s.year - 1, s.year]);
  });
});

describe('teaching a grandchild', () => {
  it('needs a grandchild 8–17 at home or nearby, and your hobby at skill 50+', () => {
    const { s, me, g } = family(63101, 10, true);
    me.hobby = 'woodworking';
    me.skills.woodworking = 40;
    expect(activityBlocker(s, 'teach_grandchild', [g.id])).toMatch(/skill 50/);
    me.skills.woodworking = 60;
    expect(activityBlocker(s, 'teach_grandchild', [g.id])).toBeNull();
    g.birthYear = s.year - 6;
    expect(activityBlocker(s, 'teach_grandchild', [g.id])).not.toBeNull(); // too young
    g.birthYear = s.year - 10;
    const t = performActivity(s, 'teach_grandchild', [g.id]);
    expect(t.people[g.id].skills.woodworking).toBe(4);
  });
});

describe('story moments', () => {
  it('what you taught them: only a craft you taught, once they are good at it', () => {
    const { s, me, g } = family(63201, 18);
    g.skills.woodworking = 45;
    expect(EVENT_BY_ID.what_you_taught.candidates!(ctx(s))).toEqual([]);
    for (const y of [9, 8, 7]) { s.year -= y; noteGrandchild(s, me, g, 'woodworking'); s.year += y; }
    noteGrandchild(s, me, g, 'woodworking');
    expect(grandchildThread(s, me, g)!.detail).toBe('woodworking');
    expect(EVENT_BY_ID.what_you_taught.candidates!(ctx(s)).map((c) => c.subject?.id)).toEqual([g.id]);
    expect(EVENT_BY_ID.what_you_taught.build(ctx(s), g).text).toMatch(/chisels/);
    EVENT_BY_ID.what_you_taught.resolve(ctx(s), 'ok', g);
    expect(EVENT_BY_ID.what_you_taught.candidates!(ctx(s))).toEqual([]);
  });

  it('turning 18: needs five years together; the gift scales with your savings and goes into theirs', () => {
    const { s, me, g } = family(63202, 18);
    for (let y = 8; y >= 1; y--) { s.year -= y; noteGrandchild(s, me, g); s.year += y; }
    expect(yearsWith(s, me, g)).toBeGreaterThanOrEqual(5);
    expect(EVENT_BY_ID.grandchild_turns_18.candidates!(ctx(s)).map((c) => c.subject?.id)).toEqual([g.id]);
    const hh = s.households[me.householdId];
    hh.wallet = 200_000;
    hh.investments = 300_000;
    const choice = EVENT_BY_ID.grandchild_turns_18.build(ctx(s), g).choices.find((c) => c.id === 'gift')!;
    expect(choice.label).toContain('$5,000'); // 1% of $500k
    EVENT_BY_ID.grandchild_turns_18.resolve(ctx(s), 'gift', g);
    expect(hh.wallet).toBe(195_000);
    expect(g.fund).toBe(5_000);
    expect(EVENT_BY_ID.grandchild_turns_18.candidates!(ctx(s))).toEqual([]);
  });

  it('a far-away grandchild you have barely seen: asked once, never again', () => {
    const { s, g } = family(63203, 9);
    const asked = () => EVENT_BY_ID.barely_know_them.candidates!(ctx(s)).some((c) => c.subject?.id === g.id);
    expect(asked()).toBe(true);
    EVENT_BY_ID.barely_know_them.resolve(ctx(s), 'later', g);
    expect(asked()).toBe(false);
  });
});

describe('the story carries on', () => {
  it('coming of age and succession name the grandparent and what they taught', () => {
    const { s, me, g } = family(63301, 18);
    for (let y = 8; y >= 1; y--) { s.year -= y; noteGrandchild(s, me, g, 'fishing'); s.year += y; }
    expect(childhoodFacts(s, g).find((f) => f.id === 'grandparent')!.text).toMatch(new RegExp(`Your grand(mother|father) ${me.firstName} taught you fishing\\.`));
    expect(successionNote(s, me, g)).toMatch(new RegExp(`${me.firstName} taught ${g.firstName} fishing`));
  });

  it('the skipped generation: your path, not their parent’s', () => {
    const { s, me, kid, g } = family(63302, 25);
    assignJob(me, CAREER_BY_ID.teacher);
    assignJob(g, CAREER_BY_ID.teacher);
    assignJob(kid, CAREER_BY_ID.nurse);
    expect(findPatterns(s, me).some((f) => f.key === `skipped:${g.id}`)).toBe(true);
    assignJob(kid, CAREER_BY_ID.teacher);
    expect(findPatterns(s, me).some((f) => f.key === `skipped:${g.id}`)).toBe(false);
  });
});

describe('saves', () => {
  it('v26 saves load', () => {
    const old: any = structuredClone(newGame(63401));
    old.schemaVersion = 26;
    expect(migrate(old)).toBeDefined();
  });
});
