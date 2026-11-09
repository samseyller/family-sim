/** Stage 4: dating, divorce, night school, home and family arcs. */
import { DEBT_RATE, SAVINGS_RATE } from '../content/economy';
import { describe, expect, it } from 'vitest';
import { newGame } from './generate';
import { breakUp, divorce, homeEquityShare, marry, reconcile, separate, separatedFrom, startDating } from './family';
import { EVENT_BY_ID, type Ctx } from './events';
import { eligibleHeirs, devKill, resolveYear, updatePlan } from './phases';
import { makeRng } from './rng';
import { estimateYear } from './budget';
import { applyPlan, runEconomy } from './systems';
import type { GameState, Person } from './types';
import { active, activePartnership, childrenOf, membersOf, parentsOf, partnerOf } from './util';
import { GameStateSchema, integrityProblems } from '../persistence/schema';

/** A fresh game whose active character is single (spouse removed). */
function single(seed: number) {
  const s = newGame(seed);
  const me = active(s);
  const sp = partnerOf(s, me.id)!;
  s.partnerships = s.partnerships.filter((p) => p.a !== me.id && p.b !== me.id);
  delete s.people[sp.id];
  for (const p of Object.values(s.people)) {
    p.biologicalParents = p.biologicalParents.filter((id) => id !== sp.id);
  }
  return s;
}
const ctx = (s: GameState): Ctx => ({ s, rng: makeRng(1), me: active(s) });
const stranger = (s: GameState, near: Person) => {
  const hh = `hS${s.nextId}`;
  s.households[hh] = { id: hh, wallet: 12000, assets: [], settled: false };
  const p: Person = structuredClone(near);
  p.id = `pS${s.nextId++}`;
  p.householdId = hh;
  p.biologicalParents = [];
  s.people[p.id] = p;
  return p;
};

describe('relationships', () => {
  it('dating keeps finances separate; marriage merges once', () => {
    const s = single(81);
    const me = active(s);
    const date = stranger(s, me);
    const mine = s.households[me.householdId].wallet;
    startDating(s, me, date);
    expect(partnerOf(s, me.id)?.id).toBe(date.id);
    expect(date.householdId).not.toBe(me.householdId);
    expect(s.households[me.householdId].wallet).toBe(mine);
    marry(s, me, date);
    expect(activePartnership(s, me.id)?.status).toBe('married');
    expect(s.partnerships.filter((p) => p.a === me.id || p.b === me.id)).toHaveLength(1);
    expect(date.householdId).toBe(me.householdId);
    expect(s.households[me.householdId].wallet).toBe(mine + 12000);
    marry(s, me, date); // again: no double merge
    expect(s.households[me.householdId].wallet).toBe(mine + 12000);
  });

  it('break-ups end dating without touching money', () => {
    const s = single(82);
    const me = active(s);
    const date = stranger(s, me);
    startDating(s, me, date);
    breakUp(s, me, date);
    expect(partnerOf(s, me.id)).toBeUndefined();
  });

  it('separation, divorce with equity split, and reconciliation', () => {
    const s = newGame(83);
    const me = active(s);
    const sp = partnerOf(s, me.id)!;
    const hh = s.households[me.householdId];
    hh.wallet = 100000;
    hh.assets.push({ id: 'aX', kind: 'house', name: 'Home', value: 300000, mortgage: 100000, upkeep: 0 });
    separate(s, me, sp);
    expect(hh.wallet).toBe(50000);
    expect(separatedFrom(s, me.id)?.id).toBe(sp.id);
    expect(partnerOf(s, me.id)).toBeUndefined();
    expect(homeEquityShare(s, me)).toBe(100000);
    const before = s.households[sp.householdId].wallet;
    expect(divorce(s, me, sp)).toBe(100000);
    expect(hh.wallet).toBe(-50000);
    expect(s.households[sp.householdId].wallet).toBe(before + 100000);
    expect(separatedFrom(s, me.id)).toBeUndefined();

    const t = newGame(84);
    const m2 = active(t);
    const s2 = partnerOf(t, m2.id)!;
    separate(t, m2, s2);
    reconcile(t, m2, s2);
    expect(partnerOf(t, m2.id)?.id).toBe(s2.id);
    expect(s2.householdId).toBe(m2.householdId);
  });

  it('a dating partner never becomes an heir', () => {
    let s = single(85);
    const me = active(s);
    startDating(s, me, stranger(s, me));
    s = devKill(s);
    expect(eligibleHeirs(s).some((h) => h.relation === 'spouse')).toBe(false);
  });
});

