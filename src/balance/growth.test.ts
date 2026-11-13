/**
 * Save growth guard. Nothing prunes distant relatives yet: every person, household and bond ever created stays in
 * the save, and every action clones the whole state. That is fine today (the heaviest 150-year family lines reach
 * about 480 KB and 180 people, measured 2026-11-13), but a feature that simulates many more people could make
 * saves slow and large. This test fails at roughly twice today's size, which is the signal to design pruning
 * (see "R1" in docs/ARCHITECTURE_REVIEW.md) before going further.
 */
import { describe, expect, it } from 'vitest';
import type { GameState } from '../engine/types';
import { playLife } from './simulate';

const LIMITS = { people: 400, kilobytes: 1000 };

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
