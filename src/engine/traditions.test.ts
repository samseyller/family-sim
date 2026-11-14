/** Family traditions: recognition, the staged boost, lapse and revival, succession, carrying on, stories. */
import { describe, expect, it } from 'vitest';
import { activityBlocker, performActivity } from './activities';
import { decisionById } from './agency';
import { EVENT_BY_ID } from './events';
import { newGame } from './generate';
import { migrate } from './migrations';
import { childhoodFacts, lifeStory, successionNote } from './narrative';
import { chooseHeir, devKill } from './phases';
import { makeRng } from './rng';
import { inheritThreads, threadsYear } from './threads';
import { bonusFor, carries, carryCandidate, liveTradition, liveTraditions, MAX_TRADITIONS, traditionYear } from './traditions';
import type { GameState, Person, Thread } from './types';
import { active, getBond, kidsAtHome, membersOf, partnerOf } from './util';

const setup = (seed: number) => {
  const s = newGame(seed);
  const me = active(s);
  s.households[me.householdId].wallet = 100_000;
  return { s, me, partner: partnerOf(s, me.id)!, kid: kidsAtHome(s, me)[0] };
};
/** A live tradition of `id`, kept `count` years, with these takers. */
const tradition = (s: GameState, me: Person, id: string, count: number, takers: Record<string, number> = {}): Thread => {
  const t: Thread = { kind: 'tradition', ownerId: me.id, detail: id, since: s.year - count + 1, hits: Array.from({ length: Math.min(8, count) }, (_, i) => s.year - Math.min(8, count) + i), count, takers };
  (s.threads ??= []).push(t);
  return t;
};
const ctx = (s: GameState) => ({ s, rng: makeRng(1), me: active(s) });

describe('new tradition activities', () => {
  it('each has a hard gate', () => {
    const { s, me, kid, partner } = setup(50101);
    for (const k of kidsAtHome(s, me)) k.birthYear = s.year - 3; // only little ones
    expect(activityBlocker(s, 'birthday_camping', [partner.id])).toMatch(/child aged 6–17/);
    kid.birthYear = s.year - 9;
    expect(activityBlocker(s, 'birthday_camping', [kid.id])).toBeNull();
    const hh = s.households[me.householdId];
    hh.assets = hh.assets.filter((a) => a.kind !== 'house');
    hh.rentTier = 'apartment';
    expect(activityBlocker(s, 'holiday_lights', [])).toMatch(/Needs a house/);
    hh.rentTier = 'house';
    expect(activityBlocker(s, 'holiday_lights', [])).toBeNull();
    expect(activityBlocker(s, 'grandparents_dinner', [partner.id])).not.toBeNull(); // not a grandparent
  });

  it('the light display costs less once you own the lights', () => {
    const { s, me } = setup(50102);
    const hh = s.households[me.householdId];
    hh.assets = hh.assets.filter((a) => a.kind !== 'house');
    hh.rentTier = 'house';
    const before = hh.wallet;
    const t = performActivity(s, 'holiday_lights', []);
    expect(before - t.households[me.householdId].wallet).toBe(150);
    expect(active(t).flags.lights_bought).toBe(1);
  });
});

describe('recognition', () => {
  it('needs three different years in five, with someone taking part; solo runs never count', () => {
    const { s, me, partner } = setup(50201);
    s.activityLog = [{ year: s.year - 3, id: 'game_night', with: 1 }, { year: s.year - 2, id: 'game_night', with: 0 }];
    s.activityLog.push({ year: s.year, id: 'game_night', with: 1 });
    expect(traditionYear(s, me, 'game_night', [partner])).toBe('');
    s.activityLog.push({ year: s.year - 1, id: 'game_night', with: 2 });
    expect(traditionYear(s, me, 'game_night', [partner])).toMatch(/becoming a family tradition \(3rd year\)/);
    expect(liveTradition(s, me.id, 'game_night')!.takers![partner.id]).toBe(1);
    expect(traditionYear(s, me, 'game_night', [])).toBe(''); // alone: nothing
  });

  it('at most three live traditions', () => {
    const { s, me, partner } = setup(50202);
    for (const id of ['game_night', 'road_trip', 'garden']) tradition(s, me, id, 4);
    s.activityLog = [0, 1, 2].map((d) => ({ year: s.year - d, id: 'movie_marathon', with: 1 }));
    expect(traditionYear(s, me, 'movie_marathon', [partner])).toBe('');
    expect(liveTraditions(s, me.id)).toHaveLength(MAX_TRADITIONS);
  });
});

