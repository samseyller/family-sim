import { DEBT_RATE, SAVINGS_RATE } from '../content/economy';
import { describe, expect, it } from 'vitest';
import { newGame, SCHEMA_VERSION } from './generate';
import { autoplayYear, choose, chooseHeir, devKill, eligibleHeirs, nextYear, resolveYear, updatePlan } from './phases';
import { makeRng } from './rng';
import { strategyPlan } from './strategies';
import { settleEstates } from './family';
import type { GameState } from './types';
import { active, ageOf, alive } from './util';
import { TIME_BUDGET } from '../content/actions';

const firstChoice = (pe: GameState['pending'][number]) => pe.choices.find((c) => !c.disabled)!.id;

function play(seed: number, years: number) {
  let s = newGame(seed);
  for (let i = 0; i < years && s.phase === 'PLANNING'; i++) s = autoplayYear(s, firstChoice);
  return s;
}

/** Advance until a year produces at least one decision. */
function untilDecision(seed: number) {
  let s = newGame(seed);
  for (let i = 0; i < 60; i++) {
    s = resolveYear(s);
    if (s.phase === 'DECISIONS') return s;
    s = nextYear(s);
    if (s.phase !== 'PLANNING') break;
  }
  throw new Error('no decision found');
}

describe('determinism', () => {
  it('same seed produces identical games', () => {
    expect(JSON.stringify(play(7, 30))).toEqual(JSON.stringify(play(7, 30)));
  });

  it('different seeds diverge', () => {
    expect(JSON.stringify(play(1, 5))).not.toEqual(JSON.stringify(play(2, 5)));
  });
});

describe('save/reload exactly-once', () => {
  it('reloading during an unresolved event gives the same result as not reloading', () => {
    const atDecision = untilDecision(11);
    const reloaded: GameState = JSON.parse(JSON.stringify(atDecision));
    const finish = (s: GameState) => {
      while (s.phase === 'DECISIONS') s = choose(s, s.pending[0].uid, firstChoice(s.pending[0]));
      return nextYear(s);
    };
    const a = finish(atDecision);
    const b = finish(reloaded);
    expect(JSON.stringify(b)).toEqual(JSON.stringify(a));
    // Year advanced exactly once; salary/aging were not re-applied.
    expect(a.year).toBe(atDecision.year + 1);
  });

  it('choosing the same event twice applies it once', () => {
    const s = untilDecision(12);
    const pe = s.pending[0];
    const once = choose(s, pe.uid, firstChoice(pe));
    const twice = choose(once, pe.uid, firstChoice(pe));
    expect(twice).toBe(once);
  });

  it('resolveYear is a no-op outside PLANNING', () => {
    const s = untilDecision(13);
    expect(resolveYear(s)).toBe(s);
  });
});

describe('plan', () => {
  it('never exceeds the time budget', () => {
    const s = newGame(3);
    const next = updatePlan(s, { alloc: { relax: 50, exercise: 9 }, children: {}, jobIntents: [] });
    const total = Object.values(next.plan.alloc).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(TIME_BUDGET);
  });
});

describe('succession and money', () => {
  it('continuing as the spouse transfers nothing', () => {
    let s = newGame(21);
    const hh = active(s).householdId;
    const before = s.households[hh].wallet;
    s = devKill(s);
    const spouse = eligibleHeirs(s).find((p) => p.householdId === hh)!;
    expect(spouse).toBeDefined();
    s = chooseHeir(s, spouse.id);
    expect(s.activeId).toBe(spouse.id);
    expect(s.households[hh].wallet).toBe(before);
    expect(s.phase).toBe('PLANNING');
  });

  it('estates of emptied households are paid out exactly once', () => {
    let s = play(5, 15);
    // Move the eldest child out, then kill everyone left at home.
    const me = active(s);
    const kid = Object.values(s.people).find((p) => p.biologicalParents.includes(me.id))!;
    const draft: GameState = structuredClone(s);
    const kidHh = 'hX';
    draft.households[kidHh] = { id: kidHh, wallet: 0, assets: [], settled: false };
    draft.people[kid.id].householdId = kidHh;
    const home = draft.households[me.householdId];
    home.wallet = 50000;
    for (const p of Object.values(draft.people)) if (p.householdId === me.householdId) p.deathYear = draft.year;
    settleEstates(draft);
    const afterFirst = draft.households[kidHh].wallet;
    expect(afterFirst).toBeGreaterThan(0);
    settleEstates(draft);
    expect(draft.households[kidHh].wallet).toBe(afterFirst);
    expect(draft.households[me.householdId].settled).toBe(true);
    s = draft;
    expect(s.households[me.householdId].wallet).toBe(0);
  });

  it('game over when there is no heir', () => {
    let s = devKill(newGame(4));
    s = chooseHeir(s, null);
    expect(s.phase).toBe('GAME_OVER');
  });
});

