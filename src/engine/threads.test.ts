/** Slice 2: consequences across years (story threads and their follow-ups). */
import { describe, expect, it } from 'vitest';
import { playLife } from '../balance/simulate';
import { checkGame, parseSaveFile, serializeGame } from '../persistence/exportImport';
import { EVENT_BY_ID } from './events';
import type { Ctx } from './eventKit';
import { newGame } from './generate';
import { choose, resolveYear } from './phases';
import { remember } from './relationships';
import { makeRng } from './rng';
import { MEND_YEARS, STORY_IDS } from './storyEvents';
import { CLOSED_KEPT_YEARS, inheritThreads, noteThread, openThread, threadsYear } from './threads';
import type { GameState, Person } from './types';
import { active, ageOf, kidsAtHome, partnerOf } from './util';

const ctx = (s: GameState): Ctx => ({ s, rng: makeRng(1), me: active(s) });
const eligibleFor = (s: GameState, id: string, p?: Person) =>
  EVENT_BY_ID[id].candidates!(ctx(s)).some((c) => c.weight > 0 && c.subject?.id === p?.id);
/** A fresh game with a partner and a child at home, the player an adult. */
const family = (seed: number) => {
  const s = newGame(seed);
  const me = active(s);
  return { s, me, partner: partnerOf(s, me.id)!, kid: kidsAtHome(s, me)[0] };
};

describe('recording', () => {
  it('one hurt is just a memory; hurts in two different years start a thread', () => {
    const { s, me, partner } = family(20101);
    remember(partner, 'missed', me.id, s.year - 1);
    threadsYear(s);
    expect(openThread(s, 'strain', me.id, partner.id)).toBeUndefined();
    remember(partner, 'promise_broken', me.id, s.year);
    threadsYear(s);
    expect(openThread(s, 'strain', me.id, partner.id)?.hits).toEqual([s.year - 1, s.year]);
  });

  it('records each year once, however often the pass runs (no double counting on reload)', () => {
    const { s, me, partner } = family(20102);
    remember(partner, 'missed', me.id, s.year - 1);
    remember(partner, 'pressure', me.id, s.year);
    threadsYear(s);
    threadsYear(s);
    threadsYear(structuredClone(s));
    expect(openThread(s, 'strain', me.id, partner.id)!.hits).toHaveLength(2);
  });

  it('storage stays bounded: few years per thread, old closed threads pruned, a hard cap overall', () => {
    const { s, me, partner } = family(20103);
    for (let y = 0; y < 20; y++) noteThread(s, 'strain', me, partner, { year: s.year - 30 + y });
    expect(openThread(s, 'strain', me.id, partner.id)!.hits.length).toBeLessThanOrEqual(8);
    const people = Object.values(s.people).filter((p) => p.id !== me.id);
    for (let i = 0; i < 200; i++) s.threads!.push({ kind: 'loss', ownerId: me.id, subjectId: people[i % people.length].id, since: s.year - 50, hits: [s.year - 50], closed: s.year - 1 - (i % 60), outcome: 'faded' });
    threadsYear(s);
    expect(s.threads!.length).toBeLessThanOrEqual(60);
    expect(s.threads!.every((t) => t.closed === undefined || s.year - t.closed < CLOSED_KEPT_YEARS)).toBe(true);
  });
});

