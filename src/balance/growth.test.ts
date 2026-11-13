/**
 * Save growth guard. Every action clones the whole state, so saves must stay small. Long games prune long-gone
 * relatives and the journal fades by importance (engine/history.ts); the heaviest 150-year family lines are about
 * 180 KB (measured 2026-11-13, down from about 480 KB before journal tiers). This test fails at roughly 2.5 times
 * that, the signal to look at what is growing before going further.
 */
import { describe, expect, it } from 'vitest';
import type { GameState } from '../engine/types';
import { playLife } from './simulate';

const LIMITS = { people: 400, kilobytes: 500 };

describe('save growth', () => {
  it('stays within budget over 150 years for the heaviest play styles', { timeout: 60_000 }, () => {
    for (const style of ['socialite', 'tycoon']) {
      let last: GameState | undefined;
      playLife(style, 501, 150, (s) => { last = s; });
      const people = Object.keys(last!.people).length;
      const kb = JSON.stringify(last).length / 1024;
      expect(people, `${style}: people after 150 years`).toBeLessThanOrEqual(LIMITS.people);
      expect(kb, `${style}: save size (KB) after 150 years`).toBeLessThanOrEqual(LIMITS.kilobytes);
    }
  });
});
