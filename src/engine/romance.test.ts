import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_BY_ID } from '../content/achievements';
import { activityBlocker, activityLabel, candidatesFor, ACTIVITY_BY_ID, performActivity } from './activities';
import { newGame } from './generate';
import { splitOff } from './household';
import { choose, nextYear, resolveYear } from './phases';
import { caughtChance, dateWhileAttached, exesOf, isSingle, pregnancyChance, TRY_FOR_BABY_CHANCE } from './romance';
import { makeRng } from './rng';
import { resolveEvent } from './events';
import type { GameState, Person } from './types';
import { active, activePartnership, adjustBond, childrenOf, getBond, partnerOf } from './util';
import { parseSaveFile, serializeGame } from '../persistence/exportImport';

const got = (s: GameState, id: string) => ACHIEVEMENT_BY_ID[id].test(s);
const refill = (s: GameState) => { s.energy = { year: s.year, max: 100, used: 0 }; return s; };
const rich = (s: GameState) => { s.households[active(s).householdId].wallet = 1_000_000; return s; };

/** An adult start whose marriage has ended, so the player is single (the ex lives elsewhere). */
function single(seed: number): GameState {
  const s = rich(newGame(seed));
  const me = active(s);
  const ex = partnerOf(s, me.id)!;
  activePartnership(s, me.id)!.status = 'divorced';
  splitOff(s, [ex], 0, 0);
  return s;
}

/** Do an activity repeatedly (fresh energy each time) until `done` says stop. */
function repeat(s: GameState, id: string, who: (s: GameState) => string[], done: (s: GameState) => boolean, tries = 60) {
  for (let i = 0; i < tries && !done(s); i++) s = performActivity(refill(s), id, who(s));
  return s;
}

describe('meeting someone', () => {
  it('dating activities start a relationship (and warn you when you are already seeing someone)', () => {
    const married = rich(newGame(801));
    expect(activityBlocker(married, 'dating_app')).toBeNull();
    expect(ACTIVITY_BY_ID.dating_app.warning!(married, active(married))).toMatch(/already seeing someone/);
    let s = single(802);
    expect(isSingle(s, active(s))).toBe(true);
    expect(got(s, 'butterflies')).toBe(false);
    s = repeat(s, 'dating_app', () => [], (x) => !isSingle(x, active(x)));
    expect(activePartnership(s, active(s).id)?.status).toBe('dating');
    expect(got(s, 'butterflies')).toBe(true);
  });

  it('five different people unlock Playing the Field; getting back together does not count twice', () => {
    let s = single(803);
    for (let n = 0; n < 5; n++) {
      s = repeat(s, 'speed_dating', () => [], (x) => !isSingle(x, active(x)));
      const p = partnerOf(s, active(s).id)!;
      if (n < 4) s = performActivity(refill(s), 'break_up', [p.id]);
    }
    expect(active(s).flags.dated).toBe(5);
    expect(got(s, 'playing_the_field')).toBe(true);
  });
});

describe('dates with a partner', () => {
  it('a night together needs a close relationship; ten dates make a Hopeless Romantic', () => {
    let s = rich(newGame(811));
    const p = partnerOf(s, active(s).id)!;
    adjustBond(s, active(s).id, p.id, -200, 0);
    expect(candidatesFor(s, ACTIVITY_BY_ID.spend_the_night)).toHaveLength(0);
    adjustBond(s, active(s).id, p.id, 300, 0);
    expect(candidatesFor(s, ACTIVITY_BY_ID.spend_the_night)).toHaveLength(1);
    for (let i = 0; i < 10; i++) s = performActivity(refill(s), ['date_night', 'picnic', 'concert_date'][i % 3], [p.id]);
    expect(got(s, 'hopeless_romantic')).toBe(true);
  });

  it('breaking up with a live-in partner: they leave, your shared kids stay with you', () => {
    let s = rich(newGame(812));
    const me = active(s);
    const p = partnerOf(s, me.id)!;
    activePartnership(s, me.id)!.status = 'dating';
    const kids = childrenOf(s, me.id).map((k) => k.id);
    s = performActivity(refill(s), 'break_up', [p.id]);
    expect(s.people[p.id].householdId).not.toBe(active(s).householdId);
    for (const k of kids) expect(s.people[k].householdId).toBe(active(s).householdId);
    expect(exesOf(s, active(s)).map((x) => x.id)).toContain(p.id);
  });
});