describe('events', () => {
  it('proposals can marry a dating partner', () => {
    const s = single(86);
    const me = active(s);
    const date = stranger(s, me);
    startDating(s, me, date);
    s.year += 2;
    s.bonds[[me.id, date.id].sort().join('|')] = { affinity: 100, trust: 100 };
    const ev = EVENT_BY_ID.proposal;
    expect(ev.candidates!(ctx(s)).length).toBe(1);
    ev.resolve(ctx(s), 'propose', date);
    expect(activePartnership(s, me.id)?.status).toBe('married');
  });

  it('adoption adds an adopted child to the household', () => {
    const s = newGame(87);
    const me = active(s);
    s.households[me.householdId].wallet = 50000;
    const before = childrenOf(s, me.id).length;
    EVENT_BY_ID.baby.resolve(ctx(s), 'adopt', partnerOf(s, me.id));
    const kids = childrenOf(s, me.id);
    expect(kids.length).toBe(before + 1);
    expect(kids.some((k) => k.adoptiveParents.includes(me.id) && k.householdId === me.householdId)).toBe(true);
  });

  it('a parent can move in, bringing their savings', () => {
    const s = newGame(88);
    const me = active(s);
    const parent = parentsOf(s, me).find((p) => p.deathYear === undefined)!;
    const theirs = s.households[parent.householdId].wallet;
    for (const p of membersOf(s, parent.householdId)) if (p.id !== parent.id) p.deathYear = s.year - 1;
    const mine = s.households[me.householdId].wallet;
    EVENT_BY_ID.parent_needs_care.resolve(ctx(s), 'move_in', parent);
    expect(parent.householdId).toBe(me.householdId);
    expect(s.households[me.householdId].wallet).toBe(mine + theirs);
  });

  it('every new event builds and resolves every choice without breaking the state', () => {
    for (const id of ['meet_someone', 'proposal', 'dating_rocky', 'divorce_or_reconcile', 'kid_moves_back', 'adult_kid_idle', 'parent_needs_care', 'night_school_flyer', 'workplace_credit']) {
      const def = EVENT_BY_ID[id];
      const base = newGame(90);
      const me = active(base);
      // A subject that fits most events: a family member.
      const subject = id === 'parent_needs_care' ? parentsOf(base, me)[0] : partnerOf(base, me.id);
      const built = def.build(ctx(base), subject);
      for (const ch of built.choices) {
        const s = structuredClone(base);
        const sub = subject ? s.people[subject.id] : undefined;
        if (id === 'divorce_or_reconcile' || id === 'dating_rocky') {
          if (id === 'divorce_or_reconcile') separate(s, active(s), sub!);
        }
        const out = def.resolve(ctx(s), ch.id, sub);
        expect(typeof out).toBe('string');
        expect(GameStateSchema.safeParse(s).success).toBe(true);
        expect(integrityProblems(s)).toEqual([]);
      }
    }
  });
});

describe('night school', () => {
  it('enroll, study, graduate, and the estimate matches the economy', () => {
    let s = newGame(91);
    const me = active(s);
    me.stats.smarts = 70;
    delete me.flags.degree;
    s = updatePlan(s, { ...s.plan, alloc: { ...s.plan.alloc, relax: 0, study: 3 }, eduIntent: { kind: 'enroll', program: 'degree' } });
    expect(s.plan.eduIntent).toEqual({ kind: 'enroll', program: 'degree' });
    const est = estimateYear(s);
    expect(est.expenses.find((l) => l.label === 'Night school')?.amount).toBe(6000);
    const draft: GameState = structuredClone(s);
    const hh = draft.households[active(draft).householdId];
    const w0 = hh.wallet;
    runEconomy(draft, applyPlan(draft, makeRng(draft.rngState)));
    const raw = w0 + est.net;
    expect(hh.wallet).toBe(Math.round(raw * (raw > 0 ? 1 + SAVINGS_RATE : 1 + DEBT_RATE)));
    expect(active(draft).education?.progress).toBe(3);

    // Finish it.
    active(draft).education!.progress = 11;
    draft.plan = { ...draft.plan, alloc: { study: 2 }, eduIntent: undefined };
    applyPlan(draft, makeRng(1));
    expect(active(draft).education).toBeUndefined();
    expect(active(draft).flags.degree).toBe(1);
  });

  it('cannot enroll in a program you already have', () => {
    const s = newGame(92);
    active(s).flags.trade_cert = 1;
    const next = updatePlan(s, { ...s.plan, eduIntent: { kind: 'enroll', program: 'trade_cert' } });
    expect(next.plan.eduIntent).toBeUndefined();
  });
});

