/** Headliners need a big break; memorials vary but stay true. */
import { describe, expect, it } from 'vitest';
import { CAREER_BY_ID } from '../content/careers';
import { EVENT_BY_ID } from './events';
import { assignJob, newGame } from './generate';
import { BIG_BREAK, bigBreakChance, bigBreakYear } from './hobbies';
import { epitaphFor } from './memorial';
import { makeRng } from './rng';
import type { GameState } from './types';
import { active, partnerOf } from './util';
import { canPromote } from './workEvents';

const musician = (seed: number, level: number, skill: number) => {
  const s = newGame(seed);
  const me = active(s);
  assignJob(me, CAREER_BY_ID.musician);
  me.jobLevel = level;
  me.skills.music = skill;
  return { s, me };
};

describe('big breaks', () => {
  it('skill gets you to touring; only a big break gets you to the top of the bill', () => {
    const { me } = musician(40101, 1, 80);
    expect(canPromote(me)).toBe(true); // session → touring by skill (72+)
    me.jobLevel = 2;
    me.skills.music = 100;
    expect(canPromote(me)).toBe(false); // touring → headliner: never a promotion
  });

  it('the chance depends on how good you are: excellent ≈ 15% over a career, good ≈ 1%, below that none', () => {
    expect(bigBreakChance(musician(40102, 2, BIG_BREAK.excellent).me)).toBe(BIG_BREAK.excellentRate);
    expect(bigBreakChance(musician(40103, 2, BIG_BREAK.good).me)).toBe(BIG_BREAK.goodRate);
    expect(bigBreakChance(musician(40104, 2, BIG_BREAK.good - 1).me)).toBe(0);
    expect(bigBreakChance(musician(40105, 3, 100).me)).toBe(0); // already a headliner
    const career = (rate: number) => 1 - (1 - rate) ** 25;
    expect(career(BIG_BREAK.excellentRate)).toBeGreaterThan(0.12);
    expect(career(BIG_BREAK.excellentRate)).toBeLessThan(0.18);
    expect(career(BIG_BREAK.goodRate)).toBeGreaterThan(0.005);
    expect(career(BIG_BREAK.goodRate)).toBeLessThan(0.015);
  });

  it('the roll is stable, and the player decides whether to take it', () => {
    let found: GameState | undefined;
    for (let seed = 40200; seed < 42000 && !found; seed++) {
      const { s } = musician(seed, 2, 95);
      bigBreakYear(s);
      if (s.scheduled.some((x) => x.eventId === 'big_break')) found = s;
    }
    expect(found).toBeDefined();
    const s = found!;
    const again = structuredClone(s);
    again.scheduled = [];
    bigBreakYear(again);
    expect(again.scheduled.filter((x) => x.eventId === 'big_break')).toHaveLength(1); // same seed, same year, same result
    const c = { s, rng: makeRng(1), me: active(s) };
    const ev = EVENT_BY_ID.big_break.build(c);
    expect(ev.choices.every((ch) => !ch.disabled)).toBe(true);
    EVENT_BY_ID.big_break.resolve(c, 'headline');
    expect(active(s).jobLevel).toBe(3);
  });

  it('other musicians need a break too, and get it on the same terms', () => {
    let headlined = 0;
    let tried = 0;
    for (let seed = 40300; seed < 41300; seed++) {
      const s = newGame(seed);
      const p = partnerOf(s, active(s).id)!;
      assignJob(p, CAREER_BY_ID.musician);
      p.jobLevel = 2;
      p.skills.music = 95;
      tried++;
      bigBreakYear(s);
      if (p.jobLevel === 3) headlined++;
    }
    expect(headlined / tried).toBeGreaterThan(0.001);
    expect(headlined / tried).toBeLessThan(0.02); // about 0.65% a year
  });
});

describe('memorial variety', () => {
  it('epitaphs vary across people, stay deterministic and fit the limit', () => {
    const lines = new Set<string>();
    const shapes = new Set<string>();
    for (let seed = 40400; seed < 40460; seed++) {
      const s = newGame(seed);
      const p = active(s);
      const e = epitaphFor(s, p, 'a devoted parent');
      expect(epitaphFor(s, p, 'a devoted parent')).toBe(e);
      expect(e.length).toBeLessThanOrEqual(160);
      lines.add(e);
      shapes.add(e.replace(p.firstName, 'X').replace(/\d+/g, 'N').replace(/(mother|father) of \w+/, 'R').replace(/a lifelong learner|a steady friend/, 'R'));
    }
    expect(lines.size).toBeGreaterThan(20); // names repeat across seeds; the shapes below are the real variety
    expect(shapes.size).toBeGreaterThanOrEqual(5);
  });
});
