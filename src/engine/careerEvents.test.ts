/** Work moments fit the job, and come up at most once a year. */
import { describe, expect, it } from 'vitest';
import { CAREER_BY_ID } from '../content/careers';
import { assignJob, newGame } from './generate';
import { EVENT_BY_ID } from './events';
import { HAS_COWORKERS, workplaceOf } from './careerEvents';
import { makeRng } from './rng';
import { resolveYear } from './phases';
import type { GameState } from './types';
import { active } from './util';

/** An adult settled into this job (hired before this year). */
const inJob = (seed: number, jobId: string): GameState => {
  const s = newGame(seed);
  const me = active(s);
  assignJob(me, CAREER_BY_ID[jobId]);
  me.flags.hired_year = s.year - 3;
  return s;
};
const eligible = (s: GameState, id: string) => EVENT_BY_ID[id].candidates!({ s, rng: makeRng(1), me: active(s) }).length > 0;

describe('workplaces', () => {
  it('sorts careers into sensible kinds of workplace', () => {
    expect(workplaceOf(CAREER_BY_ID.enlisted)).toBe('base');
    expect(workplaceOf(CAREER_BY_ID.nurse)).toBe('clinic');
    expect(workplaceOf(CAREER_BY_ID.teacher)).toBe('school');
    expect(workplaceOf(CAREER_BY_ID.electrician)).toBe('site');
    expect(workplaceOf(CAREER_BY_ID.truck_driver)).toBe('road');
    expect(workplaceOf(CAREER_BY_ID.firefighter)).toBe('responder');
    expect(workplaceOf(CAREER_BY_ID.restaurant_owner)).toBe('own');
    expect(workplaceOf(CAREER_BY_ID.developer)).toBe('office');
    expect(workplaceOf(CAREER_BY_ID.pro_soccer)).toBe('team');
  });

  it('no office politics or coworker lunches on deployment, and no stolen credit outside an office', () => {
    const soldier = inJob(9401, 'enlisted');
    expect(eligible(soldier, 'coworker_lunch')).toBe(false);
    expect(eligible(soldier, 'workplace_credit')).toBe(false);
    expect(eligible(soldier, 'care_package')).toBe(true);
    const nurse = inJob(9402, 'nurse');
    expect(eligible(nurse, 'workplace_credit')).toBe(false);
    expect(eligible(nurse, 'double_shift')).toBe(true);
    expect(HAS_COWORKERS).toContain('clinic');
    const dev = inJob(9403, 'developer');
    expect(eligible(dev, 'workplace_credit')).toBe(true);
    expect(eligible(dev, 'care_package')).toBe(false);
  });

  it('nothing at work in the first year of a new job', () => {
    const s = inJob(9404, 'developer');
    active(s).flags.hired_year = s.year;
    expect(eligible(s, 'deadline_crunch')).toBe(false);
    expect(eligible(s, 'workplace_credit')).toBe(false);
  });

  it('at most one work moment a year', () => {
    for (let seed = 9500; seed < 9560; seed++) {
      const s = inJob(seed, 'developer');
      const t = resolveYear(s);
      expect(t.pending.filter((p) => EVENT_BY_ID[p.eventId]?.work).length, `seed ${seed}`).toBeLessThanOrEqual(1);
    }
  });
});
