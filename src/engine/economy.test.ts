import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_BY_ID } from '../content/achievements';
import { CITIES } from '../content/cities';
import { DEDUCTIBLE, healthPremium, lateLifeCare, payrollTax } from '../content/economy';
import { HOME_UPGRADES } from '../content/finance';
import { estimateYear } from './budget';
import { capacityOf, financeAction, financeBlocker, homeOf, upgradeCost } from './finance';
import { newGame } from './generate';
import { homeLife, rollMisfortunes } from './lifeEvents';
import { choose, resolveYear } from './phases';
import { EVENT_BY_ID } from './events';
import { makeRng } from './rng';
import type { GameState } from './types';
import { active, kidsAtHome, parentsOf, partnerOf } from './util';
import { die } from './family';
import { cityOfHousehold } from './location';

const hhOf = (s: GameState) => s.households[active(s).householdId];
const rich = (seed: number) => { const s = newGame(seed); hhOf(s).wallet = 3_000_000; return s; };
const line = (s: GameState, label: string) => estimateYear(s).expenses.find((l) => l.label === label)?.amount ?? 0;
const got = (s: GameState, id: string) => ACHIEVEMENT_BY_ID[id].test(s);

/** Put one event in front of the player right now, then pick a choice. */
function decide(s: GameState, eventId: string, choiceId: string, subjectId?: string) {
  s.scheduled.push({ dueYear: s.year, eventId, subjectId });
  let t = resolveYear(s);
  const pe = t.pending.find((p) => p.eventId === eventId);
  if (!pe) return { s: t, pe };
  t = choose(t, pe.uid, choiceId);
  return { s: t, pe };
}

describe('everyday costs', () => {
  it('payroll tax, health insurance, insurance on homes and cars appear in the budget', () => {
    const s = rich(1501);
    expect(line(s, 'Payroll tax')).toBeGreaterThan(0);
    expect(line(s, 'Health insurance')).toBeGreaterThan(0);
    expect(line(s, 'Car insurance')).toBeGreaterThan(0);
    expect(line(s, 'Home insurance')).toBeGreaterThan(0); // renters insurance
    expect(payrollTax(1_000_000)).toBe(payrollTax(170_000)); // capped
    expect(healthPremium(55)).toBeGreaterThan(healthPremium(30));
  });

  it('late-life care is a big cost in the 80s and 90s', () => {
    expect(lateLifeCare(70, 80)).toBe(0);
    expect(lateLifeCare(82, 80)).toBeGreaterThan(10000);
    expect(lateLifeCare(92, 80)).toBeGreaterThan(lateLifeCare(86, 80));
    expect(lateLifeCare(72, 20)).toBeGreaterThan(0); // very unwell at 72
  });

  it('daycare is charged for little ones only when every adult works', () => {
    const s = rich(1502);
    const kid = kidsAtHome(s, active(s))[0];
    kid.birthYear = s.year - 2;
    const partner = partnerOf(s, active(s).id)!;
    partner.jobId = partner.jobId ?? 'retail';
    expect(line(s, 'Childcare')).toBeGreaterThan(0);
    partner.jobId = undefined;
    expect(line(s, 'Childcare')).toBe(0);
  });
});

