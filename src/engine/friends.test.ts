import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_BY_ID } from '../content/achievements';
import { CITIES, CITY_IDS } from '../content/cities';
import { FEMALE_NAMES, LAST_NAMES, MALE_NAMES } from '../content/names';
import { activityBlocker, ACTIVITY_BY_ID, candidatesFor, performActivity } from './activities';
import { estimateYear } from './budget';
import { die } from './family';
import { financeAction, financeBlocker, homeOf, relocationCost } from './finance';
import { bestFriend, FRIEND_FADE, friendsOf, friendshipsOf, friendsYear, makeFriend, willJoin } from './friends';
import { newGame } from './generate';
import { runsHousehold } from './household';
import { cityOf, homePriceIn, isNear, myCity, rentIn } from './location';
import { migrate } from './migrations';
import { makeRng } from './rng';
import type { GameState } from './types';
import { active, adjustBond, getBond, kidsAtHome, parentsOf, partnerOf } from './util';

const got = (s: GameState, id: string) => ACHIEVEMENT_BY_ID[id].test(s);
const hhOf = (s: GameState) => s.households[active(s).householdId];
const rich = (seed: number) => { const s = newGame(seed); hhOf(s).wallet = 2_000_000; return s; };
const fresh = (s: GameState) => { s.energy = { year: s.year, max: 100, used: 0 }; return s; };

describe('names', () => {
  it('has 500 female and 500 male first names and 1,000 surnames, without duplicates', () => {
    expect(FEMALE_NAMES).toHaveLength(500);
    expect(MALE_NAMES).toHaveLength(500);
    expect(LAST_NAMES).toHaveLength(1000);
    expect(new Set(FEMALE_NAMES).size).toBe(500);
    expect(new Set(MALE_NAMES).size).toBe(500);
    expect(new Set(LAST_NAMES).size).toBe(1000);
    // Matched to gender: no name is on both lists.
    expect(FEMALE_NAMES.filter((n) => MALE_NAMES.includes(n))).toEqual([]);
    expect(FEMALE_NAMES).toContain('Mary');
    expect(MALE_NAMES).toContain('James');
    expect(LAST_NAMES.slice(0, 3)).toEqual(['Smith', 'Johnson', 'Williams']);
  });

  it('people get first names that match their sex', () => {
    const s = newGame(1201);
    for (const p of Object.values(s.people)) expect((p.sex === 'F' ? FEMALE_NAMES : MALE_NAMES).includes(p.firstName)).toBe(true);
  });
});

describe('cities', () => {
  it('every new game starts in one of the 15 cities, with two named friends', () => {
    const cities = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      const s = newGame(seed);
      cities.add(myCity(s));
      const fr = friendsOf(s);
      expect(fr).toHaveLength(2);
      for (const f of fr) expect(f.firstName.length).toBeGreaterThan(0);
    }
    expect(CITY_IDS).toHaveLength(15);
    expect(cities.size).toBeGreaterThan(10);
    expect(newGame(77)).toEqual(newGame(77));
  });

  it('prices and pay follow the city', () => {
    expect(homePriceIn('family', 'new_york')).toBeGreaterThan(homePriceIn('family', 'san_antonio') * 2);
    expect(homePriceIn('mansion', 'new_york')).toBe(homePriceIn('mansion', 'san_antonio'));
    expect(rentIn('apartment', 'boston')).toBeGreaterThan(rentIn('apartment', 'houston'));
    const s = newGame(1202);
    const pay = (city: keyof typeof CITIES) => {
      const t: GameState = structuredClone(s);
      hhOf(t).city = city;
      return estimateYear(t).income.find((l) => l.label === 'Your pay')?.amount ?? 0;
    };
    expect(pay('new_york')).toBeGreaterThan(pay('san_antonio'));
  });

  it('moving to another city sells the home, ends jobs, changes schools, and leaves friends far away', () => {
    let s = rich(1203);
    s = financeAction(s, { kind: 'buyHome', tier: 'starter', downPct: 0.2 });
    const me = active(s);
    const from = myCity(s);
    const to = CITY_IDS.find((c) => c !== from)!;
    const friendsBefore = friendsOf(s).filter((f) => isNear(s, f));
    const wallet = hhOf(s).wallet;
    const cost = relocationCost(s, hhOf(s));
    expect(financeBlocker(s, { kind: 'moveCity', city: from })).toMatch(/already live/);
    s = financeAction(s, { kind: 'moveCity', city: to });
    expect(myCity(s)).toBe(to);
    expect(homeOf(hhOf(s))).toBeUndefined();
    expect(hhOf(s).wallet).toBeGreaterThan(wallet - cost); // the house sale more than covers the move
    expect(active(s).jobId).toBeUndefined();
    const partner = partnerOf(s, me.id);
    if (partner) expect(partner.jobId).toBeUndefined();
    for (const k of kidsAtHome(s, active(s))) expect(k.flags.moved).toBeGreaterThan(0);
    for (const f of friendsBefore) expect(isNear(s, s.people[f.id])).toBe(false);
    expect(got(s, 'fresh_start')).toBe(true);
  });

  it('a household you do not run cannot move city', () => {
    const s = newGame(1204, 'child');
    expect(runsHousehold(s, active(s))).toBe(false);
  });

  it('older saves get cities, and the player runs their own established home', () => {
    const s = newGame(1205);
    const raw = structuredClone(s) as any;
    raw.schemaVersion = 12;
    for (const hh of Object.values(raw.households) as any[]) { delete hh.city; delete hh.headId; }
    const m = migrate(raw)!;
    for (const hh of Object.values(m.households)) expect(CITY_IDS).toContain(hh.city);
    expect(m.households[active(m).householdId].headId).toBe(active(m).id);
  });

  it('a parent who moves in does not take over your home', () => {
    const s = newGame(1206);
    const mom = parentsOf(s, active(s)).find((p) => p.deathYear === undefined)!;
    mom.householdId = active(s).householdId;
    expect(runsHousehold(s, active(s))).toBe(true);
  });
});