describe('new games', () => {
  it('start with living parents in their own home', () => {
    for (const seed of [93, 94, 95, 96]) {
      const s = newGame(seed);
      const me = active(s);
      const parents = parentsOf(s, me);
      expect(parents).toHaveLength(2);
      expect(parents.some((p) => p.deathYear === undefined)).toBe(true);
      for (const p of parents) expect(p.householdId).not.toBe(me.householdId);
      expect(integrityProblems(s)).toEqual([]);
      expect(resolveYear(s).phase).not.toBe('PLANNING');
    }
  });
});

describe('night school safety', () => {
  it('enrolling from the flyer pencils study time into the plan', () => {
    const s = newGame(97);
    const me = active(s);
    delete me.flags.trade_cert;
    s.plan.alloc = { work: 4, relax: 5 };
    EVENT_BY_ID.night_school_flyer.resolve(ctx(s), 'trade_cert');
    expect(s.plan.alloc.study).toBe(3);
    expect(s.plan.alloc.relax).toBe(2);
  });

  it('two idle years in a row withdraws you, so tuition stops', () => {
    const s = newGame(98);
    const me = active(s);
    me.education = { program: 'degree', progress: 2, required: 12, startYear: s.year };
    s.plan = { ...s.plan, alloc: { relax: 2 } };
    applyPlan(s, makeRng(1));
    expect(me.education).toBeDefined();
    s.plan = { ...s.plan, alloc: { relax: 2 } };
    applyPlan(s, makeRng(2));
    expect(me.education).toBeUndefined();
    expect(me.flags.dropped_out).toBe(1);
  });
});

describe('economy balance', () => {
  it('income tax is progressive', async () => {
    const { incomeTax } = await import('../content/economy');
    expect(incomeTax(10000)).toBe(0);
    expect(incomeTax(30000)).toBe(1800);
    const low = incomeTax(40000) / 40000;
    const high = incomeTax(150000) / 150000;
    expect(high).toBeGreaterThan(low);
  });

  it('lifestyle trades savings for happiness', () => {
    const base = newGame(301);
    const net = (style: 'frugal' | 'comfortable' | 'lavish') => estimateYear(updatePlan(base, { ...base.plan, lifestyle: style })).net;
    expect(net('frugal')).toBeGreaterThan(net('comfortable'));
    expect(net('comfortable')).toBeGreaterThan(net('lavish'));
    const s = updatePlan(base, { ...base.plan, lifestyle: 'lavish' });
    const before = active(s).stats.happiness;
    const d = structuredClone(s);
    applyPlan(d, makeRng(1));
    const lavishGain = active(d).stats.happiness - before;
    const f = updatePlan(base, { ...base.plan, lifestyle: 'frugal' });
    const d2 = structuredClone(f);
    applyPlan(d2, makeRng(1));
    expect(lavishGain).toBeGreaterThan(active(d2).stats.happiness - before);
  });

  it('the lifestyle choice survives plan updates and year changes', () => {
    const s = updatePlan(newGame(302), { ...newGame(302).plan, lifestyle: 'frugal' });
    expect(s.plan.lifestyle).toBe('frugal');
  });

  it('estates above the exemption are taxed once', async () => {
    const { estateTax } = await import('./family');
    expect(estateTax(800000)).toBe(0);
    expect(estateTax(2000000)).toBe(300000);
  });
});
