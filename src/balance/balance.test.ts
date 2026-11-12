/** Quick balance smoke (part of npm test): a few short lives must keep every invariant. */
import { describe, expect, it } from 'vitest';
import { newGame } from '../engine/generate';
import { checkBands, compareToBaseline, summarize } from './metrics';
import { checkInvariants, playLife, playLives, seedRange, STRATEGIES } from './simulate';
import { PLAY_STYLES } from './playstyles';

describe('balance smoke', () => {
  it('a few lives of each play style break no invariants', { timeout: 60_000 }, () => {
    for (const st of STRATEGIES) for (const seed of [11, 12]) expect(playLife(st, seed, 70).violations, `${st} ${seed}`).toEqual([]);
  });

  it('one short life of each explorer style breaks no invariants', { timeout: 60_000 }, () => {
    for (const st of PLAY_STYLES.filter((p) => !p.core)) expect(playLife(st, 11, 50).violations, st.id).toEqual([]);
  });

  it('invariant checks catch broken money and stats', () => {
    const s = newGame(3);
    expect(checkInvariants(s)).toEqual([]);
    Object.values(s.households)[0].wallet = NaN;
    Object.values(s.people)[0].stats.happiness = 140;
    expect(checkInvariants(s)).toHaveLength(2);
  });

  it('drift and bands flag real moves and ignore noise', { timeout: 60_000 }, () => {
    const m = summarize(Object.fromEntries(STRATEGIES.map((st) => [st, playLives(st, seedRange(20, 3), 60)])) as never);
    expect(compareToBaseline(m, m)).toEqual([]);
    expect(compareToBaseline({ ...m, 'career.nw45': m['career.nw45'] * 1.1 }, m)).toEqual([]);
    expect(compareToBaseline({ ...m, 'career.nw45': m['career.nw45'] * 3 + 1e6 }, m).map((d) => d.key)).toEqual(['career.nw45']);
    expect(compareToBaseline({ ...m, 'ach.first_steps': 0 }, { ...m, 'ach.first_steps': 0.5 }).map((d) => d.key)).toEqual(['ach.first_steps']);
    expect(compareToBaseline({ ...m, 'ach.first_steps': 0 }, { ...m, 'ach.first_steps': 0.005 })).toEqual([]); // too rare to judge
    expect(checkBands({ ...m, 'all.violations': 1 }).some((f) => f.key === 'all.violations')).toBe(true);
  });
});