describe('friends', () => {
  it('friendships fade each year without contact, and a call keeps them going', () => {
    let s = newGame(1210);
    const [a] = friendsOf(s);
    friendshipsOf(s).find((x) => x.id === a.id)!.lastSeen = s.year - 1; // last together a year ago
    const before = getBond(s, active(s).id, a.id).affinity;
    const quiet: GameState = structuredClone(s);
    friendsYear(quiet, makeRng(1));
    expect(getBond(quiet, active(quiet).id, a.id).affinity).toBe(before - FRIEND_FADE);
    s = performActivity(fresh(s), 'call_friend', [a.id]);
    friendsYear(s, makeRng(1));
    expect(getBond(s, active(s).id, a.id).affinity).toBeGreaterThanOrEqual(before);
  });

  it('at zero a friend becomes distant, may decline, and can be won back', () => {
    const s = newGame(1211);
    const me = active(s);
    const [a] = friendsOf(s);
    adjustBond(s, me.id, a.id, -200, -50);
    friendsYear(s, makeRng(2));
    expect(friendshipsOf(s).find((f) => f.id === a.id)!.distant).toBe(true);
    expect(s.journal.some((j) => j.text.includes('drifted apart'))).toBe(true);
    const rng = makeRng(3);
    const answers = Array.from({ length: 200 }, () => willJoin(s, rng, me, a));
    expect(answers.some((x) => !x)).toBe(true); // sometimes they say no
    expect(answers.some((x) => x)).toBe(true); // but not always
    adjustBond(s, me.id, a.id, 205, 50);
    let t = fresh(s);
    t = performActivity(t, 'call_friend', [a.id]);
    expect(friendshipsOf(t).find((f) => f.id === a.id)!.distant).toBe(false);
    expect(got(t, 'like_old_times')).toBe(true);
  });

  it('far-away friends: calls and games work, in-person needs a trip', () => {
    const s = rich(1212);
    const [a, b] = friendsOf(s);
    s.households[a.householdId].city = CITY_IDS.find((c) => c !== myCity(s))!;
    s.households[b.householdId].city = myCity(s);
    const ids = (id: string) => candidatesFor(s, ACTIVITY_BY_ID[id]).map((p) => p.id);
    expect(ids('coffee_friend')).toEqual([b.id]);
    expect(ids('call_friend').sort()).toEqual([a.id, b.id].sort());
    expect(ids('video_games').sort()).toEqual([a.id, b.id].sort());
    expect(ids('visit_friend')).toEqual([a.id]);
    expect(activityBlocker(s, 'coffee_friend', [a.id])).toMatch(/cannot come/);
    const trip = performActivity(fresh(s), 'visit_friend', [a.id]);
    expect(ACTIVITY_BY_ID.visit_friend.energy(s, [a])).toBeGreaterThan(ACTIVITY_BY_ID.coffee_friend.energy(s, [b]));
    expect(got(trip, 'worth_the_trip')).toBe(true);
  });

  it('best friends rarely move away; other friends sometimes do', () => {
    let bestMoves = 0;
    let otherMoves = 0;
    for (let i = 0; i < 300; i++) {
      const s = newGame(1213);
      const me = active(s);
      const [a, b] = friendsOf(s);
      adjustBond(s, me.id, a.id, 100, 50);
      for (const f of [a, b]) friendshipsOf(s).find((x) => x.id === f.id)!.lastSeen = s.year;
      const home = myCity(s);
      s.households[a.householdId].city = home;
      s.households[b.householdId].city = home;
      expect(bestFriend(s)?.id).toBe(a.id);
      friendsYear(s, makeRng(1000 + i));
      if (cityOf(s, a) !== home) bestMoves++;
      if (cityOf(s, b) !== home) otherMoves++;
    }
    expect(bestMoves).toBeLessThan(otherMoves);
    expect(otherMoves).toBeGreaterThan(3);
  });

  it('activities and events make new named friends', () => {
    let s = rich(1214);
    const n = friendsOf(s).length;
    for (let i = 0; i < 10 && friendsOf(s).length === n; i++) s = performActivity({ ...fresh(s), activityLog: [] }, 'join_club');
    expect(friendsOf(s).length).toBe(n + 1);
    const newest = friendsOf(s)[n];
    expect(isNear(s, newest)).toBe(true);
    expect(MALE_NAMES.includes(newest.firstName) || FEMALE_NAMES.includes(newest.firstName)).toBe(true);
  });

  it('a friend passing away is noted in the journal', () => {
    const s = newGame(1215);
    const [a] = friendsOf(s);
    die(s, a, 'illness');
    expect(s.journal.some((j) => j.text.startsWith(`Your friend ${a.firstName}`))).toBe(true);
    expect(friendsOf(s).map((f) => f.id)).not.toContain(a.id);
  });

  it('eight close friends make you a Social Butterfly', () => {
    const s = newGame(1216);
    const rng = makeRng(9);
    while (friendsOf(s).length < 8) makeFriend(s, rng, active(s), 'test');
    expect(got(s, 'social_butterfly')).toBe(true);
  });
});