describe('exes', () => {
  it('coffee with an ex can rekindle things when you are both single', () => {
    let s = single(821);
    const ex = exesOf(s, active(s))[0];
    adjustBond(s, active(s).id, ex.id, 200, 0);
    const dated = active(s).flags.dated ?? 0;
    s = repeat(s, 'coffee_ex', () => [ex.id], (x) => !isSingle(x, active(x)));
    expect(partnerOf(s, active(s).id)?.id).toBe(ex.id);
    expect(got(s, 'second_spark')).toBe(true);
    expect(active(s).flags.dated ?? 0).toBe(dated);
  });
});

describe('pregnancy', () => {
  /** A woman and her boyfriend, close, living apart; nights together until a pregnancy. */
  function pregnant(seed: number): { s: GameState; partner: Person } {
    for (let k = seed; k < seed + 40; k++) {
      let s = single(k);
      const me = active(s);
      if (me.sex !== 'F') continue;
      me.birthYear = s.year - 28;
      s = repeat(s, 'dating_app', () => [], (x) => !isSingle(x, active(x)));
      const partner = partnerOf(s, active(s).id);
      if (!partner || partner.sex === 'F') continue;
      adjustBond(s, active(s).id, partner.id, 200, 50);
      s = repeat(s, 'spend_the_night', () => [partner.id], (x) => x.scheduled.some((e) => e.eventId === 'unplanned_pregnancy'), 200);
      if (s.scheduled.some((e) => e.eventId === 'unplanned_pregnancy')) return { s, partner };
    }
    throw new Error('no pregnancy');
  }

  it('a night together can lead to a pregnancy decision; keeping it means a baby next year', () => {
    const { s: s0, partner } = pregnant(830);
    let s = resolveYear(s0);
    const pe = s.pending.find((x) => x.eventId === 'unplanned_pregnancy')!;
    expect(pe).toBeDefined();
    expect(pe.choices.map((c) => c.id)).toEqual(['keep', 'keep_together', 'adoption', 'not_continue']);
    // The pending decision survives a save round-trip (the import validator knows the event).
    expect(parseSaveFile(serializeGame(s)).ok).toBe(true);
    s = choose(s, pe.uid, 'keep_together');
    expect(s.people[partner.id].householdId).toBe(active(s).householdId);
    expect(s.households[active(s).householdId].pendingBirth?.year).toBe(s.year + 1);
    expect(got(s, 'surprise_baby')).toBe(true);
    while (s.phase === 'DECISIONS') s = choose(s, s.pending[0].uid, s.pending[0].choices.find((c) => !c.disabled)!.id);
    const before = childrenOf(s, active(s).id).length;
    s = nextYear(s);
    s = resolveYear(s);
    expect(childrenOf(s, active(s).id).length).toBe(before + 1);
  });

  it('choosing not to continue means no baby', () => {
    const { s: s0 } = pregnant(860);
    let s = resolveYear(s0);
    const pe = s.pending.find((x) => x.eventId === 'unplanned_pregnancy')!;
    s = choose(s, pe.uid, 'not_continue');
    expect(s.households[active(s).householdId].pendingBirth).toBeUndefined();
  });

  it('same-sex couples never get an unplanned pregnancy', () => {
    let s = rich(newGame(890));
    const me = active(s);
    const p = partnerOf(s, me.id)!;
    p.sex = me.sex;
    adjustBond(s, me.id, p.id, 200, 0);
    s = repeat(s, 'spend_the_night', () => [p.id], () => false, 120);
    expect(s.scheduled.some((e) => e.eventId === 'unplanned_pregnancy')).toBe(false);
  });
});

describe('trying for a baby', () => {
  it('is for married couples living together; a success is a planned pregnancy (no surprise decision)', () => {
    let s = newGame(8101);
    const me = active(s);
    const spouse = partnerOf(s, me.id)!;
    me.birthYear = s.year - 30;
    spouse.birthYear = s.year - 30;
    expect(activityBlocker(s, 'try_for_baby', [spouse.id])).toBeNull();
    let tries = 0;
    let expecting = false;
    for (; tries < 40 && !expecting; tries++) {
      s = performActivity({ ...s, energy: { year: s.year, max: 100, used: 0 }, activityLog: [], rngState: 8100 + tries }, 'try_for_baby', [spouse.id]);
      expecting = !!s.households[active(s).householdId].pendingBirth;
    }
    expect(expecting).toBe(true);
    expect(s.scheduled.some((x) => x.eventId === 'unplanned_pregnancy')).toBe(false);
    expect(s.households[active(s).householdId].pendingBirth!.year).toBe(s.year + 1);
    // Already expecting: no more tries until the baby arrives.
    expect(activityBlocker(s, 'try_for_baby', [spouse.id])).not.toBeNull();
  });

  it('is better odds than leaving it to chance', () => {
    expect(TRY_FOR_BABY_CHANCE).toBeGreaterThan(pregnancyChance(newGame(8102), active(newGame(8102))));
  });
});

