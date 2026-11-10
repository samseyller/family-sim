/** The scripted players manage careers like a sensible human would. */
import { describe, expect, it } from 'vitest';
import { newGame } from './generate';
import { autoplayYear, updatePlan } from './phases';
import { strategyPlan } from './strategies';
import type { GameState } from './types';
import { active } from './util';
import { CAREER_BY_ID } from '../content/careers';

const firstChoice = (pe: GameState['pending'][number]) => pe.choices.find((c) => !c.disabled)!.id;

describe('scripted players', () => {
  it('apply for a full-time job when unemployed', () => {
    const s = newGame(501);
    active(s).jobId = undefined;
    const plan = strategyPlan(s, 'balanced');
    expect(plan.jobIntents.some((i) => i.kind === 'apply')).toBe(true);
    expect(plan.alloc.work ?? 0).toBeGreaterThan(0);
  });

  it('take a part-time job when the household runs a deficit, and drop it when comfortable', () => {
    const s = newGame(502);
    const me = active(s);
    me.jobId = 'retail';
    me.jobLevel = 1;
    s.households[me.householdId].wallet = -20000;
    const tight = strategyPlan(s, 'balanced');
    const part = tight.jobIntents.find((i) => i.kind === 'apply' && CAREER_BY_ID[i.careerId].hours === 'part');
    expect(part && part.kind === 'apply' ? CAREER_BY_ID[part.careerId]?.hours : '').toBe('part');
    expect(tight.alloc.parttime).toBe(2);

    me.partJobId = 'barista';
    s.households[me.householdId].wallet = 200000;
    const comfy = strategyPlan(s, 'balanced');
    expect(comfy.jobIntents).toContainEqual({ kind: 'quit', slot: 'part' });
  });

  it('over many years, unemployment is short-lived', () => {
    let unemployedYears = 0;
    let workingYears = 0;
    for (const seed of [503, 504, 505, 506]) {
      let s = newGame(seed);
      for (let y = 0; y < 25 && s.phase === 'PLANNING'; y++) {
        s = updatePlan(s, strategyPlan(s, 'balanced'));
        const me = active(s);
        if (!me.retired && !me.studyingUntil) (me.jobId ? workingYears++ : unemployedYears++);
        s = autoplayYear(s, firstChoice);
      }
    }
    expect(unemployedYears / (unemployedYears + workingYears)).toBeLessThan(0.15);
  });
});