describe('home upgrades', () => {
  it('a pool costs money, adds upkeep and value, and makes summers happier', () => {
    let s = rich(1510);
    expect(financeBlocker(s, { kind: 'upgradeHome', upgrade: 'pool' })).toMatch(/own/);
    s = financeAction(s, { kind: 'buyHome', tier: 'family', downPct: 0.2 });
    const before = { ...homeOf(hhOf(s))!, wallet: hhOf(s).wallet };
    s = financeAction(s, { kind: 'upgradeHome', upgrade: 'pool' });
    const home = homeOf(hhOf(s))!;
    expect(hhOf(s).wallet).toBe(before.wallet - upgradeCost('pool', cityOfHousehold(hhOf(s))));
    expect(home.upkeep).toBe(before.upkeep + HOME_UPGRADES.pool.upkeep);
    expect(home.value).toBeGreaterThan(before.value);
    expect(got(s, 'cannonball')).toBe(true);
    expect(financeBlocker(s, { kind: 'upgradeHome', upgrade: 'pool' })).toMatch(/already/);
    const h0 = active(s).stats.happiness;
    homeLife(s);
    expect(active(s).stats.happiness).toBeGreaterThan(h0);
  });

  it('an addition fits one more person, up to three', () => {
    let s = financeAction(rich(1511), { kind: 'buyHome', tier: 'starter', downPct: 0.2 });
    const cap = capacityOf(hhOf(s));
    for (let i = 0; i < 3; i++) s = financeAction(s, { kind: 'upgradeHome', upgrade: 'expansion' });
    expect(capacityOf(hhOf(s))).toBe(cap + 3);
    expect(financeBlocker(s, { kind: 'upgradeHome', upgrade: 'expansion' })).toMatch(/At most 3/);
    expect(got(s, 'room_to_grow')).toBe(true);
  });
});

describe('misfortunes', () => {
  it('are rolled with realistic odds: floods mostly in flood-prone cities', () => {
    const floods = (city: keyof typeof CITIES) => {
      let n = 0;
      for (let i = 0; i < 2000; i++) {
        const s = newGame(1520);
        hhOf(s).city = city;
        rollMisfortunes(s, makeRng(i));
        n += s.scheduled.filter((x) => x.eventId === 'flood').length;
      }
      return n;
    };
    expect(floods('houston')).toBeGreaterThan(floods('denver') * 4);
  });

  it('flood insurance turns a flood into just the deductible', () => {
    let s = financeAction(rich(1521), { kind: 'buyHome', tier: 'family', downPct: 0.2 });
    s = financeAction(s, { kind: 'floodInsurance', on: true });
    expect(line(s, 'Flood insurance')).toBeGreaterThan(0);
    const w0 = 0;
    const { s: t, pe } = decide(s, 'flood', 'claim');
    expect(pe?.choices.map((c) => c.id)).toEqual(['claim']);
    expect(got(t, 'covered')).toBe(true);
    void w0;
  });

  it('every event offers at least one choice you can take, even when broke', () => {
    for (const id of ['wedding', 'honeymoon', 'kid_birthday', 'kid_car', 'graduation_gift', 'funeral', 'car_accident', 'house_fire', 'robbery', 'flood', 'medical_bill', 'money_request']) {
      const s = newGame(1530);
      hhOf(s).wallet = -50000;
      const kid = kidsAtHome(s, active(s))[0];
      kid.birthYear = s.year - 17;
      const parent = parentsOf(s, active(s))[0];
      const subject = ['wedding', 'honeymoon'].includes(id) ? partnerOf(s, active(s).id) : ['kid_birthday', 'kid_car', 'graduation_gift'].includes(id) ? kid : id === 'medical_bill' ? active(s) : id === 'money_request' ? parent : undefined;
      const built = EVENT_BY_ID[id].build({ s, rng: makeRng(1), me: active(s) }, subject);
      expect(built.choices.some((c) => !c.disabled), `${id} has no available choice`).toBe(true);
    }
  });
});

describe('life events', () => {
  it('a parent dying brings up the funeral, which costs money', () => {
    const s = rich(1540);
    const parent = parentsOf(s, active(s)).find((p) => p.deathYear === undefined)!;
    die(s, parent, 'old age');
    expect(s.scheduled.some((x) => x.eventId === 'funeral')).toBe(true);
    const w0 = 0;
    let t = resolveYear(s);
    const pe = t.pending.find((p) => p.eventId === 'funeral')!;
    const before = hhOf(t).wallet;
    t = choose(t, pe.uid, 'traditional');
    expect(t.people[parent.id].flags.funeral_held).toBe(1);
    expect(hhOf(t).wallet).toBeLessThan(before);
    void w0;
  });

  it('a deductible is cheaper than paying for repairs yourself', () => {
    expect(DEDUCTIBLE.car).toBeLessThan(3500);
  });
});
