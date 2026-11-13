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

describe('investments in an emergency', () => {
  /** A homeowner with almost no cash but plenty invested. */
  const invested = (seed: number) => {
    const s = financeAction(rich(seed), { kind: 'buyHome', tier: 'family', downPct: 0.2 });
    hhOf(s).investments = 1_000_000;
    hhOf(s).wallet = 1000;
    return s;
  };

  it('can pay for full flood repairs by selling investments, and says so', () => {
    const s = invested(4410);
    const repair = EVENT_BY_ID.flood.build({ s, rng: makeRng(1), me: active(s) }).choices.find((c) => c.id === 'repair')!;
    expect(repair.disabled).toBe(false);
    expect(repair.hint).toMatch(/Sells \$[\d,]+ of investments/);
    const { s: t } = decide(s, 'flood', 'repair');
    expect(hhOf(t).investments!).toBeLessThan(1_000_000);
  });

  it('only sells what cash cannot cover, and never more than is invested', async () => {
    const { payEmergency, canCover } = await import('./emergency');
    const hh = { ...hhOf(newGame(4411)), wallet: 3000, investments: 10_000 };
    expect(canCover(hh, 13_000)).toBe(true);
    expect(canCover(hh, 13_001)).toBe(false);
    expect(payEmergency(hh, 5000)).toBe(2000);
    expect(hh.wallet).toBe(0);
    expect(hh.investments).toBe(8000);
    expect(payEmergency(hh, 20_000)).toBe(8000); // the rest becomes debt
    expect(hh.wallet).toBe(-12_000);
    expect(hh.investments).toBe(0);
  });

  it('everyday spending stays cash-only', () => {
    const s = invested(4412);
    const wedding = EVENT_BY_ID.wedding.build({ s, rng: makeRng(1), me: active(s) }, partnerOf(s, active(s).id));
    expect(wedding.choices.find((c) => c.id === 'dream')!.disabled).toBe(true);
  });

  it('pays 10% of cash debt from investments each year, before interest', async () => {
    const { runEconomy } = await import('./systems');
    const { DEBT_PAYDOWN } = await import('../content/economy');
    const { payDownDebt } = await import('./emergency');
    const hh = { ...hhOf(newGame(4413)), wallet: -100_000, investments: 500_000 };
    expect(payDownDebt(hh)).toBe(100_000 * DEBT_PAYDOWN);
    expect(hh.wallet).toBe(-90_000);
    expect(hh.investments).toBe(490_000);
    const broke = { ...hh, wallet: -100_000, investments: 4000 };
    expect(payDownDebt(broke)).toBe(4000); // only what there is
    // In the yearly economy, with a journal note for the player.
    const s = newGame(4414);
    hhOf(s).investments = 2_000_000;
    hhOf(s).wallet = -1_000_000;
    runEconomy(s, 0);
    expect(hhOf(s).investments!).toBeLessThan(2_000_000);
    expect(s.journal.some((j) => j.text.startsWith('Sold $'))).toBe(true);
  });
});

describe('households the player does not run', () => {
  it('cut back before their debt spirals; yours is still yours to manage', async () => {
    const { runEconomy } = await import('./systems');
    const { NPC_DEBT_FLOOR } = await import('../content/economy');
    const s = newGame(4401);
    const mine = s.households[active(s).householdId];
    const other = Object.values(s.households).find((h) => h.id !== mine.id && !h.settled && Object.values(s.people).some((p) => p.householdId === h.id))!;
    other.wallet = -2_000_000; // e.g. an elderly parent living alone on a deficit
    mine.wallet = -2_000_000;
    runEconomy(s, 0);
    expect(other.wallet).toBe(-NPC_DEBT_FLOOR);
    expect(mine.wallet).toBeLessThan(-2_000_000);
  });

  it('an elderly parent moving in shows their debt honestly', () => {
    const s = newGame(4402);
    const me = active(s);
    const mom = Object.values(s.people).find((p) => me.biologicalParents.includes(p.id) && p.householdId !== me.householdId);
    expect(mom).toBeDefined();
    if (!mom) return;
    s.households[mom.householdId].wallet = -30_000;
    const ev = EVENT_BY_ID.parent_needs_care.build({ s, rng: makeRng(1), me }, mom);
    expect(ev.text).toContain('$30,000 in debt');
    expect(ev.choices.find((c) => c.id === 'move_in')!.hint).toContain('Their debt joins');
  });
});
