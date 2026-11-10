/** Stage 6e: playable childhood. */
import { describe, expect, it } from 'vitest';
import { newGame } from './generate';
import { autoplayYear, updatePlan } from './phases';
import { CHILD_EVENTS } from './childhood';
import type { GameState } from './types';
import { active, ageOf, parentsOf } from './util';
import { integrityProblems } from '../persistence/schema';

const firstChoice = (pe: GameState['pending'][number]) => pe.choices.find((c) => !c.disabled)!.id;
const CHILD_IDS = new Set(CHILD_EVENTS.filter((e) => e.stage === 'child').map((e) => e.id));

describe('starting as a child', () => {
  it('begins at 6 in a working parents\' home with a kid plan', () => {
    const s = newGame(401, 'child');
    const me = active(s);
    expect(ageOf(me, s.year)).toBe(6);
    const parents = parentsOf(s, me);
    expect(parents).toHaveLength(2);
    for (const p of parents) {
      expect(p.householdId).toBe(me.householdId);
      expect(p.jobId).toBeTruthy();
    }
    expect(s.plan.alloc.learn).toBeGreaterThan(0);
    expect(Object.keys(s.plan.alloc).some((k) => k.startsWith('parent_time:'))).toBe(true);
    expect(s.plan.alloc.work).toBeUndefined();
    expect(integrityProblems(s)).toEqual([]);
  });

  it('kids cannot apply for jobs; teens only part-time', () => {
    const s = newGame(402, 'child');
    const kid = updatePlan(s, { ...s.plan, jobIntents: [{ kind: 'apply', careerId: 'barista' }] });
    expect(kid.plan.jobIntents).toEqual([]);
    const teen: GameState = structuredClone(s);
    active(teen).birthYear = teen.year - 16;
    const t = updatePlan(teen, { ...teen.plan, jobIntents: [{ kind: 'apply', careerId: 'barista' }, { kind: 'apply', careerId: 'retail' }] });
    expect(t.plan.jobIntents).toEqual([{ kind: 'apply', careerId: 'barista' }]);
  });

  it('plays through childhood with only childhood events, then the player chooses at 18', () => {
    for (const seed of [403, 404, 405]) {
      let s = newGame(seed, 'child');
      const seenAsChild: string[] = [];
      let chose = false;
      for (let y = 0; y < 16 && s.phase === 'PLANNING'; y++) {
        const isChild = ageOf(active(s), s.year) < 18;
        s = autoplayYear(s, (pe) => {
          if (isChild) seenAsChild.push(pe.eventId);
          if (pe.eventId === 'own_coming_of_age') chose = true;
          return firstChoice(pe);
        });
      }
      for (const id of seenAsChild) expect(CHILD_IDS.has(id) || id === 'own_coming_of_age' || id === 'school_friend', `${id} fired for a child`).toBe(true);
      if (s.phase === 'PLANNING') {
        expect(chose).toBe(true);
        expect(active(s).flags.came_of_age).toBe(1);
      }
    }
  });

  it('practice raises the hobby skill; parent time raises the bond', () => {
    let s = newGame(406, 'child');
    const me = active(s);
    me.hobby = 'music';
    const parent = parentsOf(s, me)[0];
    s = updatePlan(s, { ...s.plan, alloc: { practice: 4, [`parent_time:${parent.id}`]: 4 } });
    const key = [me.id, parent.id].sort().join('|');
    const before = s.bonds[key]?.affinity ?? 0;
    const after = autoplayYear(s, firstChoice);
    expect(active(after).skills.music ?? 0).toBeGreaterThan(5);
    expect(after.bonds[key].affinity).toBeGreaterThan(before - 5);
  });
});
