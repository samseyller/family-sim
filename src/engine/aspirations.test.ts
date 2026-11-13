/** Stages 5–6 gate: aspirations that evolve, life-stage arcs, and stories across generations. */
import { describe, expect, it } from 'vitest';
import { performActivity } from './activities';
import { EVENT_BY_ID } from './events';
import { aimText, drifting, reflectionDue, REFLECT_GAP, setAspiration, type FulfillmentYear } from './fulfillment';
import { newGame } from './generate';
import { buildMemorial } from './memorial';
import { chooseHeir, devKill, eligibleHeirs } from './phases';
import { makeRng } from './rng';
import type { GameState } from './types';
import { active, kidsAtHome } from './util';

const NONE: FulfillmentYear = { partnerBlocks: 0, childBlocks: 0, outing: 0, socialize: 0, practice: 0, learn: 0, workSurplus: 0, neglect: false, activities: [] };
const adult = (seed: number) => { const s = newGame(seed); active(s).stats.health = 80; return s; };

describe('reflection', () => {
  it('comes up after years drifting toward something else, never for one year, and at most every few years', () => {
    const s = adult(9101);
    const me = active(s);
    me.aspiration = 'security';
    s.households[me.householdId].wallet = -10_000; // security is going badly
    const exploring: FulfillmentYear = { ...NONE, activities: ['world_trip', 'vacation', 'try_new_together'] };
    expect(drifting(s, me, exploring)).toBe('exploration');
    expect(reflectionDue(s, me, exploring)).toBeUndefined(); // one year isn't enough
    expect(reflectionDue(s, me, exploring)).toBeUndefined();
    const due = reflectionDue(s, me, exploring);
    expect(due).toEqual({ reason: 'drift', suggest: 'exploration' });
    me.flags.reflect_year = s.year;
    expect(reflectionDue(s, me, exploring)).toBeUndefined(); // rate-limited
    s.year += REFLECT_GAP;
    expect(reflectionDue(s, me, exploring)).toBeDefined();
  });

  it('changing course keeps what you earned, remembers the old goal, and comes with grace', () => {
    const s = adult(9102);
    const me = active(s);
    me.aspiration = 'mastery';
    me.skills.music = 60;
    setAspiration(me, 'connection', s.year);
    expect(me.skills.music).toBe(60);
    expect(me.pastAspirations).toEqual([{ aspiration: 'mastery', until: s.year }]);
    expect(me.flags.aspiration_grace).toBeGreaterThan(s.year);
    me.fulfillment = 70;
    expect(aimText(me)).toBe('Sought mastery, then connection, and found it.');
  });

  it('the reflection event offers keep, adapt, the suggested change, or something else', () => {
    const s = adult(9103);
    const me = active(s);
    me.aspiration = 'achievement';
    me.flags.reflect_reason = 3; // plateau
    me.flags.reflect_suggest = 1; // mastery
    const built = EVENT_BY_ID.aspiration_reflection.build({ s, rng: makeRng(1), me });
    expect(built.choices.map((c) => c.id)).toEqual(['keep', 'adapt', 'to:mastery', 'other']);
    EVENT_BY_ID.aspiration_reflection.resolve({ s, rng: makeRng(1), me }, 'to:mastery');
    expect(me.aspiration).toBe('mastery');
    expect(s.journal.at(-1)!.text).toMatch(/used to want achievement most; now it’s mastery/);
  });
});

describe('life-stage arcs', () => {
  it('the work-or-family crossroads follows up three years later', () => {
    const s = adult(9201);
    s.households[active(s).householdId].wallet = 50_000;
    const c = { s, rng: makeRng(1), me: active(s) };
    EVENT_BY_ID.work_family_crossroads.resolve(c, 'scale');
    expect(s.scheduled.some((x) => x.eventId === 'crossroads_followup' && x.dueYear === s.year + 3)).toBe(true);
    expect(EVENT_BY_ID.work_family_crossroads.candidates!(c)).toEqual([]); // once
  });

  it('a creative teen’s path: encouragement builds the craft and sets their aspiration', () => {
    const s = adult(9202);
    const kid = kidsAtHome(s, active(s))[0];
    kid.birthYear = s.year - 16;
    kid.traits = ['creative', 'kind'];
    kid.hobby = 'art';
    kid.skills.art = 30;
    active(s).birthYear = s.year - 45;
    const c = { s, rng: makeRng(1), me: active(s) };
    expect(EVENT_BY_ID.creative_crossroads.candidates!(c).map((x) => x.subject?.id)).toContain(kid.id);
    EVENT_BY_ID.creative_crossroads.resolve(c, 'craft', kid);
    expect(kid.aspiration).toBe('mastery');
    expect(kid.skills.art).toBeGreaterThan(30);
  });

  it('a retiree finds a new purpose', () => {
    const s = adult(9203);
    const me = active(s);
    me.retired = true;
    me.flags.retired_year = s.year - 2;
    me.fulfillment = 40;
    const c = { s, rng: makeRng(1), me };
    expect(EVENT_BY_ID.retirement_purpose.candidates!(c).length).toBe(1);
    EVENT_BY_ID.retirement_purpose.resolve(c, 'service');
    expect(me.aspiration).toBe('service');
    expect(EVENT_BY_ID.retirement_purpose.candidates!(c)).toEqual([]);
  });

  it('collaborative hobby projects pass on skill', () => {
    const s = adult(9204);
    s.households[active(s).householdId].wallet = 10_000;
    active(s).hobby = 'woodworking';
    active(s).skills.woodworking = 40;
    const kid = kidsAtHome(s, active(s))[0];
    kid.birthYear = s.year - 12;
    const t = performActivity(s, 'hobby_project_together', [kid.id]);
    expect(t.people[kid.id].skills.woodworking).toBeGreaterThanOrEqual(3);
  });
});

describe('stories across generations', () => {
  it('an heir is introduced with the last generation’s story; memorials remember what each sought', () => {
    let s: GameState = adult(9301);
    const first = active(s);
    first.aspiration = 'connection';
    first.fulfillment = 72;
    s = devKill(s);
    const heir = eligibleHeirs(s)[0];
    if (!heir) return;
    s.people[heir.id].aspiration = 'exploration';
    s = chooseHeir(s, heir.id);
    const intro = s.journal.at(-1)!.text;
    expect(intro).toMatch(/sought connection, and found it/);
    expect(intro).toMatch(/wants exploration from life/);
    const memo = buildMemorial(s);
    expect(memo.entries[0].aim).toBe('Sought connection, and found it.');
  });
});
