/** Pruning long-gone, never-played characters down to names, dates and portraits. */
import { describe, expect, it } from 'vitest';
import { playLife } from '../balance/simulate';
import { checkGame } from '../persistence/exportImport';
import { START_YEAR } from './generate';
import { JOURNAL_KEEP_YEARS, PRUNE_AFTER_YEARS, PRUNE_DEAD_FOR, pruneHistory, trimJournal } from './history';
import { buildMemorial } from './memorial';
import type { GameState } from './types';
import { alive } from './util';

/** The first of a few lines (tycoon then socialite seeds) that lasts at least `years` (lines can die out). */
function lastingGame(years: number): GameState {
  for (const style of ['tycoon', 'socialite']) for (let seed = 501; seed < 515; seed++) {
    const s = longGame(style, seed, years);
    if (s.year - START_YEAR >= years - 1 && s.phase !== 'GAME_OVER') return s;
  }
  throw new Error(`no line lasted ${years} years`);
}

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
    const s = lastingGame(200);
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

describe('journal tiers', () => {
  it('routine entries fade first, good and bad news later, milestones never', () => {
    const s = longGame('family', 507, 1);
    s.year = 2200;
    const at = (age: number, kind: GameState['journal'][number]['kind']) => ({ year: s.year - age, text: `${kind} ${age}`, kind, who: s.activeId });
    s.journal = [at(170, 'major'), at(5, 'info'), at(10, 'info'), at(39, 'good'), at(40, 'bad'), at(150, 'birth'), at(150, 'death'), at(150, 'major')];
    expect(trimJournal(s)).toBe(2);
    expect(s.journal.map((j) => j.text)).toEqual(['major 170', 'info 5', 'good 39', 'birth 150', 'death 150', 'major 150']);
    expect(JOURNAL_KEEP_YEARS.major).toBe(Infinity);
  });

  it('keeps the first entry of the story and every memorial highlight, and shrinks long saves', { timeout: 60_000 }, () => {
    const s = lastingGame(200);
    expect(s.journal[0].text).toMatch(/^Your story begins/);
    const oldest = Math.min(...s.journal.filter((j) => j.kind === 'info').map((j) => j.year));
    expect(s.year - oldest).toBeLessThan(JOURNAL_KEEP_YEARS.info);
    expect(s.journal.filter((j) => j.kind === 'major' && j.year < s.year - 100).length).toBeGreaterThan(5);
    expect(JSON.stringify(s.journal).length).toBeLessThan(150_000);
  });
});
