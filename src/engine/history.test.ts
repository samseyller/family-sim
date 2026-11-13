/** Pruning long-gone, never-played characters down to names, dates and portraits. */
import { describe, expect, it } from 'vitest';
import { playLife } from '../balance/simulate';
import { checkGame } from '../persistence/exportImport';
import { START_YEAR } from './generate';
import { PRUNE_AFTER_YEARS, PRUNE_DEAD_FOR, pruneHistory } from './history';
import { buildMemorial } from './memorial';
import type { GameState } from './types';
import { alive } from './util';

/** Play a family line and keep the state from the year before it reaches `years`. */
function longGame(style: string, seed: number, years: number): GameState {
  let last: GameState | undefined;
  playLife(style, seed, years, (s) => { last = s; });
  return last!;
}

describe('pruning history', () => {
  it('does nothing before the family is 150 years old', () => {
    const s = longGame('socialite', 501, 60);
    expect(s.year - START_YEAR).toBeLessThan(PRUNE_AFTER_YEARS);
    expect(pruneHistory(structuredClone(s))).toBe(0);
  });

  it('in long games, keeps names, dates and portraits of long-dead, never-played people', { timeout: 60_000 }, () => {
    const s = longGame('tycoon', 504, 200);
    expect(s.year - START_YEAR).toBeGreaterThanOrEqual(PRUNE_AFTER_YEARS);
    const archived = Object.values(s.people).filter((p) => p.flags.archived);
    expect(archived.length).toBeGreaterThan(20);
    for (const p of archived) {
      expect(alive(p)).toBe(false);
      expect(s.lineage).not.toContain(p.id);
      expect(p.firstName && p.lastName && p.birthYear && p.deathYear && p.looks).toBeTruthy();
      expect(p.jobId).toBeUndefined();
      expect(p.skills).toEqual({});
    }
    // Recent deaths keep their details for now.
    const recent = Object.values(s.people).filter((p) => !alive(p) && !s.lineage.includes(p.id) && s.year - p.deathYear! < PRUNE_DEAD_FOR);
    for (const p of recent) expect(p.flags.archived).toBeUndefined();
    // Played characters are never pruned.
    for (const id of s.lineage) expect(s.people[id].flags.archived).toBeUndefined();
    // The save is still valid.
    const res = checkGame(JSON.parse(JSON.stringify(s)), 'test');
    expect(res.ok, res.ok ? '' : res.error).toBe(true);
  });

  it('memorializing prunes everyone eligible but leaves the memorial exactly the same', { timeout: 60_000 }, () => {
    const s = longGame('tycoon', 501, 120);
    const before = buildMemorial(s);
    const t = structuredClone(s);
    const n = pruneHistory(t, true);
    expect(n).toBeGreaterThan(0);
    const after = buildMemorial(t);
    expect(after.legacy).toEqual(before.legacy);
    expect(after.entries.map((e) => [e.person.id, e.epitaph, e.knownFor, e.lifespan])).toEqual(before.entries.map((e) => [e.person.id, e.epitaph, e.knownFor, e.lifespan]));
    expect(JSON.stringify(t).length).toBeLessThan(JSON.stringify(s).length);
    const res = checkGame(JSON.parse(JSON.stringify(t)), 'test');
    expect(res.ok, res.ok ? '' : res.error).toBe(true);
  });
});