describe('follow-ups need real, current causes', () => {
  it('drifting apart needs three recorded hurts, recent ones, and is not raised again right away', () => {
    const { s, me, kid } = family(20201);
    noteThread(s, 'strain', me, kid, { year: s.year - 4 });
    noteThread(s, 'strain', me, kid, { year: s.year - 3 });
    expect(eligibleFor(s, 'growing_distance', kid)).toBe(false);
    noteThread(s, 'strain', me, kid, { year: s.year - 1 });
    expect(eligibleFor(s, 'growing_distance', kid)).toBe(true);
    EVENT_BY_ID.growing_distance.resolve(ctx(s), 'reach_out', kid);
    expect(eligibleFor(s, 'growing_distance', kid)).toBe(false); // raised this year: not again for a while
    expect(kid.flags.promised_time).toBe(s.year + 1); // and they'll hold you to it
  });

  it('one good year is not enough to mend a strain; sustained years are, and it never repeats', () => {
    const { s, me, partner } = family(20202);
    noteThread(s, 'strain', me, partner, { year: s.year - 6 });
    noteThread(s, 'strain', me, partner, { year: s.year - 5 });
    remember(partner, 'missed', me.id, s.year - 5);
    noteThread(s, 'strain', me, partner, { year: s.year - 4, answer: true });
    expect(eligibleFor(s, 'kept_showing_up', partner)).toBe(false);
    for (let i = 1; i < MEND_YEARS; i++) noteThread(s, 'strain', me, partner, { year: s.year - 4 + i, answer: true });
    expect(eligibleFor(s, 'kept_showing_up', partner)).toBe(true);
    EVENT_BY_ID.kept_showing_up.resolve(ctx(s), 'ok', partner);
    expect(partner.memories?.some((m) => m.kind === 'missed')).toBeFalsy(); // forgiven
    expect(openThread(s, 'strain', me.id, partner.id)).toBeUndefined();
    expect(eligibleFor(s, 'kept_showing_up', partner)).toBe(false);
  });

  it('a child thanks you only for an interest you actually backed, and that they kept', () => {
    const { s, me, kid } = family(20203);
    kid.birthYear = s.year - 20;
    kid.hobby = 'music';
    kid.skills.music = 55;
    expect(eligibleFor(s, 'encouragement_remembered', kid)).toBe(false); // nothing recorded
    for (const y of [8, 7, 6]) noteThread(s, 'encouraged', me, kid, { detail: 'music', year: s.year - y });
    expect(eligibleFor(s, 'encouragement_remembered', kid)).toBe(true);
    expect(EVENT_BY_ID.encouragement_remembered.build(ctx(s), kid).text).toContain('music');
    kid.hobby = 'art'; // moved on
    expect(eligibleFor(s, 'encouragement_remembered', kid)).toBe(false);
    threadsYear(s);
    expect(s.threads!.find((t) => t.kind === 'encouraged')!.outcome).toBe('outgrew'); // closed without blame
  });

  it('a missed chance that no longer fits closes instead of coming back', () => {
    const { s, me } = family(20204);
    me.jobId = 'developer';
    me.jobLevel = 1;
    noteThread(s, 'missed_chance', me, undefined, { detail: 'developer:1', year: s.year - 5 });
    me.jobLevel = 2; // promoted anyway
    threadsYear(s);
    expect(s.threads!.find((t) => t.kind === 'missed_chance')!.outcome).toBe('moot');
    expect(EVENT_BY_ID.second_chance.candidates!(ctx(s))).toEqual([]);
  });

  it('threads about someone who died close, except the memory of the loss itself', () => {
    const { s, me, partner, kid } = family(20205);
    noteThread(s, 'strain', me, kid);
    noteThread(s, 'loss', me, partner);
    kid.deathYear = s.year;
    partner.deathYear = s.year;
    threadsYear(s);
    expect(s.threads!.find((t) => t.kind === 'strain')!.outcome).toBe('ended');
    expect(openThread(s, 'loss', me.id, partner.id)).toBeDefined();
  });
});

describe('succession', () => {
  it('the heir inherits the story, not the personality: someone the parent stood by may stand by the heir', () => {
    const { s, me, partner, kid } = family(20301);
    const friend = Object.values(s.people).find((p) => p.deathYear === undefined && p.id !== me.id && p.id !== partner.id && p.id !== kid.id && p.householdId !== me.householdId)!;
    noteThread(s, 'supported', me, friend, { year: s.year - 6 });
    noteThread(s, 'supported', me, friend, { year: s.year - 4 });
    noteThread(s, 'work_first', me);
    noteThread(s, 'strain', me, kid);
    inheritThreads(s, me.id, kid);
    const sup = openThread(s, 'supported', kid.id, friend.id)!;
    expect(sup.inherited).toBe(me.id);
    expect(s.threads!.filter((t) => t.kind !== 'supported').every((t) => t.outcome === 'ended')).toBe(true);
    s.activeId = kid.id;
    kid.birthYear = s.year - 30;
    expect(eligibleFor(s, 'gratitude', friend)).toBe(true);
    expect(EVENT_BY_ID.gratitude.build(ctx(s), friend).text).toContain(me.firstName);
    expect(kid.traits).not.toBe(me.traits);
  });
});

