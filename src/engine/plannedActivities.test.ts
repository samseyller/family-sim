/** The rest of the activities plan: reunions, check-up follow-ups, dentist, diet, music camp, distance levels. */
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_BY_ID } from '../content/achievements';
import { activityBlocker, candidatesFor, ACTIVITY_BY_ID, distanceOf, performActivity } from './activities';
import { VISIT } from './activitiesHome';
import { EVENT_BY_ID } from './events';
import { newGame } from './generate';
import { travelDistance } from './location';
import { choose, resolveYear } from './phases';
import { makeRng } from './rng';
import type { GameState } from './types';
import { active } from './util';

const hhOf = (s: GameState) => s.households[active(s).householdId];
const rich = (seed: number, start: 'adult' | 'child' = 'adult') => {
  const s = newGame(seed, start);
  hhOf(s).wallet = 200_000;
  active(s).stats.health = 80;
  active(s).stats.stress = 30;
  return s;
};

describe('distance', () => {
  it('has three levels: same city, a few hours away, a flight away', () => {
    expect(travelDistance('boston', 'boston')).toBe('near');
    expect(travelDistance('boston', 'new_york')).toBe('drive');
    expect(travelDistance('austin', 'houston')).toBe('drive');
    expect(travelDistance('san_diego', 'los_angeles')).toBe('drive');
    expect(travelDistance('boston', 'miami')).toBe('far');
  });

  it('sets what a visit costs and takes out of you', () => {
    expect(VISIT.near.cost).toBeLessThan(VISIT.drive.cost);
    expect(VISIT.drive.cost).toBeLessThan(VISIT.far.cost);
    const s = rich(6001);
    const rel = candidatesFor(s, ACTIVITY_BY_ID.visit)[0];
    expect(rel).toBeDefined();
    const d = distanceOf(s, rel);
    expect(ACTIVITY_BY_ID.visit.cost(s, [rel])).toBe(VISIT[d].cost);
    expect(ACTIVITY_BY_ID.visit.energy(s, [rel])).toBe(VISIT[d].energy);
  });
});

describe('family reunion', () => {
  it('needs at least three relatives from other homes, and earns the achievement', () => {
    let found = false;
    for (let seed = 6010; seed < 6060 && !found; seed++) {
      const s = rich(seed);
      const pool = candidatesFor(s, ACTIVITY_BY_ID.family_reunion);
      if (pool.length < 3) {
        expect(activityBlocker(s, 'family_reunion', pool.map((p) => p.id))).not.toBeNull();
        continue;
      }
      found = true;
      const t = performActivity(s, 'family_reunion', pool.map((p) => p.id));
      expect(active(t).flags.reunion).toBe(1);
      expect(ACHIEVEMENT_BY_ID.family_reunion.test(t)).toBe(true);
    }
    expect(found).toBe(true);
  });
});

describe('check-ups', () => {
  it('a worrying check-up schedules test results for next year', () => {
    let scheduled = false;
    for (let seed = 6100; seed < 6200 && !scheduled; seed++) {
      const s = rich(seed);
      const me = active(s);
      me.birthYear = s.year - 55;
      me.stats.health = 40;
      const t = performActivity(s, 'checkup');
      scheduled = t.scheduled.some((x) => x.eventId === 'test_results' && x.dueYear === s.year + 1 && x.subjectId === me.id);
    }
    expect(scheduled).toBe(true);
  });

  it('treating the results restores health; the results arrive the following year', () => {
    const s = rich(6201);
    const me = active(s);
    s.scheduled.push({ dueYear: s.year, eventId: 'test_results', subjectId: me.id });
    let t = resolveYear(s);
    const pe = t.pending.find((p) => p.eventId === 'test_results')!;
    expect(pe).toBeDefined();
    const before = active(t).stats.health;
    t = choose(t, pe.uid, 'treat');
    expect(active(t).stats.health).toBeGreaterThan(before);
    expect(active(t).flags.caught_early).toBe(1);
  });

  it('can be paid from investments when cash is short (it is medical)', () => {
    const s = rich(6202);
    hhOf(s).wallet = 0;
    hhOf(s).investments = 50_000;
    const built = EVENT_BY_ID.test_results.build({ s, rng: makeRng(1), me: active(s) });
    const treat = built.choices.find((c) => c.id === 'treat')!;
    expect(treat.disabled).toBe(false);
    expect(treat.hint).toMatch(/Sells/);
  });
});

describe('new health and kid activities', () => {
  it('dentist and diet plan: once a year each', () => {
    let s = rich(6301);
    s = performActivity(s, 'dentist');
    expect(active(s).flags.dentist_visits).toBe(1);
    expect(activityBlocker(s, 'dentist')).not.toBeNull();
    s = performActivity(s, 'diet_plan');
    expect(active(s).flags.diet).toBe(1);
    expect(activityBlocker(s, 'diet_plan')).not.toBeNull();
  });

  it('music camp builds music skill (kids only)', () => {
    let ok = false;
    for (let seed = 6400; seed < 6420 && !ok; seed++) {
      const s = rich(seed, 'child');
      active(s).birthYear = s.year - 10;
      if (activityBlocker(s, 'music_camp')) continue;
      const t = performActivity(s, 'music_camp');
      ok = (active(t).skills.music ?? 0) > (active(s).skills.music ?? 0); // parents may say no
    }
    expect(ok).toBe(true);
    expect(activityBlocker(rich(6430), 'music_camp')).not.toBeNull();
  });

  it('three trips abroad earn Globetrotter', () => {
    const s = rich(6500);
    active(s).flags.trips_abroad = 3;
    expect(ACHIEVEMENT_BY_ID.globetrotter.test(s)).toBe(true);
  });
});