describe('dating while attached', () => {
  it('can start a secret fling, and each time the chance of getting caught grows', () => {
    let s = rich(newGame(8201));
    const me = active(s);
    expect(caughtChance(me)).toBeCloseTo(0.06);
    let caught = false;
    let fling = false;
    for (let i = 0; i < 12 && !(caught && fling); i++) {
      s = performActivity({ ...refill(s), activityLog: [], rngState: 8200 + i }, 'speed_dating');
      caught ||= s.scheduled.some((x) => x.eventId === 'caught_cheating');
      fling ||= !!active(s).secretPartnerId;
    }
    expect(active(s).flags.sneaking).toBeGreaterThan(1);
    expect(caughtChance(active(s))).toBeGreaterThan(0.06);
    expect(caught).toBe(true);
    expect(fling).toBe(true);
    expect(ACHIEVEMENT_BY_ID.cheater.test(s)).toBe(true);
    expect(activePartnership(s, active(s).id)?.status).toBe('married'); // still married until found out
  });

  it('when your partner finds out, apologizing costs trust; leaving them for the fling ends the marriage', () => {
    const s = rich(newGame(8202));
    const me = active(s);
    const spouse = partnerOf(s, me.id)!;
    for (let i = 0; i < 20 && !me.secretPartnerId; i++) dateWhileAttached(s, makeRng(i), me, 1);
    const fling = s.people[me.secretPartnerId!];
    const pe = { uid: 'x', eventId: 'caught_cheating', subjectId: spouse.id, title: 'Found out', text: '', choices: [], major: true } as never;
    const sorry = structuredClone(s);
    const trust = getBond(sorry, me.id, spouse.id).trust;
    resolveEvent(sorry, makeRng(1), pe, 'apologize');
    expect(getBond(sorry, me.id, spouse.id).trust).toBeLessThan(trust - 30);
    expect(active(sorry).secretPartnerId).toBeUndefined();
    expect(ACHIEVEMENT_BY_ID.found_out.test(sorry)).toBe(true);
    const left = structuredClone(s);
    resolveEvent(left, makeRng(1), pe, 'leave');
    expect(partnerOf(left, me.id)?.id).toBe(fling.id);
    expect(left.partnerships.some((p) => p.status === 'separated')).toBe(true);
  });
});

describe('new activities', () => {
  it('doing your spouse’s chores is named for them, tires you, and helps the marriage', () => {
    const s = rich(newGame(8301));
    const me = active(s);
    const spouse = partnerOf(s, me.id)!;
    expect(activityLabel(s, ACTIVITY_BY_ID.do_chores)).toBe(`Do ${spouse.firstName}’s chores`);
    const before = { bond: getBond(s, me.id, spouse.id).affinity, stress: me.stats.stress };
    const after = performActivity(refill(s), 'do_chores');
    expect(getBond(after, me.id, spouse.id).affinity).toBeGreaterThan(before.bond);
    expect(active(after).stats.stress).toBeGreaterThan(before.stress);
    expect(after.lastActivity!.title).toContain(spouse.firstName);
  });

  it('the marathon stays secret until you are very fit and have run five 5ks', () => {
    let s = rich(newGame(8302));
    expect(activityBlocker(s, 'run_marathon')).toMatch(/Not available/);
    for (let i = 0; i < 5; i++) s = performActivity({ ...refill(s), activityLog: [] }, 'run_5k');
    expect(active(s).flags.five_ks).toBe(5);
    active(s).stats.fitness = 96;
    expect(activityBlocker(s, 'run_marathon')).toBeNull();
    s = performActivity(refill(s), 'run_marathon');
    expect(got(s, 'marathoner')).toBe(true);
  });

  it('conferences are for professional careers; flying to family only for relatives far away', () => {
    const s = rich(newGame(8303));
    const me = active(s);
    me.jobId = 'retail';
    expect(activityBlocker(s, 'conference')).toMatch(/professional/);
    me.jobId = 'engineer';
    expect(activityBlocker(s, 'conference')).toBeNull();
    const pool = candidatesFor(s, ACTIVITY_BY_ID.fly_visit);
    for (const p of pool) expect(p.householdId).not.toBe(me.householdId);
    expect(pool.every((p) => candidatesFor(s, ACTIVITY_BY_ID.visit).includes(p))).toBe(true);
  });
});
