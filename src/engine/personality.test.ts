/** Stage 1 gate: every trait has an upside, a downside and an explanation; reactions are bounded and deterministic. */
import { describe, expect, it } from 'vitest';
import { performActivity } from './activities';
import { newGame } from './generate';
import { REACTION_RANGE, reaction, TRAIT_INFO, yearTendencies, type Situation, type YearShape } from './personality';
import { makeRng } from './rng';
import { applyPlan } from './systems';
import type { GameState, Person, Trait } from './types';
import { active, getBond, kidsAtHome, partnerOf } from './util';

const TRAITS: Trait[] = ['ambitious', 'kind', 'stubborn', 'curious', 'anxious', 'easygoing', 'creative', 'athletic'];
const person = (traits: Trait[], extra: Partial<Person> = {}) => ({ ...active(newGame(1)), traits, ...extra }) as Person;
const QUIET: YearShape = { worked: true, workSurplus: 0, idle: false, learned: true, practicedCreative: true, exercised: true, triedSomethingNew: true, bigChange: false, neglect: false, helpedWhileStressed: false };

/** For each trait: a situation where it helps, and a year shape where it costs. */
const UPSIDE: Record<Trait, [Situation, Partial<Person>?] | 'year'> = {
  ambitious: 'year', kind: ['help'], stubborn: ['practice'], curious: ['learn'], anxious: ['relax'],
  easygoing: 'year', creative: ['practice', { hobby: 'music' }], athletic: ['exercise'],
};
const DOWNSIDE: Record<Trait, Partial<YearShape> | [Situation]> = {
  ambitious: { workSurplus: -2 }, kind: { helpedWhileStressed: true }, stubborn: [] as never, curious: { learned: false, triedSomethingNew: false, yearsInRoutine: 2 },
  anxious: { bigChange: true }, easygoing: ['practice'], creative: { practicedCreative: false, yearsWithoutOutlet: 3 }, athletic: { exercised: false },
};

describe('personality contract', () => {
  it('every trait has an upside and an explanation', () => {
    for (const t of TRAITS) {
      expect(TRAIT_INFO[t].length, t).toBeGreaterThan(20);
      const up = UPSIDE[t];
      if (up === 'year') {
        const ts = yearTendencies(person([t]), { ...QUIET, workSurplus: 2 });
        expect(ts.some((x) => (x.happiness ?? 0) > 0 || (x.stress ?? 0) < 0), t).toBe(true);
      } else {
        const r = reaction(person([t], up[1]), up[0]);
        expect(r.factor, t).toBeGreaterThan(1);
        expect(r.note, t).toBeTruthy();
      }
    }
  });

  it('every trait has a downside, and it says why', () => {
    for (const t of TRAITS) {
      if (t === 'stubborn') continue; // stubborn's cost is resisting pressure (receptiveness), tested in family rules
      const d = DOWNSIDE[t];
      if (Array.isArray(d)) {
        expect(reaction(person([t]), d[0]).factor, t).toBeLessThan(1);
      } else {
        const ts = yearTendencies(person([t]), { ...QUIET, ...d });
        const cost = ts.find((x) => (x.happiness ?? 0) < 0 || (x.stress ?? 0) > 0);
        expect(cost, t).toBeDefined();
        expect(cost!.note.length).toBeGreaterThan(10);
      }
    }
  });

  it('stacked traits stay within the cap, and no trait changes what an action costs', () => {
    const both = reaction(person(['creative', 'stubborn'], { hobby: 'music' }), 'practice');
    expect(both.factor).toBeLessThanOrEqual(REACTION_RANGE.max);
    for (const t of TRAITS) for (const sit of ['exercise', 'relax', 'learn', 'practice', 'socialize', 'help', 'travel', 'newThing'] as Situation[]) {
      const f = reaction(person([t]), sit).factor;
      expect(f).toBeGreaterThanOrEqual(REACTION_RANGE.min);
      expect(f).toBeLessThanOrEqual(REACTION_RANGE.max);
    }
  });
});

describe('same plan, different people', () => {
  /** Run one year of the same plan with the active character given these traits. */
  const year = (traits: Trait[]) => {
    const s = newGame(4242);
    const me = active(s);
    me.traits = traits;
    const p = partnerOf(s, me.id)!;
    const kid = kidsAtHome(s, me)[0];
    s.plan.alloc = { work: s.plan.alloc.work ?? 0, partner_time: 2, [`child_time:${kid.id}`]: 2, relax: 2, exercise: 1 };
    applyPlan(s, makeRng(7));
    return { s, me, p, kid };
  };

  it('a kind parent builds bonds faster from the same time together', () => {
    const plain = year(['curious', 'creative']);
    const kind = year(['kind', 'creative']);
    expect(getBond(kind.s, kind.me.id, kind.p.id).affinity).toBeGreaterThan(getBond(plain.s, plain.me.id, plain.p.id).affinity);
    expect(getBond(kind.s, kind.me.id, kind.kid.id).affinity).toBeGreaterThan(getBond(plain.s, plain.me.id, plain.kid.id).affinity);
  });

  it('is deterministic: the same seed and plan give the same state', () => {
    expect(JSON.stringify(year(['anxious', 'kind']).s)).toBe(JSON.stringify(year(['anxious', 'kind']).s));
  });

  it('the year recap names the trait that mattered most', () => {
    const { s } = year(['athletic', 'kind']);
    expect(s.journal.some((j) => /^\((athletic|kind)\) /.test(j.text))).toBe(true);
  });
});

describe('activities react to personality', () => {
  const rich = (traits: Trait[]): GameState => {
    const s = newGame(5151);
    s.households[active(s).householdId].wallet = 100_000;
    active(s).traits = traits;
    active(s).stats.stress = 50;
    return s;
  };

  it('an anxious person gets more out of a quiet day, and is told why', () => {
    const run = (traits: Trait[]) => {
      const s = rich(traits);
      const who = kidsAtHome(s, active(s))[0];
      return performActivity(s, 'quiet_day', [who.id]);
    };
    const calm = run(['anxious', 'creative']);
    const plain = run(['ambitious', 'creative']);
    expect(active(calm).stats.stress).toBeLessThan(active(plain).stats.stress);
    expect(calm.lastActivity!.text).toMatch(/calm, predictable day/);
  });

  it('the new low-cost activities are open to everyone, whatever their traits', () => {
    for (const t of TRAITS) {
      const s = rich([t]);
      const kid = kidsAtHome(s, active(s))[0];
      for (const id of ['try_new_together', 'help_project', 'quiet_day']) {
        expect(performActivity(s, id, [kid.id]).lastActivity?.id, `${t} ${id}`).toBe(id);
      }
    }
  });
});
