/** Player feedback fixes: renovation limits and rooms, 5k limits, Worth the Trip, the laptop gift. */
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_BY_ID } from '../content/achievements';
import { activityBlocker, performActivity } from './activities';
import { EVENT_BY_ID } from './events';
import { financeAction, financeBlocker, renovationsThisYear } from './finance';
import { makeFriend } from './friends';
import { newGame } from './generate';
import { makeRng } from './rng';
import type { GameState } from './types';
import { active, getBond, kidsAtHome } from './util';
import { cityOf, otherCity } from './location';

const hhOf = (s: GameState) => s.households[active(s).householdId];
const homeowner = (seed: number) => {
  const s = newGame(seed);
  hhOf(s).wallet = 1_000_000;
  active(s).stats.health = 80;
  active(s).stats.stress = 30;
  return financeAction(s, { kind: 'buyHome', tier: 'family', downPct: 0.2 });
};
const lastJournal = (s: GameState) => s.journal[s.journal.length - 1].text;

describe('renovations', () => {
  it('at most two a year, each a different room', () => {
    let s = homeowner(9001);
    s = financeAction(s, { kind: 'renovate' });
    const first = lastJournal(s);
    s = financeAction(s, { kind: 'renovate' });
    const second = lastJournal(s);
    expect(first).toMatch(/^You renovated the /);
    expect(second).toMatch(/^You renovated the /);
    expect(second).not.toBe(first);
    expect(renovationsThisYear(s)).toBe(2);
    expect(financeBlocker(s, { kind: 'renovate' })).toMatch(/Two renovations a year/);
    s.year++;
    expect(financeBlocker(s, { kind: 'renovate' })).toBeNull();
  });

  it('the room varies from family to family (not always the kitchen)', () => {
    const rooms = new Set<string>();
    for (let seed = 9010; seed < 9030; seed++) rooms.add(lastJournal(financeAction(homeowner(seed), { kind: 'renovate' })).split('. ')[0]);
    expect(rooms.size).toBeGreaterThan(3);
  });
});

describe('5ks and the marathon', () => {
  it('at most five 5ks a year', () => {
    let s = homeowner(9040);
    for (let i = 0; i < 5; i++) s = performActivity(s, 'run_5k');
    expect(active(s).flags.five_ks).toBe(5);
    expect(activityBlocker(s, 'run_5k')).not.toBeNull();
  });
});

describe('Worth the Trip', () => {
  /** A friend in another city with this affinity. */
  const withFarFriend = (seed: number, affinity: number) => {
    const s = homeowner(seed);
    const f = makeFriend(s, makeRng(seed), active(s), 'from work', otherCity(makeRng(seed), cityOf(s, active(s))))!;
    getBond(s, active(s).id, f.id).affinity = affinity;
    getBond(s, active(s).id, f.id).trust = -50;
    return { s, f };
  };

  it('counts only when the friend was there; a no-reply trip is cancelled and refunded', () => {
    let declined = false;
    for (let seed = 9100; seed < 9160 && !declined; seed++) {
      const { s, f } = withFarFriend(seed, -60);
      const before = hhOf(s).wallet;
      const t = performActivity(s, 'visit_friend', [f.id]);
      if (t.lastActivity?.tone !== 'bad') continue;
      declined = true;
      expect(active(t).flags.friend_trip).toBeUndefined();
      expect(ACHIEVEMENT_BY_ID.worth_the_trip.test(t)).toBe(false);
      expect(hhOf(t).wallet).toBe(before); // fare refunded
    }
    expect(declined).toBe(true);
    const { s, f } = withFarFriend(9200, 40); // close friends always come
    const t = performActivity(s, 'visit_friend', [f.id]);
    expect(ACHIEVEMENT_BY_ID.worth_the_trip.test(t)).toBe(true);
  });
});

describe('graduation gift', () => {
  it('a new laptop and $5,000 costs $6,000; the graduate gets the $5,000', () => {
    const s = homeowner(9300);
    const kid = kidsAtHome(s, active(s))[0];
    kid.birthYear = s.year - 22;
    kid.householdId = Object.keys(s.households).find((id) => id !== hhOf(s).id)!;
    const theirs = s.households[kid.householdId];
    const c = { s, rng: makeRng(1), me: active(s) };
    const choice = EVENT_BY_ID.graduation_gift.build(c, kid).choices.find((x) => x.id === 'g5')!;
    expect(choice.label).toContain('$6,000');
    const [mine, before] = [hhOf(s).wallet, theirs.wallet];
    EVENT_BY_ID.graduation_gift.resolve(c, 'g5', kid);
    expect(hhOf(s).wallet).toBe(mine - 6000);
    expect(theirs.wallet).toBe(before + 5000);
  });
});
