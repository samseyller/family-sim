/**
 * Golden trace: a safety net for refactors that must not change how the game plays.
 *
 * Every play style plays a few fixed lives; the full game state is fingerprinted at the end of every year.
 * A pure refactor (moving code, renaming, routing money through helpers) must reproduce every fingerprint
 * exactly, including the order of random rolls. When a change is *meant* to alter gameplay, update the stored
 * snapshot with `npx vitest run src/balance/golden.test.ts -u` and say so in the commit.
 *
 * The registries' order is pinned too: `generateEvents` walks events in registry order before a weighted
 * random pick, so reordering events changes outcomes even when nothing else does.
 */
import { describe, expect, it } from 'vitest';
import { ACTIVITIES } from '../engine/activities';
import { EVENT_BY_ID } from '../engine/events';
import type { GameState } from '../engine/types';
import { PLAY_STYLES } from './playstyles';
import { playLife } from './simulate';

const SEEDS = [501, 502];
const YEARS = 80;

/** JSON with object keys sorted, so field order never matters (only values do). */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

/** 32-bit FNV-1a, as 8 hex characters. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

const fingerprint = (s: GameState) => fnv(canonical(s));

/** One line per life: `style:seed`, then `year=hash` for every played year. */
function trace(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const style of PLAY_STYLES) {
    for (const seed of SEEDS) {
      const years: string[] = [];
      playLife(style, seed, YEARS, (s) => years.push(`${s.year}=${fingerprint(s)}`));
      out[`${style.id}:${seed}`] = years;
    }
  }
  return out;
}

describe('golden trace', () => {
  it('event and activity registries keep their order', () => {
    expect(Object.keys(EVENT_BY_ID)).toMatchSnapshot();
    expect(ACTIVITIES.map((a) => a.id)).toMatchSnapshot();
  });

  it('every play style plays out exactly as recorded, year by year', { timeout: 120_000 }, () => {
    expect(trace()).toMatchSnapshot();
  });

  it('a life plays out the same way twice (no hidden randomness)', { timeout: 60_000 }, () => {
    const run = () => { const ys: string[] = []; playLife('tycoon', SEEDS[0], 60, (s) => ys.push(fingerprint(s))); return ys; };
    expect(run()).toEqual(run());
  });
});
