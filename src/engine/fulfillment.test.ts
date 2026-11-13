/** Stage 4 gate: aspiration and fulfillment. */
import { describe, expect, it } from 'vitest';
import { checkGame } from '../persistence/exportImport';
import { EVENT_BY_ID } from './events';
import { constrained, initialFulfillment, suggestAspiration, updateFulfillment, type FulfillmentYear } from './fulfillment';
import { newGame } from './generate';
import { chooseHeir, devKill, eligibleHeirs, resolveYear } from './phases';
import { makeRng } from './rng';
import type { GameState } from './types';
import { active } from './util';

const NONE: FulfillmentYear = { partnerBlocks: 0, childBlocks: 0, outing: 0, socialize: 0, practice: 0, learn: 0, workSurplus: 0, neglect: false, activities: [] };
const adult = (seed: number) => { const s = newGame(seed); active(s).stats.health = 80; return s; };

describe('aspiration', () => {
  it('an adult without one is asked, with a suggestion first; choosing sets it', () => {
    const s = adult(8101);
    expect(active(s).aspiration).toBeUndefined();
    const t = resolveYear(s);
    const pe = t.pending.find((p) => p.eventId === 'choose_aspiration')!;
    expect(pe).toBeDefined();
    expect(pe.choices[0].label).toMatch(/suggested/);
    expect(pe.choices).toHaveLength(6);
    const c = { s: t, rng: makeRng(1), me: active(t) };
    EVENT_BY_ID.choose_aspiration.resolve(c, 'service');
    expect(active(t).aspiration).toBe('service');
  });

  it('changing course later comes with a grace period, not a drop', () => {
    const s = adult(8102);
    const me = active(s);
    me.aspiration = 'mastery';
    me.fulfillment = 60;
    EVENT_BY_ID.choose_aspiration.resolve({ s, rng: makeRng(1), me }, 'exploration');
    expect(me.flags.aspiration_grace).toBeGreaterThanOrEqual(s.year + 1);
    const before = me.fulfillment;
    updateFulfillment(s, me, NONE); // a quiet year while settling in
    expect(me.fulfillment).toBeGreaterThanOrEqual(before - 2);
  });
});

describe('fulfillment', () => {
  it('rises in years that serve the aspiration and falls in years that don’t, slowly', () => {
    const s = adult(8103);
    const me = active(s);
    me.aspiration = 'mastery';
    me.fulfillment = 50;
    updateFulfillment(s, me, { ...NONE, practice: 4, learn: 2 });
    const up = me.fulfillment!;
    expect(up).toBeGreaterThan(50);
    expect(up).toBeLessThanOrEqual(60); // slow
    me.fulfillment = 50;
    updateFulfillment(s, me, NONE);
    expect(me.fulfillment).toBeLessThan(50);
  });

  it('hard circumstances temper expectations instead of punishing', () => {
    const s = adult(8104);
    const me = active(s);
    me.aspiration = 'mastery';
    me.fulfillment = 50;
    me.stats.health = 30; // illness
    expect(constrained(s, me)).toBeDefined();
    const res = updateFulfillment(s, me, NONE);
    expect(me.fulfillment).toBeGreaterThanOrEqual(50);
    expect(res.why).toMatch(/hard year/);
  });

  it('has a small reach: at most a couple of happiness points a year', () => {
    const s = adult(8105);
    const me = active(s);
    me.aspiration = 'connection';
    me.fulfillment = 100;
    me.stats.happiness = 50;
    updateFulfillment(s, me, { ...NONE, partnerBlocks: 3, childBlocks: 4, outing: 2 });
    expect(me.stats.happiness - 50).toBeLessThanOrEqual(2);
  });

  it('low fulfillment brings choices that help, not an unavoidable decline', () => {
    const s = adult(8106);
    const me = active(s);
    me.fulfillment = 25;
    const c = { s, rng: makeRng(1), me };
    expect(EVENT_BY_ID.something_missing.candidates!(c).length).toBe(1);
    EVENT_BY_ID.something_missing.resolve(c, 'talk');
    expect(me.fulfillment).toBe(30);
    EVENT_BY_ID.something_missing.resolve(c, 'refocus');
    expect(me.flags.refocus_year).toBe(s.year + 1);
  });

  it('starts conservatively from current circumstances', () => {
    const s = adult(8107);
    const f = initialFulfillment(s, active(s));
    expect(f).toBeGreaterThanOrEqual(35);
    expect(f).toBeLessThanOrEqual(65);
    expect(['connection', 'mastery', 'achievement', 'exploration', 'security', 'service']).toContain(suggestAspiration(active(s)));
  });
});

describe('saves and succession', () => {
  it('a save from before aspirations loads; new fields validate', () => {
    const s = adult(8108);
    expect(checkGame(JSON.parse(JSON.stringify({ ...s, schemaVersion: 21 })), 'old').ok).toBe(true);
    active(s).aspiration = 'security';
    active(s).fulfillment = 58;
    const res = checkGame(JSON.parse(JSON.stringify(s)), 'new');
    expect(res.ok, res.ok ? '' : res.error).toBe(true);
  });

  it('an heir keeps their own story: they are asked for their own aspiration', () => {
    let s: GameState = adult(8109);
    active(s).aspiration = 'achievement';
    s = devKill(s);
    const heir = eligibleHeirs(s)[0];
    if (!heir) return;
    s = chooseHeir(s, heir.id);
    expect(active(s).id).toBe(heir.id);
    const t = resolveYear(s);
    const prev = Object.values(t.people).find((p) => p.aspiration === 'achievement');
    expect(prev).toBeDefined(); // the previous generation's aspiration stays theirs
    if (!active(t).aspiration) expect(t.pending.some((p) => p.eventId === 'choose_aspiration')).toBe(true);
  });
});
