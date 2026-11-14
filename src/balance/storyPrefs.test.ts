/** Core play styles answer story moments by their priorities (docs/plans/next-stories.md §4). */
import { describe, expect, it } from 'vitest';
import { EVENT_BY_ID } from '../engine/events';
import type { PendingEvent } from '../engine/types';
import { STORY_PREFS, STYLE_BY_ID, type PlayStyle } from './playstyles';
import { playLife } from './simulate';

describe('story preferences', () => {
  it('only name real events', () => {
    for (const prefs of Object.values(STORY_PREFS)) for (const id of Object.keys(prefs)) expect(EVENT_BY_ID[id], id).toBeDefined();
  });

  it('only name choices those events really offer, and replay the same way', { timeout: 120_000 }, () => {
    const seen = new Set<string>();
    for (const kind of ['family', 'balanced', 'career'] as const) {
      const base = STYLE_BY_ID[kind];
      const picks: string[] = [];
      const checked: PlayStyle = {
        ...base,
        prefer: (pe: PendingEvent, s, ctx) => {
          const out = base.prefer!(pe, s, ctx);
          const listed = STORY_PREFS[kind][pe.eventId];
          if (listed) {
            seen.add(pe.eventId);
            const offered = pe.choices.map((c) => c.id);
            for (const [id] of listed) expect(offered, `${kind} ${pe.eventId}`).toContain(id);
            picks.push(`${s.year}:${pe.eventId}:${out[0]}`);
          }
          return out;
        },
      };
      for (const seed of [61001, 61002, 61003, 61004]) playLife(checked, seed, 100);
      const again: string[] = [];
      for (const seed of [61001, 61002, 61003, 61004]) playLife({ ...checked, prefer: (pe, s, ctx) => { const out = base.prefer!(pe, s, ctx); if (STORY_PREFS[kind][pe.eventId]) again.push(`${s.year}:${pe.eventId}:${out[0]}`); return out; } }, seed, 100);
      expect(again).toEqual(picks);
    }
    expect(seen.size).toBeGreaterThan(4);
  });

  it('styles lean differently on the same moment', () => {
    const pe = { uid: 'x', eventId: 'pushed_too_hard', major: false, title: '', text: '', choices: [{ id: 'apologize', label: '' }, { id: 'explain', label: '' }] } as PendingEvent;
    const share = (kind: 'family' | 'career') => {
      let apologies = 0;
      for (let seed = 0; seed < 400; seed++) {
        const out = STYLE_BY_ID[kind].prefer!(pe, { year: 2040 + (seed % 7), threads: [], people: {}, households: {}, activeId: '' } as never, { seed, rng: undefined as never, mem: {} });
        if (out[0] === 'apologize') apologies++;
      }
      return apologies / 400;
    };
    expect(share('family')).toBeGreaterThan(0.6);
    expect(share('career')).toBeLessThan(0.4);
  });
});
