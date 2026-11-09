/** Guided first playthrough: unlocks, script, and guardrails over many different playthroughs. */
import { describe, expect, it } from 'vitest';
import { ACTIVITY_BY_ID, activityBlocker } from './activities';
import { EVENT_BY_ID } from './events';
import { financeBlocker } from './finance';
import { newGame } from './generate';
import { autoplayYear, updatePlan } from './phases';
import { makeRng } from './rng';
import { strategyPlan } from './strategies';
import { CUSHION, unlockedTabs } from './tutorial';
import type { GameState } from './types';
import { active, ageOf, childrenOf } from './util';

const ageNow = (s: GameState) => ageOf(active(s), s.year);

describe('guided start', () => {
  it('is the same family every time, starting at 18 at home with parents', () => {
    const a = newGame(1, 'guided');
    const b = newGame(999, 'guided');
    expect(a).toEqual(b);
    expect(ageNow(a)).toBe(18);
    expect(a.tutorial?.personId).toBe(a.activeId);
    expect(active(a).flags.came_of_age).toBeUndefined();
  });

  it('opens tabs with age: home+plan 18, family+journal 20, money 24, activities 30', () => {
    const s = newGame(1, 'guided');
    const at = (age: number) => {
      const t: GameState = structuredClone(s);
      active(t).birthYear = t.year - age;
      return unlockedTabs(t).sort();
    };
    expect(at(18)).toEqual(['home', 'plan']);
    expect(at(20)).toEqual(['family', 'home', 'journal', 'plan']);
    expect(at(24)).toEqual(['family', 'home', 'journal', 'money', 'plan']);
    expect(at(30)).toHaveLength(6);
    expect(unlockedTabs(newGame(5))).toHaveLength(6); // normal games: everything open
  });

  it('money and activities stay locked until their tabs open', () => {
    const s = newGame(1, 'guided');
    expect(financeBlocker(s, { kind: 'invest', amount: 1 })).toMatch(/24/);
    expect(activityBlocker(s, 'casino')).toMatch(/30/);
  });
});

describe('guardrails across many playthroughs', () => {
  // Same family; different choices each run → different lives.
  const runs = Array.from({ length: 25 }, (_, i) => i + 1);

  it('no money trouble before 24, a child by 30, nothing severe before 35, no death before 65', { timeout: 60000 }, () => {
    for (const run of runs) {
      const pick = makeRng(run * 7919);
      let s = newGame(1, 'guided');
      let kidBy30 = false;
      while (s.phase === 'PLANNING' && ageNow(s) < 65) {
        const age = ageNow(s);
        // Vary the plans too: sometimes sensible, sometimes careless.
        s = updatePlan(s, pick.chance(0.7) ? strategyPlan(s, pick.pick(['career', 'family', 'balanced'] as const)) : { ...s.plan, alloc: { relax: 12 } });
        s = autoplayYear(s, (pe) => {
          const def = EVENT_BY_ID[pe.eventId];
          if (age < 35) expect(def.severe, `severe event ${pe.eventId} at ${age} (run ${run})`).toBeFalsy();
          const open = pe.choices.filter((c) => !c.disabled);
          const ch = pick.pick(open);
          return ch.id;
        });
        if (s.phase !== 'PLANNING') break;
        const me = active(s);
        if (ageNow(s) <= 24) expect(s.households[me.householdId].wallet, `run ${run} age ${ageNow(s)}`).toBeGreaterThanOrEqual(CUSHION);
        if (ageNow(s) <= 30 && childrenOf(s, me.id).length > 0) kidBy30 = true;
      }
      expect(s.phase, `run ${run} ended in ${s.phase} at ${ageNow(s)}`).toBe('PLANNING');
      expect(ageNow(s)).toBeGreaterThanOrEqual(65);
      expect(kidBy30, `run ${run}: no child by 30`).toBe(true);
    }
  });

  it('the scripted beats are real events', () => {
    for (const id of ['meet_someone', 'proposal', 'baby', 'guided_kid']) expect(EVENT_BY_ID[id]).toBeDefined();
    expect(ACTIVITY_BY_ID.casino).toBeDefined();
  });
});