describe('long-run invariants', () => {
  it('multi-generation random play keeps a valid state', { timeout: 60000 }, () => {
    for (let seed = 100; seed < 120; seed++) {
      const r = makeRng(seed * 7);
      let s = newGame(seed);
      for (let y = 0; y < 150; y++) {
        if (s.phase === 'SUCCESSION') {
          const heirs = eligibleHeirs(s);
          s = chooseHeir(s, heirs.length ? r.pick(heirs).id : null);
        }
        if (s.phase === 'GAME_OVER') break;
        s = updatePlan(s, strategyPlan(s, r.pick(['career', 'family', 'balanced'] as const)));
        expect(Object.values(s.plan.alloc).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(TIME_BUDGET);
        expect(alive(active(s))).toBe(true);
        s = autoplayYear(s, (pe) => r.pick(pe.choices.filter((c) => !c.disabled)).id);
        for (const p of Object.values(s.people)) {
          for (const v of Object.values(p.stats)) expect(Number.isFinite(v)).toBe(true);
          expect(ageOf(p, s.year)).toBeGreaterThanOrEqual(0);
        }
        for (const h of Object.values(s.households)) expect(Number.isFinite(h.wallet)).toBe(true);
      }
    }
  });
});

describe('part-time jobs', () => {
  const withJobs = (seed: number, partId: string) => {
    const s = newGame(seed);
    const me = s.people[s.activeId];
    me.jobId = 'retail';
    me.jobLevel = 1;
    me.partJobId = partId;
    me.partPerf = 50;
    me.stats.stress = 30;
    return s;
  };

  it('caps part-time at 4 blocks and the budget at 12', () => {
    const s = withJobs(31, 'barista');
    const next = updatePlan(s, { alloc: { parttime: 9, work: 4 }, children: {}, jobIntents: [] });
    expect(next.plan.alloc.parttime).toBe(4);
    expect(TIME_BUDGET).toBe(12);
  });

  it('2 part-time blocks keep standing; holding two jobs adds stress', () => {
    const base = withJobs(32, 'barista');
    const onlyFull = structuredClone(base);
    onlyFull.people[onlyFull.activeId].partJobId = undefined;
    const plan = { alloc: { work: 4, parttime: 2 }, children: {}, jobIntents: [] };
    const a = resolveYear(updatePlan(base, plan));
    const b = resolveYear(updatePlan(onlyFull, { ...plan, alloc: { work: 4 } }));
    const meA = a.people[a.activeId];
    expect(meA.partJobId).toBe('barista');
    expect(meA.partPerf).toBeGreaterThanOrEqual(50 - 4);
    expect(meA.stats.stress).toBeGreaterThan(b.people[b.activeId].stats.stress);
  });

  it('part-time jobs have no degree or trade-cert requirements', async () => {
    const { CAREERS } = await import('../content/careers');
    for (const c of CAREERS.filter((x) => x.hours === 'part')) expect(c.requires).toBeUndefined();
  });

  it('one intent per job slot; apply for part-time while keeping full-time', () => {
    const s = withJobs(33, 'barista');
    s.people[s.activeId].partJobId = undefined;
    const next = updatePlan(s, {
      alloc: { work: 4, parttime: 2 },
      children: {},
      jobIntents: [{ kind: 'apply', careerId: 'delivery' }, { kind: 'apply', careerId: 'barista' }],
    });
    expect(next.plan.jobIntents).toEqual([{ kind: 'apply', careerId: 'delivery' }]);
    expect(next.plan.alloc.parttime).toBe(2);
  });
});

describe('migrations', () => {
  it('upgrades a v1 save to the current schema', async () => {
    const { migrate } = await import('./migrations');
    const v1: any = structuredClone(newGame(41));
    v1.schemaVersion = 1;
    v1.plan.jobIntent = { kind: 'quit' };
    delete v1.plan.jobIntents;
    for (const p of Object.values<any>(v1.people)) { delete p.partPerf; delete p.partYears; }
    const up = migrate(v1)!;
    expect(up.schemaVersion).toBe(SCHEMA_VERSION);
    expect(up.plan.jobIntents).toEqual([{ kind: 'quit', slot: 'full' }]);
    expect(Object.values(up.people).every((p) => p.partPerf === 50)).toBe(true);
    expect(migrate({ schemaVersion: 99 })).toBeUndefined();
  });
});

describe('end-year estimate', () => {
  it('matches the real economy result (before interest)', async () => {
    const { estimateYear } = await import('./budget');
    const { applyPlan, runEconomy } = await import('./systems');
    for (const seed of [51, 52, 53, 54]) {
      const s = newGame(seed);
      const est = estimateYear(s);
      const draft: GameState = structuredClone(s);
      const hh = draft.households[active(draft).householdId];
      const before = hh.wallet;
      const pay = applyPlan(draft, makeRng(draft.rngState));
      runEconomy(draft, pay);
      const raw = before + est.net;
      expect(hh.wallet).toBe(Math.round(raw * (raw > 0 ? 1 + SAVINGS_RATE : 1 + DEBT_RATE)));
      expect(est.totalIncome - est.totalExpenses).toBe(est.net);
    }
  });
});

describe('heirs', () => {
  it('adult grandchildren can carry the story on', () => {
    let s = newGame(61);
    const me = active(s);
    const kid = Object.values(s.people).find((p) => p.biologicalParents.includes(me.id))!;
    const draft: GameState = structuredClone(s);
    // Fast-forward ages: kid is 50, give them a 25-year-old child in their own household.
    draft.people[kid.id].birthYear = draft.year - 50;
    draft.people[me.id].birthYear = draft.year - 80;
    const gc = structuredClone(draft.people[kid.id]);
    gc.id = 'pgc';
    gc.birthYear = draft.year - 25;
    gc.biologicalParents = [kid.id];
    draft.people[gc.id] = gc;
    s = devKill(draft);
    const heirs = eligibleHeirs(s);
    expect(heirs.find((h) => h.id === 'pgc')?.relation).toBe('grandchild');
    expect(heirs.find((h) => h.id === kid.id)?.relation).toBe('child');
    s = chooseHeir(s, 'pgc');
    expect(s.activeId).toBe('pgc');
    expect(s.phase).toBe('PLANNING');
  });
});