describe('persistence and pacing', () => {
  it('threads survive save and load, and a resolved follow-up can’t be replayed', () => {
    let replayed = 0;
    for (let seed = 20401; seed < 20430 && replayed < 3; seed++) {
      const { s, me, partner } = family(seed);
      for (const y of [6, 5]) noteThread(s, 'strain', me, partner, { year: s.year - y });
      for (const y of [4, 3, 2]) noteThread(s, 'strain', me, partner, { year: s.year - y, answer: true });
      const loaded = parseSaveFile(serializeGame(s)); // the real export and import path
      expect(loaded.ok ? '' : loaded.error).toBe('');
      const back = (loaded as { state: GameState }).state;
      expect(back.threads).toEqual(s.threads);

      const t = resolveYear(back);
      const pe = t.pending.find((p) => p.eventId === 'kept_showing_up');
      if (!pe) continue; // this year's caps gave the slot to something else
      const after = choose(t, pe.uid, 'ok');
      expect(choose(after, pe.uid, 'ok')).toBe(after); // already resolved
      expect(eligibleFor(after, 'kept_showing_up', after.people[partner.id])).toBe(false);
      // Reloading after the choice doesn't bring it back either.
      const again = (parseSaveFile(serializeGame(after)) as { state: GameState }).state;
      expect(eligibleFor(again, 'kept_showing_up', again.people[partner.id])).toBe(false);
      replayed++;
    }
    expect(replayed).toBeGreaterThan(0);
  });

  it('old saves without threads load, and a malformed thread list is dropped rather than rejected', () => {
    const old: any = structuredClone(newGame(20402));
    old.schemaVersion = 23;
    old.threads = 'nonsense';
    const c = checkGame(old);
    expect(c.ok).toBe(true);
    expect((c as { state: GameState }).state.threads).toBeUndefined();
  });

  it('at most one story follow-up comes up a year', () => {
    for (let seed = 20500; seed < 20540; seed++) {
      const { s, me, partner, kid } = family(seed);
      kid.birthYear = s.year - 20;
      kid.hobby = 'music';
      kid.skills.music = 60;
      for (const y of [8, 7, 6]) noteThread(s, 'encouraged', me, kid, { detail: 'music', year: s.year - y });
      for (const y of [3, 2, 1]) noteThread(s, 'strain', me, partner, { year: s.year - y });
      me.aspiration = 'connection';
      for (let y = 8; y >= 1; y--) noteThread(s, 'aspiration', me, undefined, { detail: 'connection', year: s.year - y });
      const t = resolveYear(s);
      expect(t.pending.filter((p) => STORY_IDS.has(p.eventId)).length, `seed ${seed}`).toBeLessThanOrEqual(1);
    }
  });

  it('fixed seeds replay the same stories', { timeout: 60_000 }, () => {
    const run = () => { let last: GameState | undefined; playLife('family', 20601, 70, (s) => { last = s; }); return JSON.stringify(last!.threads); };
    expect(run()).toBe(run());
  });

  it('a real simulated life records threads and closes them', { timeout: 60_000 }, () => {
    let last: GameState | undefined;
    playLife('career', 20602, 90, (s) => { last = s; });
    expect(last!.threads?.length ?? 0).toBeGreaterThan(0);
    expect(last!.threads!.every((t) => t.hits.length <= 8)).toBe(true);
    expect(ageOf(active(last!), last!.year)).toBeGreaterThan(0);
  });
});