describe('the boost', () => {
  it('is very small until a tradition is well formed, and comes once a year', () => {
    expect(bonusFor(3)!.happiness).toBe(0);
    expect(bonusFor(5)!.affinity).toBeLessThan(bonusFor(10)!.affinity);
    const run = (count: number) => {
      const { s, me, partner } = setup(50301);
      setBondTo(s, me, partner);
      tradition(s, me, 'game_night', count);
      const t = liveTradition(s, me.id, 'game_night')!;
      t.hits = t.hits.filter((y) => y !== s.year);
      t.count = count - 1;
      const h = me.stats.happiness;
      traditionYear(s, me, 'game_night', [partner]);
      const once = getBond(s, me.id, partner.id).affinity;
      traditionYear(s, me, 'game_night', [partner]); // same year again: no more
      expect(getBond(s, me.id, partner.id).affinity).toBe(once);
      return { bond: once - 50, happy: me.stats.happiness - h };
    };
    const young = run(4);
    const formed = run(12);
    expect(young.bond).toBeLessThanOrEqual(1);
    expect(young.happy).toBe(0);
    expect(formed.bond).toBe(2);
    expect(formed.happy).toBe(2);
  });
});
const setBondTo = (s: GameState, a: Person, b: Person) => { s.bonds[[a.id, b.id].sort().join('|')] = { affinity: 50, trust: 50 }; };

describe('lapse and revival', () => {
  it('one missed year is fine, three lapse it, and it comes back within ten years with its count', () => {
    const { s, me, partner } = setup(50401);
    const t = tradition(s, me, 'game_night', 7);
    t.hits = t.hits.map((y) => y - 1);
    threadsYear(s);
    expect(t.closed).toBeUndefined();
    s.year += 2;
    threadsYear(s);
    expect(t.outcome).toBe('lapsed');
    s.year += 4;
    s.energy = undefined;
    const back = traditionYear(s, me, 'game_night', [partner]);
    expect(back).toMatch(/8th year/);
    expect(t.closed).toBeUndefined();
    expect(s.journal.some((j) => j.story && /is back, after/.test(j.text))).toBe(true);
  });
});

describe('across generations', () => {
  it('passes to an heir who grew up with it, and ends otherwise', () => {
    const { s, me, kid, partner } = setup(50501);
    const kept = tradition(s, me, 'host_holiday', 12, { [kid.id]: 6 });
    const other = tradition(s, me, 'game_night', 6, { [partner.id]: 6 });
    inheritThreads(s, me.id, kid);
    expect(kept.ownerId).toBe(kid.id);
    expect(kept.inherited).toBe(me.id);
    expect(other.outcome).toBe('ended');
    expect(successionNote(s, me, kid)).toMatch(/the holiday dinner is .+’s to keep now; .+ took part 6 times growing up/i);
  });

  it('a grown child who grew up with it may carry it on (hard eligibility, bounded odds)', () => {
    const { s, me, kid } = setup(50502);
    kid.birthYear = s.year - 30;
    const t = tradition(s, me, 'game_night', 15, { [kid.id]: 4 });
    expect(carryCandidate(s, me, kid)).toBeUndefined(); // still at home, and only 4 times
    kid.householdId = Object.keys(s.households).find((h) => h !== me.householdId)!;
    expect(carryCandidate(s, me, kid)).toBeUndefined();
    t.takers![kid.id] = 5;
    expect(carryCandidate(s, me, kid)).toBe(t);
    const def = decisionById('carry_tradition');
    expect(def.eligible({ s, me, p: kid, age: 30 })).toBe(true);
    def.act!({ s, me, p: kid, age: 30 });
    expect(carries(s, me.id, kid.id, 'game_night')).toBe(true);
    expect(def.eligible({ s, me, p: kid, age: 30 })).toBe(false); // once
  });
});

