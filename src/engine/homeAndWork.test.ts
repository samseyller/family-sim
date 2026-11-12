import { describe, expect, it } from 'vitest';
import { CAREER_BY_ID } from '../content/careers';
import { HOMES } from '../content/finance';
import { EVENT_BY_ID, PROMO, resolveEvent } from './events';
import { capacityOf, homeOf, makeHome } from './finance';
import { assignJob, newGame } from './generate';
import { DEBT_WARNING } from './homeEvents';
import { autoplayYear, updatePlan } from './phases';
import { makeRng } from './rng';
import { strategyPlan } from './strategies';
import type { GameState, PendingEvent } from './types';
import { active, ageOf, alive, childrenOf, kidsAtHome, membersOf, partnerOf } from './util';

const ctx = (s: GameState) => ({ s, rng: makeRng(1), me: active(s) });
const pending = (_s: GameState, eventId: string) => ({ uid: 'x', eventId, title: '', text: '', choices: [], major: true }) as unknown as PendingEvent;

describe('promotions under stress', () => {
  it('stressed workers wait longer, but overdue good work can no longer be crowded out', () => {
    const s = newGame(5101);
    const me = active(s);
    assignJob(me, CAREER_BY_ID.pilot);
    me.flags.hired_year = s.year - 10;
    me.workPerf = 90;
    me.skills.flying = 100;
    me.stats.stress = 90;
    me.jobYears = PROMO.years;
    expect(EVENT_BY_ID.promotion_offer.candidates!(ctx(s))).toEqual([]); // stressed: not yet
    me.jobYears = PROMO.stressedYears;
    expect(EVENT_BY_ID.promotion_offer.candidates!(ctx(s))[0].urgent).toBe(false);
    me.jobYears = PROMO.stressedOverdue;
    expect(EVENT_BY_ID.promotion_offer.candidates!(ctx(s))[0].urgent).toBe(true);
  });

  it('an overworked, always-stressed employee is still promoted within about a decade', () => {
    let s = newGame(5102);
    const me = active(s);
    assignJob(me, CAREER_BY_ID.pilot);
    me.flags.hired_year = s.year - 1;
    me.skills.flying = 100;
    me.workPerf = 70;
    let promotedAfter = 0;
    for (let y = 1; y <= 12 && !promotedAfter; y++) {
      const p = active(s);
      p.stats.stress = 95; // burning out every year
      const plan = strategyPlan(s, 'career');
      s = updatePlan(s, { ...plan, alloc: { work: 9, exercise: 1, practice: 2 }, jobIntents: [] });
      s = autoplayYear(s, (pe) => (pe.eventId === 'promotion_offer' ? 'accept' : pe.eventId === 'burnout' ? 'push' : pe.choices.find((c) => !c.disabled)!.id));
      if (active(s).jobLevel > 1) promotedAfter = y;
    }
    expect(promotedAfter).toBeGreaterThan(0);
    expect(promotedAfter).toBeLessThanOrEqual(10);
  });
});

describe('a full house', () => {
  it('grown children living at home still marry and have children', () => {
    let married = 0;
    let babies = 0;
    for (let seed = 5200; seed < 5215; seed++) {
      let s = newGame(seed);
      const kid = kidsAtHome(s, active(s))[0];
      if (!kid) continue;
      kid.birthYear = s.year - 24;
      kid.flags.invited_home = s.year; // stays home
      for (let y = 0; y < 15 && alive(s.people[kid.id]); y++) {
        s = updatePlan(s, strategyPlan(s, 'family'));
        s = autoplayYear(s, (pe) => pe.choices.find((c) => !c.disabled)!.id);
      }
      const k = s.people[kid.id];
      if (k.householdId === active(s).householdId && partnerOf(s, k.id)) married++;
      babies += childrenOf(s, k.id).filter((b) => b.householdId === active(s).householdId).length;
    }
    expect(married).toBeGreaterThan(2);
    expect(babies).toBeGreaterThan(0);
  });

  it('when the house is over capacity, the family is asked what to do (and each option works)', () => {
    const s = newGame(5240);
    const h = s.households[active(s).householdId];
    h.assets = h.assets.filter((a) => a.kind !== 'house');
    h.assets.push(makeHome(s, 'starter', h.city ?? 'philadelphia', 0.2));
    h.wallet = 2_000_000;
    const kid = kidsAtHome(s, active(s))[0];
    kid.birthYear = s.year - 25;
    expect(EVENT_BY_ID.crowded_home.candidates!(ctx(s)).length).toBe(membersOf(s, h.id).length > capacityOf(h) ? 1 : 0);
    // Squeeze in two more relatives.
    for (const p of Object.values(s.people).filter((p) => p.householdId !== h.id && alive(p)).slice(0, 3)) p.householdId = h.id;
    expect(membersOf(s, h.id).length).toBeGreaterThan(capacityOf(h));
    const ev = EVENT_BY_ID.crowded_home.build(ctx(s));
    expect(ev.choices.map((c) => c.id)).toEqual(expect.arrayContaining(['expand', 'move_up', 'move_out', 'squeeze']));

    const expand = structuredClone(s);
    resolveEvent(expand, makeRng(1), pending(expand, 'crowded_home'), 'expand');
    expect(capacityOf(expand.households[h.id])).toBe(capacityOf(h) + 1);

    const moveUp = structuredClone(s);
    resolveEvent(moveUp, makeRng(1), pending(moveUp, 'crowded_home'), 'move_up');
    expect(capacityOf(moveUp.households[h.id])).toBeGreaterThanOrEqual(membersOf(moveUp, h.id).length);
    expect(homeOf(moveUp.households[h.id])!.capacity).toBeGreaterThan(HOMES.starter.capacity);

    const out = structuredClone(s);
    resolveEvent(out, makeRng(1), pending(out, 'crowded_home'), 'move_out');
    expect(out.people[kid.id].householdId).not.toBe(h.id);
  });
});

describe('a debt spiral', () => {
  it('is flagged when interest outruns the budget, and selling the house clears the debt', () => {
    const s = newGame(5301);
    const me = active(s);
    me.birthYear = s.year - 72;
    me.jobId = undefined;
    me.partJobId = undefined;
    me.retired = true;
    const h = s.households[me.householdId];
    for (const p of membersOf(s, h.id)) if (p.id !== me.id) p.householdId = 'elsewhere';
    h.assets = h.assets.filter((a) => a.kind !== 'house');
    h.assets.push(makeHome(s, 'large', h.city ?? 'philadelphia', 0.2));
    h.wallet = -DEBT_WARNING - 50_000;
    expect(ageOf(me, s.year)).toBe(72);
    expect(EVENT_BY_ID.debt_spiral.candidates!(ctx(s))).toHaveLength(1);
    const ids = EVENT_BY_ID.debt_spiral.build(ctx(s)).choices.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['sell_rent', 'downsize', 'frugal', 'ignore']));
    resolveEvent(s, makeRng(1), pending(s, 'debt_spiral'), 'sell_rent');
    expect(homeOf(h)).toBeUndefined();
    expect(h.wallet).toBeGreaterThan(0);
  });

  it('is not raised for small or affordable debt', () => {
    const s = newGame(5302);
    s.households[active(s).householdId].wallet = -5_000;
    expect(EVENT_BY_ID.debt_spiral.candidates!(ctx(s))).toEqual([]);
  });
});