describe('succession through a real death', () => {
  it('the yearly pass after a death keeps the threads for the heir (they are not closed first)', () => {
    const { s, me, kid } = setup(50550);
    kid.birthYear = s.year - 20;
    const friend = Object.values(s.people).find((p) => p.deathYear === undefined && p.householdId !== me.householdId)!;
    tradition(s, me, 'game_night', 12, { [kid.id]: 8 });
    s.threads!.push({ kind: 'supported', ownerId: me.id, subjectId: friend.id, since: s.year - 6, hits: [s.year - 6, s.year - 4] });
    const dead = devKill(s);
    threadsYear(dead); // the pass that runs in the year someone dies
    expect(dead.threads!.filter((t) => t.ownerId === me.id && t.closed === undefined)).toHaveLength(2);
    const next = chooseHeir(dead, kid.id);
    expect(liveTradition(next, kid.id, 'game_night')).toBeDefined();
    expect(next.threads!.find((t) => t.kind === 'supported')).toMatchObject({ ownerId: kid.id, inherited: me.id });
    expect(next.journal.some((j) => /game night is .+’s to keep now/i.test(j.text))).toBe(true);
  });
});

describe('story moments', () => {
  it('the first one without someone who came every year: only the year after, once', () => {
    const { s, me, partner } = setup(50601);
    const gp = Object.values(s.people).find((p) => p.deathYear === undefined && p.householdId !== me.householdId)!;
    tradition(s, me, 'host_holiday', 10, { [gp.id]: 6, [partner.id]: 9 });
    expect(EVENT_BY_ID.first_without_them.candidates!(ctx(s))).toEqual([]);
    gp.deathYear = s.year - 1;
    expect(EVENT_BY_ID.first_without_them.candidates!(ctx(s)).length).toBe(1);
    expect(EVENT_BY_ID.first_without_them.build(ctx(s)).text).toContain(gp.firstName);
    EVENT_BY_ID.first_without_them.resolve(ctx(s), 'keep');
    expect(EVENT_BY_ID.first_without_them.candidates!(ctx(s))).toEqual([]);
    expect(membersOf(s, me.householdId).length).toBeGreaterThan(0);
  });

  it('a teenager who grew up with it can ask to skip it', () => {
    const { s, me, kid } = setup(50602);
    kid.birthYear = s.year - 16;
    tradition(s, me, 'game_night', 6, { [kid.id]: 4 });
    expect(EVENT_BY_ID.too_old_for_this.candidates!(ctx(s)).map((c) => c.subject?.id)).toContain(kid.id);
    EVENT_BY_ID.too_old_for_this.resolve(ctx(s), 'friend', kid);
    expect(EVENT_BY_ID.too_old_for_this.candidates!(ctx(s))).toEqual([]); // not raised again right away
  });
});

describe('narrative', () => {
  it('names only real takers and recorded years', () => {
    const { s, me, kid } = setup(50701);
    tradition(s, me, 'grandparents_dinner', 9, { [kid.id]: 7 });
    const f = childhoodFacts(s, kid).find((x) => x.id === 'tradition')!;
    expect(f.text).toBe('You grew up with Sunday dinner with the grandparents: seven years of it.');
    expect(f.people).toEqual([me.id]);
    expect(lifeStory(s, me).find((x) => x.id === 'tradition')!.text).toBe('You kept Sunday dinner with the grandparents going for 9 years.');
  });
});

describe('saves', () => {
  it('a v25 save with a recent tradition pattern gets a live tradition', () => {
    const old: any = structuredClone(newGame(50801));
    const me = active(old);
    old.schemaVersion = 25;
    old.threads = [{ kind: 'pattern', ownerId: me.id, detail: 'tradition:game_night', since: old.year - 3, hits: [old.year - 3, old.year - 1, old.year], closed: old.year, outcome: 'recognized' }];
    const up = migrate(old)!;
    expect(up.threads!.find((t) => t.kind === 'tradition')).toMatchObject({ detail: 'game_night', count: 3 });
    expect(migrate({ ...structuredClone(old), threads: 'junk' })).toBeDefined();
  });
});
